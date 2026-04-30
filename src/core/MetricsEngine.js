/* ── MetricsEngine.js ─────────────────────────────────────────────────────
   All angle and metric computations for golf swing analysis.
   Pure functions, no DOM dependencies.
─────────────────────────────────────────────────────────────────────────── */

// ── Math helpers ──────────────────────────────────────────────────────────
function deg(rad) { return rad * 180 / Math.PI; }
function vec(a, b) { return { x: b.x - a.x, y: b.y - a.y }; }
function dot(u, v) { return u.x * v.x + u.y * v.y; }
function norm(u) { return Math.sqrt(u.x * u.x + u.y * u.y); }
function midPoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

function angleBetween(u, v) {
  const n = norm(u) * norm(v);
  if (n === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / n)));
}

// ── Keypoint accessor ─────────────────────────────────────────────────────
export function getPoint(pose, name) {
  if (!pose || !pose.keypoints) return null;
  const kp = pose.keypoints.find(k => k.name === name);
  return (kp && (kp.score == null || kp.score >= 0.3)) ? kp : null;
}

// ── Core angle functions ──────────────────────────────────────────────────

export function hipAngleDeg(pose) {
  const LHIP = getPoint(pose, 'left_hip');
  const RHIP = getPoint(pose, 'right_hip');
  if (!LHIP || !RHIP) return null;
  const H = vec(LHIP, RHIP);
  return deg(Math.atan2(H.y, H.x));
}

export function shoulderAngleDeg(pose) {
  const LSHO = getPoint(pose, 'left_shoulder');
  const RSHO = getPoint(pose, 'right_shoulder');
  if (!LSHO || !RSHO) return null;
  const S = vec(LSHO, RSHO);
  return deg(Math.atan2(S.y, S.x));
}

export function xFactorDeg(pose) {
  const hip = hipAngleDeg(pose);
  const sh  = shoulderAngleDeg(pose);
  if (hip == null || sh == null) return null;
  return sh - hip;
}

export function spineTiltDeg(pose) {
  const LHIP = getPoint(pose, 'left_hip');
  const RHIP = getPoint(pose, 'right_hip');
  const LSHO = getPoint(pose, 'left_shoulder');
  const RSHO = getPoint(pose, 'right_shoulder');
  if (!LHIP || !RHIP || !LSHO || !RSHO) return null;

  const PELVIS = midPoint(LHIP, RHIP);
  const CHEST  = midPoint(LSHO, RSHO);
  const SP = vec(PELVIS, CHEST);
  const VERTICAL = { x: 0, y: -1 }; // up in screen coords
  return deg(angleBetween(SP, VERTICAL));
}

export function wristHingeDeg(pose) {
  const RELB   = getPoint(pose, 'right_elbow');
  const RWRIST = getPoint(pose, 'right_wrist');
  const RHAND  = getPoint(pose, 'right_index') || getPoint(pose, 'right_pinky');
  if (!RELB || !RWRIST || !RHAND) return null;

  const FA   = vec(RELB, RWRIST);
  const HAND = vec(RWRIST, RHAND);
  return deg(angleBetween(FA, HAND));
}

export function weightShift(pose) {
  const LANK = getPoint(pose, 'left_ankle');
  const RANK = getPoint(pose, 'right_ankle');
  const LHIP = getPoint(pose, 'left_hip');
  const RHIP = getPoint(pose, 'right_hip');
  if (!LHIP || !RHIP) return null;
  if (!LANK || !RANK) {
    // fallback: use hip lateral position
    const mid = (LHIP.x + RHIP.x) / 2;
    const spread = Math.abs(LHIP.x - RHIP.x) || 1;
    return (mid - Math.min(LHIP.x, RHIP.x)) / spread;
  }
  const ankleSpan = Math.abs(LANK.x - RANK.x) || 1;
  const hipMid = (LHIP.x + RHIP.x) / 2;
  const trailAnkle = Math.min(LANK.x, RANK.x);
  return (hipMid - trailAnkle) / ankleSpan;
}

// ── Per-frame metrics bundle ──────────────────────────────────────────────
export function computeFrameMetrics(pose) {
  return {
    hipRotationDeg:      hipAngleDeg(pose),
    shoulderRotationDeg: shoulderAngleDeg(pose),
    xFactorDeg:          xFactorDeg(pose),
    spineTiltDeg:        spineTiltDeg(pose),
    wristHingeDeg:       wristHingeDeg(pose),
    weightShift:         weightShift(pose),
  };
}

// ── Ideal ranges by phase ─────────────────────────────────────────────────
export const IDEAL_RANGES = {
  address: {
    hipRotationDeg:      { min: -5,  max: 5   },
    shoulderRotationDeg: { min: -5,  max: 5   },
    spineTiltDeg:        { min: 12,  max: 20  },
    wristHingeDeg:       { min: 0,   max: 10  },
  },
  top: {
    hipRotationDeg:      { min: 35,  max: 50  },
    shoulderRotationDeg: { min: 70,  max: 100 },
    xFactorDeg:          { min: 20,  max: 40  },
    spineTiltDeg:        { min: 12,  max: 20  },
    wristHingeDeg:       { min: 50,  max: 90  },
  },
  impact: {
    hipRotationDeg:      { min: 60,  max: 90  },
    shoulderRotationDeg: { min: 20,  max: 60  },
    spineTiltDeg:        { min: 10,  max: 20  },
  },
  finish: {
    hipRotationDeg:      { min: 80,  max: 100 },
    shoulderRotationDeg: { min: 90,  max: 110 },
    spineTiltDeg:        { min: 0,   max: 10  },
  },
};

// ── Coaching cues ─────────────────────────────────────────────────────────
export const COACHING_CUES = {
  address: {
    hipRotationDeg:      'Keep hips neutral at address — a closed or open stance can throw off your path.',
    shoulderRotationDeg: 'Align shoulders with your hip line at setup.',
    spineTiltDeg:        'Maintain a stable forward tilt over the ball — avoid standing too upright.',
    wristHingeDeg:       'Keep wrists relaxed and flat at address.',
  },
  top: {
    hipRotationDeg:      'Let your hips turn fully — trail hip should stay inside the heel.',
    shoulderRotationDeg: 'Aim for a full shoulder turn; trail shoulder should pass behind your head.',
    xFactorDeg:          'Maintain your coil — the shoulder-hip separation creates stored power.',
    spineTiltDeg:        'Keep your address spine tilt through the backswing; avoid standing up.',
    wristHingeDeg:       'Set the club fully — avoid over-cupping or bowing the lead wrist.',
  },
  impact: {
    hipRotationDeg:      'Clear the lead hip — hips should be more open than at address.',
    shoulderRotationDeg: 'Keep chest slightly open at impact; a closed chest causes pulled shots.',
    xFactorDeg:          'Maintain lag — avoid letting hips spin out ahead of the shoulders.',
    spineTiltDeg:        'Hold your spine tilt through impact; early extension loses power.',
    wristHingeDeg:       'Keep hands ahead of the ball at impact — this creates shaft lean and compression.',
  },
  finish: {
    hipRotationDeg:      'Rotate fully — your belt buckle should face the target.',
    shoulderRotationDeg: 'Chest through to the target — no stalling in the follow-through.',
    spineTiltDeg:        'Finish balanced and upright; hold the pose for 2 seconds.',
  },
};

// ── Metrics configuration ─────────────────────────────────────────────────
export const METRICS_CONFIG = [
  { key: 'hipRotationDeg',      label: 'Hip Rotation',      unit: '°' },
  { key: 'shoulderRotationDeg', label: 'Shoulder Rotation', unit: '°' },
  { key: 'xFactorDeg',          label: 'X-Factor',          unit: '°' },
  { key: 'spineTiltDeg',        label: 'Spine Tilt',        unit: '°' },
  { key: 'wristHingeDeg',       label: 'Wrist Hinge',       unit: '°' },
];

export const PHASES = ['address', 'top', 'impact', 'finish'];
export const PHASE_LABELS = {
  address: 'Address', top: 'Top of Backswing', impact: 'Impact', finish: 'Finish'
};

// ── Build phase metrics comparison table ──────────────────────────────────
export function buildPhaseMetricsTable(userFrames, proFrames, userPhases, proPhases) {
  const rows = [];

  const phaseKeys = {
    address: 'addressIdx',
    top:     'topIdx',
    impact:  'impactIdx',
    finish:  'finishIdx',
  };

  for (const phase of PHASES) {
    const uIdx = userPhases[phaseKeys[phase]];
    const pIdx = proPhases ? proPhases[phaseKeys[phase]] : null;
    if (uIdx == null) continue;

    const uFrame = userFrames[uIdx];
    const pFrame = pIdx != null ? proFrames[pIdx] : null;

    if (!uFrame) continue;
    const uM = uFrame.metrics;
    const pM = pFrame ? pFrame.metrics : null;

    const phaseRanges = IDEAL_RANGES[phase] || {};
    const phaseCues   = COACHING_CUES[phase] || {};

    for (const m of METRICS_CONFIG) {
      const youVal = uM?.[m.key];
      const proVal = pM?.[m.key];
      if (youVal == null) continue;

      const diff = proVal != null ? youVal - proVal : null;
      const range = phaseRanges[m.key];

      let status = 'ok';
      if (range && youVal != null) {
        if (youVal < range.min - 5 || youVal > range.max + 5) status = 'off';
        else if (youVal < range.min || youVal > range.max) status = 'warn';
        else status = 'good';
      }

      rows.push({
        phase,
        phaseLabel: PHASE_LABELS[phase],
        metric: m.label,
        metricKey: m.key,
        unit: m.unit,
        you: youVal != null ? +youVal.toFixed(1) : null,
        pro: proVal != null ? +proVal.toFixed(1) : null,
        diff: diff != null ? +diff.toFixed(1) : null,
        idealMin: range?.min,
        idealMax: range?.max,
        status,
        cue: phaseCues[m.key] || '',
      });
    }
  }

  return rows;
}

// ── Tempo ─────────────────────────────────────────────────────────────────
export function computeTempo(frames, phases) {
  const { addressIdx, topIdx, impactIdx } = phases;
  if (addressIdx == null || topIdx == null || impactIdx == null) return null;

  const backswingFrames = topIdx - addressIdx;
  const downswingFrames = impactIdx - topIdx;
  if (backswingFrames <= 0 || downswingFrames <= 0) return null;

  return {
    backswingFrames,
    downswingFrames,
    ratio: +(backswingFrames / downswingFrames).toFixed(2),
  };
}
