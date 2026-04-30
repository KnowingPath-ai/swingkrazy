/* ── ScoreCard.js ─────────────────────────────────────────────────────────
   SQI ring animation, letter grade, sub-score bars.
─────────────────────────────────────────────────────────────────────────── */
import { gradeColor } from '../core/SQIEngine.js';

const SQI_COMPONENT_LABELS = {
  hipRotation:      'Hip Rotation',
  shoulderRotation: 'Shoulder Rotation',
  xFactor:          'X-Factor (Coil)',
  spineTilt:        'Spine Tilt',
  wristHinge:       'Wrist Hinge',
  tempo:            'Swing Tempo',
  weightShift:      'Weight Shift',
};

export class ScoreCard {
  constructor(containerEl) {
    this.container = containerEl;
    this._animFrame = null;
  }

  render(sqiResult, history = []) {
    if (!this.container) return;
    if (!sqiResult) {
      this.container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>Complete a swing analysis to see your scorecard.</p>
      </div>`;
      return;
    }

    const { sqi, grade, componentScores } = sqiResult;
    const color = gradeColor(grade);
    const bestSQI = history.length ? Math.max(...history.map(h => h.sqi ?? 0)) : sqi;
    const avgSQI  = history.length
      ? Math.round(history.reduce((a, h) => a + (h.sqi ?? 0), 0) / history.length)
      : sqi;

    this.container.innerHTML = `
      <div style="max-width:560px;margin:0 auto;">
        <div class="scorecard-hero">
          <div class="sqi-ring-wrap">
            <canvas id="sqiRingCanvas" width="180" height="180"></canvas>
            <div class="sqi-ring-num">
              <div class="sqi-ring-val" id="sqiVal" style="color:${color}">0</div>
              <div class="sqi-ring-grade" style="color:${color}">${grade}</div>
            </div>
          </div>
          <p style="text-align:center;color:var(--muted);font-size:0.85rem;margin:0">
            Swing Quality Index
          </p>
        </div>

        <div class="stat-row" style="margin-bottom:1.5rem;">
          <div class="stat-box">
            <div class="stat-val">${sqi}</div>
            <div class="stat-lbl">This Swing</div>
          </div>
          <div class="stat-box">
            <div class="stat-val gold">${bestSQI}</div>
            <div class="stat-lbl">Personal Best</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${avgSQI}</div>
            <div class="stat-lbl">Session Avg</div>
          </div>
        </div>

        <div class="card">
          <h4 style="margin-bottom:1rem;">Component Breakdown</h4>
          <div class="sqi-sub-bars" id="subBars"></div>
        </div>
      </div>
    `;

    this._buildSubBars(componentScores);
    this._animateRing(sqi, color);
    this._animateCounter(sqi);
  }

  _buildSubBars(componentScores) {
    const el = this.container.querySelector('#subBars');
    if (!el || !componentScores) return;

    el.innerHTML = Object.entries(SQI_COMPONENT_LABELS)
      .filter(([key]) => componentScores[key] != null)
      .map(([key, label]) => {
        const score = componentScores[key];
        const pct = Math.round(score * 100);
        const barColor = pct >= 80 ? 'var(--success)'
          : pct >= 60 ? 'var(--accent)'
          : pct >= 40 ? 'var(--gold)'
          : 'var(--danger)';

        return `
          <div class="sqi-sub-row">
            <div class="sqi-sub-label">${label}</div>
            <div class="sqi-sub-bar-wrap">
              <div class="sqi-sub-bar" style="width:0%;background:${barColor}"
                   data-pct="${pct}"></div>
            </div>
            <div class="sqi-sub-val">${pct}</div>
          </div>`;
      }).join('');

    // Animate sub-bars
    setTimeout(() => {
      el.querySelectorAll('.sqi-sub-bar').forEach(bar => {
        bar.style.width = bar.dataset.pct + '%';
      });
    }, 100);
  }

  _animateRing(targetSQI, color) {
    const canvas = this.container.querySelector('#sqiRingCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = 90, cy = 90, r = 72;
    const startAngle = -Math.PI / 2;
    let current = 0;
    const duration = 900;
    const start = performance.now();

    if (this._animFrame) cancelAnimationFrame(this._animFrame);

    const draw = (now) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      current = targetSQI * eased;

      ctx.clearRect(0, 0, 180, 180);

      // Background ring
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(91,163,217,0.1)';
      ctx.lineWidth = 10;
      ctx.stroke();

      // Filled arc
      const endAngle = startAngle + (Math.PI * 2 * current / 100);
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.stroke();

      if (progress < 1) {
        this._animFrame = requestAnimationFrame(draw);
      }
    };

    this._animFrame = requestAnimationFrame(draw);
  }

  _animateCounter(targetSQI) {
    const el = this.container.querySelector('#sqiVal');
    if (!el) return;
    const duration = 900;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(targetSQI * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }
}
