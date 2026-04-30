/* ── CoachingCueBanner.js ─────────────────────────────────────────────────
   Dismissible coaching cue banner with animated slide-in from bottom.
   Calm, supportive KnowingPath.ai tone.
─────────────────────────────────────────────────────────────────────────── */

export class CoachingCueBanner {
  constructor() {
    this.el = null;
    this.queue = [];
    this.visible = false;
    this.timer = null;

    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.className = 'coaching-banner';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <div class="coaching-banner-icon">⛳</div>
      <div class="coaching-banner-body">
        <div class="coaching-banner-title">Coaching Insight</div>
        <div class="coaching-banner-text"></div>
      </div>
      <button class="coaching-banner-close" aria-label="Dismiss">✕</button>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector('.coaching-banner-close')
      .addEventListener('click', () => this.dismiss());
  }

  // ── Show a list of coaching cues ──────────────────────────────────────
  showCues(cues, { autoAdvance = true, interval = 6000 } = {}) {
    if (!cues?.length) return;
    this.queue = cues.slice();
    this._showNext(autoAdvance, interval);
  }

  // ── Show single message ───────────────────────────────────────────────
  show(message, { title = 'Coaching Insight', icon = '⛳', duration = 6000 } = {}) {
    if (this.timer) clearTimeout(this.timer);

    this.el.querySelector('.coaching-banner-icon').textContent = icon;
    this.el.querySelector('.coaching-banner-title').textContent = title;
    this.el.querySelector('.coaching-banner-text').textContent = message;

    this.el.classList.add('visible');
    this.visible = true;

    if (duration > 0) {
      this.timer = setTimeout(() => this.dismiss(), duration);
    }
  }

  dismiss() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.el.classList.remove('visible');
    this.visible = false;

    // Show next in queue after animation
    if (this.queue.length) {
      setTimeout(() => this._showNext(), 600);
    }
  }

  _showNext(autoAdvance = false, interval = 6000) {
    const cue = this.queue.shift();
    if (!cue) return;

    const icons = { high: '⚠️', medium: '💡', low: '✅' };
    const icon = icons[cue.severity] || '⛳';
    const title = `${cue.phaseLabel || cue.phase} · ${cue.metric}`;

    this.show(cue.cue, {
      title,
      icon,
      duration: autoAdvance && this.queue.length ? interval : 8000,
    });
  }

  // ── Quick success / positive message ──────────────────────────────────
  celebrate(message) {
    this.show(message, {
      title: 'Well done',
      icon: '🏆',
      duration: 5000,
    });
  }
}
