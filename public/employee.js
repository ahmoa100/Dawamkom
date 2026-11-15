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
const english = new Map([...Object.entries(ar).map(([key, value]) => [value, key]), ...Object.entries({
  'الرئيسية': 'Home', 'الحضور': 'Attendance', 'الطلبات': 'Requests', 'المزيد': 'More', 'عرض الملف الشخصي': 'View profile',
  'الملف الشخصي': 'Profile', 'تغيير كلمة المرور': 'Change password', 'كلمة المرور الحالية': 'Current password',
  'كلمة المرور الجديدة': 'New password', 'تأكيد كلمة المرور': 'Confirm password', 'كلمة المرور': 'Password', 'اللغة': 'Language',
  'البيانات الوظيفية': 'Employment details', 'تسجيل الخروج': 'Sign out', 'التنبيهات': 'Notifications', 'رجوع': 'Back',
  'حفظ': 'Save', 'طلب جديد': 'New request', 'عمليات سريعة': 'Quick actions', 'تصحيح البصمة': 'Correct a punch',
  'إجازة': 'Leave', 'الاستئذان': 'Permission request', 'النوع': 'Type', 'التاريخ': 'Date', 'بدء': 'Start date', 'انتهاء': 'End date',
  'إجمالي الأيام': 'Total days', 'العودة للدوام بتاريخ': 'Return to work on',
  'إرسال': 'Send', 'السبب': 'Reason', 'فئة السبب': 'Reason category', 'البريد الإلكتروني': 'Email', 'الشركة': 'Company',
  'المدير المباشر': 'Direct manager', 'المسمى الوظيفي': 'Job title', 'تاريخ الانضمام': 'Joining date',
  'تسجيل البصمة': 'Clock in', 'تسجيل الانصراف': 'Clock out', 'تسجيل الحضور': 'Clock-in', 'الحضور والانصراف': 'Attendance',
  'تم تسجيل الحضور بنجاح.': 'Clock-in recorded successfully.', 'تم تسجيل الانصراف بنجاح.': 'Clock-out recorded successfully.',
  'صباح الخير، ': 'Good morning, ', 'مساء الخير، ': 'Good evening, ', 'لا يوجد دوام مجدول اليوم': 'No shift scheduled today',
  'مدة الدوام منذ تسجيل الحضور': 'Time since clock-in', 'لا توجد طلبات بعد.': 'No requests yet.',
  'لا توجد بصمات مسجلة بعد.': 'No attendance records yet.', 'لا توجد تنبيهات بعد.': 'No notifications yet.',
  'تم تغيير كلمة المرور.': 'Password changed.', 'تم إرسال الطلب.': 'Request submitted.',
  'اختر النوع': 'Choose a type', 'نوع الإجازة': 'Leave type', 'نوع الطلب': 'Request type', 'اختر نوع الاستئذان': 'Choose a permission type',
  'اختر فئة السبب': 'Choose a reason category', 'اضغط لإرفاق ملف': 'Attach a file', 'اكتب الوصف…': 'Enter a description…',
  'وقت التصحيح المقترح': 'Proposed correction time', 'وقت الحضور المسجل': 'Recorded clock-in', 'وقت الانصراف المسجل': 'Recorded clock-out',
  'وقت الحضور المقترح': 'Proposed clock-in', 'وقت الانصراف المقترح': 'Proposed clock-out', 'الوصف': 'Description',
  'اختر السبب': 'Choose a reason', 'لا توجد بصمة مسجلة': 'No punch recorded', 'لم ينتهِ الدوام بعد': 'Shift still in progress',
  'تقنية السياج الجغرافي': 'Geofence', 'تعذّر تحميل بصمات اليوم.': 'Could not load punches for this date.',
  'جاري تحميل البصمات…': 'Loading attendance…',
  'طلباتي': 'My requests', 'لا توجد طلبات حالية.': 'No current requests.',
  'تفعيل إشعارات الاعتماد': 'Enable approval notifications',
  'تم تفعيل إشعارات الاعتماد.': 'Approval notifications enabled.',
  'لم يتم السماح بالإشعارات.': 'Notifications permission was not granted.',
  'تعذّر تفعيل الإشعارات.': 'Could not enable notifications.',
  'في العمل': 'At work', 'خارج وقت العمل': 'Outside working hours',
  'حساب الموظف': 'Employee account', 'تفعيل حساب دوامكم': 'Activate your Dawamkom account', 'تفعيل الحساب': 'Activate account',
  'تسجيل الدخول': 'Sign in', 'تحقق من الموافقة': 'Check approval', 'طلب تغيير الجوال': 'Request browser change',
  'الطلبات: تغيير الجوال': 'Browser change requests', 'موافقة': 'Approve', 'رفض': 'Decline', 'واجهة إدارة الشركة': 'Company workspace',
  'لم تحدد الشركة موقع عمل بعد. يتاح تسجيل الحضور والانصراف بعد تحديده.': 'Attendance will be available once the company adds a workplace.',
})]);
let employeeLanguage = 'ar';
try { if (localStorage.getItem('dawamkom-employee-language') === 'en') employeeLanguage = 'en'; } catch {}
const tr = value => employeeLanguage === 'en' ? english.get(value) ?? value : value;
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
const staticLabels = [];
for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  if (english.has(node.textContent.trim())) staticLabels.push([node, node.textContent.trim()]);
}
const translatedAttributes = [...document.querySelectorAll('[aria-label], [placeholder]')].flatMap(element =>
  ['aria-label', 'placeholder'].filter(name => english.has(element.getAttribute(name))).map(name => [element, name, element.getAttribute(name)]));
function applyEmployeeLanguage() {
  document.documentElement.lang = employeeLanguage;
  document.documentElement.dir = employeeLanguage === 'ar' ? 'rtl' : 'ltr';
  for (const [node, label] of staticLabels) node.textContent = tr(label);
  for (const [element, name, value] of translatedAttributes) element.setAttribute(name, tr(value));
}
applyEmployeeLanguage();
let employeeView = location.hash === '#requests' ? 'requests' : 'home';
const attendanceCard = $('.employee-attendance-card');
const homeView = $('[data-employee-view="home"]');
let toastTimeout;
function employeeToast(message) {
  const toast = $('#employee-toast');
  clearTimeout(toastTimeout);
  toast.textContent = tr(message);
  toast.hidden = false;
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 4200);
}

function employeeRequestLabel(type) { return tr(requestLabels[type] ?? ar[type] ?? type); }
function fillHistory(panel, rows, empty) {
  panel.replaceChildren();
  for (const row of rows) {
    const item = document.createElement('p');
    item.textContent = row;
    panel.append(item);
  }
  if (!rows.length) panel.textContent = tr(empty);
}
function showEmployeeView(page) {
  employeeView = page;
  for (const view of dashboard.querySelectorAll('[data-employee-view]')) view.hidden = view.dataset.employeeView !== page;
  for (const button of $('#employee-bottom-nav').querySelectorAll('button')) {
    if (button.dataset.employeePage === (page === 'profile' ? 'more' : page)) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (page === 'attendance') $('#employee-attendance-slot').append(attendanceCard);
  if (page === 'home') homeView.insertBefore(attendanceCard, $('.employee-quick-actions'));
}
function renderEmployeeRequests() {
  fillHistory($('#employee-requests-history'), session.ownRequests.map(request => `${employeeRequestLabel(request.type)} · ${tr(ar[request.status] ?? request.status)} · ${request.date}`), 'لا توجد طلبات بعد.');
  const list = $('#employee-home-requests-list');
  const hasRequests = session.homeRequests.length > 0;
  list.hidden = !hasRequests;
  $('#employee-home-requests-empty').hidden = hasRequests;
  const formatter = new Intl.DateTimeFormat(employeeLanguage, { dateStyle: 'medium', calendar: 'gregory', timeZone: 'UTC' });
  list.replaceChildren(...session.homeRequests.map(request => {
    const card = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = employeeRequestLabel(request.type);
    const badge = document.createElement('span');
    badge.dataset.status = request.status;
    badge.textContent = tr(ar[request.status] ?? request.status);
    const dates = document.createElement('small');
    const start = Date.parse(request.date);
    const end = Date.parse(request.end);
    dates.textContent = Number.isFinite(start) ? (end > start ? formatter.formatRange(start, end) : formatter.format(start)) : '';
    card.append(title, badge, dates);
    return card;
  }));
}
function renderEmployeeDetails() {
  const recent = session.recentPunches.map(punch => `${tr(punch.kind === 'in' ? 'تسجيل الحضور' : 'تسجيل الانصراف')} · ${new Intl.DateTimeFormat(employeeLanguage, {
    timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(punch.time))}`);
  fillHistory($('#employee-attendance-history'), recent, 'لا توجد بصمات مسجلة بعد.');
  renderEmployeeRequests();
  $('#employee-more-name').textContent = session.name;
  $('#employee-more-title').textContent = tr(ar[session.jobTitle] ?? session.jobTitle ?? '—');
  $('#employee-more-company').textContent = session.company;
  $('#employee-language').value = employeeLanguage;
  const details = $('#employee-job-details');
  details.replaceChildren();
  for (const [label, value] of [['المسمى الوظيفي', $('#employee-more-title').textContent], ['الشركة', session.company],
    ['البريد الإلكتروني', session.email], ['تاريخ الانضمام', session.joinDate], ['المدير المباشر', session.manager]]) {
    if (!value) continue;
    const term = document.createElement('dt'), definition = document.createElement('dd');
    term.textContent = tr(label);
    definition.textContent = value;
    details.append(term, definition);
  }
}

function updateTime() {
  if (!session?.ok) return;
  const now = new Date();
  const started = Date.parse(session.shiftStartsAt);
  const outside = session.punchedOutToday || (session.shiftEndsAt != null && now >= session.shiftEndsAt);
  const working = !outside && session.punchedInAt && (!Number.isFinite(started) || now >= started);
  const elapsed = working ? Math.max(0, Math.floor((now - Date.parse(session.punchedInAt)) / 60000)) : 0;
  const remaining = Math.ceil((started - now) / 60000);
  const hint = working ? tr('في العمل') : outside ? tr('خارج وقت العمل') : !Number.isFinite(started) ? tr('لا يوجد دوام مجدول اليوم') :
    employeeLanguage === 'en' ? (remaining > 0 && remaining < 120 ? `Shift starts in ${remaining} min` : `Shift ${remaining > 0 ? 'starts' : 'started'} at ${new Intl.DateTimeFormat('en', {timeZone:'Asia/Riyadh',hour:'numeric',minute:'2-digit'}).format(started)}`) :
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
  const correction = type === 'Missed punch';
  requestForm.elements.date.max = correction ? session.today : '';
  const needsNote = !correction || requestForm.elements.correctionReason.value === 'Other';
  $('#employee-request-note span').textContent = tr(correction ? 'الوصف' : 'السبب');
  $('#employee-request-date-label').textContent = tr(leave ? 'بدء' : 'التاريخ');
  for (const [id, name, visible, required] of [
    ['employee-request-end', 'end', leave, leave], ['employee-excuse-type', 'excuseType', excuse, excuse],
    ['employee-excuse-reason', 'reason', excuse, excuse],
    ['employee-attachment', 'attachment', excuse || correction || type === 'Sick leave', false],
    ['employee-correction-reason', 'correctionReason', correction, correction], ['employee-request-note', 'note', needsNote, needsNote],
  ]) {
    $('#' + id).hidden = !visible;
    requestForm.elements[name].disabled = !visible;
    requestForm.elements[name].required = required;
  }
  updateLeaveSummary();
}

function updateLeaveSummary() {
  const { type, date, end } = requestForm.elements;
  const summary = $('#employee-leave-summary');
  const startDay = date.valueAsNumber;
  const endDay = end.valueAsNumber;
  summary.hidden = !['Annual leave', 'Sick leave', 'Unpaid leave'].includes(type.value) ||
    !Number.isFinite(startDay) || !Number.isFinite(endDay) || endDay < startDay;
  if (summary.hidden) return;
  const day = 86_400_000;
  const total = new Intl.NumberFormat(employeeLanguage).format((endDay - startDay) / day + 1);
  const returnDate = new Intl.DateTimeFormat(employeeLanguage, {
    dateStyle: 'medium', calendar: 'gregory', timeZone: 'UTC',
  }).format(endDay + day);
  const [totalLabel, returnLabel] = summary.children;
  totalLabel.textContent = tr('إجمالي الأيام') + ': ' + total;
  returnLabel.textContent = tr('العودة للدوام بتاريخ') + ' ' + returnDate;
}

let correctionLoad;
async function loadCorrectionTimes() {
  correctionLoad?.abort();
  const date = requestForm.elements.date.value;
  const correction = requestForm.elements.type.value === 'Missed punch';
  const fieldset = $('#employee-correction-times');
  fieldset.hidden = !correction || !date;
  for (const box of fieldset.querySelectorAll('[data-correction-time]')) {
    box.checked = false;
    const time = requestForm.elements[box.dataset.correctionTime];
    time.value = '';
    time.disabled = time.hidden = true;
    time.required = false;
  }
  if (fieldset.hidden) return;
  const controller = new AbortController();
  correctionLoad = controller;
  const feedback = $('#employee-correction-status');
  feedback.textContent = tr('جاري تحميل البصمات…');
  $('#employee-recorded-in').textContent = $('#employee-recorded-out').textContent = '';
  try {
    const prefix = location.pathname.replace(/\/employee$/, '');
    const response = await fetch(prefix + '/api/employee/punches?date=' + encodeURIComponent(date), { signal: controller.signal });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (controller.signal.aborted) return;
    const clock = new Intl.DateTimeFormat(employeeLanguage, { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' });
    for (const [selector, entry, empty] of [['#employee-recorded-in', data.arrival, 'لا توجد بصمة مسجلة'],
      ['#employee-recorded-out', data.departure, data.inProgress ? 'لم ينتهِ الدوام بعد' : 'لا توجد بصمة مسجلة']]) {
      $(selector).textContent = entry ? clock.format(new Date(entry.time)) + (entry.geofence ? ' · ' + tr('تقنية السياج الجغرافي') : '') : tr(empty);
    }
    feedback.textContent = '';
  } catch {
    if (!controller.signal.aborted) feedback.textContent = tr('تعذّر تحميل بصمات اليوم.');
  }
}

function openRequest(kind) {
  requestForm.reset();
  requestForm.dataset.kind = kind;
  $('#employee-request-status').textContent = '';
  const types = kind === 'all' ? [...session.leaveTypes, ...session.attendanceTypes] : kind === 'leave' ? session.leaveTypes : [kind];
  requestForm.elements.type.replaceChildren(...types.map(type => new Option(employeeRequestLabel(type), type)));
  requestForm.elements.excuseType.replaceChildren(new Option(tr('اختر نوع الاستئذان'), ''), ...session.excuseTypes.map(value => new Option(tr(ar[value] ?? value), value)));
  requestForm.elements.reason.replaceChildren(new Option(tr('اختر فئة السبب'), ''), ...session.excuseReasons.map(value => new Option(tr(ar[value] ?? value), value)));
  requestForm.elements.correctionReason.replaceChildren(new Option(tr('اختر السبب'), ''),
    ...session.correctionReasons.map(value => new Option(tr(ar[value] ?? value), value)));
  requestForm.elements.date.value = kind === 'Missed punch' ? '' : session.today;
  requestForm.elements.end.min = session.today;
  $('#employee-request-type').hidden = kind !== 'all' && kind !== 'leave';
  $('#employee-request-type span').textContent = tr(kind === 'leave' ? 'نوع الإجازة' : 'نوع الطلب');
  if (kind === 'leave' || kind === 'all') requestForm.elements.type.prepend(new Option(tr('اختر النوع'), '', true, true));
  requestTitle.textContent = tr(requestLabels[kind]);
  updateRequestFields();
  loadCorrectionTimes();
  requestDialog.showModal();
}

dashboard.addEventListener('click', event => {
  const page = event.target.closest('[data-employee-page]');
  if (page) showEmployeeView(page.dataset.employeePage);
  const button = event.target.closest('[data-quick-request]');
  if (button && session?.ok) openRequest(button.dataset.quickRequest);
  const close = event.target.closest('[data-employee-close]');
  if (close) close.closest('dialog').close();
});
requestForm.elements.type.addEventListener('change', () => { updateRequestFields(); loadCorrectionTimes(); });
requestForm.elements.correctionReason.addEventListener('change', updateRequestFields);
requestForm.elements.date.addEventListener('input', () => {
  requestForm.elements.end.min = requestForm.elements.date.value;
  updateLeaveSummary();
});
requestForm.elements.date.addEventListener('change', loadCorrectionTimes);
requestForm.elements.end.addEventListener('input', updateLeaveSummary);
$('#employee-correction-times').addEventListener('change', event => {
  const box = event.target;
  if (!box.dataset.correctionTime) return;
  const time = requestForm.elements[box.dataset.correctionTime];
  time.disabled = time.hidden = !box.checked;
  time.required = box.checked;
  if (box.checked) time.focus();
});
const enablePush = $('#employee-enable-push');
const pushFeedback = $('#employee-push-status');
const supportsPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
enablePush.onclick = async () => {
  enablePush.disabled = true;
  try {
    if (await Notification.requestPermission() !== 'granted') {
      pushFeedback.textContent = tr('لم يتم السماح بالإشعارات.');
      return;
    }
    const registration = await navigator.serviceWorker.register('/employee-notifications-sw.js', { scope: location.pathname });
    const active = registration.active ? registration : await navigator.serviceWorker.ready;
    const key = session.pushPublicKey.replaceAll('-', '+').replaceAll('_', '/');
    const applicationServerKey = Uint8Array.from(atob(key), char => char.charCodeAt(0));
    const subscription = await active.pushManager.getSubscription() ??
      await active.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    const result = await api('push-subscription', { subscription, language: employeeLanguage });
    if (!result.ok) throw new Error();
    pushFeedback.textContent = tr('تم تفعيل إشعارات الاعتماد.');
    enablePush.hidden = true;
  } catch {
    pushFeedback.textContent = tr('تعذّر تفعيل الإشعارات.');
  } finally {
    enablePush.disabled = false;
  }
};
$('#employee-messages').onclick = () => run($('#employee-messages'), async () => {
  const latest = await api('session');
  if (!latest.ok) { await show(); return; }
  enablePush.hidden = !supportsPush || !latest.pushPublicKey;
  const list = $('#employee-message-list');
  fillHistory(list, [...latest.recentPunches.map(entry => tr(entry.kind === 'in' ? 'تم تسجيل الحضور بنجاح.' : 'تم تسجيل الانصراف بنجاح.')),
    ...latest.ownRequests.map(request => `${employeeRequestLabel(request.type)} · ${tr(ar[request.status] ?? request.status)} · ${request.date}`)], 'لا توجد تنبيهات بعد.');
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
      button.textContent = tr(label);
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
window.setInterval(async () => {
  const current = session;
  if (!current?.ok || dashboard.hidden || document.hidden) return;
  try {
    const latest = await api('session');
    if (!latest.ok || current !== session || dashboard.hidden) return;
    const changed = JSON.stringify([current.homeRequests, current.ownRequests]) !== JSON.stringify([latest.homeRequests, latest.ownRequests]);
    Object.assign(current, { homeRequests: latest.homeRequests, ownRequests: latest.ownRequests,
      shiftStartsAt: latest.shiftStartsAt, shiftEndsAt: latest.shiftEndsAt,
      punchedInAt: latest.punchedInAt, punchedOutToday: latest.punchedOutToday });
    if (changed) renderEmployeeRequests();
  } catch {
    // Keep the current display during a transient connection failure.
  }
}, 30_000);
async function show(forceLogin = false) {
  form.hidden = true;
  dashboard.hidden = true;
  const invitation = $('#employee-invitation');
  invitation.hidden = true;
  $('#employee-title').textContent = tr(token ? 'تفعيل حساب دوامكم' : 'حساب الموظف');
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
  $('#employee-messages').hidden = !session?.ok;
  refresh.hidden = !session?.pending;
  if (session?.ok) {
    status.textContent = '';
    dashboard.hidden = false;
    $('#employee-greeting').textContent = tr(Number(formatHour.format(new Date())) < 12 ? 'صباح الخير، ' : 'مساء الخير، ') + session.name;
    renderDeviceRequests(session.deviceRequests ?? []);
    $('#employee-location-note').hidden = session.hasLocations;
    punch.disabled = !session.hasLocations;
    $('#employee-punch-label').textContent = tr(session.nextPunch === 'out' ? 'تسجيل الانصراف' : 'تسجيل البصمة');
    dashboard.querySelector('[data-quick-request="leave"]').disabled = !session.leaveTypes.length;
    updateTime();
    renderEmployeeDetails();
    showEmployeeView(employeeView);
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
  $('#employee-submit').textContent = tr(activating ? 'تفعيل الحساب' : 'تسجيل الدخول');
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
  const registration = supportsPush ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
  const subscription = await registration?.pushManager.getSubscription().catch(() => null);
  const result = await api('logout', { pushEndpoint: subscription?.endpoint });
  if (!result.ok) throw new Error(result.error);
  form.reset();
  requestForm.reset();
  employeeView = 'home';
  $('#employee-request-status').textContent = '';
  $('#employee-device-status').textContent = '';
  await show();
});
$('#employee-language').onchange = event => {
  employeeLanguage = event.target.value;
  try { localStorage.setItem('dawamkom-employee-language', employeeLanguage); } catch {}
  applyEmployeeLanguage();
  if (session?.ok) show();
};
const passwordDialog = $('#employee-password-dialog');
const passwordForm = $('#employee-password-form');
const passwordStatus = $('#employee-password-status');
$('#employee-password-open').onclick = () => { passwordForm.reset(); passwordStatus.textContent = ''; passwordDialog.showModal(); };
passwordForm.onsubmit = event => {
  event.preventDefault();
  run(event.submitter, async () => {
    const result = await api('password', Object.fromEntries(new FormData(passwordForm)));
    if (!result.ok) { passwordStatus.textContent = tr(result.error); return; }
    passwordForm.reset();
    passwordDialog.close();
    employeeToast('تم تغيير كلمة المرور.');
  }, passwordStatus);
};
requestForm.onsubmit = event => {
  event.preventDefault();
  const message = $('#employee-request-status');
  message.textContent = '';
  run(event.submitter, async () => {
    const values = Object.fromEntries(new FormData(requestForm));
    if (values.type === 'Missed punch' && !values.proposedIn && !values.proposedOut) {
      message.textContent = tr(ar['Choose at least one valid proposed time.']);
      return;
    }
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
      await show();
      employeeToast('تم إرسال الطلب.');
    } else message.textContent = ar[result.error] ?? result.error;
  }, message);
};
punch.onclick = () => run(punch, async () => {
  const { coords } = await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
  const { latitude, longitude, accuracy } = coords;
  const kind = session.nextPunch;
  const result = await api('punch', { latitude, longitude, accuracy, kind });
  if (result.ok) employeeToast(kind === 'in' ? 'تم تسجيل الحضور بنجاح.' : 'تم تسجيل الانصراف بنجاح.');
  await show();
  if (!result.ok) status.textContent = tr(result.error);
});
run($('#employee-submit'), show);
