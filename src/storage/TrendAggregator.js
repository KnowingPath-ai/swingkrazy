/* ── TrendAggregator.js ───────────────────────────────────────────────────
   Queries SwingDB for historical trend data.
─────────────────────────────────────────────────────────────────────────── */
import { listSwings } from './SwingDB.js';

export async function getSQIHistory(n = 20) {
  const swings = await listSwings({ limit: n });
  return swings.map(s => ({ date: s.date, sqi: s.sqi ?? 0, id: s.id }));
}

export async function getMetricTrend(metricKey, phase = 'top', n = 20) {
  const swings = await listSwings({ limit: n });
  return swings
    .filter(s => s.metrics?.[phase]?.[metricKey] != null)
    .map(s => ({ date: s.date, value: s.metrics[phase][metricKey], id: s.id }));
}

export async function getBestSwing() {
  const swings = await listSwings({ limit: 100 });
  if (!swings.length) return null;
  return swings.reduce((best, s) => (s.sqi ?? 0) > (best.sqi ?? 0) ? s : best, swings[0]);
}

export async function getSessionAvgSQI(n = 10) {
  const swings = await listSwings({ limit: n });
  if (!swings.length) return 0;
  return Math.round(swings.reduce((a, s) => a + (s.sqi ?? 0), 0) / swings.length);
}

export async function getTempoHistory(n = 20) {
  const swings = await listSwings({ limit: n });
  return swings
    .filter(s => s.tempo?.ratio != null)
    .map(s => ({ date: s.date, ratio: s.tempo.ratio, id: s.id }));
}

export async function getStreakCount(threshold = 70) {
  const swings = await listSwings({ limit: 50 });
  let streak = 0;
  for (const s of swings) {
    if ((s.sqi ?? 0) >= threshold) streak++;
    else break;
  }
  return streak;
}
