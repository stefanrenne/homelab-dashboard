// The current weather as homepage shows it: an icon, the temperature and the condition.
const ICONS = {
  clear: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  night: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  partlyCloudy: '<path d="M12 3v1M5.6 5.6l.7.7M3 12h1M18.4 5.6l-.7.7"/><path d="M8 12a4 4 0 0 1 7.5-2"/><path d="M17 20H8a4 4 0 1 1 .9-7.9A5 5 0 0 1 18 13a3.5 3.5 0 0 1-1 7z"/>',
  cloudy: '<path d="M17.5 19H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 11a4 4 0 0 1-2.5 8z"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  drizzle: '<path d="M17.5 15H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 7a4 4 0 0 1-2.5 8z"/><path d="M9 19v1M13 19v1M17 19v1"/>',
  rain: '<path d="M17.5 15H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 7a4 4 0 0 1-2.5 8z"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>',
  showers: '<path d="M17.5 15H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 7a4 4 0 0 1-2.5 8z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3M10 21l-.5 1"/>',
  snow: '<path d="M17.5 15H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 7a4 4 0 0 1-2.5 8z"/><path d="M9 19h.01M13 19h.01M17 19h.01M11 22h.01M15 22h.01"/>',
  thunderstorm: '<path d="M17.5 15H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 7a4 4 0 0 1-2.5 8z"/><path d="M13 15l-2 4h3l-2 4"/>',
  unknown: '<path d="M17.5 19H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 11a4 4 0 0 1-2.5 8z"/>',
};

class HdWeather extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>
      :host { display: block; }
      .w { display: flex; align-items: center; gap: 10px; }
      svg { width: 28px; height: 28px; flex: none; color: var(--hd-text); }
      .temp { font-size: 1rem; font-weight: 600; font-variant-numeric: tabular-nums; }
      .cond { font-size: .75rem; color: var(--hd-muted); }
      .error { font-size: .75rem; color: var(--hd-error); }
    </style><div class="w"><span class="icon"></span><div><div class="temp"></div><div class="cond"></div></div></div>`;
    this.render();
  }
  set data(value) {
    this._data = value;
    this.render();
  }
  get data() {
    return this._data;
  }
  /** No coordinates configured: ask the browser once, rounded to about a kilometre. */
  locate() {
    if (this._locating) return;
    this._locating = true;
    if (!window.isSecureContext || !navigator.geolocation) {
      this._noLocation = true;
      this.render();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => this.dispatchEvent(new CustomEvent('hd-widget-params', {
        bubbles: true, composed: true,
        detail: { latitude: pos.coords.latitude.toFixed(2), longitude: pos.coords.longitude.toFixed(2) },
      })),
      () => { this._noLocation = true; this.render(); },
      { maximumAge: 30 * 60_000, timeout: 15_000 },
    );
  }
  render() {
    const root = this.shadowRoot;
    if (!root) return;
    const t = this.t ?? ((k) => k);
    if (this._data?.needsLocation && !this._noLocation) this.locate();
    const w = this._data?.weather;
    const lang = document.documentElement.lang || undefined;
    const icon = !w ? 'unknown' : w.condition === 'clear' && !w.day ? 'night' : w.condition;
    root.querySelector('.icon').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon] ?? ICONS.unknown}</svg>`;
    const temp = w?.temperature === null || w?.temperature === undefined ? '–'
      : `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1, ...(w.format ?? {}) }).format(w.temperature)}${w.unit}`;
    root.querySelector('.temp').textContent = temp;
    const cond = root.querySelector('.cond');
    cond.className = this.error ? 'error' : 'cond';
    const waiting = this._data?.needsLocation ? t(this._noLocation ? 'noLocation' : 'locating') : '';
    cond.textContent = this.error ?? (waiting || [w?.label, w ? t(w.condition) : ''].filter(Boolean).join(' · '));
    root.querySelector('.w').setAttribute('aria-label', [w?.label, temp, w ? t(w.condition) : ''].filter(Boolean).join(', '));
  }
}
customElements.define('hd-openmeteo', HdWeather);
