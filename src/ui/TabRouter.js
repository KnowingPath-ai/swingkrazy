/* ── TabRouter.js ─────────────────────────────────────────────────────────
   Vanilla JS tab router. Reads data-tab / data-panel attributes.
   Supports hash-based routing and programmatic navigation.
─────────────────────────────────────────────────────────────────────────── */

export class TabRouter {
  constructor(containerEl, onChange = null) {
    this.container = containerEl || document;
    this.onChange = onChange;
    this.buttons = [];
    this.panels = [];
    this.current = null;

    this._init();
  }

  _init() {
    this.buttons = Array.from(this.container.querySelectorAll('[data-tab]'));
    this.panels  = Array.from(this.container.querySelectorAll('[data-panel]'));

    this.buttons.forEach(btn => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.tab));
    });

    // Hash routing
    window.addEventListener('hashchange', () => this._onHash());

    // Initial route
    const hash = window.location.hash.replace('#', '');
    const initial = hash && this.buttons.find(b => b.dataset.tab === hash)
      ? hash
      : (this.buttons[0]?.dataset.tab || '');

    this.navigate(initial, { silent: true, noHash: true });
  }

  navigate(tabId, { silent = false, noHash = false } = {}) {
    if (!tabId) return;

    this.buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    this.panels.forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === tabId);
    });

    const prev = this.current;
    this.current = tabId;

    if (!noHash) {
      history.replaceState(null, '', `#${tabId}`);
    }

    if (!silent && this.onChange) {
      this.onChange(tabId, prev);
    }
  }

  _onHash() {
    const hash = window.location.hash.replace('#', '');
    if (hash && hash !== this.current) this.navigate(hash);
  }

  getActive() { return this.current; }
}
