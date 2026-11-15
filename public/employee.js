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
const deviceList = $('#employee-device-list');

function renderDeviceRequests(requests) {
  $('#employee-device-inbox').hidden = !requests.length && !$('#employee-device-status').textContent;
  deviceList.replaceChildren();
  for (const request of requests) {
    const row = document.createElement('div');
    row.className = 'actions';
    const name = document.createElement('strong');
    name.textContent = request.name;
    row.append(name);
    for (const [decision, label] of [['approve', 'موافقة'], ['reject', 'رفض']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary compact';
      button.textContent = label;
      button.onclick = () => run(button, async () => {
        const result = await api('device-approval', { staffId: request.staffId, requestId: request.requestId, decision });
        $('#employee-device-status').textContent = result.ok ? 'تم حفظ القرار.' : result.error;
        await show();
      });
      row.append(button);
    }
    deviceList.append(row);
  }
}
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
    renderDeviceRequests(session.deviceRequests ?? []);
    $('#employee-location-note').hidden = session.hasLocations;
    punch.textContent = session.nextPunch === 'in' ? 'تسجيل الحضور' : 'تسجيل الانصراف';
    requestForm.hidden = !session.leaveTypes.length;
    $('#employee-leave-empty').hidden = Boolean(session.leaveTypes.length);
    requestForm.elements.type.replaceChildren(...session.leaveTypes.map(type => new Option(ar[type] ?? type, type)));
    requestForm.elements.date.value ||= session.today;
    requestForm.elements.end.value ||= session.today;
    return;
  }
  status.textContent = session?.pending ? 'طلب تغيير الجوال بانتظار موافقة المدير المباشر.' : '';
  $('#employee-email').hidden = activating;
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
  $('#employee-device-status').textContent = '';
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
