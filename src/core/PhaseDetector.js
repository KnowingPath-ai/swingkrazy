/* ── PhaseDetector.js ─────────────────────────────────────────────────────
   Heuristic segmentation of swing frames into 6 phases.
   All functions are pure — no DOM dependencies.
─────────────────────────────────────────────────────────────────────────── */
import { getPoint } from './MetricsEngine.js';

// ── Variance helper ───────────────────────────────────────────────────────
function variance(arr, i0, i1) {
  const slice = arr.slice(i0, i1);
  if (!slice.length) return Infinity;
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  return slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
}

// ── Address: first low-variance window ────────────────────────────────────
export function detectAddressIndex(frames, windowSec = 0.4, varThreshold = 8) {
  if (!frames.length) return 0;
  const n = frames.length;
  const times = frames.map(f => f.time);
  const duration = (times[n - 1] - times[0]) || 1;
  const windowFrames = Math.max(3, Math.round(windowSec / (duration / n)));

  const hip = frames.map(f => f.metrics?.hipRotationDeg ?? 0);
  const sh  = frames.map(f => f.metrics?.shoulderRotationDeg ?? 0);

  // search only the first 40% of frames for address
  const searchEnd = Math.floor(n * 0.4);
  for (let start = 0; start + windowFrames <= searchEnd; start++) {
    const end = start + windowFrames;
    if (variance(hip, start, end) < varThreshold &&
        variance(sh,  start, end) < varThreshold) {
      return Math.floor((start + end) / 2);
    }
  }
  return 0;
}

// ── Top of backswing: max shoulder delta within first 70% ─────────────────
export function detectTopIndex(frames, addressIdx) {
  if (!frames.length) return addressIdx;
  const n = frames.length;
  const maxIdx = Math.floor(n * 0.7);
  const sh0 = frames[addressIdx]?.metrics?.shoulderRotationDeg ?? 0;

  let bestIdx = addressIdx;
  let bestDelta = 0;

  for (let i = addressIdx + 1; i <= maxIdx && i < n; i++) {
    const sh = frames[i].metrics?.shoulderRotationDeg;
    if (sh == null) continue;
    const delta = Math.abs(sh - sh0);
    if (delta > bestDelta) { bestDelta = delta; bestIdx = i; }
  }
  return bestIdx;
}

// ── Impact: lead wrist x closest to ball-line x at address ───────────────
export function detectImpactIndex(frames, addressIdx, topIdx) {
  if (!frames.length) return topIdx + 1;
  const n = frames.length;

  // ball-line x = lead wrist x at address
  const addrPose = frames[addressIdx]?.pose;
  const LWRIST0 = addrPose ? getPoint(addrPose, 'left_wrist') : null;
  const ballX = LWRIST0 ? LWRIST0.x : 0.5;

  let bestIdx = Math.min(topIdx + 1, n - 1);
  let bestDist = Infinity;

  for (let i = topIdx + 1; i < n; i++) {
    const LWRIST = getPoint(frames[i].pose, 'left_wrist');
    if (!LWRIST) continue;
    const d = Math.abs(LWRIST.x - ballX);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

// ── Finish: last low-variance window after impact ─────────────────────────
export function detectFinishIndex(frames, impactIdx, windowSec = 0.4, varThreshold = 8) {
  const n = frames.length;
  if (!n) return n - 1;

  const times = frames.map(f => f.time);
  const duration = (times[n - 1] - times[0]) || 1;
  const windowFrames = Math.max(3, Math.round(windowSec / (duration / n)));

  const hip = frames.map(f => f.metrics?.hipRotationDeg ?? 0);
  const sh  = frames.map(f => f.metrics?.shoulderRotationDeg ?? 0);

  // scan backwards from end
  for (let start = n - windowFrames; start >= impactIdx; start--) {
    const end = start + windowFrames;
    if (end > n) continue;
    if (variance(hip, start, end) < varThreshold &&
        variance(sh,  start, end) < varThreshold) {
      return Math.floor((start + end) / 2);
    }
  }
  return n - 1;
}

// ── Main detector ─────────────────────────────────────────────────────────
export function detectPhases(frames) {
  if (!frames || frames.length < 5) {
    const last = (frames?.length ?? 1) - 1;
    return { addressIdx: 0, topIdx: Math.floor(last / 3), impactIdx: Math.floor(last * 2 / 3), finishIdx: last };
  }

  const addressIdx = detectAddressIndex(frames);
  const topIdx     = detectTopIndex(frames, addressIdx);
  const impactIdx  = detectImpactIndex(frames, addressIdx, topIdx);
  const finishIdx  = detectFinishIndex(frames, impactIdx);

  return { addressIdx, topIdx, impactIdx, finishIdx };
}

// ── Phase label for a given frame index ───────────────────────────────────
export function getPhaseLabel(frameIdx, phases) {
  const { addressIdx, topIdx, impactIdx, finishIdx } = phases;
  if (frameIdx < addressIdx)    return 'pre-address';
  if (frameIdx === addressIdx)  return 'address';
  if (frameIdx < topIdx)        return 'backswing';
  if (frameIdx === topIdx)      return 'top';
  if (frameIdx < impactIdx)     return 'downswing';
  if (frameIdx === impactIdx)   return 'impact';
  if (frameIdx <= finishIdx)    return 'finish';
  return 'post-finish';
}
