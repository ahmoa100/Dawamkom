const $ = selector => document.querySelector(selector);
const form = $('#employee-auth');
const status = $('#employee-status');
const punch = $('#employee-punch');
const change = $('#employee-change');
const refresh = $('#employee-refresh');
let token = new URLSearchParams(location.hash.slice(1)).get('activate');
let session;

async function api(action, body) {
  const response = await fetch(location.pathname.replace(/\/employee$/, '') + '/api/employee/' + action, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {});
  return { ok: response.ok, ...await response.json() };
}
async function show() {
  form.hidden = true;
  const invitation = $('#employee-invitation');
  invitation.hidden = true;
  $('#employee-title').textContent = token ? 'تفعيل حساب dawamkom' : 'حساب الموظف';
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
  session = activating ? null : await api('session');
  $('#employee-topbar').hidden = !session?.ok;
  refresh.hidden = !session?.pending;
  punch.hidden = !session?.ok || !session.hasLocations;
  if (session?.ok) {
    status.textContent = session.name + (session.hasLocations ? '' : ' — لم يتم تحديد موقع عمل.');
    punch.textContent = session.nextPunch === 'in' ? 'تسجيل الحضور' : 'تسجيل الانصراف';
    return;
  }
  status.textContent = session?.pending ? 'طلب تغيير الجوال بانتظار موافقة الإدارة.' : '';
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
    if (token !== null) history.replaceState(null, '', location.pathname + location.search);
    token = null;
    form.reset();
    await show();
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
  await show();
});
punch.onclick = () => run(punch, async () => {
  const { coords } = await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
  const { latitude, longitude, accuracy } = coords;
  const result = await api('punch', { latitude, longitude, accuracy, kind: session.nextPunch });
  await show();
  status.textContent = result.ok ? 'تم تسجيل البصمة.' : result.error;
});
run($('#employee-submit'), show);
