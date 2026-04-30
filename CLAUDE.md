# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **spec-and-scaffold** project for a **browser-only, fully local golf swing analysis app**. No code has been implemented yet — the `specs/` folder contains detailed design documents, math, and JS scaffolding ready to be assembled into `index.html` + JS modules.

The goal: upload your swing video and a pro swing video → run pose estimation locally in Edge → normalize both skeletons → compare frame-by-frame at 4 swing phases → display angle metrics, skeleton overlays, and coaching cues. No cloud, no uploads.

## Tech Stack (browser-only, no build step)

- **HTML + vanilla JS** — no frameworks, no bundler
- **TensorFlow.js + BlazePose or MoveNet** — 33-keypoint pose estimation via CDN
- **OpenCV.js (WASM build)** — skeleton drawing, angle math, frame operations
- **IndexedDB** — optional local session storage
- Runs entirely in Edge/Chrome; targets **WebGPU** acceleration where available

## Architecture

### Data Pipeline (per video)

```
Video file  →  Frame sampler (seeked-event loop, ~30fps)
            →  Pose estimation (TF.js BlazePose/MoveNet)
            →  frames[]: { time, pose: { keypoints: [{name,x,y,score}] }, metrics: {...} }
            →  Phase detection (address / top / impact / finish indices)
            →  Metrics comparison (you vs pro, per phase)
            →  Visualization (canvas overlays, tables, charts)
```

### Keypoint Convention

BlazePose/MoveNet landmark names used throughout: `left_hip`, `right_hip`, `left_shoulder`, `right_shoulder`, `left_elbow`, `right_elbow`, `left_wrist`, `right_wrist`, `left_knee`, `right_knee`, `left_ankle`, `right_ankle`, `right_index` (hand proxy).

### Core Math (see `specs/math-hip-shoulder-rotation.txt`, `specs/js-functions-4-angles-phases.txt`)

All angle functions are already specified as concrete JS. Key functions:
- `hipAngleDeg(pose)` — `atan2` of LHIP→RHIP vs x-axis
- `shoulderAngleDeg(pose)` — `atan2` of LSHO→RSHO vs x-axis
- `xFactorDeg(pose)` — shoulder angle minus hip angle (coil metric)
- `spineTiltDeg(pose)` — angle of pelvis→chest vector vs vertical
- `wristHingeDeg(pose)` — angle at right wrist (forearm vs hand vectors)
- `computeFrameMetrics(pose)` — returns all five metrics for one frame

### Phase Detection

Four key frame indices per swing: `addressIdx`, `topIdx`, `impactIdx`, `finishIdx`.
- **Address** — sliding window where hip + shoulder angle variance drops below threshold
- **Top** — frame with max shoulder rotation delta from address (within first 70% of frames)
- **Impact** — frame where lead wrist x is closest to ball-line x (recorded at address)
- **Finish** — last low-variance window for hip + shoulder angles

### Normalization for Skeleton Overlay

Before overlaying two skeletons on the same canvas: translate to pelvis origin, scale by pelvis→feet height. Both skeletons then share a unit coordinate space so differences reflect mechanics, not body size.

## Spec Files Reference

| File | Contents |
|------|----------|
| `specs/implementation-plans.txt` | Full implementation plan (A–D) + complete HTML scaffold |
| `specs/math-hip-shoulder-rotation.txt` | Math derivations for all angles + phase detection algorithm |
| `specs/js-functions-4-angles-phases.txt` | Ready-to-paste JS functions for all metrics + phase detectors |
| `specs/wired-version.txt` | Tabbed UI for phase metrics table wired into the scaffold |
| `specs/additional-overlays.txt` | 5 additional features: skeleton overlay, heatmap, tempo chart, weight shift, club path |
| `specs/phase-metric-18.csv` | 18-row metrics table structure (phase × metric, with coaching cues) |
| `specs/metric-ideal-range-3.csv` | Ideal ranges at **Finish** (hip, shoulder, spine) |
| `specs/metric-ideal-range-4.csv` | Ideal ranges at **Address** |
| `specs/metric-ideal-range-5.csv` | Ideal ranges at **Top of backswing** |

## Iteration Roadmap

1. **MVP** — upload both videos, run BlazePose, show 4-frame skeletons with phase tabs and angle metrics table
2. **v2** — add skeleton overlay canvas (you=blue, pro=red, normalized) + joint delta heatmap
3. **v3** — tempo chart (backswing/downswing ratio), weight shift per phase, club path from lead wrist trajectory
4. **v4** — real-time webcam feedback

## Key Design Constraints

- All computation runs **client-side**; never send video/pose data to a server
- Right-handed golfer assumed; face-on camera view (target line = x-axis)
- Pro reference video is a local file pre-loaded by the user (not hardcoded URL)
- Skeleton drawing uses plain `<canvas>` 2D context; OpenCV.js is for math support only
- Phase sync between user and pro uses normalized swing timeline (0–100%) not raw frame indices
