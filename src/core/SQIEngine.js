/* ── SQIEngine.js ─────────────────────────────────────────────────────────
   Swing Quality Index scorer (0–100).
   Normalizes each metric against ideal ranges.
   Produces sub-scores, letter grade, and coaching cue list.
─────────────────────────────────────────────────────────────────────────── */
import { IDEAL_RANGES, COACHING_CUES, METRICS_CONFIG } from './MetricsEngine.js';

// ── SQI weighting ─────────────────────────────────────────────────────────
const SQI_WEIGHTS = {
  hipRotation:      0.20,
  shoulderRotation: 0.18,
  xFactor:          0.18,
  spineTilt:        0.16,
  wristHinge:       0.14,
  tempo:            0.08,
  weightShift:      0.06,
};

// Map from metric keys → SQI component keys
const METRIC_TO_SQI = {
  hipRotationDeg:      'hipRotation',
  shoulderRotationDeg: 'shoulderRotation',
  xFactorDeg:          'xFactor',
  spineTiltDeg:        'spineTilt',
  wristHingeDeg:       'wristHinge',
};

// ── Normalize a single metric value → [0,1] score ─────────────────────────
// 1.0 = perfectly in range, 0.0 = far out of range
function normalizeMetric(value, range) {
  if (value == null || !range) return null;
  const { min, max } = range;
  const mid = (min + max) / 2;
  const halfSpan = (max - min) / 2;

  if (value >= min && value <= max) return 1.0;

  // Distance outside range, normalized to half-span
  const overshoot = value < min ? min - value : value - max;
  const penalty = overshoot / Math.max(halfSpan, 5); // 5° tolerance
  return Math.max(0, 1 - penalty);
}

// ── Score a single phase's metrics ────────────────────────────────────────
function scorePhase(phaseMetrics, phase) {
  const ranges = IDEAL_RANGES[phase] || {};
  const scores = {};

  for (const m of METRICS_CONFIG) {
    const value = phaseMetrics[m.key];
    const range = ranges[m.key];
    if (range && value != null) {
      scores[METRIC_TO_SQI[m.key]] = normalizeMetric(value, range);
    }
  }

  return scores;
}

// ── Compute SQI from phase metrics ────────────────────────────────────────
// phaseMetrics: { address: {hipRotationDeg, …}, top: {…}, impact: {…}, finish: {…} }
// tempo: { ratio } (optional)
export function computeSQI(phaseMetrics, tempo = null) {
  // Gather per-metric scores across all phases (use worst phase for each metric)
  const componentScores = {};
  const allPhaseScores = [];

  for (const phase of ['address', 'top', 'impact', 'finish']) {
    const pm = phaseMetrics[phase];
    if (!pm) continue;
    const phaseScores = scorePhase(pm, phase);
    allPhaseScores.push(phaseScores);
  }

  // Aggregate: average across phases for each component
  const components = Object.keys(SQI_WEIGHTS);
  for (const comp of components) {
    const vals = allPhaseScores.map(ps => ps[comp]).filter(v => v != null);
    componentScores[comp] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  // Tempo score
  if (tempo?.ratio != null) {
    const idealRatio = 3.0;
    const ratioDiff = Math.abs(tempo.ratio - idealRatio);
    componentScores.tempo = Math.max(0, 1 - ratioDiff / idealRatio);
  }

  // Weight shift: simplified — use top-of-backswing weight shift proximity to trail side
  // If weight shift not available, skip it
  if (componentScores.weightShift == null) {
    // Redistribute weight on other components
    const available = Object.entries(componentScores).filter(([, v]) => v != null);
    if (!available.length) return { sqi: 0, grade: 'F', componentScores, cues: [] };
  }

  // Compute weighted SQI
  let totalWeight = 0;
  let weightedScore = 0;

  for (const [comp, weight] of Object.entries(SQI_WEIGHTS)) {
    const score = componentScores[comp];
    if (score != null) {
      weightedScore += score * weight;
      totalWeight += weight;
    }
  }

  const sqi = totalWeight > 0
    ? Math.round((weightedScore / totalWeight) * 100)
    : 0;

  return {
    sqi: Math.max(0, Math.min(100, sqi)),
    grade: getGrade(sqi),
    componentScores,
    cues: generateCues(phaseMetrics),
  };
}

// ── Letter grade ──────────────────────────────────────────────────────────
function getGrade(sqi) {
  if (sqi >= 95) return 'A+';
  if (sqi >= 90) return 'A';
  if (sqi >= 85) return 'A−';
  if (sqi >= 80) return 'B+';
  if (sqi >= 75) return 'B';
  if (sqi >= 70) return 'B−';
  if (sqi >= 65) return 'C+';
  if (sqi >= 60) return 'C';
  if (sqi >= 55) return 'C−';
  if (sqi >= 50) return 'D';
  return 'F';
}

// ── Generate coaching cues for the worst-performing areas ─────────────────
function generateCues(phaseMetrics) {
  const cues = [];
  const seen = new Set();

  for (const phase of ['impact', 'top', 'address', 'finish']) {
    const pm = phaseMetrics[phase];
    if (!pm) continue;
    const ranges = IDEAL_RANGES[phase] || {};
    const phaseCues = COACHING_CUES[phase] || {};

    for (const m of METRICS_CONFIG) {
      const value = pm[m.key];
      const range = ranges[m.key];
      if (value == null || !range) continue;

      const score = normalizeMetric(value, range);
      if (score < 0.8 && phaseCues[m.key] && !seen.has(m.key + phase)) {
        seen.add(m.key + phase);
        cues.push({
          phase,
          metric: m.label,
          score,
          cue: phaseCues[m.key],
          severity: score < 0.5 ? 'high' : 'medium',
        });
      }
    }
  }

  // Sort by severity then score
  return cues
    .sort((a, b) => (a.score - b.score))
    .slice(0, 5); // top 5 coaching points
}

// ── Normalize phase metrics for SQI input ─────────────────────────────────
// Accepts frames[] + phases indices, returns { address, top, impact, finish }
export function extractPhaseMetricsMap(frames, phases) {
  const { addressIdx, topIdx, impactIdx, finishIdx } = phases;
  const get = (idx) => (idx != null && frames[idx]) ? frames[idx].metrics : null;

  return {
    address: get(addressIdx),
    top:     get(topIdx),
    impact:  get(impactIdx),
    finish:  get(finishIdx),
  };
}

// ── Grade color token ─────────────────────────────────────────────────────
export function gradeColor(grade) {
  if (grade.startsWith('A')) return '#34D399'; // green
  if (grade.startsWith('B')) return '#5BA3D9'; // accent blue
  if (grade.startsWith('C')) return '#D4A843'; // gold
  return '#FCA5A5'; // danger red
}
