import {employeeText} from './employee-chinese.js';
let loadedVersion = document.querySelector('meta[name="dawamkom-release"]')?.content;
let dismissedVersion;
let checking = false;
const dirtyForms = new Set();
document.addEventListener('input', event => {
  if (event.target.form && event.target.type !== 'search') dirtyForms.add(event.target.form);
});
function showUpdate(version) {
  let panel = document.querySelector('#release-update-notice');
  if (panel) return;
  const L = (ar, en) => employeeText(document.documentElement.lang || 'ar', ar, en);
  panel = document.createElement('aside');
  panel.id = 'release-update-notice';
  panel.className = 'release-update-notice';
  panel.setAttribute('role', 'status');
  const title = document.createElement('strong');
  title.textContent = L('يتوفر تحديث جديد', 'An update is available');
  const description = document.createElement('p');
  description.textContent = L('حدّث الصفحة للحصول على آخر التحسينات.', 'Refresh to get the latest improvements.');
  const update = document.createElement('button');
  update.type = 'button';
  update.className = 'button primary compact';
  update.textContent = L('تحديث', 'Update');
  update.onclick = () => {
    const dirty = [...dirtyForms].some(form => form.isConnected && form.offsetParent !== null);
    if (dirty && !window.confirm(L('توجد بيانات غير محفوظة. هل تريد تحديث الصفحة؟', 'You have unsaved changes. Refresh the page?'))) return;
    location.reload();
  };
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'release-update-close';
  close.textContent = '×';
  close.setAttribute('aria-label', L('لاحقًا', 'Later'));
  close.onclick = () => { dismissedVersion = version; panel.remove(); };
  panel.append(close, title, description, update);
  document.body.append(panel);
}
async function checkRelease() {
  if (document.hidden || checking) return;
  checking = true;
  try {
    const response = await fetch('/api/version', {cache: 'no-store', signal: AbortSignal.timeout(8000)});
    if (!response.ok) return;
    const {version} = await response.json();
    if (!/^[a-f0-9]{16}$/.test(version ?? '')) return;
    if (!/^[a-f0-9]{16}$/.test(loadedVersion ?? '')) loadedVersion = version;
    if (version !== loadedVersion && version !== dismissedVersion) showUpdate(version);
  } catch { /* Retry on focus or the next periodic check. */ }
  finally { checking = false; }
}
setInterval(checkRelease, 60000);
window.addEventListener('focus', checkRelease);
window.addEventListener('online', checkRelease);
document.addEventListener('visibilitychange', checkRelease);
void checkRelease();
