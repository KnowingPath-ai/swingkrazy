/* ── TrendGraph.js ────────────────────────────────────────────────────────
   Canvas line graph for SQI / metric history over sessions.
─────────────────────────────────────────────────────────────────────────── */

export class TrendGraph {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl?.getContext('2d');
  }

  render(dataPoints, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!dataPoints?.length) {
      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No history yet — complete your first analysis to start tracking.', w / 2, h / 2);
      return;
    }

    const {
      label    = 'SQI',
      color    = '#5BA3D9',
      minY     = 0,
      maxY     = 100,
      yLabel   = 'Score',
    } = opts;

    const padL = 48, padR = 20, padT = 20, padB = 40;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const n = dataPoints.length;

    const toX = (i) => padL + (i / Math.max(n - 1, 1)) * plotW;
    const toY = (v) => padT + plotH - ((v - minY) / (maxY - minY)) * plotH;

    // Grid lines
    ctx.save();
    ctx.strokeStyle = 'rgba(91,163,217,0.1)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 5; g++) {
      const yv = minY + (maxY - minY) * g / 5;
      const y = toY(yv);
      ctx.beginPath();
      ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(71,85,105,0.8)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(yv), padL - 6, y + 4);
    }
    ctx.restore();

    // Gradient fill under line
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, color + '50');
    grad.addColorStop(1, color + '00');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toX(0), padT + plotH);
    dataPoints.forEach((pt, i) => ctx.lineTo(toX(i), toY(pt.value ?? pt.sqi ?? 0)));
    ctx.lineTo(toX(n - 1), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Line
    ctx.save();
    ctx.beginPath();
    dataPoints.forEach((pt, i) => {
      const x = toX(i), y = toY(pt.value ?? pt.sqi ?? 0);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();

    // Data points
    ctx.save();
    dataPoints.forEach((pt, i) => {
      const x = toX(i), y = toY(pt.value ?? pt.sqi ?? 0);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fill();
    });
    ctx.restore();

    // X-axis date labels (show ~5)
    ctx.save();
    ctx.fillStyle = 'rgba(71,85,105,0.8)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(n / 5));
    for (let i = 0; i < n; i += step) {
      const pt = dataPoints[i];
      const dateStr = pt.date ? new Date(pt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      ctx.fillText(dateStr, toX(i), padT + plotH + 16);
    }
    ctx.restore();

    // Title
    ctx.fillStyle = 'rgba(226,232,240,0.85)';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, w / 2, 14);
  }
}
