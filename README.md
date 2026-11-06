# MotionScope 3D (`web-bvh-viewer`)

**Browser-based BVH viewer and kinematics dashboard** — Three.js viewport + Chart.js telemetry for joint position, velocity, acceleration and anatomical angles.

For motion-capture users, coaches and researchers who need a quick **no-install** look at `.bvh` files.

Live demo (if deployed): [web-bvh-viewer.vercel.app](https://web-bvh-viewer.vercel.app)

## Features

- WebGL skeleton (solid / cyber styles), orbit camera, path tracing
- Linear kinematics (position, velocity, acceleration) and joint angle / ROM summaries
- Dual-axis velocity & acceleration charts with scrubbing
- CSV export of frame-wise metrics

## Quick start

Serve the folder (browsers block raw `file://` loads):

```bash
git clone https://github.com/biokineticum/web-bvh-viewer.git
cd web-bvh-viewer
python -m http.server 8080
# or: npx http-server -p 8080
```

Open http://localhost:8080 — drag a `.bvh` onto the viewport or use **LOAD BVH FILE**.

## Shortcuts

- `Space` — play / pause  
- `←` / `→` — step frames  
- `F` — refocus camera on hips  

## Layout

```
index.html
css/style.css
js/bvhParser.js | kinematics.js | scene3d.js | ui.js
```

---

## Author

**Dariusz Mosler** (Biokineticum) — physiotherapy, biomechanics, sports science  
🌐 [biokineticum.com](https://biokineticum.com) · 📰 [Substack](https://biokineticum.substack.com) · 𝕏 [@Biokineticum](https://x.com/Biokineticum)

