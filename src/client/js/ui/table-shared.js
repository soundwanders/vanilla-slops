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
 * tool names, so a third wrapper documented later needs no code change. It must
 * stay this narrow: most usage examples are illustrative rather than literal
 * (`-w 640`'s example is `-w 1920 -h 1080`), so copying the example wholesale
 * would hand over a different setting than the one that was clicked.
 *
 * @param {Object} option - Launch option record
 * @param {string} command - The stored command, already resolved
 * @returns {string} The command as it should be pasted
 */
export function pasteableCommand(option, command) {
  const example = option.usage_example || '';
  return example.includes('%command%') ? example : command;
}
