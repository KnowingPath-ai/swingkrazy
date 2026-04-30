/* ── SkeletonOverlay.js ───────────────────────────────────────────────────
   Renders dual skeleton (you = KP blue, pro = gold) on a canvas element.
   Supports normalized or raw [0,1] keypoints.
─────────────────────────────────────────────────────────────────────────── */

// BlazePose / MoveNet connection pairs (landmark name pairs)
const SKELETON_CONNECTIONS = [
  // Torso
  ['left_shoulder',  'right_shoulder'],
  ['left_shoulder',  'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip',       'right_hip'],
  // Left arm
  ['left_shoulder',  'left_elbow'],
  ['left_elbow',     'left_wrist'],
  // Right arm
  ['right_shoulder', 'right_elbow'],
  ['right_elbow',    'right_wrist'],
  // Left leg
  ['left_hip',       'left_knee'],
  ['left_knee',      'left_ankle'],
  // Right leg
  ['right_hip',      'right_knee'],
  ['right_knee',     'right_ankle'],
  // Head to shoulders (optional)
  ['nose',           'left_shoulder'],
  ['nose',           'right_shoulder'],
];

// Key joints to draw as larger circles
const KEY_JOINTS = new Set([
  'left_hip', 'right_hip',
  'left_shoulder', 'right_shoulder',
  'left_wrist', 'right_wrist',
  'left_ankle', 'right_ankle',
  'left_knee', 'right_knee',
  'nose',
]);

const KP_BLUE = '#5BA3D9';
const KP_GOLD = '#D4A843';

function getKP(pose, name) {
  return pose?.keypoints?.find(k => k.name === name);
}

// ── Draw a single skeleton ────────────────────────────────────────────────
function drawSkeleton(ctx, pose, color, alpha, cw, ch, opts = {}) {
  if (!pose?.keypoints?.length) return;

  const minScore = opts.minScore ?? 0.3;
  const lineWidth = opts.lineWidth ?? 2.5;
  const jointRadius = opts.jointRadius ?? 5;

  ctx.save();

  // Draw connections (limb lines)
  for (const [nameA, nameB] of SKELETON_CONNECTIONS) {
    const a = getKP(pose, nameA);
    const b = getKP(pose, nameB);
    if (!a || !b) continue;
    if ((a.score ?? 1) < minScore || (b.score ?? 1) < minScore) continue;

    const opacity = Math.min(1, ((a.score ?? 1) + (b.score ?? 1)) / 2) * alpha;
    ctx.beginPath();
    ctx.moveTo(a.x * cw, a.y * ch);
    ctx.lineTo(b.x * cw, b.y * ch);
    ctx.strokeStyle = hexWithAlpha(color, opacity);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Draw joints
  for (const kp of pose.keypoints) {
    if (!kp || (kp.score ?? 1) < minScore) continue;

    const isKey = KEY_JOINTS.has(kp.name);
    const r = isKey ? jointRadius : jointRadius * 0.65;
    const opacity = (kp.score ?? 1) * alpha;

    ctx.beginPath();
    ctx.arc(kp.x * cw, kp.y * ch, r, 0, Math.PI * 2);
    ctx.fillStyle = hexWithAlpha(color, opacity);
    ctx.fill();

    if (isKey) {
      ctx.strokeStyle = hexWithAlpha('#ffffff', opacity * 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ── Glow effect around skeleton ───────────────────────────────────────────
function drawSkeletonGlow(ctx, pose, color, cw, ch) {
  if (!pose?.keypoints?.length) return;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  drawSkeleton(ctx, pose, color, 0.3, cw, ch, { lineWidth: 6, jointRadius: 8, minScore: 0.4 });
  ctx.restore();
}

// ── Main renderer ─────────────────────────────────────────────────────────
export class SkeletonOverlay {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl?.getContext('2d');
    this.userPose = null;
    this.proPose  = null;
    this.showUser = true;
    this.showPro  = true;
    this.showGlow = true;
  }

  setUserPose(pose)  { this.userPose = pose; }
  setProPose(pose)   { this.proPose  = pose; }
  toggleUser(v)      { this.showUser = v; }
  togglePro(v)       { this.showPro  = v; }

  // ── Clear canvas ────────────────────────────────────────────────────
  clear() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // ── Render both skeletons ────────────────────────────────────────────
  draw() {
    if (!this.ctx) return;
    const { canvas, ctx } = this;
    const cw = canvas.width;
    const ch = canvas.height;

    this.clear();

    // Pro first (behind user)
    if (this.proPose && this.showPro) {
      if (this.showGlow) drawSkeletonGlow(ctx, this.proPose, KP_GOLD, cw, ch);
      drawSkeleton(ctx, this.proPose, KP_GOLD, 0.85, cw, ch);
    }

    // User on top
    if (this.userPose && this.showUser) {
      if (this.showGlow) drawSkeletonGlow(ctx, this.userPose, KP_BLUE, cw, ch);
      drawSkeleton(ctx, this.userPose, KP_BLUE, 0.95, cw, ch);
    }

    // Legend
    this._drawLegend(ctx, cw, ch);
  }

  // ── Draw a single frame from frames array ────────────────────────────
  drawFrame(userFrames, proFrames, frameIndex) {
    const uFrame = userFrames?.[frameIndex];
    const pFrame = proFrames?.[Math.round(frameIndex * (proFrames?.length / (userFrames?.length || 1)))];

    this.setUserPose(uFrame?.pose);
    this.setProPose(pFrame?.pose);
    this.draw();
  }

  // ── Draw phase skeletons at key indices ──────────────────────────────
  drawPhase(userFrames, proFrames, userPhases, proPhases, phase) {
    const phaseKey = phase + 'Idx';
    const uIdx = userPhases?.[phaseKey];
    const pIdx = proPhases?.[phaseKey];

    this.setUserPose(uIdx != null ? userFrames[uIdx]?.pose : null);
    this.setProPose(pIdx != null ? proFrames[pIdx]?.pose  : null);
    this.draw();
  }

  // ── Small legend ──────────────────────────────────────────────────────
  _drawLegend(ctx, cw, ch) {
    const items = [];
    if (this.showUser && this.userPose) items.push({ color: KP_BLUE, label: 'Your swing' });
    if (this.showPro  && this.proPose)  items.push({ color: KP_GOLD, label: 'Pro swing' });
    if (!items.length) return;

    ctx.save();
    ctx.font = '600 11px Inter, sans-serif';
    let x = 12, y = ch - 14;

    for (const { color, label } of items) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 5, y - 3, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(226,232,240,0.85)';
      ctx.fillText(label, x + 14, y);
      x += ctx.measureText(label).width + 28;
    }
    ctx.restore();
  }

  // ── Resize canvas to match its display size ──────────────────────────
  fitToContainer() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0)  this.canvas.width  = Math.round(rect.width  * devicePixelRatio);
    if (rect.height > 0) this.canvas.height = Math.round(rect.height * devicePixelRatio);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
  }
}

// ── Utility ───────────────────────────────────────────────────────────────
function hexWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
