/* ── MetricsTable.js ──────────────────────────────────────────────────────
   Renders the 18-row phase metrics comparison table.
   Shows: Phase · Metric · You · Pro · Diff · Ideal Range · Coaching cue
─────────────────────────────────────────────────────────────────────────── */
import { PHASES, PHASE_LABELS } from '../core/MetricsEngine.js';

export class MetricsTable {
  constructor(containerEl) {
    this.container = containerEl;
    this.rows = [];
    this.activePhase = 'all';
  }

  // ── Render full table ─────────────────────────────────────────────────
  render(rows) {
    this.rows = rows || [];
    if (!this.container) return;
    this.container.innerHTML = this._buildHTML();
    this._attachEvents();
  }

  // ── Update active phase filter ────────────────────────────────────────
  setPhaseFilter(phase) {
    this.activePhase = phase;
    if (!this.container) return;
    this.container.querySelectorAll('.phase-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.phase === phase);
    });
    this._updateTableRows();
  }

  // ── Export to CSV ─────────────────────────────────────────────────────
  exportCSV() {
    if (!this.rows.length) return;
    const headers = ['Phase', 'Metric', 'You (°)', 'Pro (°)', 'Diff (°)', 'Ideal Min', 'Ideal Max', 'Status', 'Coaching Cue'];
    const csvRows = this.rows.map(r => [
      r.phaseLabel,
      r.metric,
      r.you ?? '—',
      r.pro ?? '—',
      r.diff ?? '—',
      r.idealMin ?? '—',
      r.idealMax ?? '—',
      r.status,
      `"${r.cue.replace(/"/g, "'")}"`,
    ].join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `golf-swing-metrics-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  // ── Build full HTML ───────────────────────────────────────────────────
  _buildHTML() {
    if (!this.rows.length) {
      return `<div class="no-data">Upload videos and run analysis to see metrics.</div>`;
    }

    const filterBtns = [
      { phase: 'all', label: 'All Phases' },
      ...PHASES.map(p => ({ phase: p, label: PHASE_LABELS[p] })),
    ].map(f => `
      <button class="phase-filter-btn${f.phase === this.activePhase ? ' active' : ''}"
              data-phase="${f.phase}">${f.label}</button>
    `).join('');

    return `
      <div class="phase-filter">${filterBtns}</div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem;">
        <button class="btn btn-ghost btn-sm" id="metricsExportCSV">Export CSV</button>
      </div>
      <div class="metrics-table-wrap">
        <table class="metrics-table">
          <thead>
            <tr>
              <th>Phase</th>
              <th>Metric</th>
              <th>You</th>
              <th>Pro</th>
              <th>Diff</th>
              <th>Ideal Range</th>
              <th>Coaching Cue</th>
            </tr>
          </thead>
          <tbody id="metricsTableBody">
            ${this._buildRows(this.rows)}
          </tbody>
        </table>
      </div>
    `;
  }

  _buildRows(rows) {
    const filtered = this.activePhase === 'all'
      ? rows
      : rows.filter(r => r.phase === this.activePhase);

    if (!filtered.length) {
      return `<tr><td colspan="7" style="text-align:center;color:var(--dim);padding:1.5rem;">
        No data for this phase.
      </td></tr>`;
    }

    return filtered.map(r => {
      const diffClass = !r.diff ? 'td-diff-ok'
        : r.status === 'good'  ? 'td-diff-pos'
        : r.status === 'warn'  ? 'td-diff-ok'
        : 'td-diff-neg';

      const statusDot = {
        good: '<span style="color:var(--success)">●</span>',
        warn: '<span style="color:var(--warning)">●</span>',
        off:  '<span style="color:var(--danger)">●</span>',
        ok:   '',
      }[r.status] || '';

      const idealStr = (r.idealMin != null && r.idealMax != null)
        ? `${r.idealMin}° – ${r.idealMax}°`
        : '—';

      const diffStr = r.diff != null
        ? `${r.diff > 0 ? '+' : ''}${r.diff}°`
        : '—';

      return `
        <tr data-phase="${r.phase}">
          <td class="td-phase">${r.phaseLabel}</td>
          <td>${statusDot} ${r.metric}</td>
          <td class="td-you">${r.you != null ? r.you + r.unit : '—'}</td>
          <td class="td-pro">${r.pro != null ? r.pro + r.unit : '—'}</td>
          <td class="${diffClass}">${diffStr}</td>
          <td class="ideal-range">${idealStr}</td>
          <td class="td-cue">${r.cue || '—'}</td>
        </tr>`;
    }).join('');
  }

  _updateTableRows() {
    const tbody = this.container?.querySelector('#metricsTableBody');
    if (!tbody) return;
    tbody.innerHTML = this._buildRows(this.rows);
  }

  _attachEvents() {
    this.container?.querySelectorAll('.phase-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setPhaseFilter(btn.dataset.phase));
    });
    this.container?.querySelector('#metricsExportCSV')?.addEventListener('click', () => this.exportCSV());
  }
}
