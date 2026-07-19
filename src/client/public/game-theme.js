/*
 * Standalone theme handling for server-rendered /game/ pages.
 * Mirrors src/client/js/ui/theme.js but self-contained (no bundle, CSP-safe).
 * Loaded as a classic render-blocking script in <head> so data-theme is set
 * before first paint — no flash of light when arriving from a dark homepage.
 */
(function () {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch { /* private mode */ }
  var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(theme === 'dark'));
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      btn.setAttribute('aria-pressed', String(next === 'dark'));
      try { localStorage.setItem('theme', next); } catch { /* private mode */ }
    });
  });
})();
