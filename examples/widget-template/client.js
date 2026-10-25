// Optional client part: a Web Component named hd-<id>. Without this file the dashboard
// renders `blocks` itself. It receives:
//   .data     what server.js returned (set again after every refresh; null before)
//   .options  the public options only (never secrets)
//   .t(key)   translations from i18n.json for the dashboard language
//   .error    a message when the last refresh failed, otherwise null
//   .busy     true while an action this widget asked for (hd-widget-action) runs
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
        button { min-height: 28px; margin-top: .4rem; padding-inline: .75rem; border-radius: 6px; font: inherit; font-size: .8125rem;
          border: 1px solid var(--hd-border); background: none; color: var(--hd-text); cursor: pointer; }
        button:disabled { opacity: .6; cursor: progress; }
      </style>
      <div class="bar"><div class="fill" style="width:0"></div></div>
      <div class="row"><span class="label muted"></span><span class="value"></span></div>
      <button type="button" class="reset"></button>`;
    // a button press: the dashboard runs server.js's action and shows its result
    this.shadowRoot.querySelector('.reset').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('hd-widget-action', { bubbles: true, composed: true, detail: { title: this.t?.('reset') ?? 'Reset' } }));
    });
    this.render();
  }

  set busy(value) {
    this._busy = Boolean(value);
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
    const reset = root.querySelector('.reset');
    reset.textContent = t('reset');
    reset.disabled = Boolean(this._busy);
    root.querySelector('.value').textContent = this.error ?? (d ? String(d.value) : '…');
    const pct = d ? Math.max(0, Math.min(100, (100 * d.value) / (d.max || 100))) : 0;
    root.querySelector('.fill').style.width = `${pct}%`;
  }
}

customElements.define('hd-example-counter', ExampleCounter);
