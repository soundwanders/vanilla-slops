/**
 * @fileoverview What an option shows when it has no written description.
 *
 * 248 of 649 published options had none on 2026-11-22. The catalogue stores
 * nothing rather than a guess, and since 1.7.15 the API says so with `null`
 * instead of inventing "No description available". A visitor should see
 * neither that nor an empty gap, so the slot points to where the option is
 * explained. Every one of the 248 had a source link to point to.
 *
 * Shared so the game page and the homepage's expanded rows say the same thing.
 * Dependency-free and isomorphic, like everything in src/shared: the caller
 * passes its own escaper and its already-checked URL.
 */

/**
 * @param {{label: string, href: string|null}} source - The source's display
 *   name, and its URL after safeHttpUrl (null when there is none or it failed)
 * @param {(text: string) => string} escapeHtml - The caller's escaper
 * @returns {string} The pointer's HTML, or '' when there is nowhere to point
 */
export function descriptionPointerHTML({ label, href }, escapeHtml) {
  if (!href) return '';
  const name = label ? escapeHtml(label) : 'the source';
  return '<p class="option-description option-description-pointer">' +
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` +
    `What ${name} says<span aria-hidden="true"> ↗</span>` +
    '<span class="sr-only"> (opens in a new tab)</span></a></p>';
}
