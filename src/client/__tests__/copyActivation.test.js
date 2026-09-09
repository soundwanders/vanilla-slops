import { describe, it, expect } from 'vitest';
import { isCopyActivationKey } from '../js/ui/table-shared.js';
import { TableState } from '../js/ui/table-shared.js';

/**
 * Regression test for the copy control's keyboard activation.
 *
 * Bug: the keydown handler on `.option-command` was gated on
 * `!TableState.touchDevice`, and touchDevice is `'ontouchstart' in window` —
 * true on touchscreen laptops, Surface devices and keyboard-attached tablets,
 * not only on phones. On any of those the control still took focus
 * (`tabIndex = 0`) and still announced as a button (`role="button"`), and then
 * Enter and Space did nothing. That is a WCAG 2.1.1 failure on the single
 * action the whole site exists to offer.
 *
 * The rule now lives in isCopyActivationKey, which takes only the key — so a
 * device-capability check cannot be reintroduced into it without this failing.
 */
describe('isCopyActivationKey', () => {
  it('accepts Enter and Space', () => {
    expect(isCopyActivationKey('Enter')).toBe(true);
    expect(isCopyActivationKey(' ')).toBe(true);
  });

  it('ignores keys that are not activation keys', () => {
    ['Tab', 'Escape', 'a', 'ArrowDown', 'Spacebar', ''].forEach((key) => {
      expect(isCopyActivationKey(key)).toBe(false);
    });
  });

  it('does not consult touch capability', () => {
    // The exact condition that used to break it: a touch-capable device with a
    // keyboard attached. Both settings must give the same answer.
    TableState.touchDevice = true;
    expect(isCopyActivationKey('Enter')).toBe(true);
    expect(isCopyActivationKey(' ')).toBe(true);

    TableState.touchDevice = false;
    expect(isCopyActivationKey('Enter')).toBe(true);
    expect(isCopyActivationKey(' ')).toBe(true);
  });
});
