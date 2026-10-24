// Client-only widget: one search box for the dashboard and the web.
//
// While typing it sends `hd-search-input` ({ query }), on Enter a cancelable
// `hd-search-submit`; the dashboard filters its services and cancels the submit when it
// opened the only match. Otherwise Enter searches the web with the chosen engine.
const PROVIDERS = {
  duckduckgo: { url: 'https://duckduckgo.com/?q={q}', mark: 'D', name: 'DuckDuckGo' },
  google: { url: 'https://www.google.com/search?q={q}', mark: 'G', name: 'Google' },
  bing: { url: 'https://www.bing.com/search?q={q}', mark: 'B', name: 'Bing' },
  startpage: { url: 'https://www.startpage.com/do/search?q={q}', mark: 'S', name: 'Startpage' },
  baidu: { url: 'https://www.baidu.com/s?wd={q}', mark: 'B', name: 'Baidu' },
  brave: { url: 'https://search.brave.com/search?q={q}', mark: 'B', name: 'Brave' },
};

class HdSearch extends HTMLElement {
  connectedCallback() {
    const t = this.t ?? ((k) => k);
    const o = this.options ?? {};
    const filter = o.filter !== false;
    const provider = o.provider === 'custom' ? { url: o.url, mark: '⌕', name: 'Search' } : PROVIDERS[o.provider ?? 'duckduckgo'];
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        form { display: flex; align-items: center; position: relative; }
        input { width: 100%; box-sizing: border-box; min-height: 2.25rem; padding: .4rem 2.75rem .4rem .65rem; border-radius: 6px; font: inherit; font-size: .875rem;
          border: 1px solid color-mix(in srgb, var(--hd-text) 35%, transparent);
          background: color-mix(in srgb, var(--hd-text) 6%, transparent); color: var(--hd-text); outline: none; }
        input:focus-visible { border-color: var(--hd-accent); box-shadow: 0 0 0 2px var(--hd-accent); }
        input::placeholder { color: var(--hd-muted); opacity: 1; }
        button { position: absolute; right: 4px; min-width: 28px; height: 28px; border: 0; border-radius: 4px; cursor: pointer;
          font: 700 .75rem/1 inherit; color: var(--hd-text); background: color-mix(in srgb, var(--hd-text) 12%, transparent); }
        button:focus-visible { outline: 2px solid var(--hd-accent); outline-offset: 1px; }
      </style>
      <form role="search"><input type="search" autocomplete="off" enterkeyhint="search"><button type="submit"></button></form>`;
    const input = root.querySelector('input');
    const button = root.querySelector('button');
    const hint = filter ? t('placeholderFilter') : t('placeholder');
    input.placeholder = hint;
    input.setAttribute('aria-label', hint);
    button.textContent = provider?.mark ?? '⌕';
    button.title = `${t('engine')}: ${provider?.name ?? ''}`;
    button.setAttribute('aria-label', button.title);
    const send = (name, cancelable = false) =>
      this.dispatchEvent(new CustomEvent(name, { detail: { query: input.value.trim() }, bubbles: true, composed: true, cancelable }));
    if (filter) input.addEventListener('input', () => send('hd-search-input'));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        input.value = '';
        if (filter) send('hd-search-input');
      }
    });
    root.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      if (filter && !send('hd-search-submit', true)) return; // the dashboard opened the only match
      if (!provider?.url) return;
      window.open(provider.url.replace('{q}', encodeURIComponent(input.value.trim())), o.target ?? '_blank', 'noopener');
    });
  }
}
customElements.define('hd-search', HdSearch);
