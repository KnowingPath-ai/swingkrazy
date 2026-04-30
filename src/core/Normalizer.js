/* ── Normalizer.js ────────────────────────────────────────────────────────
   Normalizes keypoint coordinates for skeleton overlay comparison.
   - Canvas normalization: maps raw pixel coords → [0,1] relative to canvas.
   - Skeleton normalization: translate to pelvis origin, scale by height.
─────────────────────────────────────────────────────────────────────────── */
import { getPoint } from './MetricsEngine.js';

// ── Canvas normalization ──────────────────────────────────────────────────
// TF.js BlazePose returns keypoints in pixel coords relative to input image.
// We normalize to [0,1] for consistent angle math.
export function normalizeKeypointsToCanvas(keypoints, imageWidth, imageHeight) {
  if (!keypoints || !imageWidth || !imageHeight) return keypoints;
  return keypoints.map(kp => ({
    ...kp,
    x: kp.x / imageWidth,
    y: kp.y / imageHeight,
  }));
}

// ── Skeleton normalization for overlay ────────────────────────────────────
// Translates skeleton so pelvis midpoint is at (0,0),
// then scales so pelvis→feet distance = 1.
// Both skeletons then share a unit coordinate space.
export function normalizeSkeleton(pose) {
  if (!pose?.keypoints?.length) return pose;

  const LHIP = getPoint(pose, 'left_hip');
  const RHIP = getPoint(pose, 'right_hip');
  const LANK = getPoint(pose, 'left_ankle');
  const RANK = getPoint(pose, 'right_ankle');

  if (!LHIP || !RHIP) return pose;

  const pelvisX = (LHIP.x + RHIP.x) / 2;
  const pelvisY = (LHIP.y + RHIP.y) / 2;

  let scale = 1;
  if (LANK && RANK) {
    const feetY = (LANK.y + RANK.y) / 2;
    const height = Math.abs(feetY - pelvisY);
    if (height > 0.001) scale = 1 / height;
  }

  const normalized = pose.keypoints.map(kp => ({
    ...kp,
    x: (kp.x - pelvisX) * scale,
    y: (kp.y - pelvisY) * scale,
  }));

  return { ...pose, keypoints: normalized };
}

// ── Project normalized skeleton onto canvas ───────────────────────────────
// Given a normalized skeleton (pelvis-origin, unit scale),
// places it centered at (cx, cy) in canvas coords, scaled by canvasScale.
export function projectToCanvas(normalizedPose, cx, cy, canvasScale) {
  if (!normalizedPose?.keypoints?.length) return normalizedPose;
  return {
    ...normalizedPose,
    keypoints: normalizedPose.keypoints.map(kp => ({
      ...kp,
      x: cx + kp.x * canvasScale,
      y: cy + kp.y * canvasScale,
    })),
  };
}

// ── Mirror keypoints (for down-the-line view of right-handed golfer) ──────
export function mirrorKeypoints(keypoints) {
  if (!keypoints) return keypoints;
  return keypoints.map(kp => ({ ...kp, x: 1 - kp.x }));
}

// ── Orient for portrait video ─────────────────────────────────────────────
// If the video is taller than wide (portrait), we may need to rotate or crop.
// This returns a transform string for the canvas context.
export function getOrientationTransform(videoWidth, videoHeight, canvasWidth, canvasHeight) {
  const videoAspect = videoWidth / videoHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  const scaleX = canvasWidth / videoWidth;
  const scaleY = canvasHeight / videoHeight;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = (canvasWidth  - videoWidth  * scale) / 2;
  const offsetY = (canvasHeight - videoHeight * scale) / 2;

  return { scale, offsetX, offsetY };
}
