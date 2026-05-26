# MotionScope 3D - Premium BVH Motion Analyzer

Designed and engineered by **[Biokineticum](https://biokineticum.com)**.

**MotionScope 3D** is a state-of-the-art, browser-based 3D Biovision Hierarchy (BVH) motion visualizer and biomechanical analytics suite. Engineered entirely in JavaScript using **Three.js** for WebGL rendering and **Chart.js** for telemetry plotting, it offers clinical-grade motion capture analytics inside a responsive cyber-laboratory dark-theme dashboard.

---

## Key Features

* **WebGL 3D Viewport**: Seamless interactive orbit camera (rotate, pan, zoom with damping controls) rendering skeletal frames with ground reflections and casting shadows.
* **Dual Skeleton Styles**: Toggle instantly between **Solid Mode** (rendered cylinder bones and chrome joints) and **Cyber Mode** (glowing retro-futuristic wireframes).
* **Linear Kinematics Engine**: Precomputes and displays absolute world Position ($m$), Velocity ($m/s$), and Acceleration ($m/s^2$) vectors for selected joint nodes per frame.
* **Biomechanical Angle Solver**: Computes key joint flexions/extensions (elbows, knees, shoulders, hips) dynamically.
* **Range of Motion (ROM)**: Aggregates minimum, maximum, and total sweep ranges for every active anatomical joint.
* **Sensor Analytics Graphs**: Integrated absolute overlay plotting dual Y-axis curves for **Velocity Magnitude** ($m/s$) and **Acceleration Magnitude** ($m/s^2$) with real-time vertical time-cursor tracking and interactive chart scrubbing.
* **Multi-Joint Path Tracing**: Double-click any joint in the hierarchy tree to enable glowing neon trajectory trails.
* **Biomechanical CSV Exporter**: Exports frame-by-frame reports containing positions, velocities, accelerations, and anatomical angles.

---

## File Structure

```text
web-bvh-viewer/
├── index.html        # App interface and canvas layouts
├── README.md         # Documentation
├── .gitignore        # Version control filters
├── css/
│   └── style.css     # Glassmorphic layout and cyber theme
└── js/
    ├── bvhParser.js  # Stack parser and forward kinematics tree solver
    ├── kinematics.js # Linear differences, vector angle, and ROM mappers
    ├── scene3d.js    # Three.js render buffers, alignment matrices, and tracers
    └── ui.js         # Tick loop, scrubbing bindings, and CSV generators
```

---

## Quick Start

### 1. Launch a Local Web Server
Since the browser's security model prevents loading local file contents direct from static fetches, you need to serve the folder:

**Using Python:**
```bash
python -m http.server 8080
```

**Using Node.js / NPX:**
```bash
npx http-server -p 8080
```

### 2. Access the Application
Open your browser and navigate to:
**[http://localhost:8080](http://localhost:8080)**

### 3. Load Mocap Data
Drag any standard `.bvh` motion capture file anywhere into the 3D viewport canvas or click the **LOAD BVH FILE** button to browse.

---

## Keyboard Shortcuts

* `Space`: Toggle Play / Pause playback
* `ArrowLeft`: Step backward one frame
* `ArrowRight`: Step forward one frame
* `Key F`: Reset viewport camera target on the character Hips
