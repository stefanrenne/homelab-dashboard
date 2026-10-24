// Client-only widget: another page in a frame (homepage's iframe). The page's CSP allows the
// origin of `src` because widget.yaml lists it under `frames`. homepage's Tailwind classes are
// read for their height (the last h-<n>, as on the largest screen).

const REFERRER_POLICIES = ['no-referrer', 'no-referrer-when-downgrade', 'origin', 'origin-when-cross-origin', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'unsafe-url'];

/** The CSS height for `height` or homepage's `classes` (h-60 is 15rem). */
function frameHeight(o = {}) {
  if (typeof o.height === 'string' && /^\d+(\.\d+)?(rem|em|px|vh|%)$/.test(o.height.trim())) return o.height.trim();
  const last = [...String(o.classes ?? '').matchAll(/(?:^|\s)(?:[a-z0-9]+:)?h-(\d+(?:\.5)?)(?=\s|$)/g)].at(-1);
  return last ? `${Number(last[1]) / 4}rem` : '15rem';
}

class HdIframe extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>
      :host { display: block; }
      iframe { display: block; width: 100%; border: 0; border-radius: 6px; background: color-mix(in srgb, var(--hd-text) 6%, transparent); color-scheme: light; }
      iframe.noscroll { pointer-events: none; overflow: hidden; }
    </style>`;
    this.render();
  }
  disconnectedCallback() {
    clearInterval(this.timer);
  }
  render() {
    if (!this.shadowRoot) return;
    const o = this.options ?? {};
    let src;
    try {
      src = new URL(o.src);
      if (src.protocol !== 'http:' && src.protocol !== 'https:') return;
    } catch {
      return;
    }
    const frame = document.createElement('iframe');
    frame.src = src.href;
    frame.title = o.name ?? src.host;
    if (o.name) frame.name = o.name;
    frame.style.height = frameHeight(o);
    if (o.allowPolicy) frame.allow = String(o.allowPolicy);
    frame.allowFullscreen = (o.allowfullscreen ?? o.allowFullscreen) !== false;
    if (REFERRER_POLICIES.includes(o.referrerPolicy)) frame.referrerPolicy = o.referrerPolicy;
    frame.setAttribute('loading', o.loadingStrategy === 'lazy' ? 'lazy' : 'eager');
    if (o.allowScrolling === 'no') {
      frame.setAttribute('scrolling', 'no');
      frame.className = 'noscroll';
    }
    this.shadowRoot.querySelector('iframe')?.remove();
    this.shadowRoot.append(frame);
    clearInterval(this.timer);
    const every = Number(o.refreshInterval);
    if (every > 0) this.timer = setInterval(() => { frame.src = src.href; }, Math.max(1000, every));
  }
}
customElements.define('hd-iframe', HdIframe);
