// Client-only widget: a search box with the engine's button on the right, like homepage.
const PROVIDERS = {
  duckduckgo: { url: 'https://duckduckgo.com/?q={q}', mark: 'D', name: 'DuckDuckGo' },
  google: { url: 'https://www.google.com/search?q={q}', mark: 'G', name: 'Google' },
  bing: { url: 'https://www.bing.com/search?q={q}', mark: 'B', name: 'Bing' },
  startpage: { url: 'https://www.startpage.com/do/search?q={q}', mark: 'S', name: 'Startpage' },
};

class HdSearch extends HTMLElement {
  connectedCallback() {
    const t = this.t ?? ((k) => k);
    const o = this.options ?? {};
    const provider = o.provider === 'custom' ? { url: o.url, mark: '⌕', name: 'Search' } : PROVIDERS[o.provider ?? 'duckduckgo'];
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        form { display: flex; align-items: center; position: relative; }
        input { width: 100%; box-sizing: border-box; padding: 7px 40px 7px 10px; border-radius: 6px; font: inherit; font-size: 13px;
          border: 1px solid color-mix(in srgb, var(--hd-text) 25%, transparent);
          background: color-mix(in srgb, var(--hd-text) 6%, transparent); color: var(--hd-text); outline: none; }
        input:focus { border-color: var(--hd-accent); }
        input::placeholder { color: var(--hd-muted); }
        button { position: absolute; right: 4px; width: 26px; height: 24px; border: 0; border-radius: 4px; cursor: pointer;
          font: 700 12px/1 inherit; color: var(--hd-text); background: color-mix(in srgb, var(--hd-text) 12%, transparent); }
      </style>
      <form><input type="search" autocomplete="off"><button type="submit"></button></form>`;
    const input = root.querySelector('input');
    const button = root.querySelector('button');
    input.placeholder = t('placeholder');
    input.setAttribute('aria-label', t('placeholder'));
    button.textContent = provider?.mark ?? '⌕';
    button.title = button.ariaLabel = `${t('engine')}: ${provider?.name ?? ''}`;
    root.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!provider?.url || !input.value.trim()) return;
      window.open(provider.url.replace('{q}', encodeURIComponent(input.value.trim())), o.target ?? '_blank', 'noopener');
    });
  }
}
customElements.define('hd-search', HdSearch);
