import ar from './ar.js';

const $ = selector => document.querySelector(selector);
const form = $('#employee-auth');
try {
  const key = 'dawamkom-login-email:' + location.pathname;
  form.elements.email.value = sessionStorage.getItem(key) ?? '';
  sessionStorage.removeItem(key);
} catch {}
const status = $('#employee-status');
const punch = $('#employee-punch');
const change = $('#employee-change');
const refresh = $('#employee-refresh');
const dashboard = $('#employee-dashboard');
const requestForm = $('#employee-request');
const managerInbox = $('#manager-inbox');
const managerNavigation = $('#manager-navigation');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const requestFilters = [['Pending', 'في الانتظار'], ['Approved', 'معتمدة'], ['Declined', 'مرفوضة'], ['All', 'جميع الطلبات']];
let managerFilter = 'Pending';
let managerRequests;
let managerFeedback = '';

function renderManagerRequests() {
  const rows = managerRequests?.rows ?? [];
  const filtered = rows.filter(row => managerFilter === 'All' || row.status === managerFilter);
  managerInbox.innerHTML = '<h1>الطلبات</h1><div class="request-filters" aria-label="تصفية الطلبات">' + requestFilters.map(([value, label]) =>
    `<button type="button" data-request-filter="${value}" aria-pressed="${managerFilter === value}">${label}${value === 'Pending' ?
      `<span>${rows.filter(row => row.status === 'Pending').length}</span>` : ''}</button>`).join('') +
    '</div><p role="status">' + escape(managerFeedback) + '</p>' +
    (filtered.length ? '<div class="table-wrap request-inbox-table"><table><thead><tr>' +
      ['الرقم', 'الموظف', 'طلب', 'مسؤول الموافقة', 'الحالة', 'يوم الطلب', 'الإجراء'].map(label => `<th scope="col">${label}</th>`).join('') +
      '</tr></thead><tbody>' + filtered.map(row => {
        const tags = row.kind === 'browser' ? ['تغيير المتصفح'] : ['إجازة', ar[row.type] ?? row.type,
          row.date === row.end ? row.date : `${row.date} – ${row.end}`];
        const actions = row.status === 'Pending' ? `<div class="actions"><button type="button" class="button secondary compact" data-request-id="${escape(row.id)}" data-request-action="approve">موافقة</button>` +
          `<button type="button" class="button secondary compact" data-request-id="${escape(row.id)}" data-request-action="reject">رفض</button></div>` : '—';
        return `<tr><td><bdi>${escape(row.id.slice(0, 8))}</bdi></td><td><strong>${escape(row.employee)}</strong><small>${escape(ar[row.jobTitle] ?? row.jobTitle)}</small></td>` +
          `<td><div class="request-chips">${tags.map(tag => `<span>${escape(tag)}</span>`).join('')}</div>${row.note ? `<small>${escape(row.note)}</small>` : ''}</td>` +
          `<td>${escape(managerRequests.manager)}</td><td><span class="request-state" data-status="${escape(row.status)}">${escape(requestFilters.find(([value]) => value === row.status)?.[1] ?? row.status)}</span></td>` +
          `<td><bdi>${escape(row.submittedOn ?? '—')}</bdi></td><td>${actions}</td></tr>`;
      }).join('') + '</tbody></table></div>' : '<p class="hint">لا توجد طلبات لعرضها.</p>');
}

async function showManagerView() {
  const viewingRequests = Boolean(session?.canReviewDeviceRequests && location.hash !== '#account');
  managerInbox.hidden = !viewingRequests;
  dashboard.hidden = viewingRequests || !session?.ok;
  $('.employee-content').classList.toggle('employee-content-wide', viewingRequests);
  $('.employee-heading').hidden = viewingRequests;
  for (const link of managerNavigation.querySelectorAll('a')) {
    if (link.hash === (viewingRequests ? '#requests' : '#account')) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (!viewingRequests) return;
  try {
    managerRequests = await api('manager-requests');
    if (!managerRequests.ok) managerFeedback = managerRequests.error || 'تعذّر تحميل الطلبات.';
  } catch { managerFeedback = 'تعذّر تحميل الطلبات.'; }
  renderManagerRequests();
}

managerInbox.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.requestFilter) {
    managerFilter = button.dataset.requestFilter;
    renderManagerRequests();
    managerInbox.querySelector(`[data-request-filter="${managerFilter}"]`)?.focus();
    return;
  }
  const row = managerRequests?.rows?.find(item => item.id === button.dataset.requestId);
  if (!row) return;
  run(button, async () => {
    const decision = button.dataset.requestAction;
    const result = row.kind === 'browser' ? await api('device-approval', { staffId: row.staffId, requestId: row.id, decision }) :
      await api('leave-decision', { id: row.id, status: decision === 'approve' ? 'Approved' : 'Declined' });
    managerFeedback = result.ok ? 'تم حفظ القرار.' : result.error;
    await showManagerView();
    managerInbox.querySelector('[aria-pressed="true"]')?.focus();
  });
});
window.addEventListener('hashchange', () => { if (session?.canReviewDeviceRequests) showManagerView(); });

let token = new URLSearchParams(location.hash.slice(1)).get('activate');
let session;

async function api(action, body) {
  const response = await fetch(location.pathname.replace(/\/employee$/, '') + '/api/employee/' + action, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {});
  return { ok: response.ok, ...await response.json() };
}
async function show(forceLogin = false) {
  form.hidden = true;
  dashboard.hidden = true;
  managerInbox.hidden = managerNavigation.hidden = true;
  $('.employee-content').classList.remove('employee-content-wide');
  $('.employee-heading').hidden = false;
  const invitation = $('#employee-invitation');
  invitation.hidden = true;
  $('#employee-title').textContent = token ? 'تفعيل حساب دوامكم' : 'حساب الموظف';
  if (token !== null) {
    const details = await api('invitation', { token });
    if (!details.ok) {
      status.textContent = details.error;
      return;
    }
    $('#invitation-email').textContent = details.email;
    $('#invitation-company').textContent = details.company;
    invitation.hidden = false;
  }
  const activating = token !== null;
  session = activating || forceLogin === true ? null : await api('session');
  $('#employee-logout').hidden = !session?.ok;
  refresh.hidden = !session?.pending;
  punch.hidden = !session?.ok || !session.hasLocations;
  if (session?.ok) {
    status.textContent = 'مرحبًا، ' + session.name;
    dashboard.hidden = false;
    $('#employee-location-note').hidden = session.hasLocations;
    punch.textContent = session.nextPunch === 'in' ? 'تسجيل الحضور' : 'تسجيل الانصراف';
    requestForm.hidden = !session.leaveTypes.length;
    $('#employee-leave-empty').hidden = Boolean(session.leaveTypes.length);
    requestForm.elements.type.replaceChildren(...session.leaveTypes.map(type => new Option(ar[type] ?? type, type)));
    requestForm.elements.date.value ||= session.today;
    requestForm.elements.end.value ||= session.today;
    managerNavigation.hidden = !session.canReviewDeviceRequests;
    if (session.canReviewDeviceRequests) await showManagerView();
    return;
  }
  status.textContent = session?.pending ? 'طلب تغيير الجوال بانتظار موافقة المدير المباشر.' : '';
  const managerEmailSelected = location.hash === '#requests' && Boolean(form.elements.email.value);
  $('#employee-email').hidden = activating || managerEmailSelected;
  $('#employee-password-rules').hidden = !activating;
  $('#employee-confirm').hidden = !activating;
  form.elements.email.required = !activating;
  form.elements.confirmation.required = activating;
  form.elements.password.autocomplete = activating ? 'new-password' : 'current-password';
  form.elements.password.minLength = activating ? 10 : 0;
  $('#employee-submit').textContent = activating ? 'تفعيل الحساب' : 'تسجيل الدخول';
  change.hidden = true;
  form.hidden = Boolean(session?.pending);
}
async function authenticate(requestChange = false) {
  if (!form.reportValidity()) return;
  const credentials = Object.fromEntries(new FormData(form));
  const result = await api(token ? 'activate' : 'login', { ...credentials, token, requestChange });
  if (result.changeRequired) {
    status.textContent = 'هذا المتصفح غير معتمد. قدّم طلب تغيير الجوال.';
    change.hidden = false;
  } else if (!result.ok) {
    status.textContent = result.error;
  } else {
    const activated = token !== null;
    const activatedEmail = $('#invitation-email').textContent;
    if (activated) history.replaceState(null, '', location.pathname + location.search);
    token = null;
    form.reset();
    if (activated) form.elements.email.value = activatedEmail;
    await show(activated);
  }
}
async function run(control, action) {
  control.disabled = true;
  try { await action(); }
  catch { status.textContent = 'تعذّر إكمال الإجراء. حاول مرة أخرى.'; }
  finally { control.disabled = false; }
}
form.onsubmit = event => {
  event.preventDefault();
  run($('#employee-submit'), () => authenticate());
};
change.onclick = () => run(change, () => authenticate(true));
refresh.onclick = () => run(refresh, show);
const logout = $('#employee-logout');
logout.onclick = () => run(logout, async () => {
  const result = await api('logout', {});
  if (!result.ok) throw new Error(result.error);
  form.reset();
  requestForm.reset();
  $('#employee-request-status').textContent = '';
  managerFeedback = '';
  await show();
});
requestForm.onsubmit = event => {
  event.preventDefault();
  const message = $('#employee-request-status');
  message.textContent = '';
  run(event.submitter, async () => {
    const result = await api('requests', Object.fromEntries(new FormData(requestForm)));
    if (result.ok) requestForm.elements.note.value = '';
    message.textContent = result.ok ? 'تم إرسال طلب الإجازة.' : ar[result.error] ?? result.error;
  });
};
punch.onclick = () => run(punch, async () => {
  const { coords } = await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
  const { latitude, longitude, accuracy } = coords;
  const result = await api('punch', { latitude, longitude, accuracy, kind: session.nextPunch });
  await show();
  status.textContent = result.ok ? 'تم تسجيل البصمة.' : result.error;
});
run($('#employee-submit'), show);
