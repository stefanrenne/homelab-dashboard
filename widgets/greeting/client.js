// Client-only widget: a line of text (homepage's greeting). text_size uses homepage's names.
const SIZES = { xs: '.75rem', sm: '.875rem', md: '1rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem' };

class HdGreeting extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML =
      '<style>:host{display:block}.text{font-weight:600;line-height:1.25;color:var(--hd-text)}</style><div class="text"></div>';
    this.render();
  }
  render() {
    const box = this.shadowRoot?.querySelector('.text');
    if (!box) return;
    const o = this.options ?? {};
    box.textContent = o.text ?? '';
    box.style.fontSize = SIZES[o.text_size] ?? SIZES.xl;
  }
}
customElements.define('hd-greeting', HdGreeting);
