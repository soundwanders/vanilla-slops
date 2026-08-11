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

  // One row = always. Reset to the CSS base size, then shrink the font just
  // enough that each command fits its box on a single line. The full command
  // lives in data-command (used for copy), so the ellipsis safety net (see
  // .option-command code in table.css) never loses data.
  function fitCommands() {
    var codes = document.querySelectorAll('.option-command code');
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i];
      code.style.fontSize = '';
      if (!code.clientWidth) continue;
      var size = parseFloat(getComputedStyle(code).fontSize) || 16;
      var guard = 16;
      while (code.scrollWidth > code.clientWidth + 1 && size > 11 && guard-- > 0) {
        size -= 1;
        code.style.fontSize = size + 'px';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.option-command[data-command]').forEach(function (el) {
      el.addEventListener('click', function () { copy(el); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(el); }
      });
    });
    fitCommands();
    var raf = 0;
    window.addEventListener('resize', function () {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fitCommands);
    });
  });
})();
