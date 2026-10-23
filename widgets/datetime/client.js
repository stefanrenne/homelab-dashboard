// Client-only widget: renders the time in the browser, no server part needed.
class HdDatetime extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML =
      '<style>:host{display:block;font-variant-numeric:tabular-nums}' +
      '.time{font-size:1.4rem;font-weight:600}.date{color:var(--hd-muted)}</style>' +
      '<div class="time"></div><div class="date"></div>';
    this.render();
    this.timer = setInterval(() => this.render(), 1000);
  }
  disconnectedCallback() {
    clearInterval(this.timer);
  }
  render() {
    if (!this.shadowRoot) return;
    const o = this.options ?? {};
    const locale = o.locale || document.documentElement.lang || undefined;
    const now = new Date();
    const part = (style, key) => (style === 'none' ? '' : new Intl.DateTimeFormat(locale, { [key]: style }).format(now));
    this.shadowRoot.querySelector('.time').textContent = part(o.timeStyle ?? 'short', 'timeStyle');
    this.shadowRoot.querySelector('.date').textContent = part(o.dateStyle ?? 'long', 'dateStyle');
  }
}
customElements.define('hd-datetime', HdDatetime);
