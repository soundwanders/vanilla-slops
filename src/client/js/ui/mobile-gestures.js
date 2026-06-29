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
  let lastTouchEnd = 0;
  container.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
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

// closeLaunchOptions is injected to avoid circular imports
export function buffMobileOptions(container, closeLaunchOptions) {
  container.classList.add('mobile-enhanced');
  const interactiveElements = container.querySelectorAll('button, [role="button"]');
  interactiveElements.forEach(el => ensureTouchTarget(el));
  if (TableState.touchDevice) addSwipeToClose(container, closeLaunchOptions);
}

function addSwipeToClose(container, closeLaunchOptions) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  container.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    if (deltaY > 50) {
      container.style.transform = `translateY(${Math.min(deltaY - 50, 50)}px)`;
      container.style.opacity = Math.max(1 - (deltaY - 50) / 100, 0.5);
    }
  }, { passive: true });

  container.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    const deltaY = currentY - startY;
    if (deltaY > 100) {
      const gameId = container.dataset.gameId;
      if (gameId) closeLaunchOptions(gameId);
    } else {
      container.style.transform = '';
      container.style.opacity = '';
    }
  }, { passive: true });
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
