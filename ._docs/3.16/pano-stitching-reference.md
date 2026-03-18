# Panorama Stitching Reference — Implementation Guide

A standalone reference document for adding client-side or server-side panorama stitching to CineBlock. The idea: stitch the user's room photos into a single equirectangular 360 panorama, then send it to the Marble API as a single image with `is_pano: true` for the most spatially coherent reconstruction.

> **This is NOT in the main dev plan.** Treat this as a future feature reference.

---

## The Core Problem

A standard smartphone main camera has a horizontal field-of-view (FoV) of **~50–70 degrees** (e.g. iPhone main lens: ~69°). With 4 photos at 90° intervals:

- 4 × 70° = 280° of coverage out of 360°
- **~80° of gaps** between images
- **Zero overlap** between adjacent photos

Feature-matching stitching algorithms (SIFT, ORB, etc.) require **25–30% overlap minimum** to find matching keypoints. With 4 photos at 90° intervals from a standard lens, **traditional stitching will fail.**

### Three Possible Approaches

| Approach | Overlap Needed | Client-Side? | Quality | Complexity |
|---|---|---|---|---|
| **A. Feature-matching stitch** | Yes (25%+) | Possible (WASM) | Best if images overlap | High |
| **B. Projection-based placement** | No | Yes (canvas math) | Gaps visible, needs fill | Medium |
| **C. Require more photos** | Yes (naturally) | Either | Best overall | Low (code), High (UX ask) |

---

## Approach A: Feature-Matching Stitching

### When it works
- User captures **6–8+ overlapping photos** (45–60° intervals)
- Or uses **ultra-wide lens** (~120° FoV) giving overlap even at 90° intervals
- Scene has distinctive visual features (not blank walls)

### Client-Side: imgalign (best existing browser solution)

**Repository:** https://github.com/latsic/imgalign

- Vue.js app with custom OpenCV WASM build including stitching module
- Runs OpenCV in a WebWorker for non-blocking UI
- Supports: feature detection/matching, bundle adjustment, wave correction, color transfer, seam detection, multiband blending
- MIT licensed (note: SURF/SIFT algorithms are patented, use ORB instead)

**Integration approach:** Extract the WASM build and stitching logic from imgalign, wrap it in a standalone module. The relevant parts:
1. The custom OpenCV WASM binary (with stitching module enabled)
2. The WebWorker wrapper that calls `cv.Stitcher.create()` and `stitcher.stitch()`
3. The canvas ↔ cv.Mat conversion utilities

**Gotchas:**
- The default OpenCV.js build does **NOT** include the Stitcher class — you must custom-compile
- WASM file size increases significantly (~15–20MB with stitching)
- Memory-intensive: resize inputs to ~2000px before processing or risk tab crashes on mobile
- OpenCV Stitcher returns error codes (not exceptions): `0 = OK`, `1 = NEED_MORE_IMGS`, `2 = HOMOGRAPHY_FAIL`, `3 = CAMERA_PARAMS_FAIL`

### Building Custom OpenCV.js with Stitching

```bash
# 1. Install Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest
source ./emsdk_env.sh

# 2. Clone OpenCV
git clone https://github.com/opencv/opencv.git
cd opencv

# 3. Edit platforms/js/opencv_js.config.py to add:
# stitching = {
#     'Stitcher': ['create', 'stitch']
# }

# 4. Build
python platforms/js/build_js.py build_wasm \
  --emscripten_dir /path/to/emsdk/upstream/emscripten \
  --build_wasm \
  --cmake_option "-DBUILD_opencv_stitching=ON"
```

### Server-Side: Python OpenCV Stitcher (recommended)

**Much simpler, more reliable, avoids browser memory issues.**

```python
# pip install opencv-python-headless
import cv2

stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
images = [cv2.imread(f) for f in image_paths]
status, panorama = stitcher.stitch(images)

if status == cv2.Stitcher_OK:
    cv2.imwrite("panorama.jpg", panorama)
```

**Higher-level wrapper — OpenStitching:**

```bash
pip install stitching
# or headless:
pip install stitching-headless
```

```python
from stitching import Stitcher

stitcher = Stitcher(detector="sift", confidence_threshold=0.2)
panorama = stitcher.stitch(["img1.jpg", "img2.jpg", "img3.jpg", "img4.jpg"])
```

CLI: `stitch *.jpg -v --output panorama.jpg`

### Deploying as a Microservice

**FastAPI on Hugging Face Spaces (free tier available):**

```python
# pano_api.py
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
import cv2
import numpy as np
import tempfile

app = FastAPI()

@app.post("/stitch")
async def stitch_images(files: list[UploadFile] = File(...)):
    images = []
    for f in files:
        data = await f.read()
        arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is not None:
            images.append(img)

    stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
    status, panorama = stitcher.stitch(images)

    if status != cv2.Stitcher_OK:
        return {"error": f"Stitching failed with status {status}"}

    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    cv2.imwrite(tmp.name, panorama)
    return FileResponse(tmp.name, media_type="image/jpeg")
```

**HF Spaces requirements:**
- Must run on port 7860
- Can only write to `/tmp`
- Docker Space type for full control
- Add `requirements.txt`: `fastapi`, `uvicorn`, `opencv-python-headless`, `python-multipart`

**CineBlock integration:**
```ts
async function stitchImages(files: File[]): Promise<Blob> {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));

  const res = await fetch('https://your-space.hf.space/stitch', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error('Stitching failed');
  return res.blob();
}
```

---

## Approach B: Projection-Based Placement (No Feature Matching)

Instead of stitching by keypoint matching, **mathematically project** each photo at its known azimuth angle into equirectangular space. No overlap required.

### The Math

Each pixel in the output equirectangular image maps to a spherical coordinate:

```
theta = (x / width) * 2 * PI - PI       // longitude: -PI to PI
phi   = (y / height) * PI - PI/2         // latitude: -PI/2 to PI/2
```

Convert to a 3D unit vector:
```
X = cos(phi) * sin(theta)
Y = sin(phi)
Z = cos(phi) * cos(theta)
```

For each source image at azimuth `a` with field-of-view `fov`:
1. Apply inverse rotation by `-a` around Y axis
2. Project to camera plane: `u = f * X/Z + cx`, `v = f * Y/Z + cy`
3. If `Z > 0` and `u,v` are within image bounds, sample the source pixel

Where `f = (imageWidth / 2) / tan(fov / 2)` is the focal length in pixels.

### TypeScript/Canvas Implementation Sketch

```ts
interface PerspectiveImage {
  image: HTMLImageElement;
  azimuthDeg: number;  // 0, 90, 180, 270
  fovDeg: number;      // e.g. 70
}

function projectToEquirectangular(
  images: PerspectiveImage[],
  outWidth: number,  // e.g. 2560
  outHeight: number, // e.g. 1280 (must be outWidth / 2)
): ImageData {
  const out = new ImageData(outWidth, outHeight);

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const theta = (x / outWidth) * 2 * Math.PI - Math.PI;
      const phi = (y / outHeight) * Math.PI - Math.PI / 2;

      const dirX = Math.cos(phi) * Math.sin(theta);
      const dirY = Math.sin(phi);
      const dirZ = Math.cos(phi) * Math.cos(theta);

      // Try each source image
      for (const src of images) {
        const a = (src.azimuthDeg * Math.PI) / 180;
        // Rotate direction into camera space (inverse azimuth rotation around Y)
        const camX = dirX * Math.cos(-a) + dirZ * Math.sin(-a);
        const camY = dirY;
        const camZ = -dirX * Math.sin(-a) + dirZ * Math.cos(-a);

        if (camZ <= 0) continue; // Behind camera

        const fovRad = (src.fovDeg * Math.PI) / 180;
        const f = (src.image.width / 2) / Math.tan(fovRad / 2);

        const u = f * (camX / camZ) + src.image.width / 2;
        const v = f * (camY / camZ) + src.image.height / 2;

        if (u >= 0 && u < src.image.width && v >= 0 && v < src.image.height) {
          // Sample source pixel (nearest neighbor; use bilinear for quality)
          const srcX = Math.round(u);
          const srcY = Math.round(v);
          // ... copy pixel from source canvas to out ...
          break; // First hit wins (no blending)
        }
      }
    }
  }

  return out;
}
```

### WebGL Acceleration

The per-pixel loop above is slow on CPU for large outputs. A WebGL fragment shader can do this in real-time:

1. Render a full-screen quad
2. Fragment shader converts each pixel to spherical coords → 3D direction
3. For each source image (as a texture), test if the direction falls within its frustum
4. Sample the texture with bilinear filtering

This runs at 60fps and can produce 4096×2048 outputs instantly.

### Limitations
- **Gaps are visible** — with 4 images at 90° and ~70° FoV, ~80° of horizontal gap and all of the ceiling/floor are black
- **No automatic alignment** — relies entirely on accurate azimuth metadata
- **Seams at boundaries** — where two images meet, color/exposure differences create visible lines
- **No parallax correction** — close objects will misalign between views

### Gap Filling Options
1. **Solid color / gradient fill** — simplest, looks obviously artificial
2. **AI inpainting** — use an inpainting model to fill gaps (adds another API dependency)
3. **Accept gaps** — if Marble API handles partial equirectangular input gracefully, gaps may not matter
4. **Blurred stretch** — stretch edge pixels into gaps with heavy blur (looks better than black)

---

## Approach C: Require More Photos

The simplest code-side approach: change the UX to ask for more images.

- **6 photos at 60° intervals** with ~70° FoV lens → ~10° overlap per pair (marginal)
- **8 photos at 45° intervals** with ~70° FoV lens → ~25° overlap per pair (good)
- **12 photos at 30° intervals** → abundant overlap, very reliable stitching

This pairs well with Approach A (feature-matching stitch) and is the only way to get truly reliable panorama output from phone photos.

**UX consideration:** Asking a user to take 8–12 carefully overlapping photos is a big ask. Consider providing in-app guidance (numbered angle indicators, or a phone compass overlay).

---

## Marble API: Panorama Input

From the API reference, to send a panorama instead of multi-image:

```json
{
  "display_name": "CineBlock World",
  "model": "Marble 0.1-plus",
  "world_prompt": {
    "type": "image",
    "image_prompt": {
      "content": {
        "source": "media_asset",
        "media_asset_id": "<id>"
      },
      "is_pano": true
    }
  }
}
```

**Requirements:**
- Image must be **2:1 aspect ratio** (equirectangular projection)
- Recommended width: **2560px** (so 2560×1280)
- Higher resolution (4096×2048) may improve quality but increases upload/processing time

**Why this matters:** The Marble docs state *"360 panoramic images provide maximum control over world layout and the most accurate spatial representation."* A clean pano input should produce the most spatially coherent world.

---

## Equirectangular Format Quick Reference

- **Aspect ratio:** Exactly 2:1 (width = 2× height)
- **Projection:** X axis = longitude (-180° to +180°), Y axis = latitude (-90° to +90°)
- **Center of image:** Forward direction (0° azimuth, 0° elevation)
- **Left/right edges:** Wrap around (both represent -180°/+180° = directly behind)
- **Top/bottom:** Zenith (ceiling) and nadir (floor)

Common resolutions:

| Width × Height | Quality |
|---|---|
| 2048 × 1024 | Minimum |
| 2560 × 1280 | Marble API recommended |
| 4096 × 2048 | Good for VR/viewers |
| 8192 × 4096 | High quality |

---

## Relevant Libraries & Packages

### Stitching (creating panoramas)

| Name | Platform | Type | Notes |
|---|---|---|---|
| **imgalign** | Browser (WASM) | Feature-matching | Best browser option. Custom OpenCV build. github.com/latsic/imgalign |
| **OpenCV Stitcher** | Python | Feature-matching | Most reliable. `cv2.Stitcher_create()` |
| **OpenStitching** | Python | Feature-matching | Higher-level wrapper. `pip install stitching` |
| **360-panorama-python** | Python | Projection-based | For known camera orientations. github.com/Jie-Geng/360-panorama-python |
| **Perspective-and-Equirectangular** | Python | Projection math | Converts between perspective ↔ equirectangular. github.com/timy90022/Perspective-and-Equirectangular |
| **wasm-vips** | Browser (WASM) | Image processing | Has mosaic ops but minimal stitching docs. `npm i wasm-vips` |

### Viewing (displaying panoramas)

| Name | Install | Notes |
|---|---|---|
| **Pannellum** | `npm i pannellum` | 21kB, equirectangular/cubemap. Max ~8192px. |
| **Panolens.js** | `npm i panolens` | Three.js-based. Requires 2:1 equirectangular. |
| **Photo Sphere Viewer** | `npm i @photo-sphere-viewer/core` | Full-featured viewer. |
| **react-pannellum** | `npm i react-pannellum` | React wrapper for Pannellum. |

### Conversion utilities

| Name | Install | Notes |
|---|---|---|
| **threejs-cubemap-to-equirectangular** | `npm i threejs-cubemap-to-equirectangular` | Cubemap → equirectangular via Three.js |
| **equirect-to-cubemap-faces** | `npm i equirect-to-cubemap-faces` | Equirectangular → 6 cubemap faces |

---

## Common Pitfalls

1. **Parallax (indoor #1 killer)** — Objects at 1–3m shift dramatically between frames. Only fixable at capture time by rotating around the camera's nodal point (requires a pano head). Software cannot reliably fix this.

2. **Exposure variation** — Different walls face different light sources. Auto-exposure creates brightness jumps. Fix: require manual exposure, or apply `ExposureCompensator` in the stitching pipeline.

3. **Seam artifacts** — Visible lines at image boundaries. Fix: multiband blending (Laplacian pyramids), optimal seam finding (graph cut). OpenCV Stitcher includes these.

4. **Insufficient overlap** — Below ~25% overlap, feature matching fails entirely. The stitcher returns error code 1 or 2.

5. **Blank/featureless walls** — White walls, plain surfaces lack keypoints for feature matching. Indoor rooms with minimal decoration are hardest to stitch.

6. **Missing ceiling/floor** — 4 horizontal photos only cover the equator band. Top/bottom of the equirectangular are undefined. Consider adding up/down photos or accepting the gaps.

7. **Browser memory limits** — WASM stitching with large images can crash tabs. Always resize inputs to ≤2000px on the longest side before processing. Use WebWorkers to avoid blocking the UI thread.

8. **Lens distortion** — Phone cameras have barrel distortion. For highest quality, correct with camera calibration data before stitching. Most stitchers handle moderate distortion internally.

---

## Recommendation Summary

| Scenario | Best Approach |
|---|---|
| Users willing to take 8+ photos | Server-side OpenCV Stitcher (Approach A + C) |
| Must work with exactly 4 photos at 90° | Projection-based placement (Approach B) — accept gaps |
| Need highest quality, no constraints | Require 8+ overlapping photos + server-side stitch + Marble `is_pano: true` |
| Want to avoid server infrastructure | Client-side projection math (Approach B) in TypeScript/WebGL |
| Prototype / quick test | Skip stitching entirely — use Marble's `reconstruct_images: true` multi-image mode instead |

**Pragmatic take:** Before investing in panorama stitching, first try the changes in the main dev plan (`reconstruct_images: true` + `text_prompt` + Plus model). If those produce acceptable quality, panorama stitching may be unnecessary overhead. The stitching path is highest value if users regularly have 6+ overlapping photos and want maximum spatial accuracy.

---

## Sources

- imgalign: https://github.com/latsic/imgalign
- OpenCV.js custom build: https://lambda-it.ch/blog/build-opencv-js
- OpenCV Stitcher tutorial: https://docs.opencv.org/4.x/d8/d19/tutorial_stitcher.html
- OpenStitching: https://github.com/OpenStitching/stitching
- 360-panorama-python: https://github.com/Jie-Geng/360-panorama-python
- Perspective-and-Equirectangular: https://github.com/timy90022/Perspective-and-Equirectangular
- Perspective ↔ equirectangular math: https://anandksub.dev/blog/perspective_equirect
- Cubemap conversion: https://paulbourke.net/panorama/cubemaps/
- Pannellum: https://pannellum.org/
- wasm-vips: https://github.com/kleisauke/wasm-vips
- Panorama stitching problems: https://imagictools.com/techniques/panorama-stitching-problems-and-solutions/
- HF Spaces deployment: https://huggingface.co/blog/HemanthSai7/deploy-applications-on-huggingface-spaces
- Equirectangular projection: https://wiki.panotools.org/Equirectangular_Projection
- Phone camera FoV reference: https://learnopencv.com/approximate-focal-length-for-webcams-and-cell-phone-cameras/
