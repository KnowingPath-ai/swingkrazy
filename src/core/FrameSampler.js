/* ── FrameSampler.js ──────────────────────────────────────────────────────
   Extracts frames from a video element using seeked-event loop.
   Passes each frame to PoseEngine and builds swingFrames[].

   swingFrames shape:
     { frameIndex, time, pose: { keypoints }, metrics: {…} }
─────────────────────────────────────────────────────────────────────────── */
import { estimatePose } from './PoseEngine.js';
import { computeFrameMetrics } from './MetricsEngine.js';
import { normalizeKeypointsToCanvas } from './Normalizer.js';

const MAX_CANVAS_DIMENSION = 640; // downsample for performance

// ── Create offscreen canvas ───────────────────────────────────────────────
function createOffscreenCtx(video) {
  const vw = video.videoWidth  || 640;
  const vh = video.videoHeight || 360;

  let dw = vw, dh = vh;
  if (vw > MAX_CANVAS_DIMENSION || vh > MAX_CANVAS_DIMENSION) {
    const ratio = Math.min(MAX_CANVAS_DIMENSION / vw, MAX_CANVAS_DIMENSION / vh);
    dw = Math.round(vw * ratio);
    dh = Math.round(vh * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  return { canvas, ctx: canvas.getContext('2d'), dw, dh, vw, vh };
}

// ── Sample timestamps from video duration ─────────────────────────────────
function buildTimestamps(duration, targetFps = 15, maxFrames = 300) {
  const interval = 1 / targetFps;
  const count = Math.min(maxFrames, Math.floor(duration * targetFps));
  return Array.from({ length: count }, (_, i) => +(i * interval).toFixed(4));
}

// ── Main sampler ──────────────────────────────────────────────────────────
export async function sampleVideo(videoEl, options = {}) {
  const {
    targetFps    = 15,
    maxFrames    = 300,
    onProgress   = null,
    signal       = null,   // AbortSignal for cancellation
  } = options;

  if (!videoEl || !videoEl.src) throw new Error('No video source');

  // Ensure metadata is loaded
  await ensureMetadata(videoEl);

  const duration = videoEl.duration;
  if (!duration || !isFinite(duration)) throw new Error('Invalid video duration');

  const timestamps = buildTimestamps(duration, targetFps, maxFrames);
  const total = timestamps.length;
  const { canvas, ctx, dw, dh, vw, vh } = createOffscreenCtx(videoEl);

  const frames = [];
  let cancelled = false;

  if (signal) signal.addEventListener('abort', () => { cancelled = true; });

  for (let i = 0; i < total; i++) {
    if (cancelled) break;

    const t = timestamps[i];
    await seekTo(videoEl, t);
    if (cancelled) break;

    // Draw current frame to offscreen canvas
    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(videoEl, 0, 0, dw, dh);

    let pose = null;
    try {
      const rawPose = await estimatePose(canvas);
      if (rawPose) {
        // Normalize keypoint pixel coords → [0,1]
        const normalized = normalizeKeypointsToCanvas(rawPose.keypoints, dw, dh);
        pose = { ...rawPose, keypoints: normalized };
      }
    } catch (err) {
      console.warn(`[FrameSampler] Pose failed at t=${t}:`, err);
    }

    const metrics = pose ? computeFrameMetrics(pose) : {};

    frames.push({
      frameIndex: i,
      time: t,
      pose: pose || { keypoints: [] },
      metrics,
      canvasWidth:  dw,
      canvasHeight: dh,
      videoWidth:   vw,
      videoHeight:  vh,
    });

    if (onProgress) {
      onProgress(Math.round(((i + 1) / total) * 100), i + 1, total);
    }
  }

  return frames;
}

// ── Seek video to a precise time ──────────────────────────────────────────
function seekTo(videoEl, time) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      videoEl.removeEventListener('seeked', onSeeked);
      resolve(); // don't reject — just continue with current frame
    }, 3000);

    function onSeeked() {
      clearTimeout(timeout);
      videoEl.removeEventListener('seeked', onSeeked);
      resolve();
    }

    videoEl.addEventListener('seeked', onSeeked, { once: true });
    videoEl.currentTime = time;
  });
}

// ── Ensure video metadata is loaded ──────────────────────────────────────
function ensureMetadata(videoEl) {
  return new Promise((resolve, reject) => {
    if (videoEl.readyState >= 1) { resolve(); return; }
    const timeout = setTimeout(() => reject(new Error('Video metadata timeout')), 10000);
    videoEl.addEventListener('loadedmetadata', () => {
      clearTimeout(timeout); resolve();
    }, { once: true });
    videoEl.load();
  });
}

// ── Load a File into a video element ─────────────────────────────────────
export function loadVideoFile(videoEl, file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    videoEl.src = url;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.preload = 'auto';

    const onError = () => {
      const msg = videoEl.error ? videoEl.error.message : 'Unknown decode error';
      reject(new Error(`Video load error: ${msg}`));
    };

    videoEl.addEventListener('loadedmetadata', () => {
      // Kick off a seek to force first-frame decode (critical for rotated/portrait
      // MOV files where the browser defers rendering until a seek is issued).
      // Resolve immediately — don't await seeked, which can silently not fire at t=0.
      videoEl.currentTime = 0.001;
      resolve();
    }, { once: true });

    videoEl.addEventListener('error', onError, { once: true });
    videoEl.load();
  });
}
