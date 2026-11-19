// Runs before styles paint. Appearance is a device preference, never a role permission.
(() => {
  const key = 'dawamkom-appearance';
  let current = 'dark';
  const normalize = value => value === 'light' ? 'light' : 'dark';
  try { current = normalize(localStorage.getItem(key)); } catch { /* Storage may be disabled. */ }
  function apply(value, persist = false) {
    current = normalize(value);
    document.documentElement.dataset.theme = current;
    document.documentElement.style.colorScheme = current;
    // The native safe areas are outside the web page and need the same choice.
    try { window.ReactNativeWebView?.postMessage(JSON.stringify({type:'appearance',theme:current})); }
    catch { /* Browser and older app versions continue to use the web theme. */ }
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = current === 'light' ? '#e8e5dc' : '#14282e';
    const colorScheme = document.querySelector('meta[name="color-scheme"]');
    if (colorScheme) colorScheme.content = current;
    for (const picker of document.querySelectorAll('[data-theme-picker]')) picker.value = current;
    for (const toggle of document.querySelectorAll('[data-theme-toggle]')) toggle.setAttribute?.('aria-checked', String(current === 'light'));
    for (const toggle of document.querySelectorAll('[data-theme-switch]')) toggle.checked = current === 'light';
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
