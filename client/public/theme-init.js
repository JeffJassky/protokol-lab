// Resolve theme before Vue mounts so first paint matches saved/system preference.
// Loaded as an external script so CSP can stay strict (no inline scripts, no hash maintenance).
// Must stay in sync with useTheme.js (storageKey 'vt-theme', attribute 'data-theme').
(function () {
  try {
    var saved = localStorage.getItem('vt-theme');
    var pref = saved || 'dark';
    var resolved = pref;
    if (pref === 'auto') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (_) { /* ignore */ }
})();
