You’re dealing with a stack of small coordinate and scene-graph assumptions that can compound into exactly the “floating + horizontal offset” symptom you’re seeing. I’ll go point by point and then give you a short “most likely root cause” section at the end.

---

## 1) Raycasting + `visible: false`

Short answer: **raycasting still works on invisible meshes**.

* `THREE.Raycaster.intersectObjects()` does **not** skip objects just because `visible === false`.
* What *does* matter:

  * `layers` must match the raycaster’s layers
  * `matrixWorld` must be up to date
* This behavior is consistent across modern versions (r150+). No meaningful regression here.

**Edge case**:
If you manually filtered objects like:

```js
objects.filter(o => o.visible)
```

then you’d accidentally exclude them, but Three itself doesn’t.

---

## 2) Parent rotation (`rotation.x = Math.PI`) and child raycasting

Yes, Three.js **does correctly apply parent transforms**.

* `intersectObjects()` uses each mesh’s **`matrixWorld`**
* That matrix already includes:

  * parent rotation
  * parent position
  * parent scale

So in theory, this setup is valid:

```jsx
<group rotation={[Math.PI, 0, 0]}>
  <mesh ... />
</group>
```

**However**, two common pitfalls:

### A. Stale world matrices

If you extracted meshes via `traverse()` and are raycasting them later:

```js
scene.updateMatrixWorld(true)
```

must have run **after** transforms were applied.

If not, ray hits will be subtly offset.

---

### B. Geometry baked in different coordinate system

If your `.glb` collider was exported Y-up already, and you apply:

```jsx
rotation={[Math.PI, 0, 0]}
```

you are flipping it **again**, causing:

* vertical inversion
* horizontal displacement (because normals + triangle winding change)

This is a *very common source* of your exact symptom.

---

## 3) `setFromCamera` + R3F `createPortal`

There’s no known bug with `setFromCamera` itself.

But your setup introduces a **real risk**:

### The issue is not “stale camera”

It’s **scene mismatch**.

* Your **raycast happens in Scene A**
* Your **mannequins render in Scene B (portal)**

Even if they share the same camera, problems arise if:

* camera matrices aren’t synced per frame
* or you accidentally reference a different camera instance

### What to check

Inside your click handler:

```js
const { camera, scene, raycaster } = useThree()
```

Make sure:

* this `camera` is the **same one used to render the splat + collider**
* you are NOT mixing:

  * default camera (main scene)
  * portal camera (overlay scene)

**Quick test**:
Log:

```js
console.log(camera.uuid)
```

in both contexts.

If they differ, that’s your offset.

---

## 4) Gaussian splats vs collider alignment

Yes, this is a **known problem**.

3D Gaussian Splat pipelines (Polycam, Luma, Scaniverse):

* often export splats in **camera coordinate space (Y-down)**
* while meshes (.glb) are:

  * Y-up
  * sometimes re-centered
  * sometimes scaled differently

### Typical mismatches:

| Issue                | Effect                       |
| -------------------- | ---------------------------- |
| Different origin     | horizontal offset            |
| Different scale      | floating / sinking           |
| Y-up vs Y-down       | vertical inversion           |
| Reconstruction drift | collider doesn't match splat |

---

### How industry tools handle it

They usually:

1. Apply a **global transform matrix** to both splat and mesh
2. Export:

   * splat
   * mesh collider
     in the **same aligned coordinate frame**

If you generated the collider separately, alignment is often **not exact**.

---

## 5) Double-raycast (camera → vertical clamp)

Yes, this is often an **anti-pattern** for placement.

### Why it breaks:

You assume:

```js
downRay = new Ray(origin = [x, y+10, z], dir = [0,-1,0])
```

But that assumes:

* “up” is +Y
* surface is roughly horizontal

If your collider is:

* rotated (you have Math.PI!)
* sloped
* misaligned with world axes

Then your vertical ray:

* misses the surface
* hits a different triangle
* returns a shifted Y

→ **exactly your floating + offset issue**

---

### Better approach

Use the **original hit point directly**:

```js
const p = hits[0].point
```

Then apply only:

```js
p.y += feetOffset
```

If you need alignment:

* use `hits[0].face.normal`
* orient the mannequin to the surface

---

## 6) SparkJS `SplatMesh` transforms

This is the most subtle one.

Many Gaussian splat renderers (including SparkJS-style implementations):

* **do not behave like standard Mesh**
* may:

  * bypass `modelMatrix`
  * apply transforms in shader space
  * treat rotation as a visual-only transform

### Implication

```js
splat.rotation.x = Math.PI
```

may:

* visually flip the splat
* but NOT affect:

  * internal spatial data
  * raycast assumptions
  * alignment with external geometry

So:

> Your collider is rotated in real world space
> Your splat may only be rotated visually

→ mismatch

---

# Most Likely Root Cause (based on your symptoms)

Given:

* vertical offset
* horizontal offset
* double raycast
* Math.PI rotation
* separate collider

The highest probability issues are:

### 1. Coordinate system mismatch (very likely)

* collider is double-flipped or misaligned vs splat

### 2. Vertical raycast is invalid (very likely)

* using world down instead of surface normal

### 3. Splat transform ≠ collider transform (very likely)

* SparkJS not applying transforms like Three.js

---

# What I would do (practical fix order)

### Step 1: Kill the clamp ray

Replace:

```js
clampToSurface()
```

with:

```js
position = hits[0].point
position.y += feetOffset
```

---

### Step 2: Verify alignment visually

Temporarily render collider:

```jsx
<mesh visible={true} wireframe />
```

If it doesn’t perfectly overlap the splat:
→ that’s your root issue

---

### Step 3: Remove the Math.PI rotation (test)

Try:

* removing rotation from both splat + collider
* or applying it to only one

See which combination aligns

---

### Step 4: Force matrix updates before raycast

```js
collider.updateMatrixWorld(true)
```

right before raycasting

---

### Step 5: Log raw hit vs final position

```js
console.log("hit:", hits[0].point)
console.log("final:", finalPosition)
```

If hit is correct but final is wrong:
→ clamp logic is the bug

