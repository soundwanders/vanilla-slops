import { describe, it, expect } from 'vitest';
import { jsonLdScript } from '../utils/jsonLdScript.js';

// U+2028/U+2029 are built from char codes on purpose: written literally they
// are invisible in a diff and break the file that contains them.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('jsonLdScript — escaping', () => {
  it('neutralises a closing script tag in a game title', () => {
    // The payload this function exists for: `games.title` is scraped, not
    // authored here, and JSON.stringify leaves `<` and `/` alone.
    const out = jsonLdScript({ name: 'Foo</script><img src=x onerror=alert(1)>' });
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c');
  });

  it('catches the tag in any case and with whitespace', () => {
    expect(jsonLdScript({ n: '</SCRIPT >' })).not.toMatch(/<\/script/i);
    expect(jsonLdScript({ n: '</ScRiPt\t>' })).not.toMatch(/<\/script/i);
  });

  it('escapes < > and & wherever they appear, including nested values', () => {
    const out = jsonLdScript({ a: { b: [{ c: '<&>' }] } });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('&');
  });

  it('escapes the JavaScript line terminators', () => {
    const out = jsonLdScript({ s: `a${LS}b${PS}c` });
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
  });
});

describe('jsonLdScript — the output is still the same document', () => {
  // Escaping that changed the structured data would trade an XSS bug for an
  // SEO one. These are ordinary JSON escapes, so a parser sees no difference.
  const cases = [
    { name: 'Half-Life 2', url: 'https://x/?a=1&b=2' },
    { name: 'Pokémon™ 日本語 — em dash' },
    { name: 'He said "hi" \\ back' },
    { name: `sep${LS}arated` },
    { '@context': 'https://schema.org', '@type': 'VideoGame', author: { name: 'Valve' } },
  ];

  it.each(cases)('round-trips %#', (value) => {
    expect(JSON.parse(jsonLdScript(value))).toEqual(value);
  });

  it('handles the shapes the controller actually passes', () => {
    const breadcrumb = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Vanilla Slops', item: 'https://launchoptions.dev' },
        { '@type': 'ListItem', position: 2, name: 'Team Fortress 2', item: 'https://launchoptions.dev/game/440/team-fortress-2' },
      ],
    };
    expect(JSON.parse(jsonLdScript(breadcrumb))).toEqual(breadcrumb);
  });

  it('survives empty and absent values', () => {
    expect(JSON.parse(jsonLdScript({}))).toEqual({});
    expect(jsonLdScript(null)).toBe('null');
  });
});
