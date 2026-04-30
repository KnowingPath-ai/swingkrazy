/* ── RadarChart.js ────────────────────────────────────────────────────────
   Custom canvas-based hexagonal radar chart.
   Dual polygon traces: user (KP blue) and pro (gold).
─────────────────────────────────────────────────────────────────────────── */

const AXES = [
  { key: 'hipRotation',      label: 'Hip\nRotation' },
  { key: 'shoulderRotation', label: 'Shoulder\nRotation' },
  { key: 'xFactor',          label: 'X-Factor' },
  { key: 'spineTilt',        label: 'Spine\nTilt' },
  { key: 'wristHinge',       label: 'Wrist\nHinge' },
];

const N = AXES.length;

export class RadarChart {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl?.getContext('2d');
  }

  render(userScores, proScores = null) {
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!ctx) return;

    const size = Math.min(canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const R = size * 0.36;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this._drawGrid(ctx, cx, cy, R);
    this._drawLabels(ctx, cx, cy, R);

    if (proScores) {
      this._drawPolygon(ctx, cx, cy, R, proScores, '#D4A843', 0.15, 2, 0.7);
    }
    if (userScores) {
      this._drawPolygon(ctx, cx, cy, R, userScores, '#5BA3D9', 0.18, 2.5, 0.85);
    }

    this._drawLegend(ctx, canvas.width, canvas.height, !!proScores);
  }

  // ── Grid rings + axis lines ───────────────────────────────────────────
  _drawGrid(ctx, cx, cy, R) {
    const rings = 5;
    ctx.save();

    // Ideal zone ring (ring 4 = 80% of max)
    ctx.beginPath();
    this._tracePoly(ctx, cx, cy, R * 0.8);
    ctx.fillStyle = 'rgba(52,211,153,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,211,153,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Background rings
    for (let i = 1; i <= rings; i++) {
      ctx.beginPath();
      this._tracePoly(ctx, cx, cy, R * i / rings);
      ctx.strokeStyle = 'rgba(91,163,217,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Axis spokes
    for (let i = 0; i < N; i++) {
      const angle = (Math.PI * 2 * i / N) - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.cos(angle), cy + R * Math.sin(angle));
      ctx.strokeStyle = 'rgba(91,163,217,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Axis labels ───────────────────────────────────────────────────────
  _drawLabels(ctx, cx, cy, R) {
    ctx.save();
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < N; i++) {
      const angle = (Math.PI * 2 * i / N) - Math.PI / 2;
      const x = cx + (R + 26) * Math.cos(angle);
      const y = cy + (R + 26) * Math.sin(angle);
      const lines = AXES[i].label.split('\n');
      lines.forEach((line, li) => {
        ctx.fillText(line, x, y + (li - (lines.length - 1) / 2) * 14);
      });
    }

    ctx.restore();
  }

  // ── Draw filled polygon for a set of scores ───────────────────────────
  _drawPolygon(ctx, cx, cy, R, scores, color, fillAlpha, lineWidth, strokeAlpha) {
    ctx.save();
    ctx.beginPath();

    for (let i = 0; i < N; i++) {
      const angle = (Math.PI * 2 * i / N) - Math.PI / 2;
      const val = Math.max(0, Math.min(1, scores[AXES[i].key] ?? 0));
      const x = cx + R * val * Math.cos(angle);
      const y = cy + R * val * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fillStyle = hexAlpha(color, fillAlpha);
    ctx.fill();

    ctx.strokeStyle = hexAlpha(color, strokeAlpha);
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Dots at each vertex
    for (let i = 0; i < N; i++) {
      const angle = (Math.PI * 2 * i / N) - Math.PI / 2;
      const val = Math.max(0, Math.min(1, scores[AXES[i].key] ?? 0));
      ctx.beginPath();
      ctx.arc(
        cx + R * val * Math.cos(angle),
        cy + R * val * Math.sin(angle),
        4, 0, Math.PI * 2
      );
      ctx.fillStyle = color;
      ctx.shadowBlur = 10;
      ctx.fill();
    }

    ctx.restore();
  }

  _tracePoly(ctx, cx, cy, r) {
    for (let i = 0; i < N; i++) {
      const angle = (Math.PI * 2 * i / N) - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  _drawLegend(ctx, w, h, hasPro) {
    ctx.save();
    ctx.font = '600 11px Inter, sans-serif';
    const items = [
      { color: '#5BA3D9', label: 'Your swing' },
      ...(hasPro ? [{ color: '#D4A843', label: 'Pro swing' }] : []),
      { color: 'rgba(52,211,153,0.5)', label: 'Ideal zone', dash: true },
    ];

    let x = 12, y = h - 14;
    for (const { color, label, dash } of items) {
      ctx.fillStyle = color;
      if (dash) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y - 3); ctx.lineTo(x + 14, y - 3);
        ctx.stroke();
        ctx.setLineDash([]);
        x += 18;
      } else {
        ctx.beginPath();
        ctx.arc(x + 5, y - 3, 5, 0, Math.PI * 2);
        ctx.fill();
        x += 14;
      }
      ctx.fillStyle = 'rgba(226,232,240,0.8)';
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 16;
    }
    ctx.restore();
  }
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
