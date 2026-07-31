/*
 * Click-to-copy for launch-option commands on server-rendered /game/ pages.
 * Standalone (no bundle, CSP-safe as a same-origin script) — the SPA has its own
 * copy handling in ui/table.js; this covers the static game pages.
 */
(function () {
  function flash(el, cls, word) {
    el.classList.add(cls);
    var w = el.querySelector('.copy-word');
    if (w) {
      w.dataset.reset = w.dataset.reset || w.textContent;
      w.textContent = word;
      setTimeout(function () { w.textContent = w.dataset.reset; }, 1200);
    }
    setTimeout(function () { el.classList.remove(cls); }, 1200);
  }

  function copy(el) {
    var cmd = el.getAttribute('data-command');
    if (!cmd || !navigator.clipboard) return;
    navigator.clipboard.writeText(cmd)
      .then(function () { flash(el, 'copied', 'Copied'); })
      .catch(function () { flash(el, 'copy-failed', 'Failed'); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.option-command[data-command]').forEach(function (el) {
      el.addEventListener('click', function () { copy(el); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(el); }
      });
    });
  });
})();
