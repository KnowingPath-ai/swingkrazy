/* ── ClubPathOverlay.js ───────────────────────────────────────────────────
   Lead wrist Bézier trajectory from Top → Impact → Finish.
   Color gradient: blue (top) → gold (impact) → muted (finish).
─────────────────────────────────────────────────────────────────────────── */
import { getPoint } from '../core/MetricsEngine.js';

export class ClubPathOverlay {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl?.getContext('2d');
  }

  render(userFrames, userPhases, proFrames = null, proPhases = null) {
    const ctx = this.ctx;
    if (!ctx) return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    if (!userFrames?.length || !userPhases) {
      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Analyze a swing to see club path', cw / 2, ch / 2);
      return;
    }

    // Draw ideal path (dashed reference)
    this._drawIdealPath(ctx, cw, ch);

    // Draw pro path if available
    if (proFrames && proPhases) {
      const proPoints = this._extractWristPoints(proFrames, proPhases, cw, ch);
      if (proPoints.length >= 2) {
        this._drawPath(ctx, proPoints, '#D4A843', 0.4);
      }
    }

    // Draw user path
    const userPoints = this._extractWristPoints(userFrames, userPhases, cw, ch);
    if (userPoints.length >= 2) {
      this._drawPath(ctx, userPoints, null, 1.0, true); // gradient
      this._drawWaypoints(ctx, userPoints);
    }

    this._drawLegend(ctx, cw, ch, !!proFrames);
  }

  _extractWristPoints(frames, phases, cw, ch) {
    const { topIdx, impactIdx, finishIdx } = phases;
    const indices = [topIdx, impactIdx, finishIdx].filter(i => i != null);

    return indices.map(idx => {
      const frame = frames[idx];
      const lw = getPoint(frame?.pose, 'left_wrist');
      return lw ? { x: lw.x * cw, y: lw.y * ch, idx } : null;
    }).filter(Boolean);
  }

  _drawPath(ctx, points, solidColor, alpha, useGradient = false) {
    if (points.length < 2) return;
    ctx.save();

    if (useGradient) {
      const grad = ctx.createLinearGradient(
        points[0].x, points[0].y,
        points[points.length - 1].x, points[points.length - 1].y
      );
      grad.addColorStop(0,   `rgba(91,163,217,${alpha})`);
      grad.addColorStop(0.5, `rgba(212,168,67,${alpha})`);
      grad.addColorStop(1,   `rgba(71,85,105,${alpha})`);
      ctx.strokeStyle = grad;
    } else {
      ctx.strokeStyle = solidColor ? solidColor + Math.round(alpha * 255).toString(16).padStart(2, '0') : '#fff';
    }

    ctx.lineWidth = useGradient ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = useGradient ? '#5BA3D9' : (solidColor || '#fff');
    ctx.shadowBlur = useGradient ? 8 : 0;

    // Smooth curve through points
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const cpX = (points[i].x + points[i + 1].x) / 2;
      const cpY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, cpX, cpY);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();

    ctx.restore();
  }

  _drawWaypoints(ctx, points) {
    const colors = ['#5BA3D9', '#D4A843', '#475569'];
    const labels = ['Top', 'Impact', 'Finish'];

    points.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = colors[i] || '#fff';
      ctx.shadowColor = colors[i] || '#fff';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(226,232,240,0.9)';
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(labels[i] || '', pt.x + 10, pt.y + 4);
    });
  }

  _drawIdealPath(ctx, cw, ch) {
    // Approximate ideal inside-to-out path reference
    const start = { x: cw * 0.45, y: ch * 0.25 };
    const end   = { x: cw * 0.55, y: ch * 0.78 };

    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(52,211,153,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.bezierCurveTo(start.x - 20, ch * 0.5, end.x - 10, ch * 0.6, end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawLegend(ctx, w, h, hasPro) {
    const items = [
      { color: '#5BA3D9', label: 'Your path' },
      ...(hasPro ? [{ color: '#D4A843', label: 'Pro path' }] : []),
      { color: 'rgba(52,211,153,0.5)', label: 'Ideal path', dash: true },
    ];

    ctx.save();
    ctx.font = '600 11px Inter, sans-serif';
    let x = 12, y = h - 12;

    for (const { color, label, dash } of items) {
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
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + 5, y - 3, 4, 0, Math.PI * 2);
        ctx.fill();
        x += 12;
      }
      ctx.fillStyle = 'rgba(226,232,240,0.8)';
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 14;
    }
    ctx.restore();
  }
}
