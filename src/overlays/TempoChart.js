/* ── TempoChart.js ────────────────────────────────────────────────────────
   Canvas bar chart: backswing vs downswing duration.
   Target ratio 3:1 (blue backswing bar, gold downswing bar).
─────────────────────────────────────────────────────────────────────────── */

export class TempoChart {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl?.getContext('2d');
  }

  render(tempo) {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!tempo) {
      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Analyze a swing to see tempo chart', w / 2, h / 2);
      return;
    }

    const { backswingFrames, downswingFrames, ratio } = tempo;
    const maxVal = Math.max(backswingFrames, downswingFrames);
    const barW = Math.min(80, w * 0.18);
    const maxH = h * 0.55;
    const baseY = h * 0.80;
    const gap = barW * 1.4;
    const startX = w / 2 - gap / 2 - barW;

    // Draw bars
    const bars = [
      { val: backswingFrames, label: 'Backswing', color: '#5BA3D9', x: startX },
      { val: downswingFrames, label: 'Downswing', color: '#D4A843', x: startX + gap },
    ];

    for (const { val, label, color, x } of bars) {
      const barH = (val / maxVal) * maxH;

      // Glow
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = color + 'BB';
      ctx.beginPath();
      roundRect(ctx, x, baseY - barH, barW, barH, 6);
      ctx.fill();
      ctx.restore();

      // Value label
      ctx.fillStyle = color;
      ctx.font = `700 ${Math.round(barW * 0.28)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${val}f`, x + barW / 2, baseY - barH - 8);

      // Bar label
      ctx.fillStyle = 'rgba(148,163,184,0.8)';
      ctx.font = `500 12px Inter, sans-serif`;
      ctx.fillText(label, x + barW / 2, baseY + 18);
    }

    // Target 3:1 reference line
    const targetDownH = (backswingFrames / 3 / maxVal) * maxH;
    const refY = baseY - targetDownH;
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(52,211,153,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX + gap - barW * 0.3, refY);
    ctx.lineTo(startX + gap + barW * 1.3, refY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Ratio display
    const ratioColor = ratio >= 2.5 && ratio <= 3.5 ? '#34D399' : '#D4A843';
    ctx.fillStyle = ratioColor;
    ctx.font = `800 ${Math.round(w * 0.08)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${ratio.toFixed(1)}:1`, w / 2, h * 0.14);

    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.font = '500 12px Inter, sans-serif';
    ctx.fillText('Backswing : Downswing ratio  (ideal 3:1)', w / 2, h * 0.23);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
