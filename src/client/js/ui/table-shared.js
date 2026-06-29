import { MOBILE_BREAKPOINT, TOUCH_TARGET_MIN_PX } from '../constants.js';

export const CONFIG = {
  CLOSE_ALL_THRESHOLD: 2,
  ANIMATION_DELAY: 300,
  FEEDBACK_DURATION: 2000,
  MOBILE_BREAKPOINT,
  TOUCH_TARGET_MIN: TOUCH_TARGET_MIN_PX,
  SELECTORS: {
    tableContainer: '#table-container',
    launchOptionsRow: '.launch-options-row[style*="table-row"]',
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
