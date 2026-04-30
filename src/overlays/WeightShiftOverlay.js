/* ── WeightShiftOverlay.js ────────────────────────────────────────────────
   6-phase horizontal bars showing lead/trail weight distribution.
─────────────────────────────────────────────────────────────────────────── */

const PHASE_IDEALS = {
  address:   { min: 0.45, max: 0.55, label: 'Address' },
  backswing: { min: 0.30, max: 0.45, label: 'Backswing' },
  top:       { min: 0.25, max: 0.40, label: 'Top' },
  downswing: { min: 0.50, max: 0.65, label: 'Downswing' },
  impact:    { min: 0.65, max: 0.80, label: 'Impact' },
  finish:    { min: 0.75, max: 0.90, label: 'Finish' },
};

export class WeightShiftOverlay {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl?.getContext('2d');
  }

  render(phaseMetrics) {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const phases = Object.keys(PHASE_IDEALS);
    const rowH = Math.min(40, (h - 60) / phases.length);
    const barX0 = 90, barW = w - barX0 - 24;
    const startY = 30;

    // Title
    ctx.fillStyle = 'rgba(226,232,240,0.85)';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Weight Distribution (Trail → Lead)', w / 2, 16);

    // Axis labels
    ctx.fillStyle = 'rgba(71,85,105,0.8)';
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Trail', barX0, startY - 4);
    ctx.textAlign = 'right';
    ctx.fillText('Lead', barX0 + barW, startY - 4);

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const ideal = PHASE_IDEALS[phase];
      const y = startY + i * rowH + 4;
      const measured = phaseMetrics?.[phase]?.weightShift ?? null;

      // Bar background
      ctx.fillStyle = 'rgba(91,163,217,0.08)';
      ctx.fillRect(barX0, y + 4, barW, rowH - 12);

      // Ideal zone highlight
      const ix0 = barX0 + ideal.min * barW;
      const ix1 = barX0 + ideal.max * barW;
      ctx.fillStyle = 'rgba(52,211,153,0.15)';
      ctx.fillRect(ix0, y + 4, ix1 - ix0, rowH - 12);
      ctx.strokeStyle = 'rgba(52,211,153,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(ix0, y + 4, ix1 - ix0, rowH - 12);
      ctx.setLineDash([]);

      // User position dot
      if (measured != null) {
        const dotX = barX0 + Math.max(0, Math.min(1, measured)) * barW;
        const dotY = y + (rowH - 12) / 2 + 4;
        const inRange = measured >= ideal.min && measured <= ideal.max;
        const color = inRange ? '#34D399' : measured < ideal.min ? '#FCA5A5' : '#D4A843';

        ctx.beginPath();
        ctx.arc(dotX, dotY, 7, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Phase label
      ctx.fillStyle = 'rgba(148,163,184,0.8)';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(ideal.label, barX0 - 8, y + (rowH - 12) / 2 + 4 + 4);
    }
  }
}
