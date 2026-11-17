import ar from './ar.js';
import { punchTiming } from './work-schedule.js';

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
  'شروط كلمة المرور': 'Password requirements', '١٠ أحرف على الأقل': 'At least 10 characters',
  'حرف إنجليزي كبير مثل A': 'An uppercase English letter, such as A',
  'حرف إنجليزي صغير مثل a': 'A lowercase English letter, such as a',
  'رقم مثل 7': 'A number, such as 7', 'رمز مثل !': 'A symbol, such as !',
  'تذكّرني على هذا الجهاز': 'Remember me on this device',
  'كلمة المرور الجديدة': 'New password', 'تأكيد كلمة المرور': 'Confirm password', 'كلمة المرور': 'Password', 'اللغة': 'Language',
  'البيانات الوظيفية': 'Employment details', 'تسجيل الخروج': 'Sign out', 'التنبيهات': 'Notifications', 'رجوع': 'Back',
  'الشهر السابق': 'Previous month', 'الشهر التالي': 'Next month',
  'الفترة الصباحية': 'Morning shift',
  'حضور مكتمل': 'Complete attendance', 'بصمة ناقصة أو غياب': 'Missing punch or absence',
  'غائب': 'Absent',
  'لا يلزم الحضور': 'Attendance not required', 'الفترة لم تكتمل بعد': 'Shift not yet complete',
  'إجازة معتمدة': 'Approved leave', 'تعذّر تحميل التقويم.': 'Could not load the calendar.',
  'حفظ': 'Save', 'طلب جديد': 'New request', 'عمليات سريعة': 'Quick actions', 'تصحيح البصمة': 'Correct a punch',
  'إجازة': 'Leave', 'الاستئذان': 'Permission request', 'النوع': 'Type', 'التاريخ': 'Date', 'بدء': 'Start date', 'انتهاء': 'End date',
  'إجمالي الأيام': 'Total days', 'العودة للدوام بتاريخ': 'Return to work on',
  'إرسال': 'Send', 'السبب': 'Reason', 'فئة السبب': 'Reason category', 'البريد الإلكتروني': 'Email', 'الشركة': 'Company',
  'المدير المباشر': 'Direct manager', 'المسمى الوظيفي': 'Job title', 'تاريخ الانضمام': 'Joining date',
  'تسجيل البصمة': 'Clock in', 'تسجيل الانصراف': 'Clock out', 'تسجيل الحضور': 'Clock-in', 'الحضور والانصراف': 'Attendance',
  'تسجيل حضور': 'Clock in', 'تسجيل خروج': 'Clock out',
  'تم تسجيل الحضور بنجاح.': 'Clock-in recorded successfully.', 'تم تسجيل الانصراف بنجاح.': 'Clock-out recorded successfully.',
  'أنت تقع خارج الحدود المكانية للتحضير': 'You are outside the approved attendance area.',
  'خارج المدة الزمنية': 'Outside the punch time window',
  'انتظر قبل تسجيل بصمة أخرى.': 'Wait before recording another punch.',
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
  'بطاقات الطلبات التجريبية': 'Sample request cards',
  'عرض الرئيسية': 'Home view', 'ما يخصني': 'For me', 'ما يخص فريقي': 'For my team',
  'إجازات الفريق': 'Team leave', 'طلبات الفريق': 'Team requests', 'قادمة': 'Upcoming', 'جارية': 'In progress',
  'لا توجد إجازات قادمة للفريق.': 'No upcoming team leave.', 'لا توجد طلبات معلّقة للفريق.': 'No pending team requests.',
  'تم اعتماد الطلب.': 'Request approved.', 'تم رفض الطلب.': 'Request declined.',
  'تم تحويل الطلب لمسؤول الموافقة التالي.': 'Request forwarded to the next approver.',
  'تفعيل إشعارات الاعتماد': 'Enable approval notifications',
  'تم تفعيل إشعارات الاعتماد.': 'Approval notifications enabled.',
  'لم يتم السماح بالإشعارات.': 'Notifications permission was not granted.',
  'تعذّر تفعيل الإشعارات.': 'Could not enable notifications.',
  'في العمل': 'At work', 'خارج وقت العمل': 'Outside working hours',
  'حساب الموظف': 'Employee account', 'تفعيل حساب دوامكم': 'Activate your Dawamkom account', 'تفعيل الحساب': 'Activate account',
  'تسجيل الدخول': 'Sign in', 'تحقق من الموافقة': 'Check approval', 'طلب تغيير الجوال': 'Request browser change',
  'الطلبات: تغيير الجوال': 'Browser change requests', 'موافقة': 'Approve', 'رفض': 'Decline', 'إدارة': 'Management',
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
let homeTab = 'personal';
const attendanceCard = $('.employee-attendance-card');
const homeView = $('[data-employee-view="home"]');
let toastTimeout;
function employeeToast(message, tone = 'success') {
  const toast = $('#employee-toast');
  clearTimeout(toastTimeout);
  toast.textContent = tr(message);
  toast.dataset.tone = tone;
  delete toast.dataset.leaving;
  toast.hidden = false;
  toastTimeout = setTimeout(() => {
    toast.dataset.leaving = '';
    toastTimeout = setTimeout(() => { toast.hidden = true; }, 200);
  }, 4200);
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
  if (page === 'attendance') loadAttendanceCalendar();
  if (page === 'home') homeView.insertBefore(attendanceCard, $('#employee-home-tabs'));
}
const attendanceLabels = { complete: 'حضور مكتمل', issue: 'بصمة ناقصة أو غياب', off: 'لا يلزم الحضور', pending: 'الفترة لم تكتمل بعد' };
const attendanceDayLabel = day => tr(day.leave ? 'إجازة معتمدة' :
  day.status === 'issue' && !day.punches.length ? 'غائب' : attendanceLabels[day.status]);
let attendanceMonth, attendanceDay, attendanceCalendar;
let calendarLoad = 0;

function sampleCalendar(month, today) {
  const lastDay = new Date(month);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  return { today, days: Array.from({ length: lastDay.getUTCDate() }, (_, index) => {
    const number = index + 1;
    const date = month.toISOString().slice(0, 7) + '-' + String(number).padStart(2, '0');
    const leave = [7, 8, 21].includes(number);
    const status = leave ? 'off' : [4, 15, 25].includes(number) ? 'issue' : 'complete';
    return { date, leave, status,
      periods: leave ? [] : [{ name: tr('الفترة الصباحية'), start: '09:00', end: '17:00' }],
      punches: status === 'complete' ? [
        { kind: 'in', time: date + 'T09:00:00+03:00' },
        { kind: 'out', time: date + 'T17:00:00+03:00' },
      ] : [] };
  }) };
}

function renderCalendarDay() {
  const details = $('#employee-calendar-details');
  const day = attendanceCalendar.days.find(item => item.date === attendanceDay);
  if (!day) return;
  const heading = document.createElement('h3');
  const date = new Intl.DateTimeFormat(employeeLanguage, { dateStyle: 'full', calendar: 'gregory', timeZone: 'UTC' });
  heading.textContent = date.format(Date.parse(day.date));
  const status = document.createElement('p');
  status.textContent = attendanceDayLabel(day);
  details.replaceChildren(heading, status);
  for (const period of day.periods) {
    const row = document.createElement('p');
    row.textContent = period.flexible ? period.name : period.name + ' · ' + period.start + ' – ' + period.end;
    details.append(row);
  }
  const clock = new Intl.DateTimeFormat(employeeLanguage, { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' });
  fillHistory(details.appendChild(document.createElement('div')), day.punches.map(punch =>
    tr(punch.kind === 'in' ? 'تسجيل الحضور' : 'تسجيل الانصراف') + ' · ' + clock.format(Date.parse(punch.time))),
  'لا توجد بصمات مسجلة بعد.');
  for (const button of $('#employee-calendar-grid').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.date === attendanceDay));
  }
}

async function loadAttendanceCalendar(step = 0) {
  const current = session;
  if (!current?.ok) return;
  const month = new Date((attendanceMonth ?? current.today.slice(0, 7)) + '-01T00:00:00Z');
  month.setUTCMonth(month.getUTCMonth() + step);
  const selectedMonth = month.toISOString().slice(0, 7);
  attendanceMonth = selectedMonth;
  const load = ++calendarLoad;
  const grid = $('#employee-calendar-grid');
  const details = $('#employee-calendar-details');
  const options = { calendar: 'gregory', timeZone: 'UTC' };
  $('#employee-calendar-month').textContent = new Intl.DateTimeFormat(employeeLanguage, { ...options, month: 'long', year: 'numeric' }).format(month);
  grid.replaceChildren();
  details.textContent = tr('جاري تحميل البصمات…');
  try {
    const result = sampleRequestPreview ? { ok: true, ...sampleCalendar(month, current.today) } :
      await api('calendar?month=' + encodeURIComponent(selectedMonth));
    if (load !== calendarLoad || current !== session) return;
    if (!result.ok) throw new Error();
    attendanceCalendar = result;
    if (!result.days.some(day => day.date === attendanceDay)) {
      attendanceDay = result.today.startsWith(selectedMonth) ? result.today : result.days[0].date;
    }
    const weekdays = new Intl.DateTimeFormat(employeeLanguage, { ...options, weekday: 'short' });
    const number = new Intl.NumberFormat(employeeLanguage);
    for (let i = 0; i < 7; i++) {
      const label = document.createElement('small');
      label.textContent = weekdays.format(Date.UTC(2026, 0, 4 + i));
      grid.append(label);
    }
    for (let i = 0; i < month.getUTCDay(); i++) grid.append(document.createElement('span'));
    for (const day of result.days) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.date = day.date;
      button.dataset.dayStatus = day.status;
      button.textContent = number.format(Number(day.date.slice(-2)));
      button.setAttribute('aria-label', button.textContent + '، ' + attendanceDayLabel(day));
      button.onclick = () => { attendanceDay = day.date; renderCalendarDay(); };
      grid.append(button);
    }
    renderCalendarDay();
  } catch {
    if (load === calendarLoad && current === session) details.textContent = tr('تعذّر تحميل التقويم.');
  }
}

for (const button of document.querySelectorAll('[data-attendance-month]')) {
  button.onclick = () => loadAttendanceCalendar(Number(button.dataset.attendanceMonth));
}
function showHomeTab(tab) {
  homeTab = session.canReviewTeam ? tab : 'personal';
  $('#employee-home-tabs').hidden = !session.canReviewTeam;
  $('#employee-personal-home').hidden = homeTab !== 'personal';
  $('#employee-team-home').hidden = homeTab !== 'team';
  for (const button of $('#employee-home-tabs').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.employeeHome === homeTab));
  }
}
const sampleRequestPreview = ['127.0.0.1', '192.168.1.42'].includes(location.hostname) &&
  new URLSearchParams(location.search).get('preview') === 'requests';
$('#employee-sample-requests').hidden = !sampleRequestPreview;
const reviewedSamples = new Set();

function requestSamples() {
  const today = session.today;
  const day = offset => new Date(Date.parse(today) + offset * 86400000).toISOString().slice(0, 10);
  return [
    { id: 'preview-leave-1', employee: 'سارة أحمد', type: 'Annual leave', status: 'Approved', submittedOn: day(-2), date: day(3), end: day(5) },
    { id: 'preview-leave-2', employee: 'عمر خالد', type: 'Annual leave', status: 'Approved', submittedOn: day(-4), date: day(7), end: day(9) },
    { id: 'preview-request-1', employee: 'نورة علي', type: 'Missed punch', status: 'Pending', submittedOn: today, date: today },
    { id: 'preview-request-2', employee: 'عمر خالد', type: 'Attendance excuse', status: 'Pending', submittedOn: today, date: day(1) },
    { id: 'preview-request-3', employee: 'سارة أحمد', type: 'Attendance excuse', status: 'Declined', submittedOn: day(-2), date: day(-1) },
    { id: 'preview-request-4', employee: 'نورة علي', type: 'Annual leave', status: 'Cancelled', submittedOn: day(-3), date: day(1), end: day(2) },
  ];
}

function renderTeamHome() {
  if (!session.canReviewTeam) return;
  const requests = sampleRequestPreview ? requestSamples().filter(request => !reviewedSamples.has(request.id)) : session.teamRequests ?? [];
  const leaves = requests.filter(request => request.status === 'Approved').sort((a, b) => a.date.localeCompare(b.date));
  const pending = requests.filter(request => request.status === 'Pending').concat((sampleRequestPreview ? [] : session.deviceRequests ?? []).map(request => ({
    id: request.requestId, staffId: request.staffId, employee: request.name, submittedOn: request.submittedOn,
    type: 'طلب تغيير الجوال', status: 'Pending', browser: true,
  })));
  const formatter = new Intl.DateTimeFormat(employeeLanguage, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  for (const [selector, items, empty] of [
    ['#employee-team-leave', leaves, 'لا توجد إجازات قادمة للفريق.'],
    ['#employee-team-requests', pending, 'لا توجد طلبات معلّقة للفريق.'],
  ]) {
    const list = $(selector);
    if (!items.length) {
      const item = document.createElement('li');
      item.className = 'employee-team-card employee-team-empty';
      const message = document.createElement('p');
      message.textContent = tr(empty);
      item.append(message);
      list.replaceChildren(item);
      continue;
    }
    list.replaceChildren(...items.map(request => {
      const card = document.createElement('li');
      card.className = 'employee-team-card';
      const header = document.createElement('div');
      header.className = 'employee-team-card-header';
      const dates = document.createElement('small');
      const start = Date.parse(request.date), end = Date.parse(request.end);
      const submitted = Date.parse(request.submittedOn ?? request.date);
      if (Number.isFinite(submitted)) dates.textContent = formatter.format(submitted);
      const badge = document.createElement('span');
      badge.className = 'badge ' + (request.status === 'Pending' ? 'amber' : 'green');
      badge.textContent = request.status === 'Pending' ? tr(ar.Pending) : tr(request.date > session.today ? 'قادمة' : 'جارية');
      header.append(dates, badge);
      const body = document.createElement('div');
      body.className = 'employee-team-card-body';
      const avatar = document.createElement('span');
      avatar.className = 'employee-team-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = Array.from(request.employee?.trim() ?? '')[0] ?? '•';
      const details = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = employeeRequestLabel(request.type);
      const person = document.createElement('p');
      person.textContent = request.employee;
      details.append(title, person);
      if (Number.isFinite(start)) {
        const range = document.createElement('small');
        range.textContent = end > start ? formatter.formatRange(start, end) : formatter.format(start);
        details.append(range);
      }
      body.append(avatar, details);
      card.append(header, body);
      if (request.status === 'Pending') {
        if (request.note) {
          const note = document.createElement('small');
          note.textContent = request.note;
          details.append(note);
        }
        const actions = document.createElement('div');
        actions.className = 'employee-team-actions';
        for (const [label, status] of [['موافقة', 'Approved'], ['رفض', 'Declined']]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'button secondary';
          button.textContent = status === 'Approved' ? '✓ ' + tr(label) : '×';
          button.setAttribute('aria-label', tr(label));
          button.onclick = () => run(button, async () => {
            if (sampleRequestPreview) {
              reviewedSamples.add(request.id);
              renderTeamHome();
              employeeToast(status === 'Approved' ? 'تم اعتماد الطلب.' : 'تم رفض الطلب.');
              return;
            }
            for (const control of actions.children) control.disabled = true;
            try {
              const result = request.browser
                ? await api('device-approval', { staffId: request.staffId, requestId: request.id, decision: status === 'Approved' ? 'approve' : 'reject' })
                : await api('team-decision', { id: request.id, status });
              if (!result.ok) throw new Error(result.error);
              await show();
              employeeToast(result.forwarded ? 'تم تحويل الطلب لمسؤول الموافقة التالي.' :
                status === 'Approved' ? 'تم اعتماد الطلب.' : 'تم رفض الطلب.');
            } finally {
              for (const control of actions.children) control.disabled = false;
            }
          }, $('#employee-team-status'));
          actions.append(button);
        }
        card.append(actions);
      }
      return card;
    }));
  }
}
function renderEmployeeRequests() {
  fillHistory($('#employee-requests-history'), session.ownRequests.map(request => `${employeeRequestLabel(request.type)} · ${tr(ar[request.status] ?? request.status)} · ${request.date}`), 'لا توجد طلبات بعد.');
  const list = $('#employee-home-requests-list');
  const requests = sampleRequestPreview ? requestSamples().slice(1) : session.homeRequests;
  if (!requests.length) {
    const card = document.createElement('li');
    card.className = 'employee-team-card employee-team-empty';
    const message = document.createElement('p');
    message.textContent = tr('لا توجد طلبات حالية.');
    card.append(message);
    list.replaceChildren(card);
    return;
  }
  const formatter = new Intl.DateTimeFormat(employeeLanguage, { dateStyle: 'medium', calendar: 'gregory', timeZone: 'UTC' });
  list.replaceChildren(...requests.map(request => {
    const card = document.createElement('li');
    card.className = 'employee-team-card';
    const header = document.createElement('div');
    header.className = 'employee-team-card-header';
    const title = document.createElement('strong');
    title.textContent = employeeRequestLabel(request.type);
    const badge = document.createElement('span');
    badge.dataset.status = request.status;
    badge.textContent = tr(ar[request.status] ?? request.status);
    const dates = document.createElement('small');
    const submitted = Date.parse(request.submittedOn ?? request.date);
    const start = Date.parse(request.date);
    const end = Date.parse(request.end);
    dates.textContent = Number.isFinite(submitted) ? formatter.format(submitted) : '';
    header.append(dates, badge);
    card.append(header, title);
    if (Number.isFinite(start) && (start !== submitted || end > start)) {
      const range = document.createElement('small');
      range.textContent = end > start ? formatter.formatRange(start, end) : formatter.format(start);
      card.append(range);
    }
    return card;
  }));
}
function renderEmployeeDetails() {
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

function renderScheduledPeriods() {
  const list = $('#employee-scheduled-periods');
  const periods = session.scheduledPeriods ?? [];
  const clock = new Intl.DateTimeFormat(employeeLanguage, { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' });
  list.hidden = !periods.length;
  list.replaceChildren(...periods.map(period => {
    const row = document.createElement('li');
    const name = document.createElement('strong');
    const hours = document.createElement('bdi');
    name.textContent = period.name;
    hours.textContent = period.flexible ? (employeeLanguage === 'en' ? 'Flexible period' : 'فترة مرنة') :
      clock.formatRange(period.start, period.end);
    row.append(name, hours);
    return row;
  }));
}

function updateTime() {
  if (!session?.ok) return;
  const now = new Date();
  const timing = currentPunchTiming();
  const label = $('#employee-punch-label');
  const labels = session.punchWindows?.length || session.lastFlexiblePunch
    ? { in: 'تسجيل حضور', out: 'تسجيل خروج' }
    : { in: 'تسجيل البصمة', out: 'تسجيل الانصراف' };
  const text = tr(labels[timing.kind]);
  if (label.textContent !== text) label.textContent = text;
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
function currentPunchTiming() {
  return punchTiming(session.punchWindows ?? [], Date.now() + (session.clockOffset ?? 0),
    session.nextPunch, session.openShiftStart, session.lastFlexiblePunch);
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
  const home = event.target.closest('[data-employee-home]');
  if (home) showHomeTab(home.dataset.employeeHome);
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
    const teamChanged = JSON.stringify([current.canReviewTeam, current.teamRequests, current.deviceRequests]) !==
      JSON.stringify([latest.canReviewTeam, latest.teamRequests, latest.deviceRequests]);
    const scheduleChanged = JSON.stringify(current.scheduledPeriods) !== JSON.stringify(latest.scheduledPeriods);
    Object.assign(current, { homeRequests: latest.homeRequests, ownRequests: latest.ownRequests,
      scheduledPeriods: latest.scheduledPeriods, punchFromAnywhere: latest.punchFromAnywhere,
      hasLocations: latest.hasLocations,
      nextPunch: latest.nextPunch, punchWindows: latest.punchWindows, openShiftStart: latest.openShiftStart,
      lastFlexiblePunch: latest.lastFlexiblePunch,
      canReviewTeam: latest.canReviewTeam, teamRequests: latest.teamRequests, deviceRequests: latest.deviceRequests,
      clockOffset: Number.isFinite(latest.serverNow) ? latest.serverNow - Date.now() : 0,
      shiftStartsAt: latest.shiftStartsAt, shiftEndsAt: latest.shiftEndsAt,
      punchedInAt: latest.punchedInAt, punchedOutToday: latest.punchedOutToday });
    $('#employee-location-note').hidden = current.hasLocations;
    punch.disabled = !current.hasLocations;
    if (changed) renderEmployeeRequests();
    if (scheduleChanged) renderScheduledPeriods();
    if (teamChanged) {
      showHomeTab(homeTab);
      renderTeamHome();
      renderDeviceRequests(current.deviceRequests ?? []);
    }
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
  if (session?.canManageCompany && new URLSearchParams(location.search).get('view') !== 'employee' &&
      !matchMedia('(max-width: 750px), (hover: none) and (pointer: coarse)').matches) {
    location.replace(location.pathname.replace(/\/employee$/, '/#home'));
    return;
  }
  $('#employee-title').hidden = Boolean(session?.ok);
  $('#employee-messages').hidden = !session?.ok;
  refresh.hidden = !session?.pending;
  if (session?.ok) {
    session.clockOffset = Number.isFinite(session.serverNow) ? session.serverNow - Date.now() : 0;
    status.textContent = '';
    dashboard.hidden = false;
    $('#employee-greeting').textContent = tr(Number(formatHour.format(new Date())) < 12 ? 'صباح الخير، ' : 'مساء الخير، ') + session.name;
    renderDeviceRequests(session.deviceRequests ?? []);
    $('#employee-location-note').hidden = session.hasLocations;
    punch.disabled = !session.hasLocations;
    dashboard.querySelector('[data-quick-request="leave"]').disabled = !session.leaveTypes.length;
    renderScheduledPeriods();
    updateTime();
    renderEmployeeDetails();
    showHomeTab(homeTab);
    renderTeamHome();
    showEmployeeView(employeeView);
    return;
  }
  status.textContent = session?.pending ? 'طلب تغيير الجوال بانتظار موافقة المدير المباشر.' : '';
  $('#employee-email').hidden = activating;
  $('#employee-password-rules').hidden = !activating;
  if (activating) form.elements.password.setAttribute('aria-describedby', 'employee-password-rules');
  else form.elements.password.removeAttribute('aria-describedby');
  $('#employee-confirm').hidden = !activating;
  $('#employee-remember').hidden = activating;
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
    if (result.approved && /^\/company\/[a-f0-9-]{36}\/employee$/.test(location.pathname)) {
      try {
        if (credentials.remember === 'on') localStorage.setItem('dawamkom-remembered-workspace', location.pathname);
        else localStorage.removeItem('dawamkom-remembered-workspace');
      } catch {}
    }
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
  homeTab = 'personal';
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
  const { kind, allowed, cooldown } = currentPunchTiming();
  if (!allowed) {
    employeeToast(cooldown ? 'انتظر قبل تسجيل بصمة أخرى.' : 'خارج المدة الزمنية', 'error');
    return;
  }
  const { coords } = session?.punchFromAnywhere ? { coords: {} } : await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
  const { latitude, longitude, accuracy } = coords;
  const result = await api('punch', { latitude, longitude, accuracy, kind });
  if (!result.ok && result.error === 'Wait before recording another punch.') {
    employeeToast('انتظر قبل تسجيل بصمة أخرى.', 'error');
    return;
  }
  if (!result.ok && result.error === 'Outside the punch time window.') {
    employeeToast('خارج المدة الزمنية', 'error');
    return;
  }
  if (!result.ok && result.error === 'You are outside the approved workplace area.') {
    employeeToast('أنت تقع خارج الحدود المكانية للتحضير', 'error');
    return;
  }
  if (result.ok) employeeToast(kind === 'in' ? 'تم تسجيل الحضور بنجاح.' : 'تم تسجيل الانصراف بنجاح.');
  await show();
  if (!result.ok) status.textContent = tr(ar[result.error] ?? result.error);
});
run($('#employee-submit'), show);
