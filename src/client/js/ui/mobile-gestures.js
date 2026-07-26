import { CONFIG, TableState } from './table-shared.js';

export function buffMobileTableView(table) {
  table.classList.add('mobile-optimized');
  const buttons = table.querySelectorAll('.launch-options-btn');
  buttons.forEach(button => ensureTouchTarget(button));
  table.setAttribute('aria-label', 'Games table - swipe horizontally on mobile to view all data');
  if (table.scrollWidth > table.clientWidth) addMobileScrollHint(table);
}

export function buffMobileTouch(container) {
  container.classList.add('mobile-optimized');
  if (TableState.touchDevice) addTouchOptimizations(container);
  addMobileEventHandlers(container);
}

function addTouchOptimizations(container) {
  container.style.touchAction = 'pan-y';
  if ('vibrate' in navigator) {
    container.addEventListener('touchstart', (e) => {
      if (e.target.closest('.launch-options-btn')) navigator.vibrate(50);
    }, { passive: true });
  }
  // Double-tap-zoom is prevented via `touch-action: manipulation` in CSS on the
  // interactive elements — cleaner than a JS touchend preventDefault, which also
  // swallowed legitimate quick taps.
}

function addMobileEventHandlers(container) {
  container.addEventListener('touchstart', (e) => {
    const target = e.target.closest('[data-mobile-action]');
    if (target) target.classList.add('touch-active');
  }, { passive: true });
  container.addEventListener('touchend', (e) => {
    const target = e.target.closest('[data-mobile-action]');
    if (target) target.classList.remove('touch-active');
  }, { passive: true });
}

export function ensureTouchTarget(element) {
  const rect = element.getBoundingClientRect();
  const minSize = CONFIG.TOUCH_TARGET_MIN;
  if (rect.width < minSize || rect.height < minSize) {
    element.style.minWidth = `${minSize}px`;
    element.style.minHeight = `${minSize}px`;
    element.style.display = 'inline-flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
  }
}

function addMobileScrollHint(table) {
  const hint = document.createElement('div');
  hint.className = 'mobile-scroll-hint';
  hint.innerHTML = '← Scroll to see more →';
  hint.setAttribute('aria-hidden', 'true');
  table.parentNode.insertBefore(hint, table);
  table.addEventListener('scroll', () => {
    hint.style.opacity = '0';
    setTimeout(() => hint.remove(), 300);
  }, { once: true });
}

export function enhanceMobileEmptyState(container) {
  container.classList.add('mobile-empty-state');
  const buttons = container.querySelectorAll('button, .btn');
  buttons.forEach(button => ensureTouchTarget(button));
  const descriptions = container.querySelectorAll('.empty-description');
  descriptions.forEach(desc => {
    desc.style.lineHeight = '1.6';
    desc.style.fontSize = 'var(--font-size-base)';
  });
}

export function buffMobileOptions(container) {
  container.classList.add('mobile-enhanced');
  const interactiveElements = container.querySelectorAll('button, [role="button"]');
  interactiveElements.forEach(el => ensureTouchTarget(el));
  // No swipe-to-close: on a scrollable list, "swipe down to dismiss" and
  // "scroll down" are the same motion and fight each other. The Hide Options
  // button and the row's Options toggle close the panel explicitly.
}

export function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
}

export function getSafeAreaInsets() {
  const top = getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0px';
  const bottom = getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0px';
  return { top: parseInt(top), bottom: parseInt(bottom) };
}

export function _handleOrientationChange(getTableContainer) {
  return () => setTimeout(() => {
    TableState.isMobile = window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
    if (TableState.isMobile) {
      const container = getTableContainer();
      if (container) buffMobileTouch(container);
    }
  }, 100);
}

export function _handleVisibilityChange() {
  document.body.classList.toggle('app-hidden', document.hidden);
}

export function setupMobileEventListeners(getTableContainer) {
  window.addEventListener('orientationchange', _handleOrientationChange(getTableContainer));
  document.addEventListener('visibilitychange', _handleVisibilityChange);
}
