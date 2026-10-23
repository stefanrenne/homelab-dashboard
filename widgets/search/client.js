// Client-only widget: a search form.
const PROVIDERS = {
  duckduckgo: 'https://duckduckgo.com/?q={q}',
  google: 'https://www.google.com/search?q={q}',
  bing: 'https://www.bing.com/search?q={q}',
  startpage: 'https://www.startpage.com/do/search?q={q}',
};

class HdSearch extends HTMLElement {
  connectedCallback() {
    const t = this.t ?? ((k) => k);
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>input{width:100%;box-sizing:border-box;padding:.55rem .8rem;border-radius:8px;' +
      'border:1px solid var(--hd-border);background:var(--hd-card);color:var(--hd-text);font:inherit}</style>' +
      '<form><input type="search" autocomplete="off"></form>';
    const input = root.querySelector('input');
    input.placeholder = t('placeholder');
    input.setAttribute('aria-label', t('placeholder'));
    root.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const o = this.options ?? {};
      const template = o.provider === 'custom' ? o.url : PROVIDERS[o.provider ?? 'duckduckgo'];
      if (!template || !input.value.trim()) return;
      window.open(template.replace('{q}', encodeURIComponent(input.value.trim())), o.target ?? '_blank', 'noopener');
    });
  }
}
customElements.define('hd-search', HdSearch);
