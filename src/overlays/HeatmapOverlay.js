/* ── HeatmapOverlay.js ────────────────────────────────────────────────────
   Joint delta heatmap: color-codes each joint by positional error vs pro.
   Green = within tolerance, Yellow = slight, Red = significant mismatch.
─────────────────────────────────────────────────────────────────────────── */

const KEY_JOINTS = [
  'nose',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
];

export class HeatmapOverlay {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl?.getContext('2d');
  }

  render(userPose, proPose, { clear = true } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    if (clear) ctx.clearRect(0, 0, cw, ch);

    if (!userPose || !proPose) {
      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Load both user and pro swings to see heatmap', cw / 2, ch / 2);
      return;
    }

    const userKPs = Object.fromEntries(
      (userPose.keypoints || []).map(k => [k.name, k])
    );
    const proKPs = Object.fromEntries(
      (proPose.keypoints || []).map(k => [k.name, k])
    );

    const TOLERANCE = 0.05; // normalized units

    for (const name of KEY_JOINTS) {
      const u = userKPs[name];
      const p = proKPs[name];
      if (!u || !p) continue;

      const dist = Math.hypot(u.x - p.x, u.y - p.y);
      const normalized = Math.min(1, dist / (TOLERANCE * 4));

      // HSL: 120° green → 60° yellow → 0° red
      const hue = Math.round((1 - normalized) * 120);
      const alpha = 0.35 + normalized * 0.5;
      const radius = 10 + normalized * 22;

      // Glow circle at user joint position
      const grd = ctx.createRadialGradient(
        u.x * cw, u.y * ch, 0,
        u.x * cw, u.y * ch, radius
      );
      grd.addColorStop(0, `hsla(${hue},90%,55%,${alpha})`);
      grd.addColorStop(1, `hsla(${hue},90%,55%,0)`);

      ctx.beginPath();
      ctx.arc(u.x * cw, u.y * ch, radius, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Center dot
      ctx.beginPath();
      ctx.arc(u.x * cw, u.y * ch, 5, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue},90%,60%)`;
      ctx.fill();
    }

    this._drawLegend(ctx, cw, ch);
  }

  _drawLegend(ctx, w, h) {
    const x0 = 12, y0 = h - 22, legendW = 120, legendH = 8;

    const grd = ctx.createLinearGradient(x0, 0, x0 + legendW, 0);
    grd.addColorStop(0,   'hsl(120,80%,50%)');
    grd.addColorStop(0.5, 'hsl(60,90%,55%)');
    grd.addColorStop(1,   'hsl(0,90%,55%)');

    ctx.fillStyle = grd;
    ctx.fillRect(x0, y0, legendW, legendH);

    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Good', x0, y0 + legendH + 11);
    ctx.textAlign = 'right';
    ctx.fillText('Poor', x0 + legendW, y0 + legendH + 11);
  }
}
