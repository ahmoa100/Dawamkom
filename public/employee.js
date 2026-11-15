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
const requestDialog = $('#employee-request-dialog');
const messagesDialog = $('#employee-messages-dialog');
const requestTitle = $('#employee-requests-title');
const formatClock = new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' });
const formatHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', hourCycle: 'h23' });
const requestLabels = { 'Missed punch': 'تصحيح البصمة', 'Attendance excuse': 'الاستئذان', leave: 'إجازة', all: 'طلب جديد' };

function updateTime() {
  if (!session?.ok) return;
  const now = new Date();
  const started = Date.parse(session.shiftStartsAt);
  const elapsed = Math.max(0, Math.floor((now - Date.parse(session.punchedInAt)) / 60000)) || 0;
  const remaining = Math.ceil((started - now) / 60000);
  const hint = session.punchedInAt ? 'مدة الدوام منذ تسجيل الحضور' : !Number.isFinite(started) ? 'لا يوجد دوام مجدول اليوم' :
    remaining > 0 && remaining < 120 ? `يبدأ الدوام خلال ${remaining} دقيقة` :
      `${remaining > 0 ? 'يبدأ الدوام الساعة' : 'بدأ الدوام الساعة'} ${formatClock.format(started)}`;
  const clock = [Math.floor(elapsed / 60), elapsed % 60].map(value => String(value).padStart(2, '0')).join(':');
  if ($('#employee-shift').textContent !== hint) $('#employee-shift').textContent = hint;
  if ($('#employee-timer').textContent !== clock) $('#employee-timer').textContent = clock;
}

function updateRequestFields() {
  const type = requestForm.elements.type.value;
  const leave = requestForm.dataset.kind === 'leave' || session.leaveTypes.includes(type);
  const excuse = type === 'Attendance excuse';
  $('#employee-request-date-label').textContent = leave ? 'بدء' : 'التاريخ';
  for (const [id, name, visible, required] of [
    ['employee-request-end', 'end', leave, leave], ['employee-excuse-type', 'excuseType', excuse, excuse],
    ['employee-excuse-reason', 'reason', excuse, excuse], ['employee-attachment', 'attachment', excuse, false],
  ]) {
    $('#' + id).hidden = !visible;
    requestForm.elements[name].disabled = !visible;
    requestForm.elements[name].required = required;
  }
}

function openRequest(kind) {
  requestForm.reset();
  requestForm.dataset.kind = kind;
  $('#employee-request-status').textContent = '';
  const types = kind === 'all' ? [...session.leaveTypes, ...session.attendanceTypes] : kind === 'leave' ? session.leaveTypes : [kind];
  requestForm.elements.type.replaceChildren(...types.map(type => new Option(requestLabels[type] ?? ar[type] ?? type, type)));
  requestForm.elements.excuseType.replaceChildren(new Option('اختر نوع الاستئذان', ''), ...session.excuseTypes.map(value => new Option(ar[value] ?? value, value)));
  requestForm.elements.reason.replaceChildren(new Option('اختر فئة السبب', ''), ...session.excuseReasons.map(value => new Option(ar[value] ?? value, value)));
  requestForm.elements.date.value = session.today;
  requestForm.elements.end.min = session.today;
  $('#employee-request-type').hidden = kind !== 'all' && kind !== 'leave';
  $('#employee-request-type span').textContent = kind === 'leave' ? 'نوع الإجازة' : 'نوع الطلب';
  if (kind === 'leave' || kind === 'all') requestForm.elements.type.prepend(new Option('اختر النوع', '', true, true));
  requestTitle.textContent = requestLabels[kind];
  updateRequestFields();
  requestDialog.showModal();
}

dashboard.addEventListener('click', event => {
  const button = event.target.closest('[data-quick-request]');
  if (button && session?.ok) openRequest(button.dataset.quickRequest);
  const close = event.target.closest('[data-employee-close]');
  if (close) close.closest('dialog').close();
});
requestForm.elements.type.addEventListener('change', updateRequestFields);
requestForm.elements.date.addEventListener('change', () => {
  requestForm.elements.end.min = requestForm.elements.date.value;
});
$('#employee-messages').onclick = () => run($('#employee-messages'), async () => {
  const latest = await api('session');
  if (!latest.ok) { await show(); return; }
  const list = $('#employee-message-list');
  list.replaceChildren();
  for (const request of latest.ownRequests) {
    const item = document.createElement('p');
    item.textContent = `${requestLabels[request.type] ?? ar[request.type] ?? request.type} · ${ar[request.status] ?? request.status} · ${request.date}`;
    list.append(item);
  }
  if (!latest.ownRequests.length) list.textContent = 'لا توجد طلبات بعد.';
  messagesDialog.showModal();
});
window.setInterval(updateTime, 1000);

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
  $('#employee-title').hidden = Boolean(session?.ok);
  $('#employee-logout').hidden = !session?.ok;
  refresh.hidden = !session?.pending;
  if (session?.ok) {
    status.textContent = '';
    dashboard.hidden = false;
    $('#employee-greeting').textContent = (Number(formatHour.format(new Date())) < 12 ? 'صباح الخير، ' : 'مساء الخير، ') + session.name;
    renderDeviceRequests(session.deviceRequests ?? []);
    $('#employee-location-note').hidden = session.hasLocations;
    punch.disabled = !session.hasLocations;
    $('#employee-punch-label').textContent = session.nextPunch === 'out' ? 'تسجيل الانصراف' : 'تسجيل البصمة';
    dashboard.querySelector('[data-quick-request="leave"]').disabled = !session.leaveTypes.length;
    updateTime();
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
async function run(control, action, feedback = status) {
  control.disabled = true;
  try { await action(); }
  catch { feedback.textContent = 'تعذّر إكمال الإجراء. حاول مرة أخرى.'; }
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
    const values = Object.fromEntries(new FormData(requestForm));
    const file = values.attachment;
    delete values.attachment;
    if (file?.size) {
      if (file.size > 2 * 1024 * 1024) { message.textContent = 'حجم المرفق يتجاوز 2 ميجابايت.'; return; }
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      values.attachment = { name: file.name, data: encoded };
    }
    const result = await api('requests', values);
    if (result.ok) {
      requestDialog.close();
      status.textContent = 'تم إرسال الطلب.';
    } else message.textContent = ar[result.error] ?? result.error;
  }, message);
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
