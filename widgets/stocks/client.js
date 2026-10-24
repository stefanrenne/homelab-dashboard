// A watchlist as homepage shows it: symbol, price and the day change, ▲ up and ▼ down
// (the arrow carries the direction; `color` adds green and red).
class HdStocks extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>
      :host { display: block; }
      ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 2px 16px; }
      li { display: flex; justify-content: space-between; gap: 8px; font-size: .8125rem; line-height: 1.25rem; font-variant-numeric: tabular-nums; }
      .sym { font-weight: 700; }
      .chg { white-space: nowrap; }
      .color .up { color: var(--hd-ok); }
      .color .down { color: var(--hd-error); }
      .muted, .error { font-size: .75rem; color: var(--hd-muted); }
      .error { color: var(--hd-error); }
    </style><ul></ul>`;
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
    const list = this.shadowRoot?.querySelector('ul');
    if (!list) return;
    const t = this.t ?? ((k) => k);
    const lang = document.documentElement.lang || undefined;
    const price = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pct = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
    const size = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // spoken: the word says the sign
    list.className = this._data?.color === false ? '' : 'color';
    list.replaceChildren();
    if (this.error) {
      const li = document.createElement('li');
      li.className = 'error';
      li.textContent = this.error;
      return list.append(li);
    }
    for (const q of this._data?.quotes ?? []) {
      const li = document.createElement('li');
      const sym = Object.assign(document.createElement('span'), { className: 'sym', textContent: q.symbol });
      const val = document.createElement('span');
      if (q.price === null) {
        val.className = 'muted';
        val.textContent = t('unknownSymbol');
        li.setAttribute('aria-label', `${q.symbol}: ${t('unknownSymbol')}`);
      } else {
        const dir = q.change > 0 ? 'up' : q.change < 0 ? 'down' : 'flat';
        const arrow = { up: '▲', down: '▼', flat: '' }[dir];
        val.className = `chg ${dir}`;
        val.textContent = `${price.format(q.price)} ${arrow}${q.change === null ? '' : `${pct.format(q.change)}%`}`.trim();
        li.setAttribute('aria-label', `${q.symbol}: ${price.format(q.price)}, ${q.change === null ? '' : `${t(dir)} ${size.format(Math.abs(q.change))}%`}`);
      }
      li.append(sym, val);
      list.append(li);
    }
  }
}
customElements.define('hd-stocks', HdStocks);
