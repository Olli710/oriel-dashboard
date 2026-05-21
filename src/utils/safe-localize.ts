// ====================================================================
// safe-localize — render translation strings with whitelisted HTML
// ====================================================================
// Translation files contain a small amount of formatting markup
// (`<strong>`, `<em>`). Earlier code piped these through
// `unsafeHTML(localize(...))` — a supply-chain XSS sink: a translation
// PR claiming "just translations" could inject `<script>`, `<img
// onerror=...>` or any other tag.
//
// This helper parses the translation string and renders ONLY the
// whitelisted tags as actual HTML. Every other tag becomes literal
// text (auto-escaped by Lit). Closes review §S-1.
//
// Allowed tags:
//   <strong>…</strong>
//   <em>…</em>
//
// Tags must:
//   - have no attributes (`<strong class="foo">` → literal text)
//   - be properly closed in the same string
//
// Unknown tags pass through as escaped text. No way for a hostile
// translation to execute scripts or break out of the parent context.
// ====================================================================

import { html, type TemplateResult } from 'lit';

const ALLOWED_TAGS = new Set(['strong', 'em']);

/**
 * Tokenize a localized string into a sequence of Lit template parts.
 * Returns a single TemplateResult composed of text + allowed
 * inline-formatting tags.
 *
 * Hostile input examples (all rendered as escaped text):
 *   "<script>alert(1)</script>"                  → literal text
 *   "<img src=x onerror=alert(1)>"               → literal text
 *   "<strong onclick='evil()'>foo</strong>"      → literal text (attrs rejected)
 *   "<a href='javascript:evil()'>x</a>"          → literal text
 *
 * Friendly input:
 *   "Click <strong>here</strong> to continue"    → renders <strong>here</strong>
 *   "Press <em>Tab</em> for next"                → renders <em>Tab</em>
 */
export function renderLocalized(input: string): TemplateResult {
  // Regex: match exactly `<tag>…</tag>` for tag in {strong, em}. No
  // attributes allowed (the `[^a-z]` after the tag name ensures we
  // don't accidentally match `<strongfoo>`).
  // Lazy `.*?` so nested allowed tags work (in practice translations
  // don't nest, but be safe).
  const tagRe = /<(strong|em)>([\s\S]*?)<\/\1>/g;
  const parts: Array<string | TemplateResult> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(input)) !== null) {
    if (match.index > cursor) parts.push(input.slice(cursor, match.index));
    const tag = match[1] as string;
    const inner = match[2] as string;
    if (ALLOWED_TAGS.has(tag)) {
      // Recurse so allowed tags can contain allowed tags (rare but safe).
      parts.push(tag === 'strong'
        ? html`<strong>${renderLocalized(inner)}</strong>`
        : html`<em>${renderLocalized(inner)}</em>`);
    } else {
      parts.push(match[0]);
    }
    cursor = tagRe.lastIndex;
  }
  if (cursor < input.length) parts.push(input.slice(cursor));
  // Lit auto-escapes string children → safe.
  return html`${parts}`;
}
