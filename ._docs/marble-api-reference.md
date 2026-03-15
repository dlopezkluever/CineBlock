# Marble API Reference — CineBlock

Condensed reference for the World Labs Marble API endpoints used by CineBlock.

**Base URL:** `https://api.worldlabs.ai`
**Auth header:** `WLT-Api-Key: <your-key>`

---

## Pipeline Overview

```
1. prepare_upload  →  get signed URL for each image
2. PUT to signed URL  →  upload the actual file
3. worlds:generate  →  start world generation (returns operation_id)
4. operations/{id}  →  poll until done=true
5. worlds/{id}  →  (optional) fetch world details later
```

---

## 1. Prepare Upload

> **Note:** This endpoint is not in the public OpenAPI docs but is used in working code. Verify if behavior changes.

```
POST /marble/v1/media-assets:prepare_upload
```

**Request:**
```json
{
  "file_name": "photo.jpg",
  "kind": "image",
  "extension": "jpg"
}
```

**Response:**
```json
{
  "media_asset": {
    "media_asset_id": "uuid-string",
    "file_name": "photo.jpg",
    "kind": "image",
    "extension": "jpg"
  },
  "upload_info": {
    "upload_url": "https://storage.example.com/signed-url",
    "upload_method": "PUT",
    "required_headers": { "x-custom": "value" }
  }
}
```

---

## 2. Upload Image

```
PUT <upload_url from step 1>
```

- **Headers:** Include all `required_headers` from prepare_upload response + `Content-Type` matching the file
- **Body:** Raw file bytes

---

## 3. Generate World

```
POST /marble/v1/worlds:generate
```

**Request (multi-image, our primary use case):**
```json
{
  "display_name": "CineBlock World",
  "model": "Marble 0.1-mini",
  "world_prompt": {
    "type": "multi-image",
    "multi_image_prompt": [
      {
        "azimuth": 0,
        "content": {
          "source": "media_asset",
          "media_asset_id": "<id from step 1>"
        }
      },
      {
        "azimuth": 90,
        "content": {
          "source": "media_asset",
          "media_asset_id": "<id from step 1>"
        }
      }
    ]
  }
}
```

**Key fields:**
- `model` — `"Marble 0.1-mini"` (~150-250 credits) or `"Marble 0.1-plus"` (higher quality, more credits)
- `world_prompt.type` — discriminator: `"multi-image"`, `"image"`, `"text"`, or `"video"`
- `multi_image_prompt[].azimuth` — degrees (0, 90, 180, 270 for our 4 slots). Field is nullable.
- `multi_image_prompt[].content.source` — `"media_asset"`, `"uri"`, or `"data_base64"`
- `reconstruct_images` — optional bool, default false. If true, allows up to 8 images (otherwise 4).
- `display_name` — optional, max 64 chars
- `seed` — optional uint32 for reproducibility
- `permission` — optional, defaults to private

**Content source options (for each image):**

| Source | Required field | Use case |
|---|---|---|
| `media_asset` | `media_asset_id` | After prepare_upload flow (our approach) |
| `uri` | `uri` | Public URL to an image |
| `data_base64` | `data_base64` + optional `extension` | Inline base64 data (max 10MB) |

**Response:**
```json
{
  "operation_id": "op-uuid",
  "done": false,
  "error": null,
  "metadata": null,
  "response": null,
  "created_at": "...",
  "expires_at": "..."
}
```

**Error codes:** 400 (bad request / policy violation), 402 (insufficient credits), 422 (validation), 500

---

## 4. Poll Operation

```
GET /marble/v1/operations/{operation_id}
```

**Response (in progress):**
```json
{
  "operation_id": "op-uuid",
  "done": false,
  "error": null,
  "metadata": {
    "progress": { "status": "IN_PROGRESS", "description": "..." },
    "world_id": "world-uuid"
  },
  "response": null
}
```

**Response (complete — `done: true`):**
```json
{
  "operation_id": "op-uuid",
  "done": true,
  "error": null,
  "metadata": { "world_id": "world-uuid" },
  "response": {
    "world_id": "world-uuid",
    "display_name": "CineBlock World",
    "world_marble_url": "https://marble.worldlabs.ai/world/...",
    "assets": {
      "caption": "AI-generated description",
      "thumbnail_url": "https://...",
      "splats": {
        "spz_urls": {
          "100k": "https://...",
          "500k": "https://...",
          "full_res": "https://..."
        },
        "semantics_metadata": {
          "ground_plane_offset": 0.0,
          "metric_scale_factor": 1.0
        }
      },
      "mesh": {
        "collider_mesh_url": "https://...glb"
      },
      "imagery": {
        "pano_url": "https://..."
      }
    }
  }
}
```

**Response (failed):**
```json
{
  "operation_id": "op-uuid",
  "done": false,
  "error": { "code": 500, "message": "Generation failed" },
  "metadata": null,
  "response": null
}
```

**Polling strategy:** Every 5 seconds, timeout after 5 minutes.

---

## 5. Get World (optional)

```
GET /marble/v1/worlds/{world_id}
```

Returns a `World` object directly (same shape as `response` in the operation poll above). **Not** wrapped in `{ world: ... }`.

---

## Assets We Use

From the World response, CineBlock needs:

| Asset | Path | Purpose |
|---|---|---|
| SPZ 500k | `assets.splats.spz_urls["500k"]` | Gaussian splat for real-time rendering |
| Collider mesh | `assets.mesh.collider_mesh_url` | Invisible GLB for raycast hit testing |
| World ID | `world_id` | Stored for export metadata |

We don't currently use: `pano_url`, `thumbnail_url`, `caption`, `100k`/`full_res` splats, `semantics_metadata`.

---

## Endpoints We Don't Use

- `POST /marble/v1/worlds:list` — list/filter worlds
- `DELETE /marble/v1/worlds/{world_id}` — delete a world
- `GET /marble/v1/media-assets/{media_asset_id}` — get media asset metadata
- Text-to-world, single-image, video, depth-pano, inpaint-pano prompt types

---

## Rate Limits & Budget

- 6 requests/minute (across all endpoints)
- Mini model: ~150-250 credits per generation (~$0.15)
- Plus model: higher quality, more credits
- $5 minimum purchase = ~6,250 credits = ~25-40 mini generations
