// Runs before styles paint. Appearance is a device preference, never a role permission.
(() => {
  const key = 'dawamkom-appearance';
  let current = 'dark';
  const normalize = value => value === 'white' && !window.ReactNativeWebView ? 'white' : value === 'light' || value === 'white' ? 'light' : 'dark';
  try { current = normalize(localStorage.getItem(key)); } catch { /* Storage may be disabled. */ }
  function apply(value, persist = false) {
    current = normalize(value);
    const base = current === 'white' ? 'light' : current;
    document.documentElement.dataset.theme = base;
    document.documentElement.dataset.appearance = current;
    document.documentElement.style.colorScheme = base;
    // The native safe areas are outside the web page and need the same choice.
    try { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'appearance',theme:base})); }
    catch { /* Browser and older app versions continue to use the web theme. */ }
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = current === 'white' ? '#f5f7f8' : current === 'light' ? '#e8e5dc' : '#14282e';
    const colorScheme = document.querySelector('meta[name="color-scheme"]');
    if (colorScheme) colorScheme.content = base;
    for (const picker of document.querySelectorAll('[data-theme-picker]')) picker.value = current;
    for (const toggle of document.querySelectorAll('[data-theme-toggle]')) toggle.setAttribute?.('aria-checked', String(base === 'light'));
    for (const toggle of document.querySelectorAll('[data-theme-switch]')) toggle.checked = base === 'light';
    if (persist) { try { localStorage.setItem(key, current); } catch { /* Keep the choice for this page. */ } }
  }
  window.dawamkomTheme = { get: () => current, set: value => apply(value, true) };
  apply(current);
  document.addEventListener('DOMContentLoaded', () => apply(current));
  document.addEventListener('change', event => {
    if (event.target.matches?.('[data-theme-picker]')) apply(event.target.value, true);
    if (event.target.matches?.('[data-theme-switch]')) apply(event.target.checked ? 'light' : 'dark', true);
  });
  window.addEventListener('storage', event => { if (event.key === key) apply(event.newValue); });
})();
