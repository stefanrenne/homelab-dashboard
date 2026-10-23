// Optional client part: a Web Component named hd-<id>. Without this file the dashboard
// renders `blocks` itself. It receives:
//   .data     what server.js returned (set again after every refresh; null before)
//   .options  the public options only (never secrets)
//   .t(key)   translations from i18n.json for the dashboard language
//   .error    a message when the last refresh failed, otherwise null
// Theme colours come in as CSS variables: --hd-text, --hd-muted, --hd-accent, --hd-card,
// --hd-border, --hd-ok, --hd-warn, --hd-error.

class ExampleCounter extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `
      <style>
        .bar { height: 6px; border-radius: 3px; background: var(--hd-border); overflow: hidden; }
        .fill { height: 100%; background: var(--hd-accent); transition: width .3s; }
        .row { display: flex; justify-content: space-between; font-size: .85rem; margin-top: .3rem; }
        .muted { color: var(--hd-muted); }
      </style>
      <div class="bar"><div class="fill" style="width:0"></div></div>
      <div class="row"><span class="label muted"></span><span class="value"></span></div>`;
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
    const d = this._data;
    root.querySelector('.label').textContent = t('value');
    root.querySelector('.value').textContent = this.error ?? (d ? String(d.value) : '…');
    const pct = d ? Math.max(0, Math.min(100, (100 * d.value) / (d.max || 100))) : 0;
    root.querySelector('.fill').style.width = `${pct}%`;
  }
}

customElements.define('hd-example-counter', ExampleCounter);
