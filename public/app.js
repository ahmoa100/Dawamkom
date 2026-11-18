import { notificationDisplay, newNotificationIds } from './notification-display.js';
import { isAdministrator, roleBranches } from './branch-roles.js';
import { payrollMarkup, mountPayroll } from './payroll.js';
import { employeeRequestTypes, effectiveRequestPreferences } from './request-settings.js';
import { isMobileDevice } from './device-interface.js';
import { employeeGreetings } from './employee-greetings.js';
import { mountSetupGuide, restartSetupGuide, setupGuideSaved } from './setup-guide.js';
import { annualLeaveBalance as calculateAnnualLeaveBalance } from './leave-balance.js';
import ar from './ar.js';
import { downloadReport } from './report-files.js';
import { allowsAnywhere, allowsCompanyLocation, defaultPeriodIds, effectivePeriodIds, isFlexiblePeriod, isScheduleRestDay, periodBounds, nextPeriodColor, periodColors, periodDisplayColor } from './work-schedule.js';
import { staffRoles as roleOptions } from './staff-options.js';
import { annualLeaveDays, contractTerms, contractTypes, genders, jobTitles, nationalityCodes, probationDays, westernDigits } from './staff-options.js';

let language = 'ar';
try { if (localStorage.getItem('dawamak-language') === 'en') language = 'en'; } catch { /* Storage can be disabled. */ }
const t = (label) => language === 'ar' && Object.hasOwn(ar, label) ? ar[label] : label;

const pages = {
  home: ['Overview', '⌂'], requests: ['Requests', '≡'], staff: ['Staff', '♙'],
  attendance: ['Attendance', '◷'], leaves: ['Leave balances', '▤'], reports: ['Reports', '▥'],
  payroll: ['Payroll', '▣'],
  documents: ['Documents', '▧'], settings: ['Settings', '⚙'],
  mobile: ['Staff view', '◉'],
};
const superAdmin = location.pathname === '/super-admin';
const companyPrefix = location.pathname.startsWith('/company/') ? location.pathname.replace(/\/$/, '') : '';
const superAdminPages = { home: ['Overview', '⌂'], partners: ['Partners', '▦'], settings: ['Settings', '⚙'] };
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const time = (value) => value ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en', {
  timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: state.timeFormat === '24' ? 'h23' : 'h12',
}).format(new Date(value)) : '—';
const badge = (label) => '<span class="badge ' + (({
  Active: 'green', Approved: 'green', 'Punched in': 'green', Pending: 'amber', 'Pending activation': 'amber',
  'Invitation draft': 'amber', Declined: 'red', Suspended: 'red',
})[label] ?? '') + '">' + esc(t(label)) + '</span>';
const card = (title, content) => '<section class="card"><h2>' + title + '</h2>' + content + '</section>';
const table = (headers, rows, empty, className = '', groups = []) => rows.length ? '<div class="table-wrap"><table class="' + className + '"><thead>' +
  (groups.length ? '<tr>' + groups.map(([label, count]) => '<th scope="colgroup" colspan="' + count + '">' + t(label) + '</th>').join('') + '</tr>' : '') + '<tr>' +
  headers.map((header) => '<th scope="col">' + header + '</th>').join('') +
  '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((value) => '<td>' + value + '</td>').join('') + '</tr>').join('') +
  '</tbody></table></div>' : '<p class="empty">' + empty + '</p>';
const title = (heading, subtitle) => '<div class="intro"><h1>' + heading + '</h1><p>' + subtitle + '</p></div>';
const button = (label) => '<button class="button primary">' + label + '</button>';
let state;
let toastTimer;
let attendanceDate;
let attendanceSearch = '';
let requestStatus = 'Pending';
let scheduleTab = 'schedule';
let scheduleWeek = 0;
let addingPeriod = false;
let editingPeriod;

function say(message, error = false) {
  const toast = $('#message');
  toast.textContent = t(message);
  toast.classList.toggle('error', error);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
}
let partnerInvitation;
async function save(action, body) {
  const response = await fetch(companyPrefix + '/api/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  if (action === 'partners' && (!body.operation || body.operation === 'activation-link' || partnerInvitation?.url.includes('/company/' + body.id + '/'))) {
    partnerInvitation = result.invitation;
  }
  state = result;
  render();
  return result;
}
function requestRows(items, decisions = false) {
  return items.map((item) => [
    esc(state.staff.find((person) => person.id === item.staffId)?.name),
    '<strong>' + esc(t(item.type)) + '</strong><small>' + esc(item.note) + '</small>',
    esc(item.date === item.end ? item.date : item.date + ' – ' + item.end),
    badge(item.status),
    ...(decisions ? [item.status === 'Pending' && !item.approvalSteps ? '<div class="actions">' +
      ['Approved', 'Declined'].map((status) => '<button class="button secondary compact" data-decision="' + status + '" data-id="' +
        esc(item.id) + '">' + (status === 'Approved' ? t('Approve') : t('Decline')) + '</button>').join('') + '</div>' : '—'] : []),
  ]);
}
function requestTable(items, decisions = false) {
  return table([t('Staff member'), t('Request'), t('Date'), t('Status'), ...(decisions ? [t('Action')] : [])], requestRows(items, decisions), t('No requests to show.'));
}
function home() {
  const active = state.staff.filter((person) => person.status === 'Active');
  const pending = state.requests.filter((item) => item.status === 'Pending');
  const present = new Set(state.punches.filter((entry) => entry.date === state.today && entry.kind === 'in').map((entry) => entry.staffId));
  const metrics = [
    [t('Active staff'), active.length, 'staff'], [t('Punched in today'), present.size, 'attendance'],
    [t('Pending requests'), pending.length, 'requests'], [t('Invitation drafts'), state.staff.length - active.length, 'staff'],
  ];
  return '<section class="hero"><div><p class="eyebrow">' + t('COMPANY WORKSPACE') + '</p><h1>' + t('Attendance overview') + '</h1><p>' + t('See who has arrived and what needs your attention.') + '</p></div><span>' +
    esc(state.today) + '</span></section><div class="metrics">' + metrics.map(([label, count, route]) =>
      '<a class="metric" href="#' + route + '"><span>' + t(label) + '</span><strong>' + count + '</strong></a>').join('') +
    '</div>' + card(t('Awaiting approval'), requestTable(pending, true));
}
function requests() {
  return '<h1>' + t('Requests') + '</h1><section id="manager-device-requests">' + requestInbox(requestManagerSession) + '</section>';
}
function requestInbox(session) {
  const browser = [...(session?.deviceHistory ?? []),
    ...(session?.deviceRequests ?? []).map(item => ({ ...item, status: 'Pending' }))].map(item => ({
      ...item, id: item.requestId, type: 'Browser change', browser: true,
    }));
  const items = [...state.requests, ...browser].reverse().sort((a, b) => (b.submittedOn ?? '').localeCompare(a.submittedOn ?? ''));
  const statuses = [['Pending', 'Awaiting approval'], ['Approved', 'Approved'], ['Declined', 'Declined'], ['Expired', 'Expired'], ['Cancelled', 'Cancelled'], ['All', 'All requests']];
  const filters = '<div class="request-filters" aria-label="' + t('Status') + '">' + statuses.map(([status, label]) =>
    '<button type="button" data-request-filter="' + status + '" aria-pressed="' + (requestStatus === status) + '">' + t(label) + '</button>').join('') + '</div>';
  const rows = items.filter(item => requestStatus === 'All' ? item.status !== 'Pending' : item.status === requestStatus).map(item => {
    const directory = requestDirectory ?? state;
    const employee = directory.staff.find(member => member.id === item.staffId);
    const manager = directory.staff.find(member => member.id === (item.approverId ?? employee?.managerId));
    const tags = [item.type]; if(item.loanAmount) tags.push(item.loanAmount+' SAR · '+item.repaymentInstallments+' دفعات');
    if (directory.leaveTypes.includes(item.type)) tags.unshift('Leave');
    if (item.date) tags.push(item.date === item.end ? item.date : `${item.date} – ${item.end}`);
    if (item.excuseType) tags.push(item.excuseType);
    if (item.reason) tags.push(item.reason);
    if (item.correctionReason) tags.push(item.correctionReason);
    if (item.proposedIn) tags.push(t('Check in') + ' ' + item.proposedIn);
    if (item.proposedOut) tags.push(t('Check out') + ' ' + item.proposedOut);
    const attachment = item.attachmentName ? '<a class="request-attachment" href="' + companyPrefix + '/api/request-attachment/' +
      encodeURIComponent(item.id) + '">' + esc(item.attachmentName) + '</a>' : '';
    const canDecide = item.status === 'Pending' && (item.browser
      ? Boolean(session?.companyReviewer || (item.approverId && item.approverId === session?.deviceReviewerId))
      : !item.approvalSteps || item.approverId === session?.reviewerId || session?.companyReviewer);
    const actions = !canDecide ? '' : '<div class="request-row-actions">' + ['approve', 'reject'].map(decision => {
      const label = t(decision === 'approve' ? 'Approve' : 'Decline');
      return '<button type="button" class="button secondary compact" aria-label="' + esc(label) + '" title="' + esc(label) + '" ' + (item.browser ? 'data-device-decision="' + decision +
        '" data-device-staff="' + esc(item.staffId) + '" data-device-request="' + esc(item.id) : 'data-decision="' +
        (decision === 'approve' ? 'Approved' : 'Declined') + '" data-id="' + esc(item.id)) + '">' +
        (decision === 'approve' ? '✓' : '×') + '</button>';
    }).join('') + '</div>';
    return ['<bdi>' + esc(item.id.slice(0, 8)) + '</bdi>', '<div class="request-chips">' + tags.map(tag =>
      '<span>' + esc(t(tag)) + '</span>').join('') + '</div><small>' + esc(employee ? staffName(employee) : (item.name ?? '')) +
      (item.note ? ' · ' + esc(item.note) : '') + '</small>' +
      (item.rejectionNote ? '<small>' + t('Rejection notes') + ' · ' + esc(item.rejectionNote) + '</small>' : '') + attachment,
      manager ? '<strong>' + esc(staffName(manager)) + '</strong><small>' + esc(t(manager.jobTitle ?? '')) + '</small>' : '—',
      badge(item.status), '<bdi>' + esc(item.submittedOn ?? '—') + '</bdi>', actions];
  });
  return filters + table([...['Request number', 'Request', 'Approver', 'Status', 'Request day'].map(t),
    '<span class="request-action-label">' + t('Actions') + '</span>'], rows,
    t('No requests to show.'), 'requests-overview');
}
let requestManagerSession;
let requestDirectory;
let rejectionTarget;
function openRequestRejection(target) {
  rejectionTarget = { ...target.dataset };
  $('#request-rejection-form').reset();
  $('#request-rejection-error').textContent = '';
  $('#request-rejection-title').textContent = t('Rejection notes');
  $('#request-rejection-label').firstChild.textContent = t('Rejection notes');
  $('#confirm-request-rejection').textContent = t('Decline');
  $('#request-rejection-dialog').showModal();
  $('#request-rejection-form textarea').focus();
}
let managementAlerts = [];
const seenManagementAlerts = new Set();
let managementPopupTimer;
function closeManagementPopup() {
  clearTimeout(managementPopupTimer);
  $('#management-notification-dialog').hidden = true;
  $('#management-notifications').setAttribute('aria-expanded', 'false');
}
function showManagementPopup(alerts = managementAlerts) {
  if (document.querySelector('dialog[open]')) return;
  const panel = $('#management-notification-dialog');
  panel.hidden = false;
  $('#management-notifications').setAttribute('aria-expanded', 'true');
  $('#management-notification-list').innerHTML = alerts.length ? alerts.map(alert =>
    '<a class="management-alert" href="#' + alert.page + '"><strong>' + esc(alert.label) + '</strong><small>' +
    esc(alert.detail) + '</small></a>').join('') : '<p class="hint">' + t('No notifications yet.') + '</p>';
  clearTimeout(managementPopupTimer);
  managementPopupTimer = setTimeout(closeManagementPopup, notificationDisplay(state.notificationSettings?.display).seconds * 1000);
}
let refreshingManagementAlerts = false;
function drawManagementAlerts() {
  const count = $('#management-notification-count');
  count.hidden = !managementAlerts.length;
  count.textContent = new Intl.NumberFormat(language).format(managementAlerts.length);
  $('#management-notifications').setAttribute('aria-label', t('Notifications') + ' (' + managementAlerts.length + ')');
  $('#management-notification-title').textContent = t('Notifications');
  $('#close-management-notifications').setAttribute('aria-label', t('Close'));
  $('#management-notification-list').innerHTML = managementAlerts.length ? managementAlerts.map(alert =>
    '<a class="management-alert" href="#' + alert.page + '"><strong>' + esc(alert.label) + '</strong><small>' +
    esc(alert.detail) + '</small></a>').join('') : '<p class="hint">' + t('No notifications yet.') + '</p>';
}
async function refreshManagementAlerts() {
  if (!state || superAdmin || document.hidden || refreshingManagementAlerts) return;
  refreshingManagementAlerts = true;
  try {
    const response = await fetch(companyPrefix + '/api/requests', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const snapshot = await response.json();
    const staff = new Map(snapshot.staff.map(person => [person.id, person]));
    managementAlerts = snapshot.requests.filter(request => request.status === 'Pending' &&
      (!request.approvalSteps || request.approverId === snapshot.reviewerId || snapshot.companyReviewer)).map(request => ({
        id: 'request-' + request.id + '-' + (request.approverId ?? ''), page: 'requests', label: t(request.type), detail: staff.get(request.staffId) ? staffName(staff.get(request.staffId)) : '',
      })).concat((snapshot.deviceRequests ?? []).map(request => ({
        id: 'browser-' + request.staffId + '-' + request.requestId, page: 'requests', label: t('Browser change'), detail: request.name,
      })), (state.documents ?? []).filter(document => documentDaysRemaining(document) < 0).map(document => ({
        id: 'document-' + document.id + '-' + document.expiresOn, page: 'documents', label: t('Expired documents'), detail: document.name,
      })));
    drawManagementAlerts();
    const fresh = newNotificationIds(managementAlerts, seenManagementAlerts);
    if (fresh.length && notificationDisplay(state.notificationSettings?.display).mode === 'popup') showManagementPopup(fresh);
  } catch { /* Retry when the bell is opened or at the next refresh. */ }
  finally { refreshingManagementAlerts = false; }
}
function updateRequestInbox(panel) {
  const markup = requestInbox(requestManagerSession);
  if (panel.requestMarkup === markup) return;
  const focused = panel.contains(document.activeElement) && document.activeElement;
  const focusData = focused && Object.entries(focused.dataset);
  panel.innerHTML = panel.requestMarkup = markup;
  if (focusData?.length) [...panel.querySelectorAll('button')].find(button =>
    focusData.every(([key, value]) => button.dataset[key] === value))?.focus();
}
async function refreshRequestInbox(panel) {
  if (panel.getAttribute('aria-busy') === 'true') return;
  panel.setAttribute('aria-busy', 'true');
  const current = state;
  try {
    const response = await fetch(companyPrefix + '/api/requests', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const snapshot = await response.json();
    if (!panel.isConnected || state !== current || panel.querySelector('.request-row-actions button:disabled')) return;
    state.requests = snapshot.requests;
    requestDirectory = snapshot;
    requestManagerSession = snapshot;
    updateRequestInbox(panel);
  } catch { /* The next refresh retries transient failures. */ }
  finally {
    panel.setAttribute('aria-busy', 'false');
  }
}
let addingStaff = false;
let editingStaff;
const openStaffBranches = new Set();
let profileStaffId;
let profileTab = 'overview';
let profileAttendanceDate;
let staffActivationObserver;
let accountIdentity;
function accountPage() {
  if (!accountIdentity) return '<p>' + t('Loading…') + '</p>';
  return title(t('Personal profile'), esc(accountDisplayName())) + card(t('Personal profile'),
    '<dl class="staff-profile-fields"><div><dt>' + t('Name') + '</dt><dd>' + esc(accountDisplayName()) +
    '</dd></div><div><dt>' + t('Email') + '</dt><dd><bdi>' + esc(accountIdentity.email) + '</bdi></dd></div></dl>') +
    card(t('Change password'), '<form id="account-password-form"><label>' + t('Current password') +
      '<input type="password" name="currentPassword" autocomplete="current-password" maxlength="128" required></label><label>' + t('New password') +
      '<input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><p class="hint">' +
      t('Use 10–128 characters with uppercase, lowercase, a number and a symbol.') + '</p><label>' + t('Confirm password') +
      '<input type="password" name="confirmation" autocomplete="new-password" minlength="10" maxlength="128" required></label>' +
      button(t('Change password')) + '<p id="account-password-feedback" role="status"></p></form>');
}
async function loadAccountIdentity() {
  if (superAdmin || !companyPrefix) return;
  try {
    const response = await fetch(companyPrefix + '/api/account');
    if (!response.ok) return;
    accountIdentity = await response.json();
    $('#account-name').textContent = accountDisplayName();
    $('#account-email').textContent = accountIdentity.email;
    $('#account-menu').hidden = false;
    $('#account-language-slot').append($('#language'));
    if (route() === 'account') render();
  } catch { /* Keep account controls hidden until the signed-in identity is available. */ }
}
function staffProfile() {
  const match = location.hash.match(/^#staff\/([^/]+)\/(overview|attendance|leaves|personal)$/);
  profileStaffId = match?.[1];
  profileTab = match?.[2] ?? 'overview';
  const person = state.staff.find(item => item.id === profileStaffId && item.status !== 'Removed');
  if (!person) return '<a class="settings-back" href="#staff">' + t('Staff') + '</a><p>' + t('Employee not found.') + '</p>';
  const tabs = [['overview', 'Organization overview'], ['attendance', 'Attendance'], ['leaves', 'Leaves'], ['personal', 'Personal profile']];
  let content;
  if (profileTab === 'attendance') {
    const day = profileAttendanceDate ?? state.today;
    const records = state.punches.filter(entry => entry.staffId === person.id && entry.date === day)
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    content = '<label>' + t('Date') + '<input type="date" id="profile-attendance-date" value="' + esc(day) +
      '" max="' + esc(state.today) + '"></label>' + attendanceTable(day, person.id) +
      table(['Type', 'Time'].map(t), records.map(entry => [t(entry.kind === 'in' ? 'Check in' : 'Check out'), time(entry.time)]),
        t('No records yet.'));
  } else if (profileTab === 'personal') {
    content = '<p><bdi>' + esc(person.email) + '</bdi></p>' + (person.status === 'Active'
      ? '<form id="staff-password-form"><label>' + t('New password') +
        '<input type="password" name="password" minlength="10" maxlength="128" autocomplete="new-password" required aria-describedby="staff-password-help"></label>' +
        '<p class="hint" id="staff-password-help">' + t('Use 10–128 characters with uppercase, lowercase, a number and a symbol.') + '</p>' +
        '<label>' + t('Confirm password') + '<input type="password" name="confirmation" minlength="10" maxlength="128" autocomplete="new-password" required></label>' +
        button(t('Change password')) + '<p id="staff-password-feedback" role="status"></p></form>'
      : '<p class="hint">' + t('The employee must activate their account first.') + '</p>');
  } else if (profileTab === 'leaves') {
    const balance = annualLeaveBalance(person, state.today, state.requests);
    const requests = state.requests.filter(item => item.staffId === person.id && state.leaveTypes.includes(item.type));
    content = (balance ? '<p>' + t('Used in the current contract year') + ' · ' + esc(balance.used) +
      '</p><p>' + t('Remaining in the current contract year') + ' · ' + esc(balance.remaining ?? '—') + '</p>' : '') +
      table(['Leave type', 'From', 'To', 'Status'].map(t), requests.map(item =>
        [esc(t(item.type)), esc(item.date), esc(item.end ?? item.date), badge(item.status)]), t('No requests to show.'));
  } else {
    const branch = state.locations.find(item => item.id === person.branchId);
    const manager = state.staff.find(item => item.id === person.managerId);
    const fields = [['Arabic name', person.nameAr || person.name], ['English name', person.nameEn], ['Email', person.email],
      ['Phone', person.phone], ['Job title', t(person.jobTitle ?? 'Unassigned')], ['Branch', branch?.name],
      ['Direct manager', manager && staffName(manager)], ['Joining date (Gregorian)', person.joinDate],
      ['Date of birth (Gregorian)', person.birthDate],
      ['Date of birth (Hijri)', person.birthDate ? hijriBirthDate(Date.parse(person.birthDate)) : ''],
      ['Status', t(person.status)]];
    content = '<dl class="staff-profile-fields">' + fields.map(([label, value]) =>
      '<div><dt>' + t(label) + '</dt><dd>' + esc(value ?? '—') + '</dd></div>').join('') + '</dl>';
  }
  return '<a class="settings-back" href="#staff">' + t('Staff') + '</a><h1>' + esc(staffName(person)) +
    '</h1><nav class="schedule-tabs staff-profile-tabs" aria-label="' + t('Personal profile') + '">' +
    tabs.map(([key, label]) => '<a href="#staff/' + esc(person.id) + '/' + key + '"' +
      (profileTab === key ? ' aria-current="page"' : '') + '>' + t(label) + '</a>').join('') +
    '</nav><section class="card staff-profile-content">' + content + '</section>';
}
function closeStaffDialog() {
  const id = editingStaff?.id;
  addingStaff = false;
  editingStaff = undefined;
  render();
  (id ? $('[data-edit-staff="' + CSS.escape(id) + '"]') : $('#add-staff'))?.focus();
}
const staffName = person => (language === 'ar' ? person.nameAr : person.nameEn) || person.name || person.nameAr || person.nameEn || '';
const accountDisplayName = () => {
  const person = state?.staff.find(item => item.id === accountIdentity?.id);
  return person ? staffName(person) : accountIdentity?.name ?? '';
};
const commonGivenNames = {
  Male: new Set('محمد احمد محمود مصطفى عبدالله عبدالعزيز عبدالرحمن عبدالكريم عمر علي خالد ابراهيم يوسف يحيى حسن حسين سعد سعود فيصل فهد سلمان تركي سامي طارق ناصر ماجد mohammed muhammad ahmed ahmad omar ali khalid ibrahim yousef yahya hassan hussein abdulkarim'.split(' ')),
  Female: new Set('فاطمه عائشه مريم ساره سارا نوره نورا هند ريم دانه وفاء هدى زينب خديجه لطيفه هيفاء اسماء منيره fatima aisha maryam sara sarah noura nora reem wafa'.split(' ')),
};
function suggestStaffGender(name) {
  const firstName = name.trim().split(/\s+/)[0].toLowerCase().normalize('NFKC')
    .replace(/\p{M}|ـ/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  return genders.find(gender => commonGivenNames[gender].has(firstName)) ?? '';
}
const birthCalendar = new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura-nu-latn', {
  timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
});
const millisecondsPerDay = 86400000;
function hijriBirthDate(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  const parts = birthCalendar.formatToParts(timestamp);
  return ['year', 'month', 'day'].map((field, index) =>
    parts.find(part => part.type === field).value.padStart(index === 0 ? 4 : 2, '0')).join('-');
}
function gregorianBirthDate(value, today) {
  const target = westernDigits(value.trim()).replaceAll('/', '-');
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|30)$/.test(target)) return '';
  let start = Math.floor(Date.parse('0622-07-19') / millisecondsPerDay);
  let end = Math.floor(Date.parse(today) / millisecondsPerDay);
  while (start <= end) {
    const day = Math.floor((start + end) / 2);
    const timestamp = day * millisecondsPerDay;
    const candidate = hijriBirthDate(timestamp);
    if (candidate === target) return new Date(timestamp).toISOString().slice(0, 10);
    if (candidate < target) start = day + 1;
    else end = day - 1;
  }
  return '';
}
function staff() {
  const input = (label, name, attrs) => '<label>' + t(label) + '<input name="' + name + '" ' + attrs + '></label>';
  const select = (label, name, options, optional = false) => '<label>' + t(label) + '<select name="' + name + '"' +
    (optional ? '' : ' required') + '><option value="">' + t(optional ? 'Choose later' : 'Choose an option') + '</option>' +
    options.map(([value, label]) => '<option value="' + esc(value) + '">' + esc(label) + '</option>').join('') + '</select></label>';
  const choices = values => values.map(value => [value, t(value)]);
  const countryNames = new Intl.DisplayNames('en', { type: 'region' });
  const countries = nationalityCodes.map(code => [code, countryNames.of(code)])
    .sort((a, b) => a[1].localeCompare(b[1], 'en'));
  const managers = state.staff.filter(person => person.role === 'Manager' && person.status !== 'Removed' && person.id !== editingStaff?.id)
    .map(person => [person.id, staffName(person)]);
  const branches = new Map(state.locations.map(branch => [branch.id, branch.name]));
  const directory = state.staff.filter(person => person.status !== 'Removed')
    .sort((a, b) => Number(b.status === 'Active') - Number(a.status === 'Active'));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', dateStyle: 'short' }).format(new Date());
  const form = '<form id="staff-form"><section aria-labelledby="staff-personal-heading">' +
    '<h3 id="staff-personal-heading">' + t('Personal information') + '</h3><div class="fields">' +
    input('Arabic name', 'nameAr', 'required maxlength="120" dir="rtl"') +
    input('English name', 'nameEn', 'required maxlength="120" dir="ltr"') +
    input('Email', 'email', 'type="email" required maxlength="254"') +
    input('Phone', 'phone', 'type="tel" required maxlength="32" dir="ltr"') +
    input('Date of birth (Gregorian)', 'birthDate', 'type="date" required max="' + esc(state.today) + '"') +
    input('Date of birth (Hijri)', 'birthDateHijri', 'type="text" dir="ltr" maxlength="10" placeholder="YYYY-MM-DD" autocomplete="off"') +
    select('Nationality', 'nationality', countries) +
    input('Identity number', 'identityNumber', 'required maxlength="20" inputmode="numeric" dir="ltr"') +
    select('Gender', 'gender', choices(genders)) + '</div></section>' +
    '<section aria-labelledby="staff-employment-heading"><h3 id="staff-employment-heading">' +
    t('Employment information') + '</h3><div class="fields">' +
    select('Job title', 'jobTitle', choices(state.jobTitles ?? jobTitles)) +
    (branches.size ? select('Branch', 'branchId', [...branches], true) : '') +
    select('Direct manager', 'managerId', managers, true) +
    input('Joining date (Gregorian)', 'joinDate', 'type="date" lang="en" required value="' + esc(today) + '"') +
    '<div class="staff-leave-entry">' +
    select('Annual leave entitlement (days)', 'annualLeave', annualLeaveDays.map(value => [value, value])) +
    input('Current accrued balance', 'currentLeaveBalance', 'type="number" min="-99999" max="99999" step="0.01"') + '</div>' +
    select('Contract term', 'contractTerm', choices(contractTerms)) +
    '<div id="contract-custom" hidden>' + input('Contract length in months', 'contractMonths', 'type="number" min="1" max="600" disabled') + '</div>' +
    select('Contract type', 'contractType', choices(contractTypes)) +
    select('Probation period (days)', 'probation', probationDays.map(value => [value, value])) +
    (editingStaff?.probationDays != null && !probationDays.includes(editingStaff.probationDays)
      ? '<small class="hint">' + t('Previously saved probation period') + ' · ' + esc(editingStaff.probationDays) + '</small>' : '') +
    '</div>' +
    '<fieldset class="staff-default-periods"><legend>' + t('Default work periods') + '</legend>' +
    (state.workPeriods?.length ? periodChoices(editingStaff ? defaultPeriodIds(editingStaff) : [], 'defaultPeriodId') :
      '<p class="hint">' + t('Define a period in Work schedule settings to assign it here.') + '</p>') + '</fieldset></section>' +
    '<section aria-labelledby="staff-salary-heading"><h3 id="staff-salary-heading">' + t('Salary information') + '</h3><div class="fields">' +
    input('Monthly base salary (SAR)', 'salary', 'type="number" min="0.01" max="999999999.99" step="0.01" required') +
    input('Monthly allowances (SAR)', 'allowances', 'type="number" min="0" max="999999999.99" step="0.01" value="0" required') +
    input('Total salary (SAR)', 'totalSalary', 'type="number" step="0.01" readonly aria-live="polite"') +
    '</div></section>' + button(t('Save employee')) + '</form>';
  const staffTable = people => table(['Name', 'Email', 'Phone', 'Job title', ...(branches.size ? ['Branch'] : []), 'Status', 'Actions'].map(t), people.map(person =>
      ['<a class="staff-profile-name" href="#staff/' + esc(person.id) + '/overview">' +
        esc(staffName(person)) + '</a>', '<bdi>' + esc(person.email) + '</bdi>', '<bdi>' + esc(person.phone || '—') + '</bdi>',
        esc(t(person.jobTitle === null ? 'Unassigned' : person.jobTitle || person.role || 'Unassigned')),
        ...(branches.size ? [esc(branches.get(person.branchId) ?? '—')] : []), badge(person.status),
        '<div class="activation-actions"><button type="button" class="button secondary compact staff-edit" data-edit-staff="' + esc(person.id) +
          '" aria-haspopup="dialog" aria-label="' + t('Edit employee') + '" title="' + t('Edit employee') + '">✎</button>' +
          '<button type="button" class="button secondary compact" data-remove-staff="' + esc(person.id) + '">' +
          t('Delete employee') + '</button>' + (person.canCopyActivation ? '<button type="button" class="button secondary compact" data-staff-link="' +
          esc(person.id) + '">' + t('Copy activation link') + '</button>' : '') + '</div>']), t('No staff members yet.'));
  let staffDirectory = staffTable(directory);
  if (state.isCompanyOwner && branches.size) {
    const groups = [...branches].map(([id, name]) => ({ id, name, people: directory.filter(person => person.branchId === id) }));
    const unassigned = directory.filter(person => !branches.has(person.branchId));
    if (unassigned.length) groups.push({ id: 'unassigned', name: t('Unassigned'), people: unassigned });
    staffDirectory = groups.map(group => '<details class="staff-branch-group" data-staff-branch="' + esc(group.id) + '"' +
      (openStaffBranches.has(group.id) ? ' open' : '') + '><summary><strong>' + esc(group.name) +
      '</strong><span>' + new Intl.NumberFormat(language).format(group.people.length) + '</span></summary>' +
      staffTable(group.people) + '</details>').join('');
  }
  return title(t('Staff'), t('Manage your staff list and prepare invitations.')) +
    '<div class="period-toolbar"><a class="settings-back" href="' + companyPrefix + '/employee?view=employee">' + t('Employee sign-in') + '</a>' +
    (state.admin ? '' : '<a class="settings-back" href="/admin">' + t('Admin sign-in with Google') + '</a>') +
    '</div>' +
      '<div class="period-toolbar"><button type="button" id="add-staff" class="button primary" aria-expanded="' +
      addingStaff + '" aria-haspopup="dialog">+ ' + t('Add new employee') + '</button></div>' +
    (addingStaff || editingStaff ? '<dialog id="staff-dialog" aria-labelledby="staff-title"><header><h2 id="staff-title">' +
      t(editingStaff ? 'Edit employee' : 'Add new employee') + '</h2><button type="button" class="button secondary" id="close-staff" aria-label="' +
      t('Close') + '">×</button></header>' + form + '</dialog>' : '') +
    '<section class="card staff-directory"><h2>' + t('Staff directory') + '</h2>' +
    staffDirectory + '</section>';
}
function attendanceTable(day, staffId) {
  const query = attendanceSearch.trim().toLowerCase();
  const periods = new Map((state.workPeriods ?? []).map(period => [period.id, period]));
  const punches = new Map();
  for (const entry of state.punches) {
    if (!punches.has(entry.staffId)) punches.set(entry.staffId, []);
    punches.get(entry.staffId).push(entry);
  }
  const formatDuration = minutes => {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return [hours || !remainder ? hours + ' ' + (language === 'ar' ? t('Hours unit') : 'h') : '',
      remainder ? remainder + ' ' + (language === 'ar' ? t('Minutes unit') : 'min') : ''].filter(Boolean).join(' ');
  };
  const rows = state.staff.filter(person => (!staffId || person.id === staffId) && (person.status !== 'Removed' ||
    punches.get(person.id)?.some(entry => entry.date === day)) &&
    (staffId || !query || [person.name, person.nameAr, person.nameEn].some(name => name?.toLowerCase().includes(query)))).map(person => {
    const scheduled = effectivePeriodIds(state, person, day)
      .map(id => periods.get(id)).filter(Boolean).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
    const entries = (punches.get(person.id) ?? []).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const overnight = scheduled.some(period => period.end < period.start);
    const daily = entries.filter(entry => entry.date === day);
    const first = daily.find(entry => entry.kind === 'in');
    const dayStart = Date.parse(day + 'T00:00:00+03:00');
    const dayEnd = dayStart + 86400000;
    let open, lastOut, worked = 0, completed = false;
    for (const entry of entries) {
      if (entry.kind === 'in') open = entry;
      if (entry.kind !== 'out' || !open) continue;
      const began = Date.parse(open.time), finished = Date.parse(entry.time);
      const elapsed = finished - began;
      if (open.flexible) {
        const assigned = scheduled.filter(isFlexiblePeriod).map(period => periodBounds(period, day)).find(range => range.start === open.shiftStart);
        const validDay = open.shiftStart == null || assigned || (open.date === day && open.shiftEnd == null);
        const portion = validDay ? Math.max(0, Math.min(finished, open.shiftEnd ?? Infinity, assigned?.end ?? dayEnd) - Math.max(began, assigned?.start ?? dayStart)) : 0;
        if (portion > 0) {
          worked += portion;
          completed = true;
          lastOut = entry;
        }
      } else if (open.date === day && (entry.date === day || (overnight && elapsed <= 86400000))) {
        worked += elapsed;
        completed = true;
        lastOut = entry;
      }
      open = undefined;
    }
    const minutes = Math.floor(worked / 60000);
    const status = first || completed ? 'Present' : scheduled.length ? 'Absent' : 'Not required';
    const required = scheduled.reduce((total, period) => total + period.duration, 0);
    const shortfall = scheduled.length && required > 0 && lastOut ? Math.max(0, required - minutes) : null;
    return [
      '<strong>' + esc(staffName(person)) + '</strong>' + (person.jobTitle ? '<small>' + esc(t(person.jobTitle)) + '</small>' : ''),
      '<span class="badge ' + (status === 'Present' ? 'green' : scheduled.length ? 'red' : '') + '">' + t(status) + '</span>',
      scheduled.length ? scheduled.map(period => '<div class="attendance-shift"' + periodColor(period) + '><strong>' + esc(period.name) + '</strong><small><bdi>' +
        esc(periodHours(period)) + '</bdi>' + (isFlexiblePeriod(period) ? '' : ' · ' + esc(formatDuration(period.duration))) + '</small></div>').join('') : t('Not scheduled'),
      time(first?.time), time(lastOut?.time ?? daily.findLast(entry => entry.kind === 'out')?.time),
      completed ? esc(formatDuration(minutes)) : '—',
      shortfall === null ? '—' : esc(formatDuration(shortfall)),
      esc(t(daily.findLast(entry => entry.device)?.device ?? person.approvedDevice ?? '—')),
    ];
  });
  return table(['Staff member', 'Status', 'Scheduled shift', 'First punch-in', 'Latest punch-out', 'Worked duration', 'Shortfall', 'Attendance device'].map(t),
    rows, t(query ? 'No matching employees.' : 'No staff members yet.'), 'daily-attendance-table');
}
function attendance() {
  const day = attendanceDate || state.today;
  const dayLabel = new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en', {
    dateStyle: 'full', timeZone: 'UTC',
  }).format(new Date(day + 'T00:00:00Z'));
  return '<h1>' + t('Attendance') + '</h1>' +
    card(esc(dayLabel), '<div class="attendance-toolbar"><input id="attendance-search" type="search" aria-label="' +
      t('Search by employee name') + '" placeholder="' + t('Search by employee name') + '" value="' + esc(attendanceSearch) + '">' +
      '<div class="attendance-date-controls" role="group" aria-label="' + t('Date') + '">' +
      '<button type="button" data-attendance-step="-1" aria-label="' + t('Previous day') + '">←</button>' +
      '<label class="attendance-calendar"><span aria-hidden="true"></span><input id="attendance-date" type="date" aria-label="' +
      t('Date') + '" value="' + esc(day) + '"></label>' +
      '<button type="button" data-attendance-step="1" aria-label="' + t('Next day') + '">→</button></div></div>' +
      '<div id="attendance-results">' + attendanceTable(day) + '</div>');
}
function leaves() {
  return title(t('Leave balances'), '') + annualLeaveBalances();
}

const settingsSections = {
  'settings/organization': ['Organization structure', 'Manage the logo and contact details.', 'ⓘ', organizationStructure],
  'settings/punch-methods': ['Punch methods', 'Manage where staff can punch in and out.', '◎', punchMethods],
  'settings/work-schedule': ['Work schedule settings', 'Set working days and hours.', '▦', workSchedule],
  'settings/leave-types': ['Leaves', 'Manage the leave types employees can request.', '▤', leaveTypes],
  'settings/staff-roles': ['Staff roles and permissions', 'View the number of staff assigned to each role.', '♙', staffRoles],
  'settings/approval-chain': ['Approval chain', 'Create request types and manage approval workflows.', '☷', approvalChain],
  'settings/notifications': ['Notification preferences', 'Manage manager and employee notifications, including exceptions.', '<span class="employee-bell"></span>', notificationPreferences],
  'settings/requests': ['Request and leave settings', 'Manage employee requests, leave types and balances.', '☷', requestAndLeaveSettings],
};
const approvalTypeLabels = {
  'Loan request': 'Loan request',
  'Leave cancellation': 'Leave cancellation', 'Annual leave': 'Annual leave', 'Sick leave': 'Sick leave', 'Unpaid leave': 'Unpaid leave',
  'Missed punch': 'Punch correction', 'Attendance excuse': 'Permission request',
};
let requestSettingsTab = 'requests';
function requestAndLeaveSettings() {
  const tabs = '<div class="schedule-tabs" role="group" aria-label="' + esc(t('Request and leave settings')) + '">' +
    [['requests', 'Employee requests'], ['leaves', 'Leaves']].map(([key, label]) =>
      '<button type="button" data-request-settings-tab="' + key + '" aria-pressed="' + (requestSettingsTab === key) + '">' +
      esc(t(label)) + '</button>').join('') + '</div>';
  return tabs + (requestSettingsTab === 'leaves' ? leaveTypes() : employeeRequestSettings());
}
document.addEventListener('click', event => {
  const tab = event.target.closest('[data-request-settings-tab]');
  if (!tab) return;
  requestSettingsTab = tab.dataset.requestSettingsTab;
  render();
  $('[data-request-settings-tab="' + requestSettingsTab + '"]')?.focus();
});
function employeeRequestSettings() {
 const prefs=effectiveRequestPreferences(state);
 return '<section class="card"><h2>'+t('Requests')+'</h2>'+Object.entries(prefs).map(([type,enabled])=>'<div class="notification-row"><strong>'+esc(t(type))+'</strong><button type="button" role="switch" class="leave-switch" aria-label="'+esc(t(type))+'" aria-checked="'+enabled+'" data-request-preference="'+esc(type)+'"><span></span></button></div>').join('')+'</section>';
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-request-preference]');
 if(button)run(button,()=>save('request-preferences',{type:button.dataset.requestPreference,enabled:button.getAttribute('aria-checked')!=='true'}));
});
const directApprovalStep = 'direct-manager';
let approvalDraft;
function approvalChain() {
  return '<section class="card">' + table(
    [t('Request type'), t('Approval action')],
    employeeRequestTypes(state).map(type => { const label=approvalTypeLabels[type]??type; return [esc(t(label)),
      '<button type="button" class="button secondary compact" data-edit-approval="' + esc(type) +
      '" aria-label="' + esc(t('Edit') + ' — ' + t(label)) + '">✎</button>']; }),
    '',
  ) + '</section><dialog class="catalog-dialog" id="approval-dialog" aria-labelledby="approval-title"></dialog>';
}
function drawApprovalDialog() {
  const dialog = $('#approval-dialog');
  const { type, steps } = approvalDraft;
  const managers = state.staff.filter(person => person.role === 'Manager' && person.status === 'Active');
  const options = [[directApprovalStep, t('Direct manager')], ...managers.map(person => [person.id, staffName(person)])];
  const option = (id, label, step) => '<option value="' + esc(id) + '"' + (step === id ? ' selected' : '') +
    (step !== id && steps.includes(id) ? ' disabled' : '') + '>' + esc(label) + '</option>';
  const stepButton = (verb, label, icon, index, disabled) => '<button type="button" class="button secondary compact" data-approval-step="' +
    verb + '" data-index="' + index + '" aria-label="' + t(label) + '"' + (disabled ? ' disabled' : '') + '>' + icon + '</button>';
  dialog.innerHTML = '<header><h2 id="approval-title">' + esc(t(approvalTypeLabels[type]??type)) +
    '</h2><button type="button" class="button secondary compact" data-close-approval aria-label="' + t('Close') + '">×</button></header>' +
    '<form id="approval-chain-form"><fieldset><legend>' + t('Approver') + '</legend><div class="approval-steps">' +
    steps.map((step, index) => (index ? '<span class="approval-direction" aria-hidden="true">' + (language === 'ar' ? '←' : '→') + '</span>' : '') +
      '<div class="approval-step" data-approval-card="' + index + '" tabindex="0" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight">' +
      stepButton('remove', 'Remove step', '×', index, steps.length === 1) + '<label><span>' + t('Step') + ' ' + (index + 1) +
      '</span><select required name="approver" data-index="' + index + '">' +
      '<option value="">' + t('Choose an approver') + '</option>' +
      (step && !options.some(([id]) => id === step) ? option(step, t('Unavailable approver'), step) : '') +
      options.map(([id, label]) => option(id, label, step)).join('') + '</select></label></div>').join('') +
    '<button type="button" class="button secondary compact" data-approval-step="add" aria-label="' + t('Add approver') +
    '"' + (steps.length >= options.length ? ' disabled' : '') + '>+</button></div></fieldset>' +
    '<p class="hint">' + t('Approvers review each request in the order shown.') + '</p>' + button(t('Save')) + '</form>';
  if (!dialog.open) dialog.showModal();
  bindApprovalDrag(dialog);
}
function moveApprovalStep(from, to) {
  const { steps } = approvalDraft;
  if (from === to || to < 0 || to >= steps.length) return;
  steps.splice(to, 0, ...steps.splice(from, 1));
  drawApprovalDialog();
  $('#approval-dialog [data-approval-card="' + to + '"]')?.focus();
}
function bindApprovalDrag(dialog) {
  const list = dialog.querySelector('.approval-steps');
  let drag;
  list.onpointerdown = event => {
    const card = event.target.closest('[data-approval-card]');
    if (drag || !event.isPrimary || event.button !== 0 || !card ||
        event.target.closest('select, button') || approvalDraft.steps.length < 2) return;
    drag = { card, pointer: event.pointerId, x: event.clientX, y: event.clientY };
    list.setPointerCapture(event.pointerId);
  };
  list.onpointermove = event => {
    if (drag?.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moving && Math.hypot(dx, dy) < 6) return;
    drag.moving = true;
    drag.card.classList.add('approval-dragging');
    drag.card.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-approval-card]');
    drag.target?.classList.remove('approval-drop-target');
    drag.target = list.contains(target) ? target : null;
    drag.target?.classList.add('approval-drop-target');
  };
  const finish = (event, drop) => {
    if (drag?.pointer !== event.pointerId) return;
    const { card, target } = drag;
    drag = undefined;
    card.classList.remove('approval-dragging');
    card.style.transform = '';
    target?.classList.remove('approval-drop-target');
    if (drop && target) moveApprovalStep(Number(card.dataset.approvalCard), Number(target.dataset.approvalCard));
  };
  list.onpointerup = event => finish(event, true);
  list.onpointercancel = list.onlostpointercapture = event => finish(event, false);
  list.onkeydown = event => {
    if (!event.target.matches('[data-approval-card]') || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const from = Number(event.target.dataset.approvalCard);
    const later = event.key === (language === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    moveApprovalStep(from, from + (later ? 1 : -1));
  };
}
function notificationPreferences() {
  return '<ul class="card notification-preferences">' + [
    ['attendance', 'Attendance alerts', 'Configure attendance reminder notifications.'],
    ['documents', 'Document wallet alerts', 'Configure document expiry notifications.'],
    ['encouragement', 'Encouragement phrases', 'Show occasional encouragement after attendance punches.'],
  ].map(([key, label, hint]) => '<li><div><strong>' + t(label) + '</strong><span class="hint">' + t(hint) +
    '</span></div><div class="notification-actions"><button type="button" class="button secondary compact" data-edit-notification="' + key +
    '" title="' + t('Edit') + '" aria-label="' + t('Edit') + ' — ' + t(label) + '">✎</button>' +
    '<button type="button" role="switch" class="leave-switch" data-notification-preference="' + key +
    '" aria-label="' + t(label) + '" aria-checked="' + (key === 'encouragement' ? state.encouragementSettings?.enabled !== false : Boolean(state.notificationPreferences?.[key])) + '"><span></span></button></div></li>').join('') +
    '</ul><section class="card notification-display-preferences"><h2>' + t('Notification display') + '</h2>' +
    '<form id="notification-display-form"><label>' + t('Display mode') + '<select name="mode"><option value="popup"' +
    (notificationDisplay(state.notificationSettings?.display).mode === 'popup' ? ' selected' : '') + '>' + t('Temporary popup') + '</option><option value="badge"' +
    (notificationDisplay(state.notificationSettings?.display).mode === 'badge' ? ' selected' : '') + '>' + t('Bell counter only') + '</option></select></label>' +
    '<label>' + t('Popup duration (seconds)') + '<input name="seconds" type="number" min="2" max="60" step="1" required value="' +
    notificationDisplay(state.notificationSettings?.display).seconds + '"></label>' + button(t('Save')) + '</form></section><dialog class="catalog-dialog" id="notification-settings-dialog" aria-labelledby="notification-settings-title"></dialog>';
}
const attendanceNotificationRules = [
  ['beforeStart', 'Before shift starts', 'Remind employees who have not clocked in before their shift starts.', true],
  ['beforeDeduction', 'After shift starts', 'Remind employees who have not clocked in after their shift starts.', false],
  ['beforeEnd', 'Before shift ends', 'Remind employees who have not clocked out before their shift ends.', true],
  ['afterEnd', 'After shift ends', 'Remind employees who have not clocked out after their shift ends.', true],
];
function phraseEditorRow(phrase = {}) {
  return '<fieldset class="phrase-editor-row"><label>العربية<input data-phrase-ar maxlength="240" required value="' + esc(phrase.ar) + '"></label>' +
    '<label>English<input dir="ltr" data-phrase-en maxlength="240" required value="' + esc(phrase.en) + '"></label>' +
    '<label><input type="checkbox" data-phrase-morning' + (phrase.morning ? ' checked' : '') + '>' + t('Morning only') + '</label>' +
    '<label><input type="checkbox" data-phrase-opening' + (phrase.opening ? ' checked' : '') + '>' + t('Clock-in only') + '</label>' +
    '<button type="button" class="button secondary compact" data-remove-phrase aria-label="' + t('Delete phrase') + '">×</button></fieldset>';
}
function openNotificationSettings(key) {
  if (key === 'encouragement') {
    const dialog = $('#notification-settings-dialog');
    dialog.innerHTML = '<header><h2 id="notification-settings-title">' + t('Encouragement phrases') +
      '</h2><button type="button" class="button secondary compact" data-close-phrases>×</button></header>' +
      '<p class="hint">' + t(state.isCompanyOwner ? 'Company-wide phrases and availability.' : 'Changes apply to employees in your branch.') + '</p>' +
      '<form id="encouragement-settings-form"><div class="phrase-editor-list">' +
      (state.encouragementSettings?.phrases ?? employeeGreetings).map(phraseEditorRow).join('') +
      '</div><div class="actions"><button type="button" class="button secondary" data-add-phrase>' + t('Add phrase') + '</button>' + button(t('Save')) + '</div></form>';
    dialog.querySelector('[data-close-phrases]').onclick = () => dialog.close();
    dialog.querySelector('[data-add-phrase]').onclick = () => {
      const list = dialog.querySelector('.phrase-editor-list');
      if (list.children.length >= 200) return;
      list.insertAdjacentHTML('beforeend', phraseEditorRow());
      list.lastElementChild.querySelector('input').focus();
    };
    dialog.onclick = event => { if (event.target.closest('[data-remove-phrase]')) event.target.closest('fieldset').remove(); };
    dialog.showModal();
    return;
  }
  const dialog = $('#notification-settings-dialog');
  const attendance = key === 'attendance';
  const settings = state.notificationSettings ?? {};
  const selected = settings.documentRecipients;
  const people = state.staff.filter(person => person.status !== 'Removed');
  const details = attendance ? '<p class="hint">' + t('Choose when employees are reminded to clock in and out.') + '</p>' +
    attendanceNotificationRules.map(([id, label, hint, enabled]) => {
      const rule = settings.attendance?.[id] ?? { enabled, minutes: 5 };
      return '<fieldset class="notification-rule"><label class="role-member"><input type="checkbox" name="' + id +
        '" data-notification-rule="' + id + '"' + (rule.enabled ? ' checked' : '') + '><strong>' + t(label) +
        '</strong></label><p class="hint">' + t(hint) + '</p><label class="notification-minutes">' + t('Minutes') +
        '<input type="number" name="' + id + '-minutes" min="0" max="1440" step="1" required value="' + esc(rule.minutes) +
        '"' + (rule.enabled ? '' : ' disabled') + '></label></fieldset>';
    }).join('') :
    '<label class="role-member"><input type="checkbox" name="allManagers"' + (selected == null ? ' checked' : '') +
    '>' + t('All managers') + '</label><fieldset class="notification-rule" id="document-notification-recipients"' +
    (selected == null ? ' hidden disabled' : '') + '><legend>' + t('Choose employees') + '</legend>' +
    people.map(person => '<label class="role-member"><input type="checkbox" name="recipients" value="' +
      esc(person.id) + '"' + (selected?.includes(person.id) ? ' checked' : '') + '>' + esc(staffName(person)) + '</label>').join('') +
    '</fieldset>';
  dialog.innerHTML = '<header><h2 id="notification-settings-title">' + t(attendance ? 'Attendance alerts' : 'Document wallet alerts') +
    '</h2><button class="button secondary compact" type="button" aria-label="' + t('Close') +
    '">×</button></header><form id="notification-settings-form" data-key="' + key + '">' + details + button(t('Save')) + '</form>';
  dialog.querySelector('header button').onclick = () => dialog.close();
  const form = dialog.querySelector('form');
  form.onchange = event => {
    const checkbox = event.target;
    if (checkbox.dataset.notificationRule) form.elements[checkbox.dataset.notificationRule + '-minutes'].disabled = !checkbox.checked;
    if (checkbox.name === 'allManagers') {
      const recipients = $('#document-notification-recipients');
      recipients.hidden = recipients.disabled = checkbox.checked;
    }
  };
  dialog.showModal();
}
let selectedStaffRole;
let selectedJobTitle;
function staffRoles() {
  const staff = state.staff.filter(person => person.status !== 'Removed');
  const format = new Intl.NumberFormat(language);
  const roles = state.staffRoles ?? roleOptions;
  const removeButton = (kind, value, label) => '<button type="button" class="button secondary compact" data-remove-' +
    kind + '="' + esc(value) + '">' + t(label) + '</button>';
  const membersByRole = new Map(roles.map(role => [role, staff.filter(person => person.role === role)]));
  const rows = roles.map(role => {
    const count = membersByRole.get(role).length;
    return '<tr data-staff-role="' + esc(role) + '"><td><button type="button" class="period-name" aria-haspopup="dialog">' +
      esc(t(role)) + '</button></td><td>' + format.format(count) + '</td><td>' + removeButton('role', role, 'Delete role') + '</td></tr>';
  }).join('');
  const field = selectedJobTitle ? 'jobTitle' : 'role';
  const selection = selectedJobTitle ?? selectedStaffRole;
  const assigned = staff.filter(person => person[field] === selection);
  const available = staff.filter(person => person[field] !== selection);
  const memberGroup = (label, members, checked) => '<fieldset><legend>' + t(label) + '</legend>' +
    (members.length ? members.map(person =>
      '<label class="role-member"><input type="checkbox" name="member" value="' + esc(person.id) + '"' +
      (checked ? ' checked' : '') + (checked && selectedStaffRole === 'Employee' ? ' disabled' : '') + '> ' + esc(staffName(person)) +
      (checked ? '' : ' <small class="hint">(' + esc(t(person[field] ?? 'Unassigned')) + ')</small>') + '</label>').join('')
      : '<p class="hint">' + t('No employees in this list.') + '</p>') + '</fieldset>';
  const branchMode = !selectedJobTitle && state.locations?.length;
  const member = (person, branch) => '<label class="role-member branch-role-person"><span><strong>' + esc(staffName(person)) +
    '</strong><small class="hint">' + esc(t(person.jobTitle || person.role || 'Unassigned')) + '</small></span><input type="checkbox" name="branch-member" data-branch-id="' + esc(branch.id) +
    '" value="' + esc(person.id) + '"' + (person.role === selection && roleBranches(person, selection).includes(branch.id) ? ' checked' : '') + '></label>';
  const admins = staff.filter(isAdministrator);
  const options = branchMode ? '<label>' + t('Search by name') + '<input type="search" id="branch-role-search" placeholder="' + t('Search by name') + '"></label><div class="branch-role-grid">' + state.locations.map(branch => {
    const employees = staff.filter(person => !isAdministrator(person) && person.branchId === branch.id);
    return '<section class="branch-role-panel" data-role-branch="' + esc(branch.id) + '"><h3>' + esc(branch.name) +
      '</h3><fieldset><legend>' + t('Administrators') + '</legend><p class="hint">' + t('Administrators can be assigned to more than one branch.') + '</p>' +
      (admins.map(person => member(person, branch)).join('') || '<p class="hint">' + t('No employees in this list.') + '</p>') +
      '</fieldset><fieldset><legend>' + t('Available to assign in') + ' ' + esc(branch.name) + '</legend>' +
      (employees.map(person => member(person, branch)).join('') || '<p class="hint">' + t('No employees in this list.') + '</p>') + '</fieldset></section>';
  }).join('') + '</div>' + (staff.some(person => !isAdministrator(person) && !state.locations.some(branch => branch.id === person.branchId)) ?
    '<fieldset><legend>' + t('Unassigned') + '</legend><p class="hint">' + t('Assign a branch in the employee profile first.') + '</p></fieldset>' : '') :
    memberGroup('Assigned employees', assigned, true) + memberGroup('Available to assign', available, false);
  const dialog = selection ? '<dialog id="role-dialog" class="' + (branchMode ? 'branch-role-dialog' : '') + '" aria-labelledby="role-title"><header><h2 id="role-title">' +
    esc(t(selection)) + ' · ' + format.format(assigned.length) + '</h2><button type="button" class="button secondary" id="close-role" aria-label="' +
    t('Close') + '">×</button></header><form id="role-form">' +
    '<p class="hint">' + t(branchMode ? 'Branch permissions are saved independently.' : selectedJobTitle ? 'Each person has one job title. Selecting someone assigns them this title.' :
      'Each person has one role. Selecting someone moves them to this role.') + '</p>' +
    options + '<div class="actions">' + button(t('Save assignments')) + '<button type="button" class="button secondary" data-cancel-role>' + t('Cancel') + '</button></div></form></dialog>' : '';
  const jobTitleRows = (state.jobTitles ?? jobTitles).map(jobTitle => [
    '<button type="button" class="period-name" data-job-title="' + esc(jobTitle) + '" aria-haspopup="dialog">' + esc(t(jobTitle)) + '</button>',
    format.format(staff.filter(person => person.jobTitle === jobTitle).length),
    removeButton('job-title', jobTitle, 'Delete job title'),
  ]);
  const createDialog = (kind, heading, label) =>
    '<div class="catalog-toolbar"><button type="button" class="button primary compact" data-create-catalog="' + kind +
    '" aria-haspopup="dialog">+ ' + t(heading) + '</button></div>' +
    '<dialog id="create-' + kind + '" class="catalog-dialog" aria-labelledby="create-' + kind + '-heading">' +
    '<header><h2 id="create-' + kind + '-heading">' + t(heading) + '</h2><button type="button" class="button secondary compact" data-close-catalog aria-label="' +
    t('Close') + '">×</button></header><form id="' + kind + '-form"><label>' + t(label) +
    '<input name="name" maxlength="120" required autofocus></label>' + button(t(heading)) + '</form></dialog>';
  return '<section class="card">' + createDialog('create-role', 'Create role', 'Role name') +
    '<div class="table-wrap"><table class="staff-roles-table"><thead><tr><th scope="col">' + t('Role name') +
    '</th><th scope="col">' + t('Assigned employees') + '</th><th scope="col">' + t('Actions') +
    '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + dialog + '</section>' +
    card(t('Job titles'), createDialog('job-title', 'Create job title', 'Job title') + table([t('Job title'), t('Assigned employees'), t('Actions')],
      jobTitleRows, t('No job titles.'), 'staff-roles-table'));
}
function closeRoleDialog() {
  const role = selectedStaffRole;
  const jobTitle = selectedJobTitle;
  selectedStaffRole = undefined;
  selectedJobTitle = undefined;
  render();
  if (role) $('[data-staff-role="' + CSS.escape(role) + '"] button')?.focus();
  if (jobTitle) $('[data-job-title="' + CSS.escape(jobTitle) + '"]')?.focus();
}
function settings() {
  const sections = Object.entries(settingsSections).filter(([path]) => path !== 'settings/leave-types' && (!superAdmin || path === 'settings/organization'));
  return '<h1>' + t('Settings') + '</h1>' + (state.isCompanyOwner && !superAdmin ? '<p><button type="button" class="button secondary" id="restart-setup-guide">' + t('Restart setup tour') + '</button></p>' : '') + '<div class="settings-grid">' +
    sections.map(([path, [name, description, icon]]) =>
      '<a class="settings-tile' + (path === 'settings/requests' ? ' settings-tile-requests' : '') + '" href="#' + path + '"><span class="settings-icon" aria-hidden="true">' + icon + '</span>' +
      '<span><strong>' + t(superAdmin && path === 'settings/organization' ? 'Organization information' : name) +
      '</strong><span class="hint">' + t(description) + '</span></span></a>').join('') + '</div>';
}

let organizationTab = 'overview';
function organizationStructure() {
  const tabs = '<div class="schedule-tabs" role="group" aria-label="' + esc(t('Organization structure')) + '">' +
    [['overview', 'Organization overview'], ['structure', 'Structure'], ['chart', 'Organization chart'], ['settings', 'Settings']].map(([tab, label]) =>
      '<button type="button" data-organization-tab="' + tab + '" aria-pressed="' + (organizationTab === tab) + '">' +
      esc(t(label)) + '</button>').join('') + '</div>';
  if (organizationTab === 'chart') return tabs;
  if (organizationTab === 'settings') return tabs + card(t('Time format'), '<form id="time-format-form"><label>' + t('Time format') +
    '<select name="format"><option value="12">' + t('12-hour') + '</option><option value="24"' +
    (state.timeFormat === '24' ? ' selected' : '') + '>' + t('24-hour') + '</option></select></label>' + button(t('Save settings')) + '</form>');
  if (organizationTab === 'structure') return tabs + companyBranches();
  const staff = state.staff.filter(person => person.status !== 'Removed');
  const departments = new Set(staff.map(person => person.department?.trim()).filter(Boolean));
  const managerIds = new Set(staff.filter(person => person.role === 'Manager').map(person => person.id));
  const unassigned = staff.filter(person => !managerIds.has(person.managerId)).length;
  const number = new Intl.NumberFormat(language);
  const metrics = [['Staff', staff.length], ['Branches', state.locations.length], ['Departments', departments.size]];
  const logo = state.organization?.logo;
  return tabs + '<section class="card organization-overview"><div class="organization-overview-name">' +
    (logo ? '<img src="' + esc(logo) + '" alt="">' : '') + '<h2>' + esc(state.company) + '</h2></div>' +
    '<dl class="organization-overview-metrics">' + metrics.map(([label, count]) =>
      '<div><dt>' + esc(t(label)) + '</dt><dd>' + number.format(count) + '</dd></div>').join('') + '</dl></section>' +
    (unassigned ? card(number.format(unassigned) + ' ' + t('Employees without a direct manager'),
      '<a href="#staff" class="button secondary">' + t('Manage employees') + '</a>') : '') +
    '<details class="card organization-profile"><summary>' + t('Organization information') + '</summary>' +
    organizationSettings() + '</details>';
}
const validOrganizationLogo = file => file.size > 0 && file.size <= 5 * 1024 * 1024 &&
  ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
function matchLogoPreviewBackground(image) {
  const frame = image.parentElement;
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  const sums = [0, 0, 0];
  let samples = 0, lightSamples = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x > 0 && x < size - 1 && y > 0 && y < size - 1) continue;
      samples += 1;
      const index = (y * size + x) * 4;
      const red = data[index], green = data[index + 1], blue = data[index + 2];
      const darkest = Math.min(red, green, blue);
      if (data[index + 3] < 250 || darkest < 238 || Math.max(red, green, blue) - darkest > 12) continue;
      lightSamples += 1;
      sums[0] += red;
      sums[1] += green;
      sums[2] += blue;
    }
  }
  frame.style.backgroundColor = lightSamples / samples >= 0.85
    ? 'rgb(' + sums.map(sum => Math.round(sum / lightSamples)).join(', ') + ')' : '';
}
const saudiRegions = [
  ['الرياض', 'الرياض،الخرج،الدرعية،المجمعة،الدوادمي،وادي الدواسر'],
  ['مكة المكرمة', 'مكة المكرمة،جدة،الطائف،رابغ،القنفذة،الليث'],
  ['المدينة المنورة', 'المدينة المنورة،ينبع،العلا،بدر،خيبر'],
  ['القصيم', 'بريدة،عنيزة،الرس،البكيرية،المذنب'],
  ['المنطقة الشرقية', 'الدمام،الخبر،الظهران،الجبيل،الأحساء،الهفوف،القطيف،حفر الباطن،الخفجي'],
  ['عسير', 'أبها،خميس مشيط،بيشة،محايل عسير،النماص،ظهران الجنوب'],
  ['تبوك', 'تبوك،ضباء،الوجه،أملج،تيماء،حقل،البدع'],
  ['حائل', 'حائل،بقعاء،الغزالة،الشنان'],
  ['الحدود الشمالية', 'عرعر،رفحاء،طريف،العويقيلة'],
  ['جازان', 'جازان،صبيا،أبو عريش،صامطة،فرسان،بيش'],
  ['نجران', 'نجران،شرورة،حبونا،بدر الجنوب'],
  ['الباحة', 'الباحة،بلجرشي،المندق،المخواة،قلوة'],
  ['الجوف', 'سكاكا،دومة الجندل،القريات،طبرجل'],
];
function organizationLocationOptions(field, profile) {
  const isSaudi = ['SA', 'Saudi Arabia', 'السعودية', 'المملكة العربية السعودية'].includes(profile.country);
  const countries = new Intl.DisplayNames(language, { type: 'region' });
  const options = {
    country: [['SA', countries.of('SA')]],
    region: isSaudi ? saudiRegions.map(([region]) => [region, region]) : [],
    city: (isSaudi ? saudiRegions.find(([region]) => region === profile.region)?.[1] ?? '' : '')
      .split('،').filter(Boolean).map(city => [city, city]),
  }[field];
  const current = field === 'country' && isSaudi ? 'SA' : profile[field];
  if (current && !options.some(([value]) => value === current)) options.push([current, current]);
  return '<option value="">' + t('Select') + '</option>' + options.map(([value, label]) =>
    '<option value="' + esc(value) + '"' + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
}
function organizationSettings() {
  const profile = state.organization ?? {};
  const locationField = (label, name) => '<label>' + t(label) + '<select name="' + name +
    '" data-organization-location>' + organizationLocationOptions(name, profile) + '</select></label>';
  const field = (label, name, type = 'text') => '<label>' + t(label) + '<input type="' + type +
    '" name="' + name + '" value="' + esc(name === 'name' && !superAdmin ? state.company : profile[name]) +
    '" maxlength="' + (name === 'name' ? 120 : 300) + '"' + (name === 'name' ? ' required' : '') + '></label>';
  return '<form id="organization-form">' +
    '<section class="card organization-logo-editor"><h2>' + t('Organization branding') + '</h2>' +
      '<div class="organization-logo-layout"><div class="organization-logo-preview"><img class="organization-logo"' +
      (profile.logo ? ' src="' + esc(profile.logo) + '"' : ' hidden') + ' alt="' + t('Organization logo') + '"></div>' +
      '<div><small>' + t('Maximum logo size: 5 MB.') + '</small><div class="organization-logo-actions">' +
      '<label class="button secondary logo-upload">' + t('Upload logo') +
      '<input type="file" name="logo" accept="image/png,image/jpeg,image/webp"></label>' +
      '<button type="button" class="logo-remove" data-remove-organization-logo' + (profile.logo ? '' : ' hidden') + '>' +
      t('Remove image') + '</button><button type="submit" class="button primary">' + t('Save') +
      '</button><input type="hidden" name="removeLogo" value=""></div>' +
      '<small>' + t('PNG, JPG, JPEG or WebP. Recommended size: 120 × 36 px.') + '</small></div></div></section>' +
    card(t('General information'), '<div class="fields">' + field('Company name', 'name') + locationField('Country', 'country') +
      locationField('Region', 'region') + locationField('City', 'city') + '</div>') +
    card(t('Contact information'), '<div class="fields">' + field('Email', 'email', 'email') +
      field('Contact person', 'contactName') + field('Mobile number', 'phone', 'tel') + field('Address', 'address') +
      '</div>') + button(t('Save settings')) + '</form>';
}
function workSchedule() {
  const tabs = [['schedule', 'Work schedules'], ['periods', 'Work schedule settings']];
  return '<div class="schedule-tabs" role="group" aria-label="' + t('Work schedules') + '">' +
    tabs.map(([id, label]) => '<button type="button" data-schedule-tab="' + id + '" aria-pressed="' +
      (scheduleTab === id) + '">' + t(label) + '</button>').join('') + '</div>' +
    (scheduleTab === 'periods' ? workPeriods() + workingHours() : weeklySchedule());
}
let selectedScheduleCell;
const wallTime = value => periodTimeLabel(periodTimeParts(value));
const periodHours = period => period.start && period.end ? wallTime(period.start) + ' – ' + wallTime(period.end) : t('Flexible period');
const displayPeriodColor = period => periodDisplayColor(period, Math.max(0, state.workPeriods.findIndex(item => item.id === period.id)));
const periodColor = period => ' style="--period-color:' + displayPeriodColor(period) + '"';
function periodChoices(selected, field, focusId) {
  return '<div class="schedule-options">' + state.workPeriods.map(period =>
    '<label><input type="checkbox" name="' + field + '" value="' + esc(period.id) + '"' +
    (selected.includes(period.id) ? ' checked' : '') + (period.id === focusId ? ' autofocus' : '') +
    '><span class="period-dot" aria-hidden="true"' + periodColor(period) + '></span><span><strong>' + esc(period.name) +
    '</strong><small><bdi>' + esc(periodHours(period)) + '</bdi></small></span></label>').join('') + '</div>';
}
function scheduleAssignmentDialog() {
  const { staffId, date, periodId } = selectedScheduleCell;
  const person = state.staff.find(item => item.id === staffId);
  const selected = effectivePeriodIds(state, person, date);
  const restDay = isScheduleRestDay(state, person, date);
  const overridden = (state.workAssignments ?? []).some(item => item.staffId === staffId && item.date === date);
  return '<dialog class="catalog-dialog" id="schedule-assignment-dialog" aria-labelledby="schedule-assignment-title">' +
    '<header><h2 id="schedule-assignment-title">' + t('Assign periods') + '</h2>' +
    '<button type="button" id="close-schedule-assignment" class="button secondary compact" aria-label="' + t('Close') + '">×</button></header>' +
    '<p>' + esc(staffName(person)) + ' · <bdi>' + esc(date) + '</bdi></p>' +
    '<form id="schedule-assignment-form"><fieldset class="schedule-assignment-fields"' + (restDay ? ' disabled' : '') +
    '>' + periodChoices(selected, 'periodId', periodId) + '</fieldset>' +
    '<div class="schedule-options"><label><input name="restDay" type="checkbox"' + (restDay ? ' checked' : '') +
    '><span><strong>' + t('Rest day') + '</strong><small>' +
    t('Applies to the selected employee and date.') + '</small></span></label></div>' +
    '<fieldset class="schedule-assignment-fields"' + (restDay ? ' disabled' : '') + '><label>' +
    t('Number of working days') + '<input name="repeat" type="number" min="1" max="366" step="1" required value="1"></label></fieldset>' +
    '<p class="hint">' + t('Repeat from the selected date and skip rest days.') + '</p>' +
    '<p class="hint error" id="schedule-assignment-error" role="alert"></p><div class="actions">' + button(t('Save assignments')) +
    (overridden ? '<button type="submit" value="default" class="button secondary" formnovalidate>' + t('Restore default periods') + '</button>' : '') +
    '</div></form></dialog>';
}
function focusScheduleCell({ staffId, date }) {
  $('[data-schedule-staff="' + CSS.escape(staffId) + '"][data-schedule-date="' + date + '"].schedule-add')?.focus();
}
function closeScheduleAssignment() {
  const cell = selectedScheduleCell;
  selectedScheduleCell = undefined;
  render();
  focusScheduleCell(cell);
}
function weeklySchedule() {
  const start = new Date(state.today + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - start.getUTCDay() + scheduleWeek * 7);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    return day;
  });
  const locale = language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en';
  const dateLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dayLabel = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const periods = state.workPeriods ?? [];
  const rows = state.staff.filter(person => ['Active', 'Pending activation'].includes(person.status)).map(person => [
    '<strong>' + esc(staffName(person)) + '</strong><small>' + esc(t(person.role ?? 'Unassigned')) + '</small>',
    ...days.map(day => {
      const date = day.toISOString().slice(0, 10);
      const selected = effectivePeriodIds(state, person, date);
      const scheduled = periods.filter(period => selected.includes(period.id)).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
      const cell = ' data-schedule-staff="' + esc(person.id) + '" data-schedule-date="' + date + '"';
      return '<div class="schedule-cell">' + scheduled.map(period =>
        '<div class="schedule-period"' + periodColor(period) + '><strong>' + esc(period.name) + '</strong><small><bdi>' +
        esc(periodHours(period)) + '</bdi></small><div class="schedule-period-actions">' +
        '<button type="button" class="button secondary compact" data-edit-assignment="' + esc(period.id) + '"' + cell +
        ' aria-label="' + esc(t('Edit assignment') + ' — ' + period.name) + '" title="' + t('Edit assignment') + '">✎</button>' +
        '<button type="button" class="button secondary compact" data-remove-assignment="' + esc(period.id) + '"' + cell +
        ' aria-label="' + esc(t('Remove assignment') + ' — ' + period.name) + '" title="' + t('Remove assignment') + '">×</button></div></div>').join('') +
        '<button type="button" class="schedule-add' + (scheduled.length ? ' has-periods' : '') + '"' + cell +
        ' aria-haspopup="dialog" aria-label="' + esc(t('Assign periods') + ' — ' + staffName(person) + ' — ' + dayLabel.format(day)) + '">' +
        (isScheduleRestDay(state, person, date) ?
          '<span class="schedule-rest-label">' + t('Rest day') + '</span>' : '+') + '</button></div>';
    }),
  ]);
  const weekLabel = dateLabel.formatRange(days[0], days[6]);
  return '<section class="card weekly-schedule"><div class="schedule-week"><h2>' + esc(weekLabel) + '</h2>' +
    '<div class="actions"><button type="button" class="button secondary" data-week-step="-1">' + t('Previous week') + '</button>' +
    '<button type="button" class="button secondary" data-week-step="1">' + t('Next week') + '</button></div></div>' +
    (periods.length ? '' : '<p class="hint">' + t('Define a period in Work schedule settings to assign it here.') + '</p>') +
    table([t('Staff'), ...days.map(day => esc(dayLabel.format(day)))], rows, t('No employees yet.')) +
    (selectedScheduleCell ? scheduleAssignmentDialog() : '') + '</section>';
}
function workPeriods() {
  const rows = (state.workPeriods ?? []).map(period => {
    const { id, name, duration } = period;
    const elapsed = [Math.floor(duration / 60), duration % 60];
    const format = new Intl.NumberFormat(language, { minimumIntegerDigits: 2 });
    return ['<span class="period-dot" aria-hidden="true"' + periodColor(period) + '></span>' + esc(name),
      '<bdi class="period-duration">' + elapsed.map(value => format.format(value)).join(':') + '</bdi>' + (isFlexiblePeriod(period) ? '<small>' + t('Flexible period') + ' · ' + periodHours(period) + '</small>' : ''),
      '<div class="actions"><button type="button" class="button secondary compact" data-edit-period="' + esc(id) + '" aria-label="' +
      esc(t('Edit period') + ' — ' + name) + '">' + t('Edit') + '</button>' +
      '<button type="button" class="button secondary compact" data-duplicate-period="' + esc(id) + '" title="' +
      esc(t('Duplicate period')) + '" aria-label="' + esc(t('Duplicate period') + ' — ' + name) + '">⧉</button>' +
      '<button type="button" class="button secondary compact" data-delete-period="' + esc(id) + '" title="' +
      esc(t('Delete period')) + '" aria-label="' + esc(t('Delete period') + ' — ' + name) + '">×</button></div>'];
  });
  return '<section class="card"><div class="period-toolbar"><button type="button" id="add-period" class="button primary" aria-expanded="' +
    addingPeriod + '"><span aria-hidden="true">+ </span>' + t('Define a new period') + '</button></div>' +
    (addingPeriod ? periodDialog() : '') +
    table([t('Period'), t('Duration'), t('Action')], rows, t('No periods yet.'), 'work-periods-table') + '</section>';
}
function periodDialog() {
  const period = editingPeriod ?? {};
  const color = (editingPeriod ? displayPeriodColor(period) : nextPeriodColor(state.workPeriods)).toLowerCase();
  const choices = periodColors.includes(color) ? periodColors : [...periodColors, color];
  const punchWindow = (key, label, fields) => '<details class="period-window" open><summary>' + t(label) +
    '</summary><div class="period-fields">' + fields.map(([field, caption, value]) =>
      '<label><span>' + t(caption) + '</span><input type="number" min="0" max="720" required name="' + key + '-' + field +
      '" value="' + esc(period[key]?.[field] ?? value) + '"></label>').join('') + '</div><p class="hint" data-window="' + key + '"></p></details>';
  return '<dialog id="period-dialog" aria-labelledby="period-title"><form id="period-form">' +
    '<header><h2 id="period-title">' + t(editingPeriod ? 'Edit period' : 'New period') + '</h2><button type="button" id="close-period" class="button secondary" aria-label="' + t('Close') + '">×</button></header>' +
    '<label id="period-name-field">' + t('Period name') + '<input name="name" required maxlength="80" value="' + esc(period.name) + '" autofocus></label>' +
    '<details class="period-color-picker"><summary><span class="period-dot" aria-hidden="true" style="--period-color:' +
    color + '"></span>' + t('Period color') + '</summary><div class="period-color-palette" role="group" aria-label="' +
    t('Period color') + '">' + choices.map((choice, index) =>
    '<input type="radio" name="color" value="' + choice + '" style="--period-color:' + choice +
    '" aria-label="' + t('Color option') + ' ' + (index + 1) + '"' +
    (choice === color ? ' checked' : '') + '>').join('') + '</div></details>' +
    '<label class="period-flexible-option">' + t('Flexible period') + '<input type="checkbox" name="flexibleDay"' + (isFlexiblePeriod(period) ? ' checked' : '') + '></label>' +
    '<fieldset id="timed-period-settings">' +
    '<div class="period-times">' + periodTimePicker('start', 'Start time', period.start ?? '08:00') +
    periodTimePicker('end', 'End time', period.end ?? '17:00') + '</div>' +
    '<p>' + t('Period window') + ' <output id="period-duration"></output></p></fieldset>' +
    '<fieldset id="flexible-period-settings"' + (isFlexiblePeriod(period) ? '' : ' hidden disabled') + '><legend>' + t('Total flexible period hours') + '</legend><div class="period-times">' +
    '<label>' + t('Hours') + '<select name="durationHours">' + Array.from({length:24}, (_, hour) => '<option value="' + hour + '"' + (hour === Math.floor((period.duration || 480) / 60) ? ' selected' : '') + '>' + hour + '</option>').join('') + '</select></label>' +
    '<label>' + t('Minutes') + '<select name="durationMinutes">' + Array.from({length:60}, (_, minute) => '<option value="' + minute + '"' + (minute === (period.duration || 480) % 60 ? ' selected' : '') + '>' + minute + '</option>').join('') + '</select></label></div></fieldset>' +
    '<fieldset id="fixed-period-rules"' + (isFlexiblePeriod(period) ? ' hidden disabled' : '') + '>' +
    punchWindow('arrival', 'Check-in rules', [['before', 'Before start (min)', 60], ['grace', 'Allowed lateness (min)', 0], ['after', 'After start (min)', 60]]) +
    punchWindow('departure', 'Check-out rules', [['before', 'Before end (min)', 60], ['grace', 'Allowed early departure (min)', 0], ['after', 'After end (min)', 60]]) +
    '</fieldset><div class="actions">' + button(t('Save period')) +
    '</div></form></dialog>';
}
const twoTimeDigits = value => String(value).padStart(2, '0');
function periodTimeParts(time) {
  const [hour, minute] = time.split(':').map(Number);
  return { hour: state.timeFormat === '24' ? hour : hour % 12 || 12, minute, half: hour >= 12 ? 1 : 0 };
}
function periodTimeLabel(parts) {
  const clock = twoTimeDigits(parts.hour) + ':' + twoTimeDigits(parts.minute);
  return state.timeFormat === '24' ? clock : clock + ' ' + t(parts.half ? 'PM' : 'AM');
}
function periodTimePicker(name, label, value) {
  const parts = periodTimeParts(value);
  const clock24 = state.timeFormat === '24';
  const choices = (part, values, labels = []) => values.map((number, index) =>
    '<button type="button" data-time-part="' + part + '" data-time-value="' + number + '" aria-pressed="' +
    (parts[part] === number) + '">' + (labels[index] ?? twoTimeDigits(number)) + '</button>').join('');
  return '<div><span id="period-' + name + '-label">' + t(label) + '</span>' +
    '<details class="period-time-picker"><summary aria-labelledby="period-' + name + '-label period-' + name + '-value">' +
    '<span id="period-' + name + '-value" class="period-time-value">' + esc(periodTimeLabel(parts)) + '</span></summary>' +
    '<input type="hidden" name="' + name + '" value="' + esc(value) + '">' +
    '<div class="period-time-menu">' + (clock24 ? '' : '<div class="period-time-halves" role="group" aria-label="' + t('Time of day') + '">' +
    choices('half', [0, 1], [t('AM'), t('PM')]) + '</div>') + '<div class="period-time-columns" dir="ltr">' +
    '<div class="period-time-wheel" role="group" aria-label="' + t('Hours') + '">' +
    choices('hour', Array.from({ length: clock24 ? 24 : 12 }, (_, index) => clock24 ? index : index + 1)) + '</div>' +
    '<div class="period-time-wheel" role="group" aria-label="' + t('Minutes') + '">' +
    choices('minute', Array.from({ length: 60 }, (_, index) => index)) + '</div></div>' +
    '<button type="button" class="button secondary compact" data-close-time-picker>' + t('Done') + '</button></div></details></div>';
}
function updatePeriodPreview(form) {
  const flexible = form.elements.flexibleDay.checked;
  const rules = form.querySelector('#fixed-period-rules'), target = form.querySelector('#flexible-period-settings');
  rules.hidden = rules.disabled = flexible;
  target.hidden = target.disabled = !flexible;
  form.elements.name.required = true;
  const minutes = (name) => {
    const [hours, mins] = form.elements[name].value.split(':').map(Number);
    return hours * 60 + mins;
  };
  const format = (value) => {
    if (!Number.isFinite(value)) return '—';
    const minute = (value + 1440) % 1440;
    return [Math.floor(minute / 60), minute % 60].map(n => String(n).padStart(2, '0')).join(':');
  };
  const start = minutes('start'), end = minutes('end');
  const targetMinutes = Number(form.elements.durationHours.value) * 60 + Number(form.elements.durationMinutes.value);
  form.elements.durationHours.setCustomValidity(flexible && (targetMinutes <= 0 || targetMinutes > (end - start + 1440) % 1440) ? t('Choose flexible hours within the period window.') : '');
  const display = value => Number.isFinite(value) ? wallTime(format(value)) : '—';
  form.querySelector('#period-duration').textContent = format(end - start);
  for (const [key, time, status, direction] of [['arrival', start, 'Late after', 1], ['departure', end, 'Early before', -1]]) {
    const read = (field) => form.elements[key + '-' + field].valueAsNumber;
    form.querySelector('[data-window="' + key + '"]').textContent = t('Punch window') + ' ' +
      display(time - read('before')) + ' – ' + display(time + read('after')) + ' · ' +
      t(status) + ' ' + display(time + direction * read('grace'));
  }
}
function workingHours() {
  const schedule = state.workSchedule;
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return card(t('Working days and hours'), '<form id="schedule-form"><fieldset><legend>' + t('Working days') + '</legend>' +
    '<div class="schedule-days">' + weekdays.map((day, index) => '<label><input type="checkbox" name="day" value="' + index +
      '"' + (schedule.days.includes(index) ? ' checked' : '') + '> ' + t(day) + '</label>').join('') + '</div></fieldset>' +
    '<div class="fields"><label>' + t('Start time') + '<input type="time" name="start" required value="' + esc(schedule.start) + '"></label>' +
    '<label>' + t('End time') + '<input type="time" name="end" required value="' + esc(schedule.end) + '"></label></div>' +
    button(t('Save settings')) + '</form>');
}
function annualLeaveBalance(person, today, requests) {
  return calculateAnnualLeaveBalance(person, today, requests, state.leavePreferences);
}

function annualLeaveBalances() {
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const rows = state.staff.filter(person => person.status !== 'Removed').map(person => {
    const balance = annualLeaveBalance(person, state.today, state.requests);
    return ['<strong>' + esc(staffName(person)) + '</strong>',
      ...[balance?.start, balance?.end, balance?.opening, balance?.openingExpires,
        balance?.current, balance?.currentExpires, balance?.accrued]
        .map(value => '<bdi>' + esc(typeof value === 'number' ? number.format(value) : value ?? '—') + '</bdi>')];
  });
  return card(t('Annual leave balances'), table(['Staff member', 'Entitlement year start', 'Entitlement year end',
    'Year opening balance', 'Opening balance expiry date', 'Current year balance', 'Current year balance expiry date', 'Balance accrued to today'].map(t), rows, t('No staff members yet.')));
}

function leavePreferenceForm() {
  const preferences = state.leavePreferences ?? { availability: 'full', remaining: 'all', carryoverDays: 0 };
  const choice = (name, value, label, description) => '<label class="leave-policy-option"><span><input type="radio" name="' + name +
    '" value="' + value + '"' + (preferences[name] === value ? ' checked' : '') + ' required> ' + t(label) +
    '</span><small>' + t(description) + '</small></label>';
  return '<form id="leave-preferences-form">' + card(t('Balance availability'),
    choice('availability', 'full', 'Make the full balance available', 'The annual allowance is available in advance. Unearned leave used appears as a negative accrued balance.') +
    choice('availability', 'accrued', 'Accrued balance', 'Leave accrues monthly. Employees can only use their earned balance.')) +
    card(t('Remaining balance'),
    choice('remaining', 'reset', 'Reset the balance', 'Remaining balance cannot be carried into the next year.') +
    choice('remaining', 'all', 'Carry over the full balance', 'Carry all remaining current-year balance into the next contractual year.') +
    choice('remaining', 'partial', 'Carry over part of the balance', 'Carry remaining current-year balance up to the specified number of days.') +
    '<label id="leave-carryover-days"' + (preferences.remaining !== 'partial' ? ' hidden' : '') + '>' + t('Number of days') +
    '<input type="number" name="carryoverDays" min="0" max="99999" step="0.01" value="' + esc(preferences.carryoverDays ?? 0) +
    '"' + (preferences.remaining !== 'partial' ? ' disabled' : ' required') + '></label>') + button(t('Save settings')) + '</form>';
}
let leavePreferencesTab = 'types';
function leaveTypes() {
  const tabs = '<div class="schedule-tabs" role="group" aria-label="' + esc(t('Leaves')) + '">' +
    [['types', 'Available leave types'], ['settings', 'Leave settings']].map(([key, label]) =>
      '<button type="button" data-leave-preferences-tab="' + key + '" aria-pressed="' + (leavePreferencesTab === key) + '">' +
      esc(t(label)) + '</button>').join('') + '</div>';
  if (leavePreferencesTab === 'settings') return tabs + leavePreferenceForm();
  const rows = state.leaveTypes.filter(type => type !== 'Annual leave').map(type => {
    const { maxDays, active, description } = state.leaveSettings[type];
    return [
      '<strong>' + esc(t(type)) + '</strong>' + (description ? '<small>' + esc(t(description)) + '</small>' : ''),
      esc(maxDays ?? '—'),
      '<button type="button" role="switch" class="leave-switch" aria-label="' + esc(t(type)) +
        '" aria-checked="' + active + '" data-leave-status="' + esc(type) + '"><span></span></button>',
    ];
  });
  const types = table(['Leave type name', 'Maximum days', 'Status'].map(t), rows, '', 'leave-types-table');
  const addType = '<form id="leave-type-form"><label>' + t('Leave type name') + '<input name="name" required maxlength="60"></label>' +
    '<label>' + t('Maximum days') + '<input name="maxDays" type="number" min="0" step="1"></label>' +
    button(t('Add leave type')) + '</form>';
  return tabs + card(t('Available leave types'), types + addType);
}
let editingLocationId;
let locationMap;
let punchMethodsTab = 'methods';
let editingBranch;
const hasLocationCoordinates = site => Number.isFinite(site.latitude) && Number.isFinite(site.longitude);

function punchMethods() {
  const methods = ['Based on company location', ...(state.staff.some(person => person.status !== 'Removed' &&
    allowsAnywhere(state, person)) ? ['From anywhere'] : [])];
  const tabs = '<div class="schedule-tabs" role="group" aria-label="' + esc(t('Punch methods')) + '">' +
    [['methods', 'Attendance recording methods'], ['locations', 'Attendance recording locations']].map(([tab, label]) =>
      '<button type="button" data-punch-methods-tab="' + tab + '" aria-pressed="' + (punchMethodsTab === tab) + '">' +
      esc(t(label)) + (tab === 'methods' ? ' <span class="badge">' + new Intl.NumberFormat(language).format(methods.length) + '</span>' : '') +
      '</button>').join('') + '</div>';
  return tabs + (punchMethodsTab === 'methods'
    ? card(t('Attendance recording methods'), methods.map(method => '<span class="badge">' + esc(t(method)) + '</span>').join(' ')) + companyBranches({ showAttendanceStatus: true })
    : punchLocations());
}

function editLocationButton(site, attribute) {
  return '<button type="button" class="button secondary" ' + attribute + '="' + esc(site.id) +
    '" aria-label="' + esc(t('Edit') + ' — ' + site.name) + '" title="' + esc(t('Edit')) + '">✎</button>';
}

function companyBranches({ showAttendanceStatus = false } = {}) {
  const editing = state.locations.find(site => site.id === editingBranch);
  const rows = state.locations.map(site => [
    '<strong>' + esc(site.name) + '</strong>',
    ...(showAttendanceStatus ? [hasLocationCoordinates(site) ? '<span class="badge green">' + esc(t('Geofence enabled')) +
      '</span>' : '<span class="badge">' + esc(t('Geofence not configured')) + '</span>'] : []),
    '<div class="actions">' + editLocationButton(site, 'data-edit-branch') +
      '<button type="button" class="button secondary" data-remove-location="' + esc(site.id) + '" title="' + esc(t('Delete branch')) +
      '" aria-label="' + esc(t('Delete branch') + ' — ' + site.name) + '">×</button></div>',
  ]);
  return '<section class="card"><header class="location-toolbar"><h2>' + t('Company branches') + '</h2>' +
    '<button type="button" id="add-branch" class="button primary" aria-expanded="' + (editingBranch === '') + '">' +
    '<span aria-hidden="true">+</span> ' + t('New branch') + '</button></header>' +
    table(['Branch', ...(showAttendanceStatus ? ['Attendance method status'] : []), 'Action'].map(t), rows, t('No company branches yet.')) +
    (editingBranch !== undefined ? '<form id="branch-form"><label>' + t('Branch name') +
      '<input name="name" required maxlength="120" value="' + esc(editing?.name ?? '') + '"></label><div class="actions">' +
      button(t('Save branch')) + '<button type="button" id="close-branch" class="button secondary">' + t('Cancel') +
      '</button></div></form>' : '') + '</section>';
}

function punchLocations() {
  const editing = state.locations.find(site => site.id === editingLocationId);
  const staff = state.staff.filter(person => person.status !== 'Removed');
  const rows = state.locations.map(site => [
    '<strong>' + esc(site.name) + '</strong>',
    hasLocationCoordinates(site) ? '<bdi>' + esc(site.latitude + ', ' + site.longitude) + '</bdi>' : '—',
    esc(site.radius ?? '—'),
    editLocationButton(site, 'data-edit-location'),
  ]);
  const unconfigured = state.locations.filter(site => !hasLocationCoordinates(site));
  const addLocation = unconfigured.length
    ? '<form id="select-location-form"><label>' + t('Company branches') + '<select name="id" required>' +
      unconfigured.map(site => '<option value="' + esc(site.id) + '">' + esc(site.name) + '</option>').join('') +
      '</select></label>' + button(t('Add geographic location')) + '</form>'
    : state.locations.length ? '' : '<button type="button" class="button primary" id="add-branch-from-locations">' +
      t('Add geographic location') + '</button>';
  const methods = [['company', 'Based on company location'], ['anywhere', 'From anywhere']];
  const cards = '<div class="attendance-method-cards">' + methods.map(([method, label]) => {
    const assigned = staff.filter(person => method === 'anywhere' ? allowsAnywhere(state, person) : allowsCompanyLocation(person)).length;
    return '<section class="card"><header class="location-toolbar"><h2>' + t(label) + '</h2>' +
      '<button type="button" class="button secondary compact" data-edit-attendance-method="' + method +
      '" aria-haspopup="dialog">' + t('Edit') + ' ✎</button></header><small>' + t('Assigned employees') + ' · ' +
      new Intl.NumberFormat(language).format(assigned) + '</small></section>';
  }).join('') + '</div>';
  return cards + attendanceMethodDialog(staff) + '<section class="card"><h2>' + t('Geographic locations') + '</h2>' +
    table([t('Location'), t('Coordinates'), t('Radius (metres)'), t('Action')], rows, t('No company branches yet.'), 'location-table') +
    (editing ? '<form id="location-form"><h3>' + t(hasLocationCoordinates(editing) ? 'Edit geographic location' : 'Add geographic location') + '</h3>' +
      '<p class="hint">' + t('Select the workplace on the map and set the radius in metres.') + '</p>' +
      '<div id="location-map" dir="ltr" role="region" aria-label="' + t('Workplace map') + '"></div>' +
      '<p id="map-status" class="hint" role="status" hidden></p>' +
      '<p><strong>' + esc(editing?.name ?? '') + '</strong></p><div class="fields">' +
      '<label>' + t('Radius (metres)') + '<input name="radius" type="number" required min="10" max="5000" value="' + esc(editing?.radius ?? 100) + '"></label>' +
      '<label>' + t('Latitude') + '<input name="latitude" type="number" required min="-90" max="90" step="any" value="' + esc(editing?.latitude ?? '') + '"></label>' +
      '<label>' + t('Longitude') + '<input name="longitude" type="number" required min="-180" max="180" step="any" value="' + esc(editing?.longitude ?? '') + '"></label></div>' +
      '<div class="actions"><button type="button" id="use-location" class="button secondary">' + t('Use my current location') +
      '</button>' + button(t('Save location')) + '<button type="button" id="close-location" class="button secondary">' + t('Cancel') + '</button>' +
      '</div></form>' : addLocation) + '</section>';
}

let attendanceMethod;
let attendanceBranch;
function attendanceMethodDialog(staff) {
  if (!attendanceMethod) return '';
  const groups = [...state.locations.map(site => [site.id, site.name]), ['', t('Unassigned')]];
  const currentBranch = attendanceBranch ?? groups[0][0];
  const members = staff.filter(person => (person.branchId ?? '') === currentBranch);
  return '<dialog id="attendance-method-dialog" class="catalog-dialog"><header><h2>' +
    t(attendanceMethod === 'company' ? 'Based on company location' : 'From anywhere') +
    '</h2><button type="button" id="close-attendance-method" class="button secondary" aria-label="' + t('Close') +
    '">×</button></header><div class="attendance-method-branches" role="group" aria-label="' + t('Company branches') + '">' +
    groups.map(([id, name]) => '<button type="button" class="button secondary" data-attendance-branch="' + esc(id) +
      '" aria-pressed="' + (id === currentBranch) + '">' + esc(name) + '</button>').join('') +
    '</div><div class="attendance-method-members">' + members.map(person => {
      const assigned = attendanceMethod === 'anywhere' ? allowsAnywhere(state, person) : allowsCompanyLocation(person);
      return '<div><span><strong>' + esc(staffName(person)) + '</strong><small>' + esc(t(person.jobTitle ?? 'Unassigned')) +
        '</small></span><button type="button" class="button secondary compact" data-attendance-staff="' + esc(person.id) +
        '" data-attendance-enabled="' + !assigned + '" aria-label="' + esc(t(assigned ? 'Remove' : 'Add') + ' — ' + staffName(person)) +
        '">' + t(assigned ? 'Remove' : 'Add') + (assigned ? '' : ' +') + '</button></div>';
    }).join('') + (!members.length ? '<p class="hint">' + t('No staff members yet.') + '</p>' : '') + '</div></dialog>';
}

function mountLocationMap(form) {
  const L = window.L;
  const status = $('#map-status');
  function mapError() {
    status.textContent = t('Map unavailable. Enter coordinates or use your current location.');
    status.hidden = false;
  }
  if (!L) { mapError(); return; }
  const configured = state.locations.filter(hasLocationCoordinates);
  const recent = configured.find(site => site.id === editingLocationId) ?? configured.at(-1);
  const centre = recent ? [recent.latitude, recent.longitude] : [24.7136, 46.6753];
  const map = L.map($('#location-map'), { zoomControl: false }).setView(centre, recent ? 16 : 12);
  locationMap = map;
  L.control.zoom({ zoomInTitle: t('Zoom in'), zoomOutTitle: t('Zoom out') }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    referrerPolicy: 'strict-origin-when-cross-origin',
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).on('tileerror', mapError).on('tileload', () => { status.hidden = true; }).addTo(map);
  let pin, circle;
  const fields = form.elements;
  function draw(recenter = false) {
    const point = [fields.latitude.valueAsNumber, fields.longitude.valueAsNumber];
    const radius = fields.radius.valueAsNumber;
    if (!point.every(Number.isFinite) || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180 ||
        !Number.isInteger(radius) || radius < 10 || radius > 5000) {
      if (pin) { pin.remove(); circle.remove(); pin = circle = null; }
      return;
    }
    if (!pin) {
      pin = L.circleMarker(point, { radius: 6, color: '#fff', fillColor: '#bd342b', fillOpacity: 1, interactive: false }).addTo(map);
      circle = L.circle(point, { radius, color: '#195342', fillOpacity: 0.18, interactive: false }).addTo(map);
    }
    pin.setLatLng(point).bringToFront();
    circle.setLatLng(point).setRadius(radius);
    if (recenter || !map.getBounds().contains(point)) map.setView(point, Math.max(map.getZoom(), 16));
  }
  map.on('click', ({ latlng }) => {
    const point = latlng.wrap();
    fields.latitude.value = point.lat.toFixed(7);
    fields.longitude.value = point.lng.toFixed(7);
    draw();
  });
  form.addEventListener('input', () => draw());
  form.addEventListener('location-update', () => draw(true));
  draw();
}

function mobile() {
  const last = state.punches.findLast((entry) => entry.staffId === 'demo');
  const next = last?.kind === 'in' ? 'out' : 'in';
  return title(t('Staff view'), t('Sara Ahmed · Demo employee')) +
    '<section class="hero punch"><div><p class="eyebrow">' + esc(last?.site || t('Approved workplaces')) + '</p><h2>' +
    (last?.kind === 'in' ? t('You’re punched in') : t('Ready to punch in')) + '</h2><p>' +
    (last ? t('Last punch: ') + time(last.time) : t('Your location is checked when you punch.')) +
    '</p></div><button class="button primary" id="punch" data-kind="' + next + '">' + t(next === 'in' ? 'Punch in' : 'Punch out') + '</button></section>' +
    card(t('New request'), '<form id="request-form"><div class="fields"><label>' + t('Request type') + '<select name="type">' +
      [...state.leaveTypes.filter(type => state.leaveSettings[type].active), 'Missed punch', 'Attendance excuse'].map(type => '<option value="' + esc(type) + '">' + esc(t(type)) + '</option>').join('') + '</select></label>' +
      '<label>' + t('Start date') + '<input name="date" type="date" required value="' + esc(state.today) + '"></label><label id="end-date">' + t('End date') + '<input name="end" type="date" required value="' + esc(state.today) + '"></label></div>' +
      '<label>' + t('Reason') + '<textarea name="note" maxlength="1000" required></textarea></label>' + button(t('Submit request')) + '</form>') +
    card(t('My requests'), requestTable(state.requests.filter((item) => item.staffId === 'demo')));
}

const reportSections = {
  'reports/catalog': ['Report catalog', '▥'],
  'reports/issued': ['Issued report history', '▤'],
};
const reportTypes = {
  'reports/absence': ['Absence report', '⊘'],
  'reports/attendance': ['Attendance and clock-out report', '◷'],
  'reports/attendance-follow-up': ['Attendance follow-up report', '☷'],
};
function reportLinks(sections) {
  return '<div class="settings-grid">' + Object.entries(sections).map(([path, [label, icon]]) =>
      '<a class="settings-tile" href="#' + path + '"><span class="settings-icon" aria-hidden="true">' +
      icon + '</span><strong>' + t(label) + '</strong></a>').join('') + '</div>';
}
function reports() {
  return '<h1>' + t('Reports') + '</h1>' + reportLinks(reportSections);
}
function reportExportToolbar(periodButtonId) {
  const periodButton = periodButtonId ? '<button type="button" class="button secondary compact" id="' + periodButtonId +
    '"><span aria-hidden="true">▦</span> ' + t('Change reporting period') + '</button>' : '';
  return '<div class="actions report-export-toolbar">' + periodButton + '<details class="report-export"><summary class="button compact"><span aria-hidden="true">⤓</span> ' +
    t('Export') + '</summary><div class="report-export-options" role="group" aria-label="' + t('File format') + '">' +
    '<button type="button" data-report-format="xlsx"><strong>Excel</strong><bdi>.xlsx</bdi></button>' +
    '<button type="button" data-report-format="pdf"><strong>PDF</strong><bdi>.pdf</bdi></button></div></details></div>';
}
function attendanceFollowUp() {
  const start = state.today.slice(0, 7) + '-01';
  const monthEnd = new Date(start + 'T00:00:00Z');
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const end = monthEnd.toISOString().slice(0, 10);
  return '<div id="attendance-follow-up"></div>' +
    '<dialog id="follow-up-period-dialog" class="catalog-dialog" aria-labelledby="follow-up-period-title">' +
    '<header><h2 id="follow-up-period-title">' + t('Change reporting period') + '</h2></header>' +
    '<form><div class="fields"><label>' + t('Start date') + '<input type="date" name="start" required value="' + start +
    '"></label><label>' + t('End date') + '<input type="date" name="end" required value="' + end + '"></label></div>' +
    '<div class="actions">' + button(t('Apply')) + '<button type="button" class="button secondary" data-cancel-period>' +
    t('Cancel') + '</button></div></form></dialog>';
}
function mountAttendanceFollowUp(panel) {
  const dialog = $('#follow-up-period-dialog');
  const form = dialog.querySelector('form');
  const { start, end } = form.elements;
  const staffIds = new Set(state.staff.filter(person => person.status !== 'Removed').map(person => person.id));
  function showReport() {
    panel.innerHTML = reportExportToolbar('open-follow-up-period') +
      attendanceReportSummary(staffIds, Date.parse(start.value), Date.parse(end.value), true);
    $('#open-follow-up-period').onclick = () => dialog.showModal();
    mountReportExport(panel, 'attendance-follow-up', start.value, end.value);
  }
  bindReportPeriodCancel(dialog, [start, end], '[data-cancel-period]');
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopPropagation();
    if (!validateReportPeriod(form, start, end)) return;
    dialog.close();
    showReport();
    $('#open-follow-up-period').focus();
  });
  showReport();
}
function validateReportPeriod(form, start, end) {
  const days = (Date.parse(end.value) - Date.parse(start.value)) / 86400000;
  end.setCustomValidity(days < 0 || days >= 366 ? t('Choose an ordered date range of up to 366 days.') : '');
  return form.reportValidity();
}
function bindReportPeriodCancel(dialog, inputs, selector, afterCancel) {
  const form = dialog.querySelector('form');
  const { start, end } = form.elements;
  let applied = inputs.map(input => input.type === 'checkbox' ? input.checked : input.value);
  dialog.addEventListener('close', () => {
    applied = inputs.map(input => input.type === 'checkbox' ? input.checked : input.value);
  });
  function cancel() {
    inputs.forEach((input, index) => {
      if (input.type === 'checkbox') input.checked = applied[index];
      else input.value = applied[index];
    });
    end.setCustomValidity('');
    afterCancel?.();
    dialog.close();
  }
  for (const control of dialog.querySelectorAll(selector)) control.onclick = cancel;
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  for (const input of [start, end]) input.oninput = () => end.setCustomValidity('');
}
function mountReportExport(panel, type, start, end) {
  const menu = panel.querySelector('.report-export');
  const options = [...panel.querySelectorAll('[data-report-format]')];
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !menu.open) return;
    event.preventDefault();
    menu.open = false;
    menu.querySelector('summary').focus();
  });
  menu.addEventListener('focusout', event => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  });
  for (const option of options) {
    option.disabled = !panel.querySelector('tbody tr');
    option.onclick = () => {
      const rows = [...panel.querySelectorAll('thead tr:last-child, tbody tr')].map(row =>
        [...row.cells].map(cell => cell.textContent.trim()));
      const body = { type, start, end, language, format: option.dataset.reportFormat, rows };
      menu.open = false;
      menu.querySelector('summary').focus();
      for (const button of options) button.disabled = true;
      run(option, async () => {
        const result = await save('issued-reports', body);
        const issued = result.issuedReports[0];
        downloadReport({ ...body, title: issued.title });
        location.hash = 'reports/issued';
      }, 'Report added to issued history.').finally(() => {
        for (const button of options) button.disabled = false;
      });
    };
  }
}
document.addEventListener('click', event => {
  const menu = $('.report-export[open]');
  if (menu && !menu.contains(event.target)) menu.open = false;
});
function issuedReports() {
  const issuedAt = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh', calendar: 'gregory' });
  const rows = (state.issuedReports ?? []).map(report => [esc(report.title),
    esc(report.start + ' – ' + report.end), esc(issuedAt.format(Date.parse(report.createdAt))),
    report.format === 'csv' ? 'CSV' : report.format === 'xlsx' ? 'Excel' : 'PDF',
    '<button type="button" class="button secondary compact" data-download-report="' + esc(report.id) + '">' + t('Download') + '</button>']);
  return table(['Reports', 'Reporting period', 'Issued at', 'File format', 'Actions'].map(t), rows, t('No issued reports yet.'));
}
function mountIssuedReports() {
  for (const button of document.querySelectorAll('[data-download-report]')) {
    button.onclick = () => run(button, async () => {
      const response = await fetch(companyPrefix + '/api/issued-reports?id=' + encodeURIComponent(button.dataset.downloadReport));
      if (!response.ok) throw new Error('Report not found.');
      downloadReport(await response.json());
    });
  }
}
function attendanceReportDialog() {
  const employees = state.staff.filter(person => person.status !== 'Removed');
  const first = state.today.slice(0, 7) + '-01';
  const monthEnd = new Date(first + 'T00:00:00Z');
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const last = monthEnd.toISOString().slice(0, 10);
  return '<dialog id="attendance-report-dialog" class="catalog-dialog" aria-labelledby="attendance-report-title">' +
    '<header><h2 id="attendance-report-title">' + t('Create attendance report') + '</h2>' +
    '<button type="button" class="button secondary compact" data-close-attendance-report aria-label="' + t('Close') + '">×</button></header>' +
    '<form id="attendance-report-form"><fieldset><legend>' + t('Which employee?') + '</legend>' +
    '<details class="report-employee-picker"><summary>' + t('Choose employees') + '</summary>' +
    '<div class="report-employee-options"><label class="role-member"><input type="checkbox" name="allStaff"' +
    (employees.length ? ' checked' : ' disabled') + '>' + t('Everyone') + '</label>' +
    employees.map(person => '<label class="role-member"><input type="checkbox" name="staffId" value="' +
      esc(person.id) + '" checked>' + esc(staffName(person)) + '</label>').join('') +
    '</div></details></fieldset><fieldset><legend>' + t('Reporting period') + '</legend><div class="fields">' +
    '<label>' + t('Start date') + '<input type="date" name="start" required value="' + esc(first) + '"></label>' +
    '<label>' + t('End date') + '<input type="date" name="end" required value="' + esc(last) + '"></label></div></fieldset>' +
    '<div class="actions"><button class="button primary" type="submit" disabled>' + t('Apply') +
    '</button><button type="button" class="button secondary" data-close-attendance-report>' + t('Cancel') +
    '</button></div></form></dialog>';
}

function attendanceReportSummary(staffIds, first, last, followUp = false) {
  const dayMs = 86400000, minuteMs = 60000;
  const periods = new Map(state.workPeriods.map(period => [period.id, period]));
  const days = [];
  const end = followUp ? last : Math.min(last, Date.parse(state.today));
  for (let time = first; time <= end; time += dayMs) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  const now = Date.now();
  const dateLabel = new Intl.DateTimeFormat(language, { dateStyle: 'full', calendar: 'gregory', timeZone: 'UTC' });
  const hours = milliseconds => {
    const minutes = Math.floor(milliseconds / minuteMs);
    return '<bdi>' + Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + '</bdi>';
  };
  const rows = state.staff.filter(person => staffIds.has(person.id)).map(person => {
    const punches = state.punches.filter(entry => entry.staffId === person.id)
      .map(entry => ({ ...entry, timestamp: Date.parse(entry.time) })).sort((a, b) => a.timestamp - b.timestamp);
    const requests = state.requests.filter(item => item.staffId === person.id && item.status === 'Approved');
    const pairs = [];
    let arrival;
    for (const punch of punches) {
      if (punch.kind === 'in') arrival = punch;
      else if (punch.kind === 'out' && arrival) {
        if (punch.timestamp - arrival.timestamp <= dayMs &&
          (arrival.shiftStart == null || punch.shiftStart == null || arrival.shiftStart === punch.shiftStart)) {
          pairs.push([arrival, punch]);
        }
        arrival = undefined;
      }
    }
    let total = 0, late = 0, excusedLate = 0, early = 0, excusedEarly = 0;
    let absent = 0, missing = 0, onLeave = 0, workedDays = 0;
    const dailyStatuses = [];
    for (const day of days) {
      if (followUp && day > state.today) {
        const leave = requests.some(item => state.leaveTypes.includes(item.type) && item.date <= day && (item.end ?? item.date) >= day);
        const upcoming = (!person.joinDate || day >= person.joinDate) && effectivePeriodIds(state, person, day).length;
        dailyStatuses.push(leave ? 'On leave' : upcoming ? 'Upcoming' :
          isScheduleRestDay(state, person, day) ? 'Rest day' : 'Not scheduled');
        continue;
      }
      if (person.joinDate && day < person.joinDate) {
        if (followUp) dailyStatuses.push('Not scheduled');
        continue;
      }
      const midnight = Date.parse(day + 'T00:00:00+03:00');
      const scheduled = effectivePeriodIds(state, person, day).map(id => periods.get(id)).filter(Boolean).map(period => {
        const flexible = isFlexiblePeriod(period);
        const { start, end } = periodBounds(period, day);
        return { period, flexible, start, end };
      });
      const leave = requests.some(item => state.leaveTypes.includes(item.type) && item.date <= day && (item.end ?? item.date) >= day);
      if (leave) onLeave++;
      const starts = new Set(scheduled.map(shift => shift.start));
      const daily = punches.filter(entry => entry.shiftStart == null ? entry.date === day : starts.has(entry.shiftStart));
      const dayPairs = pairs.filter(([entry]) => entry.shiftStart == null ? entry.date === day : starts.has(entry.shiftStart));
      for (const [entry, exit] of dayPairs) {
        total += Math.max(0, Math.min(exit.timestamp, entry.shiftEnd ?? Infinity) - entry.timestamp);
      }
      if (leave) {
        if (followUp) dailyStatuses.push('On leave');
        continue;
      }
      let missedArrivals = 0, missedPunches = 0, completeShifts = 0, shortFlexible = false;
      for (const { period, flexible, start, end } of scheduled) {
        const records = daily.filter(entry => entry.shiftStart === start || (entry.shiftStart == null &&
          (scheduled.length === 1 || (entry.kind === 'in' ?
            entry.timestamp >= start - (period.arrival?.before ?? 60) * minuteMs && entry.timestamp <= start + (period.arrival?.after ?? 60) * minuteMs :
            entry.timestamp >= end - (period.departure?.before ?? 60) * minuteMs && entry.timestamp <= end + (period.departure?.after ?? 60) * minuteMs))));
        const clockIn = records.find(entry => entry.kind === 'in');
        const clockOut = records.findLast(entry => entry.kind === 'out');
        if (!clockIn && now > (flexible ? end - 1 : start + (period.arrival?.after ?? 60) * minuteMs)) { missedPunches++; missedArrivals++; }
        if ((!clockOut || records.at(-1)?.kind === 'in') && now > (flexible ? end - 1 : end + (period.departure?.after ?? 60) * minuteMs)) missedPunches++;
        const closed = clockIn && clockOut && clockOut.timestamp >= clockIn.timestamp && records.at(-1)?.kind === 'out';
        const workedMilliseconds = dayPairs.filter(([entry]) => records.includes(entry)).reduce((total, [entry, exit]) =>
          total + Math.max(0, Math.min(exit.timestamp, end, entry.shiftEnd ?? Infinity) - Math.max(entry.timestamp, start)), 0);
        const enough = !flexible || !period.duration || workedMilliseconds >= period.duration * minuteMs;
        if (closed && enough) completeShifts++;
        if (flexible && closed && !enough && now > end) shortFlexible = true;
        if (flexible) continue;
        const lateBy = clockIn ? Math.max(0, clockIn.timestamp - start) : 0;
        const earlyBy = clockOut ? Math.max(0, end - clockOut.timestamp) : 0;
        const excuse = type => requests.some(item => item.type === 'Attendance excuse' && item.date === day && item.excuseType === type);
        if (excuse('Late arrival')) excusedLate += lateBy; else late += lateBy;
        if (excuse('Early departure')) excusedEarly += earlyBy; else early += earlyBy;
      }
      const unmatched = daily.length > dayPairs.length * 2;
      if (missedPunches || (day < state.today && unmatched && !scheduled.length)) missing++;
      const worked = dayPairs.some(([entry, exit]) => exit.timestamp > entry.timestamp);
      if (worked && !unmatched && completeShifts === scheduled.length) workedDays++;
      const isAbsent = scheduled.length > 0 && missedArrivals === scheduled.length && !daily.length;
      if (isAbsent) absent++;
      if (followUp) {
        const workday = !isScheduleRestDay(state, person, day);
        const started = scheduled.some(shift => now >= shift.start) || daily.length > 0;
        dailyStatuses.push(isAbsent ? 'Absence' : missedPunches ? 'Incomplete record' : shortFlexible ? 'Hours shortfall' :
          scheduled.length ? (completeShifts === scheduled.length && !unmatched ? 'Present' :
            day === state.today && started ? 'In progress' : 'Scheduled') :
          unmatched ? (day === state.today ? 'In progress' : 'Incomplete record') :
            worked ? 'Present' : workday ? 'Not scheduled' : 'Rest day');
      }
    }
    if (followUp) return [esc(person.employeeNumber ?? '—'), esc(staffName(person)),
      ...dailyStatuses.map(status => '<span class="' + (['Absence', 'Incomplete record', 'Hours shortfall'].includes(status) ? 'attendance-follow-up-issue' : '') + '">' + t(status) + '</span>')];
    return [esc(person.employeeNumber ?? '—'), esc(staffName(person)), hours(total),
      hours(late), hours(excusedLate), hours(early), hours(excusedEarly), absent, missing, onLeave, workedDays];
  });
  if (followUp) return table([t('Employee number'), t('Staff member'), ...days.map(day => esc(dateLabel.format(Date.parse(day))))],
    days.length ? rows : [], t('No attendance records in this period.'), 'attendance-follow-up-table',
    [['Basic details', 2], ['Daily attendance', days.length]]);
  return table(['Employee number', 'Staff member', 'Total work hours', 'Unexcused late arrival',
    'Excused late arrival', 'Unexcused early departure', 'Excused early departure',
    'Absent days', 'Days with missing punches', 'Approved leave days', 'Days worked'].map(t),
  days.length ? rows : [], t('No attendance records in this period.'), 'attendance-summary-table',
  [['Basic details', 2], ['Attendance summary columns', 9]]);
}

function mountAttendanceReport(dialog) {
  const form = dialog.querySelector('form');
  const { allStaff, start, end } = form.elements;
  const employees = [...form.querySelectorAll('[name="staffId"]')];
  const create = form.querySelector('[type="submit"]');
  const summary = form.querySelector('summary');
  const result = $('#attendance-report-result');
  function showReport() {
    const staffIds = new Set(new FormData(form).getAll('staffId'));
    result.innerHTML = reportExportToolbar('open-attendance-report') +
      attendanceReportSummary(staffIds, Date.parse(start.value), Date.parse(end.value));
    $('#open-attendance-report').onclick = () => dialog.showModal();
    mountReportExport(result, 'attendance-summary', start.value, end.value);
  }
  function updateSelection() {
    const count = employees.filter(input => input.checked).length;
    allStaff.checked = count > 0 && count === employees.length;
    allStaff.indeterminate = count > 0 && count < employees.length;
    create.disabled = count === 0;
    summary.textContent = allStaff.checked ? t('Everyone') : count ? t('{count} employees selected').replace('{count}', new Intl.NumberFormat(language).format(count)) : t('Choose employees');
  }
  allStaff.onchange = () => {
    for (const employee of employees) employee.checked = allStaff.checked;
    updateSelection();
  };
  for (const employee of employees) employee.onchange = updateSelection;
  bindReportPeriodCancel(dialog, [start, end, ...employees], '[data-close-attendance-report]', updateSelection);
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopPropagation();
    const staffIds = new Set(new FormData(form).getAll('staffId'));
    if (!staffIds.size || !validateReportPeriod(form, start, end)) return;
    dialog.close();
    showReport();
    $('#open-attendance-report').focus();
  });
  updateSelection();
  showReport();
}

function absenceReportDialog() {
  const employees = state.staff.filter(person => person.status !== 'Removed');
  return '<dialog id="absence-report-dialog" class="catalog-dialog report-dialog" aria-labelledby="absence-report-title">' +
    '<header><h2 id="absence-report-title">' + t('Absence report') + '</h2>' +
    '<button type="button" class="button secondary compact" data-close-absence-report aria-label="' + t('Close') + '">×</button></header>' +
    '<form id="absence-report-form"><label>' + t('Which employee?') +
    '<select name="staffId" required><option value="all" selected>' + t('Everyone') + '</option>' +
    employees.map(person => '<option value="' + esc(person.id) + '">' + esc(staffName(person)) + '</option>').join('') +
    '</select></label><fieldset><legend>' + t('Reporting period') + '</legend><div class="fields">' +
    '<label>' + t('Start date') + '<input type="date" name="start" required max="' + esc(state.today) +
    '" value="' + esc(state.today.slice(0, 7) + '-01') + '"></label>' +
    '<label>' + t('End date') + '<input type="date" name="end" required max="' + esc(state.today) +
    '" value="' + esc(state.today) + '"></label></div></fieldset>' +
    '<div class="actions"><button class="button primary" type="submit">' + t('Apply') +
    '</button><button type="button" class="button secondary" data-close-absence-report>' + t('Cancel') +
    '</button></div></form></dialog>';
}

function mountAbsenceReport(dialog) {
  const form = dialog.querySelector('form');
  const { staffId, start, end } = form.elements;
  const result = $('#absence-report-result');
  bindReportPeriodCancel(dialog, [start, end, staffId], '[data-close-absence-report]');
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopPropagation();
    if (!validateReportPeriod(form, start, end)) return;
    dialog.close();
    showReport();
    $('#open-absence-report').focus();
  });
  function showReport() {
    const dayMilliseconds = 86400000;
    const first = Date.parse(start.value);
    const last = Date.parse(end.value);
    const people = state.staff.filter(person => person.status !== 'Removed' && (staffId.value === 'all' || person.id === staffId.value));
    const periods = new Map(state.workPeriods.map(period => [period.id, period]));
    const now = Date.now();
    const number = new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dateLabel = new Intl.DateTimeFormat(language, { dateStyle: 'medium', calendar: 'gregory', timeZone: 'UTC' });
    const summaries = people.map(person => {
      const arrivals = state.punches.filter(entry => entry.staffId === person.id && entry.kind === 'in');
      const leaves = state.requests.filter(item => item.staffId === person.id && item.status === 'Approved' && state.leaveTypes.includes(item.type));
      let absent = 0, leave = 0, working = 0, latest;
      for (let time = first; time <= last; time += dayMilliseconds) {
        const day = new Date(time).toISOString().slice(0, 10);
        const scheduled = effectivePeriodIds(state, person, day).map(id => periods.get(id)).filter(Boolean);
        if (!scheduled.length) continue;
        working++;
        if (leaves.some(item => item.date <= day && (item.end ?? item.date) >= day)) {
          leave++;
          continue;
        }
        const midnight = Date.parse(day + 'T00:00:00+03:00');
        const starts = new Set(scheduled.map(period => periodBounds(period, day).start));
        if (arrivals.some(entry => entry.shiftStart == null ? entry.date === day : starts.has(entry.shiftStart))) continue;
        const lastArrival = Math.max(...scheduled.map(period => isFlexiblePeriod(period) ? periodBounds(period, day).end - 1 :
          Date.parse(day + 'T' + period.start + ':00+03:00') + (period.arrival?.after ?? 60) * 60000));
        if (now <= lastArrival) continue;
        absent++;
        latest = time;
      }
      return { person, absent, leave, working, latest };
    });
    const rows = summaries.sort((a, b) => b.absent - a.absent).map(({ person, absent, leave, working, latest }) => {
      const manager = state.staff.find(item => item.id === person.managerId);
      return [esc(person.employeeNumber ?? '—'), esc(staffName(person)), esc(person.department ?? '—'),
        esc(manager ? staffName(manager) : '—'), absent, leave,
        working ? '<bdi>' + number.format(absent / working * 100) + '</bdi>' : '—',
        working, latest === undefined ? '—' : esc(dateLabel.format(latest))];
    });
    result.innerHTML = reportExportToolbar('open-absence-report') + table(['Employee number', 'Staff member', 'Department', 'Direct manager', 'Absent days',
      'Approved leave days', 'Absence rate (%)', 'Total working days', 'Last absence date'].map(t), rows,
    t('No staff members yet.'), 'absence-summary-table', [['Basic details', 2], ['Employment information', 2], ['Report columns', 5]]);
    mountReportExport(result, 'attendance-performance', start.value, end.value);
    $('#open-absence-report').onclick = () => dialog.showModal();
  }
  showReport();
}
const documentDaysRemaining = document => (Date.parse(document.expiresOn) - Date.parse(state.today)) / 86400000;
const expiredDocumentCount = () => (state.documents ?? []).filter(document => documentDaysRemaining(document) < 0).length;
function documents() {
  const rows = (state.documents ?? []).map(document => {
    const days = documentDaysRemaining(document);
    const alert = !document.expiresOn ? 'Expiry date not set' : days < 0 ? 'Document expired' :
      days <= 30 ? 'Document expires soon' : 'Document valid';
    return ['<a href="' + companyPrefix + '/api/documents?id=' + esc(encodeURIComponent(document.id)) + '">' + esc(document.name) + '</a>',
      '<form class="document-expiry-form" data-document-id="' + esc(document.id) + '"><input name="expiresOn" type="date" aria-label="' +
      t('Document expiry date') + '" value="' + esc(document.expiresOn) + '"><button type="submit" class="button secondary compact">' +
      t('Save') + '</button></form>',
      '<span class="badge ' + (days < 0 ? 'red' : days <= 30 ? 'amber' : '') + '">' + t(alert) + '</span>'];
  });
  return '<h1>' + t('Documents') + '</h1><button type="button" class="button primary" id="open-document-upload">' + t('Upload document') +
    '</button><section class="card document-wallet">' + table(['Document name', 'Document expiry date', 'Reminder status'].map(t), rows,
      t('No documents uploaded yet.'), 'document-wallet-table') + '</section>' +
    '<dialog class="catalog-dialog" id="document-upload-dialog" aria-labelledby="document-upload-title">' +
    '<header><h2 id="document-upload-title">' + t('Upload document') + '</h2><button type="button" id="close-document-upload" class="button secondary compact" aria-label="' +
    t('Close') + '">×</button></header><form id="document-upload-form"><label>' + t('Document file') +
    '<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg" required></label><label>' + t('Document expiry date') +
    '<input type="date" name="expiresOn"></label><p class="hint">' + t('PDF, PNG or JPEG up to 2 MB.') + '</p>' +
    button(t('Upload document')) + '</form></dialog>';
}
function payroll() { return payrollMarkup({ state, language, esc, t }); }
const views = { payroll, account: accountPage, home, requests, staff, 'staff-profile': staffProfile, attendance, leaves, reports, documents, settings, mobile };
function partnersPage() {
  return '<h1>' + t('Partners') + '</h1><section class="card partners-card">' +
    '<div class="catalog-toolbar"><button type="button" class="button primary compact" data-create-catalog="partner">+ ' +
    t('Add company') + '</button></div>' +
    table(['Company name', 'Authorized contact', 'Email', 'Contact number', 'Status', 'Action', 'Actions'].map(t), state.partners.map(partner => [
      '<strong>' + esc(partner.name) + '</strong>', esc(partner.contactName || '—'),
      '<bdi>' + esc(partner.email) + '</bdi>', '<bdi>' + esc(partner.phone) + '</bdi>',
      badge(partner.suspended ? 'Suspended' : partner.active ? 'Active' : 'Pending activation'),
      '<button type="button" role="switch" class="leave-switch" aria-label="' +
        esc(t('Company access') + ' — ' + partner.name) + '" aria-checked="' + !partner.suspended +
        '" data-partner-status="' + esc(partner.id) + '"><span></span></button>',
      '<div class="activation-actions">' + (partner.id === 'xyz-demo' ? '' :
        '<button type="button" class="button secondary compact" data-edit-partner="' + esc(partner.id) +
        '" aria-haspopup="dialog" aria-label="' + t('Edit company') + '" title="' + t('Edit company') + '">✎</button>') +
      '<button type="button" class="button secondary compact" data-remove-partner="' +
        esc(partner.id) + '">' + t('Delete company') + '</button>' +
      (!partner.active && !partner.suspended ? '<button type="button" class="button secondary compact" data-partner-link="' +
        esc(partner.id) + '">' + t('Copy activation link') + '</button>' : '') + '</div>',
    ]), t('No companies yet.'), 'partners-table') + '</section>' +
    '<dialog id="create-partner" class="catalog-dialog" aria-labelledby="partner-dialog-title"><header><h2 id="partner-dialog-title">' +
    t('Add company') + '</h2><button type="button" class="button secondary compact" data-close-catalog aria-label="' +
    t('Close') + '">×</button></header><form id="partner-form">' +
    '<label>' + t('Company name') + '<input name="name" maxlength="120" required></label>' +
    '<label>' + t('Authorized contact') + '<input name="contactName" maxlength="120" autocomplete="name" required></label>' +
    '<label>' + t('Email') + '<input name="email" type="email" maxlength="254" required></label>' +
    '<label>' + t('Contact number') + '<input name="phone" type="tel" maxlength="40" required></label>' +
    '<fieldset id="partner-password-fields" hidden disabled><legend>' + t('Set a new company password') + '</legend>' +
    '<p class="hint">' + t('The current password cannot be displayed. Leave blank to keep it unchanged. Changing it signs the company account out.') + '</p>' +
    '<label>' + t('New password') + '<input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password"></label>' +
    '<label>' + t('Confirm password') + '<input name="confirmation" type="password" minlength="10" maxlength="128" autocomplete="new-password"></label>' +
    '<button type="button" class="button secondary compact" id="toggle-partner-password" aria-pressed="false">' + t('Show password') + '</button></fieldset>' +
    button(t('Add company')) + '</form></dialog>';
}
const route = () => {
  const hash = location.hash.slice(1);
  if (superAdmin) return Object.hasOwn(superAdminPages, hash) || hash === 'settings/organization' ? hash : 'home';
  if (/^payroll\/\d{4}-(0[1-9]|1[0-2])$/.test(hash)) return 'payroll';
  if (hash === 'account' || hash === 'account/password') return 'account';
  if (/^staff\/[^/]+\/(overview|attendance|leaves|personal)$/.test(hash)) return 'staff-profile';
  return Object.hasOwn(views, hash) || Object.hasOwn(settingsSections, hash) ||
    Object.hasOwn(reportSections, hash) || Object.hasOwn(reportTypes, hash) ? hash : 'home';
};
function applyLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = t('dawamkom');
  $('#brand-name').textContent = t('dawamkom');
  $('#demo-label').textContent = t('Local demo');
  $('#nav').setAttribute('aria-label', t('Main navigation'));
  $('#language').textContent = language === 'ar' ? 'English' : 'العربية';
  $('#language').lang = language === 'ar' ? 'en' : 'ar';
}
function render() {
  staffActivationObserver?.disconnect();
  locationMap?.remove();
  locationMap = null;
  if (companyPrefix && (state.canManageCompany || !state.isCompanyOwner) && isMobileDevice()) {
    location.replace(companyPrefix + '/employee');
    return;
  }
  const page = route();
  const logout = $('#logout-form');
  logout.hidden = !(superAdmin || state.admin);
  if (superAdmin) $('.management-topbar-actions').append(logout);
  logout.action = companyPrefix ? companyPrefix + '/logout' : '/admin/logout';
  $('#management-notifications').hidden = superAdmin;
  if (!superAdmin) {
    drawManagementAlerts();
    void refreshManagementAlerts();
  }
  $('#logout-button').textContent = t('Sign out');
  $('#account-profile-link').textContent = t('View personal profile') + ' ♙';
  $('#account-password-link').textContent = t('Change password') + ' ⚿';
  if (!accountIdentity) void loadAccountIdentity();
  else $('#account-name').textContent = accountDisplayName();
  const logo = state.organization?.logo;
  const workspaceIcon = $('.workspace-icon');
  workspaceIcon.style.backgroundColor = '';
  workspaceIcon.classList.toggle('has-logo', Boolean(logo));
  if (logo) {
    const image = document.createElement('img');
    image.className = 'workspace-logo';
    image.alt = '';
    image.addEventListener('load', () => {
      if (image.isConnected) matchLogoPreviewBackground(image);
    }, { once: true });
    workspaceIcon.replaceChildren(image);
    image.src = logo;
  } else {
    workspaceIcon.textContent = '▦';
  }
  if (superAdmin) {
    const organization = page === 'settings/organization';
    const navPage = organization ? 'settings' : page;
    $('#company').textContent = 'Super Admin';
    $('#crumb').textContent = t(organization ? 'Organization information' : superAdminPages[page][0]);
    $('#nav').innerHTML = Object.entries(superAdminPages).map(([key, [label, icon]]) =>
      '<a href="#' + key + '"' + (navPage === key ? ' aria-current="page"' : '') +
      '><span aria-hidden="true">' + icon + '</span>' + t(label) + '</a>').join('');
    $('#main').innerHTML = organization ? '<a class="settings-back" href="#settings">' + t('Back to Settings') +
      '</a><h1>' + t('Organization information') + '</h1>' + organizationSettings() :
      page === 'settings' ? settings() : page === 'partners' ? partnersPage() :
      card(t('Overview'), '<a href="#partners">' + t('Partners') + '</a>');
    $('#main').setAttribute('aria-busy', 'false');
    return;
  }
  const section = settingsSections[page];
  const reportSection = reportSections[page] ?? reportTypes[page];
  const followUp = page === 'reports/attendance-follow-up';
  const navPage = section ? 'settings' : reportSection ? 'reports' : page === 'staff-profile' ? 'staff' : page;
  $('#company').textContent = state.company;
  $('#crumb').textContent = t((section ?? reportSection ?? (page === 'account' ? ['Personal profile'] : pages[page === 'staff-profile' ? 'staff' : page]))[0]);
  const expired = expiredDocumentCount();
  const expiredLabel = new Intl.NumberFormat(language).format(expired);
  const documentAlert = expired ? '<span class="nav-document-alert" role="img" aria-label="' +
    esc(t('Expired documents') + ': ' + expiredLabel) + '">' + expiredLabel + '</span>' : '';
  $('#nav').innerHTML = Object.entries(pages).filter(([key]) => key !== 'mobile').map(([key, [name, icon]]) =>
    '<a href="#' + key + '"' + (navPage === key ? ' aria-current="page"' : '') + '><span aria-hidden="true">' +
    icon + '</span>' + t(name) + (key === 'documents' ? documentAlert : '') + '</a>').join('');
  $('#main').innerHTML = section
    ? '<a class="settings-back" href="#settings">' + t('Back to Settings') + '</a><h1>' +
      t(page === 'settings/work-schedule' ? 'Work schedules' : section[0]) + '</h1>' + section[3]()
    : reportSection ? '<a class="settings-back" href="#' + (reportTypes[page] ? 'reports/catalog' : 'reports') + '">' +
      t('Back to Reports') + '</a><h1>' + t(reportSection[0]) + '</h1>' +
      (page === 'reports/catalog' ? reportLinks(reportTypes) : followUp ? attendanceFollowUp() : page === 'reports/attendance' ?
        '<div id="attendance-report-result"></div>' + attendanceReportDialog() : page === 'reports/absence' ?
        '<div id="absence-report-result"></div>' + absenceReportDialog() : page === 'reports/issued' ? issuedReports() : '') : views[page]();
  if (page === 'payroll') mountPayroll({ state, language, esc, t, save, say, companyPrefix, downloadReport });
  const attendanceReport = $('#attendance-report-dialog');
  if (attendanceReport) mountAttendanceReport(attendanceReport);
  if (followUp) {
    const panel = $('#attendance-follow-up');
    mountAttendanceFollowUp(panel);
  }
  if (page === 'reports/issued') mountIssuedReports();
  const documentDialog = $('#document-upload-dialog');
  if (documentDialog) {
    $('#open-document-upload').onclick = () => documentDialog.showModal();
    $('#close-document-upload').onclick = () => documentDialog.close();
  }
  const absenceReport = $('#absence-report-dialog');
  if (absenceReport) mountAbsenceReport(absenceReport);
  if (page === 'requests') {
    const panel = $('#manager-device-requests');
    panel.requestMarkup = requestInbox(requestManagerSession);
    refreshRequestInbox(panel);
  }
  if ($('#location-form')) mountLocationMap($('#location-form'));
  const attendanceDialog = $('#attendance-method-dialog');
  if (attendanceDialog) {
    attendanceDialog.addEventListener('cancel', event => {
      event.preventDefault();
      attendanceMethod = undefined;
      render();
    });
    attendanceDialog.showModal();
  }
  const assignmentDialog = $('#schedule-assignment-dialog');
  if (assignmentDialog) {
    assignmentDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeScheduleAssignment();
    });
    assignmentDialog.showModal();
  }
  const period = $('#period-dialog');
  const roleDialog = $('#role-dialog');
  if (roleDialog) {
    roleDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeRoleDialog();
    });
    roleDialog.querySelector('[data-cancel-role]').onclick = closeRoleDialog;
    const search = roleDialog.querySelector('#branch-role-search');
    if (search) search.oninput = () => {
      const query = search.value.trim().toLocaleLowerCase();
      for (const person of roleDialog.querySelectorAll('.branch-role-person')) person.hidden = !person.textContent.toLocaleLowerCase().includes(query);
    };
    roleDialog.showModal();
  }
  for (const group of document.querySelectorAll('[data-staff-branch]')) {
    group.addEventListener('toggle', () => {
      if (group.open) openStaffBranches.add(group.dataset.staffBranch);
      else openStaffBranches.delete(group.dataset.staffBranch);
    });
  }
  const activationLayouts = [];
  for (const wrap of document.querySelectorAll('.staff-directory .table-wrap')) {
    const buttons = [...wrap.querySelectorAll('[data-staff-link]')];
    if (!buttons.length) continue;
    const layout = document.createElement('div');
    layout.className = 'staff-table-layout';
    wrap.before(layout);
    layout.append(wrap);
    const rail = document.createElement('div');
    rail.className = 'staff-activation-rail';
    layout.append(rail);
    const entries = buttons.map(button => {
      const row = button.closest('tr');
      button.setAttribute('aria-label', t('Copy activation link') + ' · ' + row.querySelector('.staff-profile-name').textContent);
      rail.append(button);
      return { button, row };
    });
    activationLayouts.push({ layout, entries });
  }
  const alignActivationButtons = () => {
    for (const { layout, entries } of activationLayouts) {
      const top = layout.getBoundingClientRect().top;
      for (const { button, row } of entries) {
        const bounds = row.getBoundingClientRect();
        button.style.top = (bounds.top - top + bounds.height / 2) + 'px';
      }
    }
  };
  if (activationLayouts.length) {
    staffActivationObserver = new ResizeObserver(alignActivationButtons);
    for (const { layout } of activationLayouts) {
      staffActivationObserver.observe(layout);
      staffActivationObserver.observe(layout.querySelector('table'));
    }
    requestAnimationFrame(alignActivationButtons);
  }
  const staffDialog = $('#staff-dialog');
  if (staffDialog) {
    if (editingStaff) {
      const form = $('#staff-form');
      const person = editingStaff;
      const values = { ...person, nameAr: person.nameAr || person.name, nameEn: person.nameEn || person.name,
        birthDateHijri: person.birthDate ? hijriBirthDate(Date.parse(person.birthDate)) : '',
        salary: person.salary?.monthlyBase, allowances: person.salary?.monthlyAllowances,
        probation: person.probationDays, annualLeave: person.annualLeaveDays };
      for (const field of form.elements) {
        if (!field.name || field.name === 'defaultPeriodId') continue;
        field.value = values[field.name] ?? '';
        if (!field.value) field.required = false;
      }
      for (const name of ['contractTerm', 'contractType']) {
        form.elements[name].dispatchEvent(new Event('change', { bubbles: true }));
      }
      updateSalaryTotal(form);
      form.initialValues = new FormData(form);
    } else {
      const { nameAr, nameEn, gender } = $('#staff-form').elements;
      const suggest = () => {
        gender.value = suggestStaffGender(nameAr.value) || suggestStaffGender(nameEn.value);
      };
      nameAr.addEventListener('change', suggest);
      nameEn.addEventListener('change', suggest);
      gender.addEventListener('change', () => {
        nameAr.removeEventListener('change', suggest);
        nameEn.removeEventListener('change', suggest);
      });
    }
    updateSalaryTotal($('#staff-form'));
    staffDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeStaffDialog();
    });
    staffDialog.showModal();
  }
  if (period) {
    const form = $('#period-form');
    updatePeriodPreview(form);
    const pickers = form.querySelectorAll('.period-time-picker');
    for (const picker of pickers) {
      picker.addEventListener('toggle', () => {
        if (!picker.open) return;
        for (const other of pickers) if (other !== picker) other.open = false;
        for (const wheel of picker.querySelectorAll('.period-time-wheel')) {
          const selected = wheel.querySelector('[aria-pressed="true"]');
          wheel.scrollTop += selected.getBoundingClientRect().top - wheel.getBoundingClientRect().top;
        }
      });
    }
    period.addEventListener('click', event => {
      for (const picker of pickers) if (!picker.contains(event.target)) picker.open = false;
      const picker = event.target.closest('.period-time-picker');
      if (!picker) return;
      if (event.target.closest('[data-close-time-picker]')) {
        picker.open = false;
        picker.querySelector('summary').focus();
      }
      const option = event.target.closest('[data-time-part]');
      if (!option) return;
      const field = picker.querySelector('input');
      const parts = periodTimeParts(field.value);
      parts[option.dataset.timePart] = Number(option.dataset.timeValue);
      const hour = state.timeFormat === '24' ? parts.hour : parts.hour % 12 + parts.half * 12;
      field.value = twoTimeDigits(hour) + ':' + twoTimeDigits(parts.minute);
      picker.querySelector('.period-time-value').textContent = periodTimeLabel(parts);
      picker.querySelector('[data-time-part="' + option.dataset.timePart + '"][aria-pressed="true"]').setAttribute('aria-pressed', 'false');
      option.setAttribute('aria-pressed', 'true');
      updatePeriodPreview(form);
    });
    period.addEventListener('cancel', event => {
      event.preventDefault();
      const opened = form.querySelector('.period-time-picker[open]');
      if (opened) {
        opened.open = false;
        opened.querySelector('summary').focus();
        return;
      }
      addingPeriod = false;
      render();
      $('#add-period')?.focus();
    });
    period.showModal();
  }
  $('#main').setAttribute('aria-busy', 'false');
  mountSetupGuide({ state, superAdmin, language, save });
}
function locate() {
  if (!navigator.geolocation) return Promise.reject(new Error('Location is unavailable in this browser.'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
    ({ code }) => reject(new Error(code === 1 ? 'Allow location access and try again.' : 'Could not get your location. Try again.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  ));
}
async function run(control, action, success, onError = error => say(error.message, true)) {
  control.disabled = true;
  try { await action(); if (success) say(success); }
  catch (error) { onError(error); }
  finally { control.disabled = false; }
}

applyLanguage();
$('#language').onclick = () => {
  const form = $('#location-form') || $('#main form');
  const draft = form ? new FormData(form) : null;
  language = language === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem('dawamak-language', language); } catch { /* Storage can be disabled. */ }
  applyLanguage();
  if (!state) return;
  render();
  const replacement = form && document.getElementById(form.id);
  if (draft && replacement) {
    for (const field of replacement.elements) {
      if (field.type === 'checkbox') field.checked = draft.getAll(field.name).includes(field.value);
      else if (draft.has(field.name)) field.value = draft.get(field.name);
    }
    replacement.dispatchEvent(new Event('location-update'));
    replacement.elements.namedItem('type')?.dispatchEvent(new Event('change', { bubbles: true }));
  }
};
window.addEventListener('hashchange', () => {
  if (!state) return;
  selectedScheduleCell = undefined;
  if (route() === 'requests') requestStatus = 'Pending';
  render();
});
function refreshVisibleRequests() {
  const panel = $('#manager-device-requests');
  if (panel && !document.hidden && !panel.querySelector('.request-row-actions button:disabled')) refreshRequestInbox(panel);
}
window.setInterval(refreshVisibleRequests, 5000);
window.setInterval(refreshManagementAlerts, 30000);
$('#management-notifications').onclick = async () => {
  drawManagementAlerts();
  if ($('#management-notification-dialog').hidden) showManagementPopup();
  else closeManagementPopup();
  await refreshManagementAlerts();
};
$('#close-management-notifications').onclick = closeManagementPopup;
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeManagementPopup(); });
document.addEventListener('click', event => { if (!event.target.closest('#management-notification-dialog, #management-notifications')) closeManagementPopup(); });
$('#close-request-rejection').onclick = () => $('#request-rejection-dialog').close();
$('#request-rejection-form').onsubmit = event => {
  event.preventDefault();
  const target = rejectionTarget;
  if (!target) return;
  const rejectionNote = new FormData(event.target).get('rejectionNote');
  run(event.submitter, async () => {
    if (target.deviceStaff) {
      const response = await fetch(companyPrefix + '/api/employee/device-approval', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: target.deviceStaff, requestId: target.deviceRequest, decision: 'reject', rejectionNote }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const panel = $('#manager-device-requests');
      if (panel) await refreshRequestInbox(panel);
    } else {
      await save('decision', { id: target.id, status: 'Declined', rejectionNote });
    }
    $('#request-rejection-dialog').close();
    void refreshManagementAlerts();
  }, 'Decision saved.', error => { $('#request-rejection-error').textContent = t(error.message); });
};
$('#management-notification-list').onclick = event => {
  if (!event.target.closest('a')) return;
  requestStatus = 'Pending';
  closeManagementPopup();
  render();
};
document.addEventListener('visibilitychange', refreshVisibleRequests);
window.addEventListener('focus', async () => {
  const page = route();
  refreshVisibleRequests();
  const collection = superAdmin ? 'partners' : 'staff';
  if (!state || page !== collection || $('#create-partner')?.open || $('#staff-dialog')?.open ||
      !state[collection].some(person => superAdmin ? !person.active : person.canCopyActivation)) return;
  const current = state;
  try {
    const response = await fetch(companyPrefix + (superAdmin ? '/api/partners' : '/api/state'), { cache: 'no-store' });
    if (!response.ok) return;
    const updated = await response.json();
    if (state !== current || route() !== page || $('#create-partner')?.open || $('#staff-dialog')?.open) return;
    if (JSON.stringify(updated[collection]) === JSON.stringify(current[collection])) return;
    state = updated;
    render();
  } catch { /* The displayed list is still available when refresh fails. */ }
});
$('#main').addEventListener('click', (event) => {
  const staffRow = event.target.closest('.staff-directory tbody tr');
  if (staffRow && !event.target.closest('a, button, input, select, textarea, label')) {
    const profileLink = staffRow.querySelector('.staff-profile-name');
    if (profileLink) { location.hash = profileLink.hash; return; }
  }

  if (event.target.closest('#restart-setup-guide')) { void restartSetupGuide(); return; }
  const editNotification = event.target.closest('[data-edit-notification]');
  if (editNotification) {
    openNotificationSettings(editNotification.dataset.editNotification);
    return;
  }
  const preference = event.target.closest('[data-notification-preference]');
  if (preference) {
    run(preference, () => save(preference.dataset.notificationPreference === 'encouragement' ? 'encouragement-settings' : 'notification-preferences', {
      key: preference.dataset.notificationPreference, enabled: preference.getAttribute('aria-checked') !== 'true',
    }), 'Notification preference saved.');
    return;
  }
  const removeLogo = event.target.closest('[data-remove-organization-logo]');
  if (removeLogo) {
    const form = removeLogo.form;
    form.elements.logo.value = '';
    form.elements.removeLogo.value = 'true';
    const preview = form.querySelector('.organization-logo');
    preview.removeAttribute('src');
    preview.parentElement.style.backgroundColor = '';
    preview.hidden = true;
    removeLogo.hidden = true;
    form.elements.logo.focus();
    return;
  }
  const dateStep = event.target.closest('[data-attendance-step]');
  if (dateStep) {
    const step = dateStep.dataset.attendanceStep;
    const day = new Date((attendanceDate || state.today) + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() + Number(step));
    attendanceDate = day.toISOString().slice(0, 10);
    render();
    $('[data-attendance-step="' + step + '"]').focus();
    return;
  }
  const leaveTab = event.target.closest('[data-leave-preferences-tab]');
  if (leaveTab) {
    leavePreferencesTab = leaveTab.dataset.leavePreferencesTab;
    render();
    $('[data-leave-preferences-tab="' + CSS.escape(leavePreferencesTab) + '"]')?.focus();
    return;
  }
  const leaveSwitch = event.target.closest('[data-leave-status]');
  if (leaveSwitch) {
    const name = leaveSwitch.dataset.leaveStatus;
    run(leaveSwitch, async () => {
      await save('leave-types/status', { name, active: leaveSwitch.getAttribute('aria-checked') !== 'true' });
      $('[data-leave-status="' + CSS.escape(name) + '"]')?.focus();
    }, 'Leave type updated.');
    return;
  }
  if (event.target.closest('#toggle-partner-password')) {
    const control = $('#toggle-partner-password');
    const visible = control.getAttribute('aria-pressed') !== 'true';
    for (const field of ['password', 'confirmation']) $('#partner-form').elements[field].type = visible ? 'text' : 'password';
    control.setAttribute('aria-pressed', String(visible));
    control.textContent = t(visible ? 'Hide password' : 'Show password');
    return;
  }
  const create = event.target.closest('[data-create-catalog]');
  if (create) {
    const dialog = $('#create-' + create.dataset.createCatalog);
    if (create.dataset.createCatalog === 'partner') {
      const form = $('#partner-form');
      form.reset();
      form.querySelector('#partner-password-fields').hidden = true;
      form.querySelector('#partner-password-fields').disabled = true;
      delete form.dataset.partnerId;
      $('#partner-dialog-title').textContent = t('Add company');
      form.querySelector('button.primary').textContent = t('Add company');
    }
    dialog.showModal();
    return;
  }
  const close = event.target.closest('[data-close-catalog]');
  if (close) {
    close.closest('dialog').close();
    return;
  }
  const removeRole = event.target.closest('[data-remove-role]');
  const removeTitle = event.target.closest('[data-remove-job-title]');
  if (removeRole || removeTitle) {
    const value = removeRole?.dataset.removeRole ?? removeTitle.dataset.removeJobTitle;
    const prompt = removeRole ? 'Delete this role and clear its employee assignments?' : 'Delete this job title and clear it from assigned employees?';
    if (window.confirm(t(prompt) + '\n' + t(value))) {
      if (removeRole) run(removeRole, () => save('staff/roles/remove', { role: value }), 'Role deleted.');
      else run(removeTitle, () => save('job-titles/remove', { name: value }), 'Job title deleted.');
    }
    return;
  }
  const roleRow = event.target.closest('[data-staff-role]');
  const jobTitleButton = event.target.closest('tr')?.querySelector('[data-job-title]');
  if (jobTitleButton) {
    selectedJobTitle = jobTitleButton.dataset.jobTitle;
    render();
    return;
  }
  if (roleRow) {
    selectedStaffRole = roleRow.dataset.staffRole;
    render();
    return;
  }
  const target = event.target.closest('button') ?? event.target.closest('.location-table tbody tr')?.querySelector('[data-edit-location]');
  if (target?.dataset.editApproval) {
    const type = target.dataset.editApproval;
    approvalDraft = { type, steps: [...(state.approvalChains?.[type] ?? [directApprovalStep])] };
    drawApprovalDialog();
    return;
  }
  if (target?.hasAttribute('data-close-approval')) {
    $('#approval-dialog').close();
    return;
  }
  if (target?.dataset.approvalStep && approvalDraft) {
    const { steps } = approvalDraft;
    const index = Number(target.dataset.index);
    const operation = target.dataset.approvalStep;
    let focus = index;
    if (operation === 'add') focus = steps.push('') - 1;
    else {
      steps.splice(index, 1);
      focus = Math.min(index, steps.length - 1);
    }
    drawApprovalDialog();
    $('#approval-dialog select[data-index="' + focus + '"]')?.focus();
    return;
  }
  if (!target) return;
  if (target.dataset.editAttendanceMethod) {
    attendanceMethod = target.dataset.editAttendanceMethod;
    attendanceBranch = undefined;
    render();
    return;
  }
  if (target.id === 'close-attendance-method') {
    attendanceMethod = undefined;
    render();
    return;
  }
  if (target.hasAttribute('data-attendance-branch')) {
    attendanceBranch = target.dataset.attendanceBranch;
    render();
    return;
  }
  if (target.dataset.attendanceStaff) {
    run(target, async () => {
      await save('attendance-methods', { method: attendanceMethod, staffId: target.dataset.attendanceStaff,
        enabled: target.dataset.attendanceEnabled === 'true' });
      $('[data-attendance-staff="' + CSS.escape(target.dataset.attendanceStaff) + '"]')?.focus();
    }, 'Settings saved.');
    return;
  }
  if (target.id === 'close-schedule-assignment') {
    closeScheduleAssignment();
    return;
  }
  if (target.dataset.scheduleStaff) {
    const { scheduleStaff: staffId, scheduleDate: date, editAssignment, removeAssignment } = target.dataset;
    if (removeAssignment) {
      run(target, async () => {
        await save('work-assignments', { staffId, date, removePeriodId: removeAssignment });
        focusScheduleCell({ staffId, date });
      }, 'Schedule updated.');
    } else {
      selectedScheduleCell = { staffId, date, periodId: editAssignment };
      render();
    }
    return;
  }
  if (target.dataset.requestFilter) {
    requestStatus = target.dataset.requestFilter;
    const panel = $('#manager-device-requests');
    updateRequestInbox(panel);
    panel.querySelector('[data-request-filter="' + CSS.escape(requestStatus) + '"]')?.focus();
    return;
  }
  if (target.dataset.editPartner) {
    const partner = state.partners.find(item => item.id === target.dataset.editPartner);
    const form = $('#partner-form');
    if (!partner || !form) return;
    form.reset();
    form.querySelector('#partner-password-fields').hidden = !partner.active;
    form.querySelector('#partner-password-fields').disabled = !partner.active;
    for (const field of ['password', 'confirmation']) form.elements[field].type = 'password';
    $('#toggle-partner-password').textContent = t('Show password');
    $('#toggle-partner-password').setAttribute('aria-pressed', 'false');
    form.dataset.partnerId = partner.id;
    for (const field of ['name', 'contactName', 'phone', 'email']) form.elements[field].value = partner[field] ?? '';
    $('#partner-dialog-title').textContent = t('Edit company');
    form.querySelector('button.primary').textContent = t('Save changes');
    form.closest('dialog').showModal();
    return;
  }
  if (target.dataset.deviceDecision) {
    if (target.dataset.deviceDecision === 'reject') { openRequestRejection(target); return; }
    run(target, async () => {
      const { deviceStaff: staffId, deviceRequest: requestId, deviceDecision: decision } = target.dataset;
      const response = await fetch(companyPrefix + '/api/employee/device-approval', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId, requestId, decision }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const panel = $('#manager-device-requests');
      if (panel) {
        target.disabled = false;
        await refreshRequestInbox(panel);
      }
    }, 'Request decision saved.');
    return;
  }
  if (target.dataset.partnerLink) {
    run(target, async () => {
      const id = target.dataset.partnerLink;
      if (!partnerInvitation?.url.includes('/company/' + id + '/')) {
        await save('partners', { operation: 'activation-link', id });
      }
      await navigator.clipboard.writeText(partnerInvitation.url);
      $('[data-partner-link="' + CSS.escape(id) + '"]')?.focus();
    }, 'Activation link copied.');
    return;
  }
  if (target.dataset.staffLink) {
    run(target, async () => {
      const staffId = target.dataset.staffLink;
      const response = await fetch(companyPrefix + '/api/staff/activation-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.invitation?.staffId !== staffId || !result.invitation.url) throw new Error('Could not create the employee activation link.');
      await navigator.clipboard.writeText(result.invitation.url);
      $('[data-staff-link="' + CSS.escape(staffId) + '"]')?.focus();
    }, 'Activation link copied.');
    return;
  }
  if (target.dataset.partnerStatus || target.dataset.removePartner) {
    const partner = state.partners.find(item => item.id === (target.dataset.partnerStatus || target.dataset.removePartner));
    if (!partner) return;
    if (target.dataset.removePartner) {
      if (window.confirm(t('Delete this company and all its data?') + '\n' + partner.name)) {
        run(target, () => save('partners', { operation: 'delete', id: partner.id }), 'Company deleted.');
      }
    } else {
      run(target, async () => {
        await save('partners', { operation: 'status', id: partner.id, suspended: !partner.suspended });
        $('[data-partner-status="' + CSS.escape(partner.id) + '"]')?.focus();
      }, 'Company status updated.');
    }
    return;
  }
  if (target.id === 'close-role') closeRoleDialog();
  if (target.dataset.removeStaff) {
    const person = state.staff.find(item => item.id === target.dataset.removeStaff);
    if (person && window.confirm(t('Delete this employee and revoke access?') + '\n' + staffName(person))) {
      run(target, async () => {
        await save('staff/remove', { staffId: person.id });
        render();
        $('#add-staff')?.focus();
      }, 'Employee deleted.');
    }
  }
  if (target.dataset.editStaff) {
    editingStaff = state.staff.find(person => person.id === target.dataset.editStaff && person.status !== 'Removed');
    if (editingStaff) render();
  }
  if (target.id === 'add-staff') {
    addingStaff = !addingStaff;
    render();
    if (addingStaff) $('#staff-form input').focus();
  }
  if (target.id === 'close-staff') closeStaffDialog();
  if (target.dataset.weekStep) {
    scheduleWeek += Number(target.dataset.weekStep);
    render();
    $('[data-week-step="' + target.dataset.weekStep + '"]')?.focus();
  }
  if (target.dataset.scheduleTab) {
    scheduleTab = target.dataset.scheduleTab;
    render();
    $('[data-schedule-tab][aria-pressed="true"]')?.focus();
  }

  if (target.dataset.punchMethodsTab) {
    if (punchMethodsTab === target.dataset.punchMethodsTab) return;
    punchMethodsTab = target.dataset.punchMethodsTab;
    editingBranch = undefined;
    editingLocationId = undefined;
    render();
    $('[data-punch-methods-tab][aria-pressed="true"]')?.focus();
    return;
  }
  if (target.dataset.organizationTab) {
    organizationTab = target.dataset.organizationTab;
    editingBranch = undefined;
    render();
    $('[data-organization-tab][aria-pressed="true"]')?.focus();
    return;
  }
  if (target.id === 'add-period') {
    editingPeriod = undefined;
    addingPeriod = !addingPeriod;
    render();
    $(addingPeriod ? '#period-form input' : '#add-period')?.focus();
  }
  if (target.dataset.editPeriod) {
    editingPeriod = state.workPeriods.find(period => period.id === target.dataset.editPeriod);
    addingPeriod = true;
    render();
  }
  if (target.dataset.deletePeriod) {
    const period = state.workPeriods.find(item => item.id === target.dataset.deletePeriod);
    if (!period || !window.confirm(t('Delete this period and remove it from employee schedules?') + '\n' + period.name)) return;
    run(target, async () => {
      await save('work-periods/remove', { id: period.id });
      $('#add-period')?.focus();
    }, 'Period deleted.');
  }
  if (target.dataset.duplicatePeriod) {
    run(target, async () => {
      await save('work-periods/duplicate', { id: target.dataset.duplicatePeriod });
      $('[data-duplicate-period="' + CSS.escape(target.dataset.duplicatePeriod) + '"]')?.focus();
    }, 'Period duplicated.');
    return;
  }
  if (target.id === 'close-period') {
    addingPeriod = false;
    render();
    $('#add-period')?.focus();
  }
  if (target.dataset.removeLocation) {
    const branch = state.locations.find(site => site.id === target.dataset.removeLocation);
    if (!branch || !window.confirm(t('Delete this branch and clear its attendance location and employee assignments?') + '\n' + branch.name)) return;
    run(target, async () => {
      await save('locations/remove', { id: branch.id });
      editingBranch = undefined;
      render();
      $('#add-branch')?.focus();
    }, 'Location removed.');
  }
  if (target.id === 'punch-from-anywhere') run(target, async () => {
    await save('locations/anywhere', { enabled: !state.punchFromAnywhere });
    $('#punch-from-anywhere')?.focus();
  }, 'Settings saved.');
  if (target.id === 'punch') run(target, async () => save('punch', {
    ...(state.punchFromAnywhere ? {} : await locate()), kind: target.dataset.kind,
  }), 'Punch recorded.');
  if (target.dataset.decision === 'Declined') { openRequestRejection(target); return; }
  if (target.dataset.decision) run(target, () => save('decision', { id: target.dataset.id, status: target.dataset.decision }), 'Decision saved.');
  if (target.dataset.editBranch || ['add-branch', 'close-branch', 'add-branch-from-locations'].includes(target.id)) {
    if (target.id === 'add-branch-from-locations') punchMethodsTab = 'methods';
    editingBranch = target.id.startsWith('add-branch') ? '' : target.dataset.editBranch;
    render();
    $(editingBranch !== undefined ? '#branch-form input' : '#add-branch')?.focus();
  }
  if (target.dataset.editLocation || target.id === 'close-location') {
    const siteId = target.dataset.editLocation ?? editingLocationId;
    editingLocationId = target.dataset.editLocation;
    render();
    $(editingLocationId ? '#location-form input' : '[data-edit-location="' + CSS.escape(siteId) + '"]')?.focus();
  }
  if (target.id === 'use-location') run(target, async () => {
    const { latitude, longitude } = await locate();
    const form = target.form;
    form.elements.latitude.value = latitude;
    form.elements.longitude.value = longitude;
    form.dispatchEvent(new Event('location-update'));
  }, 'Location selected. Save the location to apply it.');
});
$('#main').addEventListener('load', event => {
  if (event.target.matches('.organization-logo')) matchLogoPreviewBackground(event.target);
}, true);
function updateSalaryTotal(form) {
  const base = form.elements.salary.valueAsNumber, allowances = form.elements.allowances.valueAsNumber;
  form.elements.totalSalary.value = Number.isFinite(base) && Number.isFinite(allowances) ? (base + allowances).toFixed(2) : '';
}
$('#main').addEventListener('input', event => {
  const field = event.target;
  if (field.form?.id === 'staff-form' && ['salary', 'allowances'].includes(field.name)) updateSalaryTotal(field.form);
  if (field.form?.id === 'staff-form' && ['birthDate', 'birthDateHijri'].includes(field.name)) {
    const { birthDate, birthDateHijri } = field.form.elements;
    if (field === birthDate) {
      birthDateHijri.value = birthDate.value ? hijriBirthDate(Date.parse(birthDate.value)) : '';
      birthDateHijri.setCustomValidity('');
    } else {
      birthDate.value = gregorianBirthDate(birthDateHijri.value, state.today);
      birthDateHijri.setCustomValidity(birthDateHijri.value && !birthDate.value ? t('Enter a valid Hijri birth date.') : '');
    }
  }
  if (event.target.id === 'attendance-search') {
    attendanceSearch = event.target.value;
    $('#attendance-results').innerHTML = attendanceTable(attendanceDate || state.today);
  }
  if (event.target.form?.id === 'period-form') updatePeriodPreview(event.target.form);
});
$('#main').addEventListener('change', (event) => {
  if (event.target.form?.id === 'leave-preferences-form' && event.target.name === 'remaining') {
    const partial = event.target.value === 'partial';
    $('#leave-carryover-days').hidden = !partial;
    const input = event.target.form.elements.carryoverDays;
    input.disabled = !partial; input.required = partial;
  }
  if (event.target.matches('#approval-chain-form select')) {
    const index = Number(event.target.dataset.index);
    approvalDraft.steps[index] = event.target.value;
    drawApprovalDialog();
    $('#approval-dialog select[data-index="' + index + '"]')?.focus();
    return;
  }
  if (event.target.matches('#period-form [name="color"]')) {
    event.target.closest('.period-color-picker').querySelector('.period-dot').style.setProperty('--period-color', event.target.value);
    return;
  }
  if (event.target.matches('#schedule-assignment-form [name="restDay"]')) {
    for (const fieldset of event.target.form.querySelectorAll('.schedule-assignment-fields')) {
      fieldset.disabled = event.target.checked;
    }
    return;
  }
  const target = event.target;
  if (target.hasAttribute('data-organization-location')) {
    const { country, region, city } = target.form.elements;
    if (target === country) region.innerHTML = organizationLocationOptions('region', { country: country.value });
    if (target !== city) city.innerHTML = organizationLocationOptions('city', { country: country.value, region: region.value });
  }
  if (target.form?.id === 'organization-form' && target.name === 'logo' && target.files[0]) {
    const form = target.form;
    const file = target.files[0];
    if (!validOrganizationLogo(file)) {
      target.value = '';
      say('Choose a PNG, JPEG or WebP image up to 5 MB.', true);
      return;
    }
    form.elements.removeLogo.value = '';
    form.querySelector('[data-remove-organization-logo]').hidden = false;
    const preview = form.querySelector('.organization-logo');
    preview.parentElement.style.backgroundColor = '';
    const url = URL.createObjectURL(file);
    preview.onload = preview.onerror = () => URL.revokeObjectURL(url);
    preview.src = url;
    preview.hidden = false;
  }
  if (target.form?.id === 'staff-form' && target.name === 'contractTerm') {
    const custom = target.value === 'Custom';
    $('#contract-custom').hidden = !custom;
    target.form.elements.contractMonths.disabled = !custom;
    target.form.elements.contractMonths.required = custom;
  }
  if (target.form?.id === 'staff-form' && target.name === 'contractType') {
    const { probation, annualLeave } = target.form.elements;
    const isTamheer = target.value === 'Tamheer';
    if (isTamheer) probation.value = annualLeave.value = '0';
    probation.disabled = annualLeave.disabled = isTamheer;
  }
  if (target.id === 'profile-attendance-date') { profileAttendanceDate = target.value; render(); $('#profile-attendance-date').focus(); }
  if (target.id === 'attendance-date') { attendanceDate = target.value; render(); $('#attendance-date').focus(); }
  if (target.name === 'type') {
    $('#end-date').hidden = !state.leaveTypes.includes(target.value);
    target.form.elements.end.required = !$('#end-date').hidden;
  }
});
$('#main').addEventListener('submit', async (event) => {
  if (event.target.getAttribute('action')?.endsWith('/logout')) return;
  event.preventDefault();
  const form = event.target;
  const fields = new FormData(form);
  const values = Object.fromEntries(fields);
  if (form.id === 'approval-chain-form') {
    const { type, steps } = approvalDraft;
    run(event.submitter, async () => {
      await save('approval-chains', { type, steps });
      $('[data-edit-approval="' + CSS.escape(type) + '"]')?.focus();
    }, 'Approval chain saved.');
    return;
  }
  if (form.id === 'encouragement-settings-form') {
    const phrases = [...form.querySelectorAll('.phrase-editor-row')].map(row => ({
      ar: row.querySelector('[data-phrase-ar]').value, en: row.querySelector('[data-phrase-en]').value,
      morning: row.querySelector('[data-phrase-morning]').checked, opening: row.querySelector('[data-phrase-opening]').checked,
    }));
    run(event.submitter, () => save('encouragement-settings', { phrases }), 'Notification preference saved.');
    return;
  }
  if (form.id === 'notification-display-form') {
    run(event.submitter, async () => {
      await save('notification-settings', { key: 'display', display: { mode: values.mode, seconds: Number(values.seconds) } });
      closeManagementPopup();
    }, 'Notification preference saved.');
    return;
  }
  if (form.id === 'notification-settings-form') {
    const key = form.dataset.key;
    const body = key === 'attendance' ? { key, rules: Object.fromEntries(attendanceNotificationRules.map(([id]) => {
      const enabled = form.elements[id].checked;
      const minutes = form.elements[id + '-minutes'];
      return [id, { enabled, minutes: minutes.validity.valid && minutes.value !== '' ? Number(minutes.value) : 5 }];
    })) } : { key, recipients: form.elements.allManagers.checked ? null : fields.getAll('recipients') };
    run(event.submitter, () => save('notification-settings', body), 'Notification preference saved.');
    return;
  }
  if (form.id === 'document-upload-form') {
    run(event.submitter, async () => {
      const { file, expiresOn } = values;
      if (!file.size || file.size > 2 * 1024 * 1024 || !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) {
        throw new Error('Choose a PDF, PNG or JPEG up to 2 MB and a valid expiry date.');
      }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read the document.'));
        reader.readAsDataURL(file);
      });
      await save('documents', { name: file.name, mime: file.type, data, expiresOn });
    }, 'Document uploaded.');
    return;
  }
  if (form.matches('.document-expiry-form')) {
    run(event.submitter, () => save('documents/expiry', { id: form.dataset.documentId, expiresOn: values.expiresOn }), 'Expiry date saved.');
    return;
  }
  if (form.id === 'schedule-assignment-form') {
    const cell = selectedScheduleCell;
    const periodIds = fields.getAll('periodId');
    event.submitter.disabled = true;
    try {
      selectedScheduleCell = undefined;
      const schedule = event.submitter.value === 'default' ? { useDefault: true } :
        form.elements.restDay.checked ? { restDay: true } :
          { periodIds, repeat: form.elements.repeat.valueAsNumber, restDay: false };
      await save('work-assignments', { staffId: cell.staffId, date: cell.date, ...schedule });
      focusScheduleCell(cell);
      say('Schedule updated.');
    } catch (error) {
      selectedScheduleCell = cell;
      const feedback = $('#schedule-assignment-error');
      if (feedback) feedback.textContent = t(error.message);
    } finally {
      event.submitter.disabled = false;
    }
    return;
  }
  if (form.id === 'time-format-form') run(event.submitter, () => save('time-format', values), 'Settings saved.');
  if (form.id === 'organization-form') {
    run(event.submitter, async () => {
      const file = values.logo;
      delete values.logo;
      if (values.removeLogo) values.logo = '';
      delete values.removeLogo;
      if (file.size) {
        if (!validOrganizationLogo(file)) {
          throw new Error('Choose a PNG, JPEG or WebP image up to 5 MB.');
        }
        values.logo = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Could not read the logo.'));
          reader.readAsDataURL(file);
        });
      }
      await save(superAdmin ? 'platform-organization' : 'organization', values);
    }, 'Organization information saved.');
    return;
  }
  if (form.id === 'partner-form') {
    const id = form.dataset.partnerId;
    run(event.submitter, async () => {
      await save('partners', id ? { ...values, operation: 'update', id } : values);
      (id ? $('[data-edit-partner="' + CSS.escape(id) + '"]') : $('[data-create-catalog="partner"]'))?.focus();
    }, id ? 'Company updated.' : 'Company added.');
    return;
  }
  if (form.id === 'job-title-form' || form.id === 'create-role-form') {
    const role = form.id === 'create-role-form';
    const kind = role ? 'create-role' : 'job-title';
    run(event.submitter, async () => {
      await save(role ? 'staff/roles/create' : 'job-titles', values);
      if (!role) await setupGuideSaved('job-title');
      $('[data-create-catalog="' + kind + '"]')?.focus();
    }, role ? 'Role created.' : 'Job title added.');
  }
  if (form.id === 'role-form') run(event.submitter, async () => {
    const role = selectedStaffRole;
    const jobTitle = selectedJobTitle;
    const branchAssignments = !jobTitle && form.querySelector('[data-role-branch]') ? [...form.querySelectorAll('[data-role-branch]')].map(panel => ({
      branchId: panel.dataset.roleBranch, staffIds: [...panel.querySelectorAll('input:checked')].map(input => input.value),
    })) : undefined;
    await save(jobTitle ? 'job-titles/assign' : 'staff/roles', { role, jobTitle, staffIds: fields.getAll('member'), branchAssignments });
    closeRoleDialog();
  }, selectedJobTitle ? 'Job title assignments saved.' : 'Role assignments saved.');
  if (form.id === 'period-form') run(event.submitter, async () => {
    const window = (key) => Object.fromEntries(['before', 'grace', 'after'].map(field => [field, Number(values[key + '-' + field])]));
    const settings = form.elements.flexibleDay.checked ? { kind: 'flexible', start: values.start, end: values.end,
      duration: Number(values.durationHours) * 60 + Number(values.durationMinutes) } :
      { start: values.start, end: values.end, arrival: window('arrival'), departure: window('departure') };
    const name = values.name.trim() || (settings.kind === 'flexible' ? t('Flexible period') : '');
    await save('work-periods', { id: editingPeriod?.id, name, color: values.color, ...settings });
    addingPeriod = false;
    await setupGuideSaved('period');
    render();
    $('#add-period')?.focus();
  }, 'Period saved.');
  if (form.id === 'schedule-form') {
    const days = new FormData(form).getAll('day').map(Number);
    run(event.submitter, () => save('work-schedule', { days, start: values.start, end: values.end }), 'Settings saved.');
  }
  if (form.id === 'leave-preferences-form') run(event.submitter, () => save('leave-preferences', {
    availability: values.availability, remaining: values.remaining, carryoverDays: Number(values.carryoverDays ?? 0),
  }), 'Settings saved.');
  if (form.id === 'leave-type-form') run(event.submitter, () => save('leave-types', values), 'Leave type added.');
  if (form.id === 'branch-form') run(event.submitter, async () => {
    if (editingBranch) values.id = editingBranch;
    const existingBranches = new Set(state.locations.map(site => site.id));
    await save('locations/branch', values);
    const created = state.locations.find(site => !existingBranches.has(site.id));
    if (created) await setupGuideSaved('branch', created.id);
    editingBranch = undefined;
    render();
    $('#add-branch')?.focus();
  }, 'Location saved.');
  if (form.id === 'select-location-form') {
    editingLocationId = values.id;
    render();
    $('#location-form input')?.focus();
  }
  if (form.id === 'location-form') {
    for (const name of ['latitude', 'longitude', 'radius']) values[name] = form.elements[name].valueAsNumber;
    if (editingLocationId) values.id = editingLocationId;
    run(event.submitter, async () => {
      await save('locations', values);
      await setupGuideSaved('location');
      editingLocationId = undefined;
      render();
      $('[data-edit-location="' + CSS.escape(values.id) + '"]')?.focus();
    }, 'Location saved.');
  }
  if (form.id === 'account-password-form') run(event.submitter, async () => {
    const response = await fetch(companyPrefix + (accountIdentity.owner ? '/api/account/password' : '/api/employee/password'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    form.reset();
    $('#account-password-feedback').textContent = t('Password changed.');
  }, '', error => { $('#account-password-feedback').textContent = t(error.message); });
  if (form.id === 'staff-password-form') run(event.submitter, async () => {
    await save('staff/password', { staffId: profileStaffId, password: values.password, confirmation: values.confirmation });
    $('#staff-password-feedback').textContent = t('Password changed. The employee must sign in again.');
  }, '', error => { $('#staff-password-feedback').textContent = t(error.message); });
  if (form.id === 'staff-form') run(event.submitter, async () => {
    const periodIds = fields.getAll('defaultPeriodId');
    delete values.defaultPeriodId;
    delete values.birthDateHijri;
    if (editingStaff) {
      const staffId = editingStaff.id;
      const updates = Object.fromEntries(Object.entries(values).filter(([field, value]) =>
        value !== (form.initialValues.get(field) ?? '') && (value !== '' || field === 'managerId' || form.initialValues.has(field))));
      if (JSON.stringify(periodIds) !== JSON.stringify(form.initialValues.getAll('defaultPeriodId'))) updates.periodIds = periodIds;
      for (const field of ['contractMonths', 'probation', 'annualLeave']) {
        if (Object.hasOwn(updates, field)) updates[field] = updates[field] === '' ? null : Number(updates[field]);
      }
      if (Object.keys(updates).length) await save('staff/update', { staffId, ...updates });
    } else {
      if (values.contractMonths) values.contractMonths = Number(values.contractMonths);
      values.probation = values.contractType === 'Tamheer' ? 0 : Number(values.probation);
      values.annualLeave = values.contractType === 'Tamheer' ? 0 : Number(values.annualLeave);
      await save('staff', { ...values, periodIds });
    }
    closeStaffDialog();
  }, editingStaff ? 'Employee updated.' : 'Employee added.', error => {
    const duplicateFields = {
      'That email is already on the staff list.': 'email',
      'That phone number is already on the staff list.': 'phone',
      'That email and phone number are already on the staff list.': 'email',
    };
    const field = duplicateFields[error.message];
    if (!field) {
      say(error.message, true);
      return;
    }
    window.alert(t(error.message));
    form.elements[field].focus();
  });
  if (form.id === 'request-form') run(event.submitter, () => save('requests', values), 'Request submitted.');
});

async function openManagerHome() {
  if (!companyPrefix || !['', '#home'].includes(location.hash) ||
      !matchMedia('(max-width: 750px), (hover: none) and (pointer: coarse)').matches) return false;
  try {
    const response = await fetch(companyPrefix + '/api/employee/session');
    if (!response.ok || !(await response.json()).canReviewTeam) return false;
    location.replace(companyPrefix + '/employee');
    return true;
  } catch {
    return false;
  }
}

if (!await openManagerHome()) {
  try {
    const response = await fetch(companyPrefix + (superAdmin ? '/api/partners' : '/api/state'));
    if (!response.ok) throw new Error('Could not load the workspace.');
    state = await response.json();
    render();
  } catch (error) {
    $('#main').textContent = t(error.message);
    $('#main').setAttribute('aria-busy', 'false');
  }
}

document.addEventListener('click', event => {
  const menu = $('#account-menu');
  if (!menu.contains(event.target) || event.target.closest('a, button')) menu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') $('#account-menu').open = false;
});
