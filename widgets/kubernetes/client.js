// The cluster as homepage's kubernetes widget shows it: meters for CPU and memory of the
// cluster, then a line per node. A node that is not Ready is marked with a shape and a word.
const fmtBytes = (n, lang) => {
  const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: n >= 100 ? 0 : 1 }).format(n)} ${units[i]}`;
};

class HdKubernetes extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>
      :host { display: block; }
      .title { font-size: .75rem; font-weight: 700; text-transform: uppercase; color: var(--hd-muted); margin-bottom: 2px; }
      .meters { display: flex; gap: 16px; flex-wrap: wrap; }
      .meter { min-width: 120px; font-size: .75rem; line-height: 1rem; }
      .row { display: flex; justify-content: space-between; gap: 8px; font-variant-numeric: tabular-nums; }
      .bar { margin-top: 2px; height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--hd-text) 20%, transparent); overflow: hidden; }
      .fill { height: 100%; background: color-mix(in srgb, var(--hd-text) 50%, transparent); }
      ul { list-style: none; margin: 8px 0 0; padding: 0; }
      li { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; font-size: .75rem; line-height: 1.25rem; font-variant-numeric: tabular-nums; }
      .down { color: var(--hd-error); }
      .muted { color: var(--hd-muted); }
      .error { font-size: .75rem; color: var(--hd-error); }
    </style><div class="box"></div>`;
    this.render();
  }
  set data(value) {
    this._data = value;
    this.render();
  }
  get data() {
    return this._data;
  }
  meter(name, used, total, text) {
    const pct = total > 0 && used !== null ? Math.round((100 * used) / total) : null;
    const el = document.createElement('div');
    el.className = 'meter';
    el.innerHTML = '<div class="row"><span class="n"></span><span class="v"></span></div><div class="bar"><div class="fill"></div></div><div class="d muted"></div>';
    el.querySelector('.n').textContent = name;
    el.querySelector('.v').textContent = pct === null ? '–' : `${pct}%`;
    el.querySelector('.fill').style.width = `${pct ?? 0}%`;
    el.querySelector('.d').textContent = text;
    el.setAttribute('role', 'meter');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    if (pct !== null) el.setAttribute('aria-valuenow', String(pct));
    el.setAttribute('aria-label', `${name}: ${pct === null ? '–' : `${pct}%`} (${text})`);
    return el;
  }
  render() {
    const box = this.shadowRoot?.querySelector('.box');
    if (!box) return;
    const t = this.t ?? ((k) => k);
    const lang = document.documentElement.lang || undefined;
    const num = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
    box.replaceChildren();
    if (this.error) {
      const e = Object.assign(document.createElement('div'), { className: 'error', textContent: this.error });
      return box.append(e);
    }
    const d = this._data;
    if (!d) return;
    const c = d.cluster;
    if (c?.show) {
      if (c.showLabel && c.label) box.append(Object.assign(document.createElement('div'), { className: 'title', textContent: c.label }));
      const meters = document.createElement('div');
      meters.className = 'meters';
      if (c.cpu) meters.append(this.meter(t('cpu'), c.cpu.used, c.cpu.total, `${c.cpu.used === null ? '–' : num.format(c.cpu.used)} / ${num.format(c.cpu.total)} ${t('cores')}`));
      if (c.memory) meters.append(this.meter(t('memory'), c.memory.used, c.memory.total, `${c.memory.used === null ? '–' : fmtBytes(c.memory.used, lang)} / ${fmtBytes(c.memory.total, lang)}`));
      box.append(meters);
    }
    const o = d.nodeOptions ?? {};
    if (d.nodes?.length) {
      const list = document.createElement('ul');
      for (const n of d.nodes) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = o.showLabel === false ? '' : n.name;
        if (!n.ready) {
          const flag = Object.assign(document.createElement('span'), { className: 'down', textContent: ` ✕ ${t('notReady')}` });
          name.append(flag);
        }
        const p = (part) => (part.used === null || !part.total ? '–' : `${Math.round((100 * part.used) / part.total)}%`);
        const cpu = Object.assign(document.createElement('span'), { textContent: o.cpu === false ? '' : `${t('cpu')} ${p(n.cpu)}` });
        const mem = Object.assign(document.createElement('span'), { textContent: o.memory === false ? '' : `${t('memory')} ${p(n.memory)}` });
        li.append(name, cpu, mem);
        list.append(li);
      }
      box.append(list);
    }
  }
}
customElements.define('hd-kubernetes', HdKubernetes);
