/* ── PoseEngine.js ────────────────────────────────────────────────────────
   Loads and runs TF.js pose estimation (BlazePose or MoveNet).
   Handles WebGPU → WebGL → WASM backend fallback.
   Exposes: init(), estimatePose(imageSource), dispose()
─────────────────────────────────────────────────────────────────────────── */

const CDN_BASE = 'https://cdn.jsdelivr.net/npm';

// Model config options
export const MODEL_OPTIONS = {
  blazepose: {
    label: 'BlazePose (33 keypoints — best accuracy)',
    tfModel: 'BlazePose',
  },
  movenet_lightning: {
    label: 'MoveNet Lightning (17 keypoints — fast)',
    tfModel: 'MoveNet',
    variant: 'SinglePose.Lightning',
  },
  movenet_thunder: {
    label: 'MoveNet Thunder (17 keypoints — accurate)',
    tfModel: 'MoveNet',
    variant: 'SinglePose.Thunder',
  },
};

// BlazePose keypoint index → name mapping (33 landmarks)
// MoveNet uses 17 landmarks; we map them to the same names.
const BLAZEPOSE_LANDMARKS = [
  'nose','left_eye_inner','left_eye','left_eye_outer',
  'right_eye_inner','right_eye','right_eye_outer',
  'left_ear','right_ear','mouth_left','mouth_right',
  'left_shoulder','right_shoulder','left_elbow','right_elbow',
  'left_wrist','right_wrist','left_pinky','right_pinky',
  'left_index','right_index','left_thumb','right_thumb',
  'left_hip','right_hip','left_knee','right_knee',
  'left_ankle','right_ankle','left_heel','right_heel',
  'left_foot_index','right_foot_index',
];

const MOVENET_LANDMARKS = [
  'nose','left_eye','right_eye','left_ear','right_ear',
  'left_shoulder','right_shoulder','left_elbow','right_elbow',
  'left_wrist','right_wrist','left_hip','right_hip',
  'left_knee','right_knee','left_ankle','right_ankle',
];

let detector = null;
let modelType = null;
let isInitialized = false;

// ── Backend setup ─────────────────────────────────────────────────────────
async function setupBackend() {
  if (typeof tf === 'undefined') throw new Error('TensorFlow.js not loaded');

  // Try WebGPU first, fall back to WebGL, then WASM
  const backends = ['webgpu', 'webgl', 'wasm'];
  for (const backend of backends) {
    try {
      await tf.setBackend(backend);
      await tf.ready();
      console.log(`[PoseEngine] Using TF.js backend: ${backend}`);
      return backend;
    } catch {
      // try next
    }
  }
  throw new Error('No TF.js backend available');
}

// ── Load scripts dynamically ──────────────────────────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Initialize ────────────────────────────────────────────────────────────
export async function init(selectedModel = 'blazepose', onProgress = null) {
  if (isInitialized && modelType === selectedModel) return;

  onProgress?.('Loading TensorFlow.js…', 5);

  // TF.js core + backends (loaded via CDN in index.html)
  // If not present, load them now
  if (typeof tf === 'undefined') {
    await loadScript(`${CDN_BASE}/@tensorflow/tfjs@4.20.0/dist/tf.min.js`);
  }

  const backend = await setupBackend();

  onProgress?.('Loading pose detection model…', 20);

  // Load the pose detection library
  if (typeof poseDetection === 'undefined') {
    await loadScript(`${CDN_BASE}/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js`);
  }

  if (detector) { detector.dispose?.(); detector = null; }

  onProgress?.('Initializing model…', 50);

  try {
    if (selectedModel === 'blazepose') {
      detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.BlazePose,
        {
          runtime: 'tfjs',
          modelType: 'full',
          enableSmoothing: false,
        }
      );
    } else if (selectedModel === 'movenet_lightning') {
      detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
    } else if (selectedModel === 'movenet_thunder') {
      detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER }
      );
    }
  } catch (err) {
    // BlazePose may fail on some browsers — fall back to MoveNet
    console.warn('[PoseEngine] BlazePose failed, falling back to MoveNet:', err);
    detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
    );
    selectedModel = 'movenet_lightning';
  }

  modelType = selectedModel;
  isInitialized = true;
  onProgress?.('Model ready', 100);
  return { backend, modelType };
}

// ── Estimate pose from image/canvas/video element ─────────────────────────
export async function estimatePose(imageSource) {
  if (!detector) throw new Error('PoseEngine not initialized — call init() first');

  const poses = await detector.estimatePoses(imageSource, {
    flipHorizontal: false,
    maxPoses: 1,
  });

  if (!poses?.length) return null;

  const raw = poses[0];
  const landmarkNames = modelType === 'blazepose' ? BLAZEPOSE_LANDMARKS : MOVENET_LANDMARKS;

  // Normalize keypoint shape: {name, x, y, score}
  const keypoints = raw.keypoints.map((kp, i) => ({
    name:  kp.name || landmarkNames[i] || `kp_${i}`,
    x:     kp.x,
    y:     kp.y,
    score: kp.score ?? 1,
  }));

  // BlazePose also has keypoints3D — ignore for 2D analysis
  return { keypoints, score: raw.score ?? 1 };
}

// ── Dispose ───────────────────────────────────────────────────────────────
export function dispose() {
  if (detector) { detector.dispose?.(); detector = null; }
  isInitialized = false;
}

export function isReady() { return isInitialized && detector != null; }
export function getModelType() { return modelType; }
