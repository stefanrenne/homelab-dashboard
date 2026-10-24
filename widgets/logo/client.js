// Client-only widget: a logo (homepage's logo widget). `icon` arrives as a URL from the
// dashboard; one ending in #hd-mask[=hex] is a single-colour icon, drawn as a mask.
const MARK = `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
  <path d="M6 22 24 7l18 15"/><path d="M11 18v22h26V18"/><path d="M17 26h14M17 32h14M17 38h14"/><circle cx="21" cy="26" r=".5"/></svg>`;

class HdLogo extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>
      :host { display: block; }
      .logo { width: 48px; height: 48px; display: block; color: var(--hd-accent); }
      img.logo { object-fit: contain; }
      .mask { -webkit-mask: var(--mask) center / contain no-repeat; mask: var(--mask) center / contain no-repeat; background: var(--fill, var(--hd-accent)); }
    </style><div class="box"></div>`;
    this.render();
  }
  render() {
    const box = this.shadowRoot?.querySelector('.box');
    if (!box) return;
    const icon = (this.options ?? {}).icon;
    box.replaceChildren();
    if (!icon) {
      box.innerHTML = MARK;
      box.firstElementChild.classList.add('logo');
      return;
    }
    const mask = /#hd-mask(?:=([0-9a-f]+))?$/.exec(icon);
    if (mask) {
      const span = document.createElement('span');
      span.className = 'logo mask';
      span.setAttribute('aria-hidden', 'true');
      span.style.setProperty('--mask', `url("${icon.slice(0, mask.index)}")`);
      if (mask[1]) span.style.setProperty('--fill', `#${mask[1]}`);
      box.append(span);
      return;
    }
    const img = document.createElement('img');
    img.className = 'logo';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.src = icon.startsWith('/icons/') ? icon.slice(1) : icon; // relative, for settings.base
    box.append(img);
  }
}
customElements.define('hd-logo', HdLogo);
