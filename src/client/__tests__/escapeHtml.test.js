import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../js/ui/table-shared.js';
import { createEmptyStateHTML } from '../js/ui/empty-states.js';

/**
 * Two ways text reached innerHTML unescaped.
 *
 * escapeHtml was a textContent/innerHTML round trip, which encodes `<` `>` `&`
 * but not quotes. The option card puts its output inside double-quoted
 * attributes, and eight published descriptions contain a `"` — each one ended
 * `data-search` early and spilled the rest into the tag as stray attributes.
 *
 * The empty states interpolated the active filters with no escaping at all, and
 * the filters are read straight from the URL. A link such as
 * `/?search=<a href=//evil.example>…</a>` therefore put the attacker's markup on
 * the page. The CSP stops it running script; it does not stop a fake link.
 */
describe('escapeHtml', () => {
  it('encodes every character that can end a text node or a quoted attribute', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`))
      .toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('keeps a real description inside its attribute', () => {
    const html = `<li data-search="${escapeHtml('skips "press key to continue" prompts')}">`;
    expect(html).toBe('<li data-search="skips &quot;press key to continue&quot; prompts">');
  });

  it('encodes & first, so nothing is double-encoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('returns an empty string for anything that is not a string', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(42)).toBe('');
  });
});

describe('empty states built from URL filters', () => {
  const payload = '<a href="//evil.example">Download the fix</a>';

  it('escapes the search term echoed in "No results found for …"', () => {
    const html = createEmptyStateHTML('search-no-results', { search: payload });
    expect(html).not.toContain('<a href');
    expect(html).toContain('&lt;a href=&quot;//evil.example&quot;&gt;');
  });

  it('escapes every value listed under "Active filters"', () => {
    const html = createEmptyStateHTML('all-games-filtered', {
      search: payload,
      developer: payload,
      engine: payload,
      category: payload,
      year: payload,
      options: payload,
      optionSearch: payload,
    });
    expect(html).not.toContain('<a href');
    expect(html.match(/&lt;a href=/g)).toHaveLength(7);
  });
});
