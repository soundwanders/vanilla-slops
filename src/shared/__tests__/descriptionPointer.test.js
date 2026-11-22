import { describe, it, expect } from 'vitest';
import { descriptionPointerHTML } from '../descriptionPointer.js';

// What an option without a written description shows, on both the game page
// and the homepage's expanded rows. Never invented text, never "null", never
// an empty gap when there is somewhere to send the reader.

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

describe('descriptionPointerHTML', () => {
  it('points to where the option is explained, by name', () => {
    const html = descriptionPointerHTML(
      { label: 'PCGamingWiki', href: 'https://www.pcgamingwiki.com/wiki/Half-Life:_Alyx' },
      escapeHtml,
    );
    expect(html).toContain('What PCGamingWiki says<');
    expect(html).toContain('href="https://www.pcgamingwiki.com/wiki/Half-Life:_Alyx"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('class="option-description option-description-pointer"');
  });

  it('says where the link goes for a screen reader, and keeps the arrow out of it', () => {
    const html = descriptionPointerHTML({ label: 'ProtonDB', href: 'https://www.protondb.com/app/440' }, escapeHtml);
    expect(html).toContain('<span aria-hidden="true"> ↗</span>');
    expect(html).toContain('<span class="sr-only"> (opens in a new tab)</span>');
  });

  it('escapes the name and the URL with the caller\'s escaper', () => {
    const html = descriptionPointerHTML(
      { label: '<b>Wiki</b>', href: 'https://example.com/?a=1&b="2"' },
      escapeHtml,
    );
    expect(html).toContain('What &lt;b&gt;Wiki&lt;/b&gt; says');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=&quot;2&quot;"');
    expect(html).not.toContain('<b>');
  });

  it('falls back to "the source" when the source has no name', () => {
    const html = descriptionPointerHTML({ label: '', href: 'https://steamcommunity.com/x' }, escapeHtml);
    expect(html).toContain('What the source says<');
  });

  it('renders nothing when there is nowhere to point', () => {
    expect(descriptionPointerHTML({ label: 'PCGamingWiki', href: null }, escapeHtml)).toBe('');
  });

  it('never prints the API\'s null, or the old invented text', () => {
    const html = descriptionPointerHTML({ label: 'PCGamingWiki', href: 'https://www.pcgamingwiki.com/' }, escapeHtml);
    expect(html).not.toMatch(/null|No description available|Community/);
  });
});
