// Homepage-style meters: icon, "25.7 TB  Free", a thin usage bar, and the label below.
const ICONS = {
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  memory: '<path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M8 11V9M16 11V9M12 11V9M2 15h20M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.1a2 2 0 0 0 0 3.837V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5.1a2 2 0 0 0 0-3.837Z"/>',
  disk: '<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>',
  cputemp: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
  uptime: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  network: '<path d="M7 17V7M4 10l3-3 3 3M17 7v10M14 14l3 3 3-3"/>',
};

class HdResources extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        :host { display: block; }
        .meters { display: flex; gap: 12px; flex-wrap: wrap; }
        .meter { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
        svg { width: 20px; height: 20px; flex: none; color: var(--hd-text); }
        .txt { min-width: 85px; font-size: .75rem; line-height: 1rem; }
        .row { display: flex; justify-content: space-between; gap: 8px; }
        .bar { margin-top: 2px; height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--hd-text) 20%, transparent); overflow: hidden; }
        .fill { height: 100%; border-radius: 999px; background: color-mix(in srgb, var(--hd-text) 50%, transparent); transition: width 1s; }
        .label { font-size: .75rem; text-align: center; color: var(--hd-text); margin-top: 2px; }
        .detail { font-size: .6875rem; color: var(--hd-muted); }
        .nobar .bar { display: none; }
        .error, .missing .v { font-size: .75rem; color: var(--hd-error); }
        @media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
      </style>
      <div class="meters"></div><div class="label"></div>`;
    this.render();
  }

  set data(value) {
    this._data = value;
    this.render();
  }

  get data() {
    return this._data;
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;
    const t = this.t ?? ((k) => k);
    const box = root.querySelector('.meters');
    box.replaceChildren();
    if (this.error) {
      const e = document.createElement('div');
      e.className = 'error';
      e.textContent = this.error;
      box.append(e);
    }
    for (const m of this._data?.meters ?? []) {
      const el = document.createElement('div');
      el.className = 'meter';
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[m.kind] ?? ICONS.disk}</svg>
        <div class="txt"><div class="row"><span class="v"></span><span class="c"></span></div><div class="bar"><div class="fill"></div></div><div class="detail" hidden></div></div>`;
      const pct = Math.round(Math.max(0, Math.min(100, m.percent)));
      el.querySelector('.v').textContent = m.text;
      el.querySelector('.c').textContent = t(m.caption);
      el.querySelector('.fill').style.width = `${pct}%`;
      if (m.missing) el.classList.add('missing');
      if (m.noBar) el.classList.add('nobar');
      if (m.detail) {
        const d = el.querySelector('.detail');
        d.hidden = false;
        d.textContent = m.detailCaption ? `${m.detail} ${t(m.detailCaption)}` : m.detail;
      }
      if (m.mount) el.title = m.mount;
      // The bar is drawn for the eye; screen readers get the same as a meter.
      const name = [this.options?.label, t(m.kind)].filter(Boolean).join(' ');
      if (m.noBar) {
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', `${name}: ${m.text} ${t(m.caption)}`);
      } else {
        el.setAttribute('role', 'meter');
        el.setAttribute('aria-valuemin', '0');
        el.setAttribute('aria-valuemax', '100');
        el.setAttribute('aria-valuenow', String(pct));
        el.setAttribute('aria-label', m.missing ? `${name}: ${m.text} ${t(m.caption)}` : `${name}: ${m.text} ${t(m.caption)}, ${pct}% ${t('used')}`);
      }
      el.querySelector('svg').setAttribute('aria-hidden', 'true');
      box.append(el);
    }
    root.querySelector('.label').textContent = this.options?.label ?? '';
  }
}

customElements.define('hd-resources', HdResources);
