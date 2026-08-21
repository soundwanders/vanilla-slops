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
 * substitutes `%command%` with the game's executable, so the tool has to be
 * written in front of it — `gamemoderun %command%`, `mangohud %command%`.
 *
 * Those two used to be stored as the bare tool names `gamemode` and `mangohud`,
 * which do nothing at all when pasted, and this function existed to serve the
 * working form from usage_example instead. **They now store the working form
 * directly** (slop-scraper rev 15), so for those two rows the substitution is a
 * no-op — the example and the command are the same string. The rule below is
 * unchanged and still earns its place: it keys on the shape of the example, not
 * on those two names, so it goes on covering the Proton variables and any
 * wrapper documented later. It also still handles the old bare spellings, which
 * costs nothing and means a stale cached payload degrades quietly.
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
