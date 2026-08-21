import { describe, it, expect } from 'vitest';
import { safeHttpUrl } from '../utils/safeUrl.js';

// Exotic whitespace is built from char codes: written literally it is invisible
// in a diff and can break the file that carries it.
const NBSP = String.fromCharCode(0x00a0);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('safeHttpUrl — real provenance links pass through untouched', () => {
  // Every source_url sampled from production is an absolute https URL. None of
  // these may be altered: the link is shown as the catalogue recorded it.
  it.each([
    'https://www.pcgamingwiki.com/wiki/Team_Fortress_2',
    'https://steamcommunity.com/app/440/discussions/0/1234567890/',
    'https://github.com/ValveSoftware/Source-1-Games/issues/1',
    'http://old-forum.example.com/thread?id=7',
    'https://x.example/path?a=1&b=2#frag',
  ])('%s', (url) => {
    expect(safeHttpUrl(url)).toBe(url);
  });

  it('does not normalise — no trailing slash appears, no re-encoding', () => {
    expect(safeHttpUrl('https://example.com')).toBe('https://example.com');
    expect(safeHttpUrl('https://example.com/a%20b')).toBe('https://example.com/a%20b');
  });
});

describe('safeHttpUrl — script-bearing schemes are refused', () => {
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('rejects %s', (url) => {
    expect(safeHttpUrl(url)).toBe('');
  });

  it('rejects a scheme hidden behind ASCII whitespace', () => {
    // The URL parser strips these before reading the scheme, so a check against
    // the raw string would let them through.
    expect(safeHttpUrl('  javascript:alert(1)')).toBe('');
    expect(safeHttpUrl('java\nscript:alert(1)')).toBe('');
    expect(safeHttpUrl('java\tscript:alert(1)')).toBe('');
    expect(safeHttpUrl('java\rscript:alert(1)')).toBe('');
  });

  it('rejects non-breaking and line separators around the scheme', () => {
    expect(safeHttpUrl(NBSP + 'javascript:alert(1)')).toBe('');
    expect(safeHttpUrl(LS + 'javascript:alert(1)')).toBe('');
    expect(safeHttpUrl(PS + 'javascript:alert(1)')).toBe('');
  });
});

describe('safeHttpUrl — anything unparseable is treated as absent', () => {
  it.each([
    ['relative path', '/wiki/Team_Fortress_2'],
    ['protocol-relative', '//evil.example.com'],
    ['bare text', 'not a url'],
    ['empty', ''],
  ])('%s', (_label, url) => {
    expect(safeHttpUrl(url)).toBe('');
  });

  it.each([null, undefined, 42, {}, []])('non-string %s', (value) => {
    expect(safeHttpUrl(value)).toBe('');
  });
});
