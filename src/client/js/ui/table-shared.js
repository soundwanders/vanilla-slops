import { MOBILE_BREAKPOINT, TOUCH_TARGET_MIN_PX } from '../constants.js';

export const CONFIG = {
  CLOSE_ALL_THRESHOLD: 2,
  ANIMATION_DELAY: 300,
  FEEDBACK_DURATION: 2000,
  MOBILE_BREAKPOINT,
  TOUCH_TARGET_MIN: TOUCH_TARGET_MIN_PX,
  SELECTORS: {
    tableContainer: '#table-container',
    launchOptionsRow: '.launch-options-row.is-open',
    launchOptionsBtn: '.launch-options-btn',
    closeAllBtn: '#close-all-launch-options-btn'
  },
  CLASSES: {
    gamesTable: 'games-table',
    launchOptionsRow: 'launch-options-row',
    launchOptionsCell: 'launch-options-cell',
    launchOption: 'launch-option',
    optionCommand: 'option-command',
    closeAllBtn: 'close-all-btn',
    emptyTableState: 'empty-table-state',
    mobileResponsive: 'mobile-responsive-table'
  },
  DATA_LABELS: {
    title: 'Game Title',
    developer: 'Developer',
    publisher: 'Publisher',
    releaseDate: 'Release Date',
    engine: 'Engine',
    launchOptions: 'Launch Options'
  }
};

export const TableState = {
  openLaunchOptionsRows: new Set(),
  currentStats: { withOptions: 0, withoutOptions: 0, total: 0 },
  currentFilters: {},
  activeOptionFilter: { category: '', risk: '', command: '' },
  sortConfig: {},
  isInitialized: false,
  isMobile: false,
  touchDevice: false
};

export function getTableContainer() {
  const container = document.querySelector(CONFIG.SELECTORS.tableContainer);
  if (!container) console.error('Table container not found');
  return container;
}

export function getOpenLaunchOptionsCount() {
  return document.querySelectorAll(CONFIG.SELECTORS.launchOptionsRow).length;
}

export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * The string a user should actually paste into Steam.
 *
 * Usually that is the stored command. The exception is a wrapper tool: Steam
 * substitutes `%command%` with the game's executable, so `gamemode` and
 * `mangohud` are stored as bare tool names that do nothing on their own — the
 * working form is `gamemoderun %command%` / `mangohud %command%`, and it lives
 * in usage_example. Those two carry ~4,000 game-option links between them, a
 * quarter of the catalogue, so the difference is not a corner case.
 *
 * Keyed on the example wrapping `%command%` rather than on a hardcoded list of
 * tool names, so a wrapper documented later needs no code change.
 *
 * Two conditions, and the second one is not optional. Most usage examples are
 * illustrative rather than literal — `-w 640` is documented as
 * `-w 1920 -h 1080` — so an example may describe a *different setting* than the
 * option it hangs off. The dictionary also attaches one example per Proton
 * variable name to rows carrying different values, which is the case that bit:
 * `PROTON_NO_ESYNC=0` is documented as `PROTON_NO_ESYNC=1 %command%`, and
 * substituting on the wrap alone offered someone the flag that *enables* esync
 * from the row for disabling it. Requiring the example to start with the stored
 * command keeps the substitution to examples that are the same option, spelled
 * runnably.
 *
 * @param {Object} option - Launch option record
 * @param {string} command - The stored command, already resolved
 * @returns {string} The command as it should be pasted
 */
export function pasteableCommand(option, command) {
  const example = option.usage_example || '';
  const isRunnableFormOfThisCommand =
    example.includes('%command%') && example.startsWith(command);
  return isRunnableFormOfThisCommand ? example : command;
}
