// ============================================================================
// Tests — safe-localize XSS guard (review §S-1)
// ============================================================================
// renderLocalized must allow only <strong> and <em>; every other tag falls
// through as escaped text. Hostile translation contributions should not be
// able to inject scripts, images, event handlers, javascript: URLs, or
// any tag with attributes.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, html } from 'lit';

import { renderLocalized } from '../../src/utils/safe-localize';

/** Render a TemplateResult into a detached container, return the container. */
function renderToContainer(input: string): HTMLElement {
  const container = document.createElement('div');
  render(html`${renderLocalized(input)}`, container);
  return container;
}

describe('renderLocalized — XSS guard', () => {
  it('renders <strong> as a real tag', () => {
    const c = renderToContainer('Click <strong>here</strong> to continue');
    expect(c.querySelector('strong')?.textContent).toBe('here');
    expect(c.textContent).toBe('Click here to continue');
  });

  it('renders <em> as a real tag', () => {
    const c = renderToContainer('Press <em>Tab</em> next');
    expect(c.querySelector('em')?.textContent).toBe('Tab');
  });

  it('rejects <script> — no script element appears in DOM', () => {
    const c = renderToContainer("Hello <script>alert('xss')</script>");
    expect(c.querySelector('script')).toBeNull();
    // The literal characters appear as text
    expect(c.textContent).toContain("<script>alert('xss')</script>");
  });

  it('rejects <img onerror=...> — no img element appears in DOM', () => {
    const c = renderToContainer('<img src=x onerror=alert(1)>');
    expect(c.querySelector('img')).toBeNull();
    expect(c.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('rejects <strong> with attributes (parser requires bare tag)', () => {
    const c = renderToContainer("<strong onclick='evil()'>foo</strong>");
    // No <strong> tag in DOM (the `onclick` attr makes the regex skip it)
    expect(c.querySelector('strong')).toBeNull();
    // The whole thing appears as text
    expect(c.textContent).toContain("<strong onclick='evil()'>foo</strong>");
  });

  it('rejects <a href="javascript:..."> — no anchor appears in DOM', () => {
    const c = renderToContainer('<a href="javascript:evil()">x</a>');
    expect(c.querySelector('a')).toBeNull();
    expect(c.textContent).toContain('<a href="javascript:evil()">x</a>');
  });

  it('rejects event handler attributes on allowed tags by treating them as text', () => {
    const c = renderToContainer('<strong onmouseover=alert(1)>foo</strong>');
    // No <strong> in DOM — parser requires bare `<strong>` with no attrs
    expect(c.querySelector('strong')).toBeNull();
    expect(c.textContent).toContain('<strong onmouseover=alert(1)>');
  });

  it('passes plain text unchanged', () => {
    const c = renderToContainer('Hello world');
    expect(c.textContent).toBe('Hello world');
    expect(c.children.length).toBe(0); // no element children
  });

  it('handles consecutive allowed tags', () => {
    const c = renderToContainer('<strong>A</strong> and <em>B</em>');
    expect(c.querySelector('strong')?.textContent).toBe('A');
    expect(c.querySelector('em')?.textContent).toBe('B');
  });
});
