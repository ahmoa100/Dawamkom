import ar from './ar.js';
import { defaultPeriodIds, effectivePeriodIds } from './work-schedule.js';
import { staffRoles as roleOptions } from './staff-options.js';
import { annualLeaveDays, contractTerms, contractTypes, genders, jobTitles, nationalityCodes, probationDays } from './staff-options.js';

let language = 'ar';
try { if (localStorage.getItem('dawamak-language') === 'en') language = 'en'; } catch { /* Storage can be disabled. */ }
const t = (label) => language === 'ar' && Object.hasOwn(ar, label) ? ar[label] : label;

const pages = {
  home: ['Overview', '⌂'], requests: ['Requests', '≡'], staff: ['Staff', '♙'],
  attendance: ['Attendance', '◷'], leaves: ['Leaves', '▤'], settings: ['Settings', '⚙'],
  mobile: ['Staff view', '◉'],
};
const superAdmin = location.pathname === '/super-admin';
const companyPrefix = location.pathname.startsWith('/company/') ? location.pathname.replace(/\/$/, '') : '';
const superAdminPages = { home: ['Overview', '⌂'], partners: ['Partners', '▦'], settings: ['Settings', '⚙'] };
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const time = (value) => value ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '—';
const badge = (label) => '<span class="badge ' + (({
  Active: 'green', Approved: 'green', 'Punched in': 'green', Pending: 'amber', 'Pending activation': 'amber',
  'Invitation draft': 'amber', Declined: 'red', Suspended: 'red',
})[label] ?? '') + '">' + esc(t(label)) + '</span>';
const card = (title, content) => '<section class="card"><h2>' + title + '</h2>' + content + '</section>';
const table = (headers, rows, empty, className = '') => rows.length ? '<div class="table-wrap"><table class="' + className + '"><thead><tr>' +
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
  if (action === 'staff' || action === 'staff/activation-link') staffInvitation = result.invitation;
  if (action === 'partners' && (!body.operation || body.operation === 'activation-link' || partnerInvitation?.url.includes('/company/' + body.id + '/'))) {
    partnerInvitation = result.invitation;
  }
  state = result;
  render();
}
function requestRows(items, decisions = false) {
  return items.map((item) => [
    esc(state.staff.find((person) => person.id === item.staffId)?.name),
    '<strong>' + esc(t(item.type)) + '</strong><small>' + esc(item.note) + '</small>',
    esc(item.date === item.end ? item.date : item.date + ' – ' + item.end),
    badge(item.status),
    ...(decisions ? [item.status === 'Pending' ? '<div class="actions">' +
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
  const browser = session?.canReviewDeviceRequests ? [...(session.deviceHistory ?? []),
    ...session.deviceRequests.map(item => ({ ...item, status: 'Pending' }))].map(item => ({
      ...item, id: item.requestId, type: 'Browser change', browser: true,
    })) : [];
  const items = [...state.requests, ...browser].reverse().sort((a, b) => (b.submittedOn ?? '').localeCompare(a.submittedOn ?? ''));
  const statuses = [['Pending', 'Awaiting approval'], ['Approved', 'Approved'], ['Declined', 'Declined'], ['Expired', 'Expired'], ['Cancelled', 'Cancelled'], ['All', 'All requests']];
  const filters = '<div class="request-filters" aria-label="' + t('Status') + '">' + statuses.map(([status, label]) =>
    '<button type="button" data-request-filter="' + status + '" aria-pressed="' + (requestStatus === status) + '">' + t(label) + '</button>').join('') + '</div>';
  const rows = items.filter(item => requestStatus === 'All' || item.status === requestStatus).map(item => {
    const directory = requestDirectory ?? state;
    const employee = directory.staff.find(member => member.id === item.staffId);
    const manager = directory.staff.find(member => member.id === (item.approverId ?? employee?.managerId));
    const tags = [item.type];
    if (directory.leaveTypes.includes(item.type)) tags.unshift('Leave');
    if (item.date) tags.push(item.date === item.end ? item.date : `${item.date} – ${item.end}`);
    if (item.excuseType) tags.push(item.excuseType);
    if (item.reason) tags.push(item.reason);
    if (item.correctionReason) tags.push(item.correctionReason);
    if (item.proposedIn) tags.push(t('Check in') + ' ' + item.proposedIn);
    if (item.proposedOut) tags.push(t('Check out') + ' ' + item.proposedOut);
    const attachment = item.attachmentName ? '<a class="request-attachment" href="' + companyPrefix + '/api/request-attachment/' +
      encodeURIComponent(item.id) + '">' + esc(item.attachmentName) + '</a>' : '';
    const actions = item.status !== 'Pending' ? '' : '<div class="request-row-actions">' + ['approve', 'reject'].map(decision => {
      const label = t(decision === 'approve' ? 'Approve' : 'Decline');
      return '<button type="button" class="button secondary compact" aria-label="' + esc(label) + '" title="' + esc(label) + '" ' + (item.browser ? 'data-device-decision="' + decision +
        '" data-device-staff="' + esc(item.staffId) + '" data-device-request="' + esc(item.id) : 'data-decision="' +
        (decision === 'approve' ? 'Approved' : 'Declined') + '" data-id="' + esc(item.id)) + '">' +
        (decision === 'approve' ? '✓' : '×') + '</button>';
    }).join('') + '</div>';
    return ['<bdi>' + esc(item.id.slice(0, 8)) + '</bdi>', '<div class="request-chips">' + tags.map(tag =>
      '<span>' + esc(t(tag)) + '</span>').join('') + '</div><small>' + esc(item.name ?? (employee ? staffName(employee) : '')) +
      (item.note ? ' · ' + esc(item.note) : '') + '</small>' + attachment,
      manager ? '<strong>' + esc(staffName(manager)) + '</strong><small>' + esc(t(manager.jobTitle ?? '')) + '</small>' : '—',
      badge(item.status), '<bdi>' + esc(item.submittedOn ?? '—') + '</bdi>', actions];
  });
  return filters + table([...['Request number', 'Request', 'Approver', 'Status', 'Request day'].map(t),
    '<span class="request-action-label">' + t('Actions') + '</span>'], rows,
    t('No requests to show.'), 'requests-overview');
}
let requestManagerSession;
let requestDirectory;
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
    const [requestsResponse, sessionResponse] = await Promise.all(['/api/requests', '/api/employee/session']
      .map(path => fetch(companyPrefix + path, { cache: 'no-store', signal: AbortSignal.timeout(8000) })));
    if (!requestsResponse.ok || (!sessionResponse.ok && sessionResponse.status !== 401)) return;
    const [snapshot, session] = await Promise.all([requestsResponse.json(), sessionResponse.ok ? sessionResponse.json() : undefined]);
    if (!panel.isConnected || state !== current || panel.querySelector('.request-row-actions button:disabled')) return;
    state.requests = snapshot.requests;
    requestDirectory = snapshot;
    requestManagerSession = session;
    updateRequestInbox(panel);
  } catch { /* The next refresh retries transient failures. */ }
  finally {
    panel.setAttribute('aria-busy', 'false');
  }
}
let addingStaff = false;
let editingStaff;
function closeStaffDialog() {
  const id = editingStaff?.id;
  addingStaff = false;
  editingStaff = undefined;
  render();
  (id ? $('[data-edit-staff="' + CSS.escape(id) + '"]') : $('#add-staff'))?.focus();
}
let staffInvitation;
const staffName = person => (language === 'ar' ? person.nameAr : person.nameEn) || person.name;
const commonGivenNames = {
  Male: new Set('محمد احمد محمود مصطفى عبدالله عبدالعزيز عبدالرحمن عبدالكريم عمر علي خالد ابراهيم يوسف يحيى حسن حسين سعد سعود فيصل فهد سلمان تركي سامي طارق ناصر ماجد mohammed muhammad ahmed ahmad omar ali khalid ibrahim yousef yahya hassan hussein abdulkarim'.split(' ')),
  Female: new Set('فاطمه عائشه مريم ساره سارا نوره نورا هند ريم دانه وفاء هدى زينب خديجه لطيفه هيفاء اسماء منيره fatima aisha maryam sara sarah noura nora reem wafa'.split(' ')),
};
function suggestStaffGender(name) {
  const firstName = name.trim().split(/\s+/)[0].toLowerCase().normalize('NFKC')
    .replace(/\p{M}|ـ/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  return genders.find(gender => commonGivenNames[gender].has(firstName)) ?? '';
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
    .map(person => [person.id, person.nameAr || person.name || person.nameEn]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', dateStyle: 'short' }).format(new Date());
  const form = '<form id="staff-form"><section aria-labelledby="staff-personal-heading">' +
    '<h3 id="staff-personal-heading">' + t('Personal information') + '</h3><div class="fields">' +
    input('Arabic name', 'nameAr', 'required maxlength="120" dir="rtl"') +
    input('English name', 'nameEn', 'required maxlength="120" dir="ltr"') +
    input('Email', 'email', 'type="email" required maxlength="254"') +
    input('Phone', 'phone', 'type="tel" required maxlength="32" dir="ltr"') +
    input('Date of birth', 'birthDate', 'type="date" required max="' + esc(state.today) + '"') +
    select('Nationality', 'nationality', countries) +
    input('Identity number', 'identityNumber', 'required maxlength="20" inputmode="numeric" dir="ltr"') +
    select('Gender', 'gender', choices(genders)) + '</div></section>' +
    '<section aria-labelledby="staff-employment-heading"><h3 id="staff-employment-heading">' +
    t('Employment information') + '</h3><div class="fields">' +
    select('Job title', 'jobTitle', choices(state.jobTitles ?? jobTitles)) +
    select('Direct manager', 'managerId', managers, true) +
    input('Joining date (Gregorian)', 'joinDate', 'type="date" lang="en" required value="' + esc(today) + '"') +
    select('Contract term', 'contractTerm', choices(contractTerms)) +
    '<div id="contract-custom" hidden>' + input('Contract length in months', 'contractMonths', 'type="number" min="1" max="600" disabled') + '</div>' +
    select('Contract type', 'contractType', choices(contractTypes)) +
    select('Probation period (days)', 'probation', probationDays.map(value => [value, value])) +
    select('Annual leave entitlement (days)', 'annualLeave', annualLeaveDays.map(value => [value, value])) + '</div>' +
    '<fieldset class="staff-default-periods"><legend>' + t('Default work periods') + '</legend>' +
    (state.workPeriods?.length ? periodChoices(editingStaff ? defaultPeriodIds(editingStaff) : [], 'defaultPeriodId') :
      '<p class="hint">' + t('Define a period in Work schedule settings to assign it here.') + '</p>') + '</fieldset></section>' +
    '<section aria-labelledby="staff-salary-heading"><h3 id="staff-salary-heading">' + t('Salary information') + '</h3><div class="fields">' +
    input('Monthly base salary (SAR)', 'salary', 'type="number" min="0.01" max="999999999.99" step="0.01" required') +
    input('Monthly allowances (SAR)', 'allowances', 'type="number" min="0" max="999999999.99" step="0.01" value="0" required') +
    '</div></section>' + button(t('Save employee')) + '</form>';
  return title(t('Staff'), t('Manage your staff list and prepare invitations.')) +
    '<div class="period-toolbar"><a class="settings-back" href="' + companyPrefix + '/employee">' + t('Employee sign-in') + '</a>' +
    (state.admin ? '' : '<a class="settings-back" href="/admin">' + t('Admin sign-in with Google') + '</a>') +
    '</div>' +
      '<div class="period-toolbar"><button type="button" id="add-staff" class="button primary" aria-expanded="' +
      addingStaff + '" aria-haspopup="dialog">+ ' + t('Add new employee') + '</button></div>' +
    (addingStaff || editingStaff ? '<dialog id="staff-dialog" aria-labelledby="staff-title"><header><h2 id="staff-title">' +
      t(editingStaff ? 'Edit employee' : 'Add new employee') + '</h2><button type="button" class="button secondary" id="close-staff" aria-label="' +
      t('Close') + '">×</button></header>' + form + '</dialog>' : '') +
    '<section class="card staff-directory"><h2>' + t('Staff directory') + '</h2>' +
    table([t('Name'), t('Email'), t('Phone'), t('Job title'), t('Status'), t('Actions')], state.staff.filter(person => person.status !== 'Removed').map(person =>
      ['<strong>' + esc(staffName(person)) + '</strong>', '<bdi>' + esc(person.email) + '</bdi>', '<bdi>' + esc(person.phone || '—') + '</bdi>',
        esc(t(person.jobTitle === null ? 'Unassigned' : person.jobTitle || person.role || 'Unassigned')), badge(person.status),
        '<div class="activation-actions"><button type="button" class="button secondary compact staff-edit" data-edit-staff="' + esc(person.id) +
          '" aria-haspopup="dialog" aria-label="' + t('Edit employee') + '" title="' + t('Edit employee') + '">✎</button>' +
          '<button type="button" class="button secondary compact" data-remove-staff="' + esc(person.id) + '">' +
          t('Delete employee') + '</button>' + (person.canCopyActivation ? '<button type="button" class="button secondary compact" data-staff-link="' +
          esc(person.id) + '">' + t('Copy activation link') + '</button>' : '') + '</div>']), t('No staff members yet.')) + '</section>';
}
function attendanceTable(day) {
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
  const rows = state.staff.filter(person => (person.status !== 'Removed' ||
    punches.get(person.id)?.some(entry => entry.date === day)) &&
    (!query || [person.name, person.nameAr, person.nameEn].some(name => name?.toLowerCase().includes(query)))).map(person => {
    const scheduled = effectivePeriodIds(state, person, day)
      .map(id => periods.get(id)).filter(Boolean).sort((a, b) => a.start.localeCompare(b.start));
    const entries = (punches.get(person.id) ?? []).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const overnight = scheduled.some(period => period.end < period.start);
    const daily = entries.filter(entry => entry.date === day);
    const first = daily.find(entry => entry.kind === 'in');
    let open, lastOut, worked = 0;
    for (const entry of entries) {
      if (entry.kind === 'in') open = entry;
      if (entry.kind !== 'out' || !open) continue;
      const elapsed = Date.parse(entry.time) - Date.parse(open.time);
      if (open.date === day && (entry.date === day || (overnight && elapsed <= 86400000))) {
        worked += elapsed;
        lastOut = entry;
      }
      open = undefined;
    }
    const minutes = Math.floor(worked / 60000);
    const status = first ? 'Present' : scheduled.length ? 'Absent' : 'Not required';
    const required = scheduled.reduce((total, period) => total + period.duration, 0);
    const shortfall = scheduled.length && lastOut ? Math.max(0, required - minutes) : null;
    return [
      '<strong>' + esc(staffName(person)) + '</strong>' + (person.jobTitle ? '<small>' + esc(t(person.jobTitle)) + '</small>' : ''),
      '<span class="badge ' + (first ? 'green' : scheduled.length ? 'red' : '') + '">' + t(status) + '</span>',
      scheduled.length ? scheduled.map(period => '<div class="attendance-shift"><strong>' + esc(period.name) + '</strong><small><bdi>' +
        esc(period.start + ' – ' + period.end) + '</bdi> · ' + esc(formatDuration(period.duration)) + '</small></div>').join('') : t('Not scheduled'),
      time(first?.time), time(lastOut?.time ?? daily.findLast(entry => entry.kind === 'out')?.time),
      lastOut ? esc(formatDuration(minutes)) : '—',
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
  return title(t('Leaves'), t('Review leave requests and see which dates are approved.')) +
    card(t('Approved leave'), requestTable(state.requests.filter((item) => state.leaveTypes.includes(item.type) && item.status === 'Approved'))) +
    card(t('Leave requests'), requestTable(state.requests.filter((item) => state.leaveTypes.includes(item.type) && item.status !== 'Approved'), true));
}
const settingsSections = {
  'settings/organization': ['Organization information', 'Manage the logo and contact details.', 'ⓘ', organizationSettings],
  'settings/punch-methods': ['Punch methods', 'Manage where staff can punch in and out.', '◎', punchMethods],
  'settings/work-schedule': ['Work schedule settings', 'Set working days and hours.', '▦', workSchedule],
  'settings/leave-types': ['Leaves', 'Manage the leave types employees can request.', '▤', leaveTypes],
  'settings/staff-roles': ['Staff roles and permissions', 'View the number of staff assigned to each role.', '♙', staffRoles],
  'settings/approval-chain': ['Approval chain', 'Create request types and manage approval workflows.', '☷', () => ''],
  'settings/notifications': ['Notification preferences', 'Manage manager and employee notifications, including exceptions.', '<span class="employee-bell"></span>', () => ''],
};
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
  const options = memberGroup('Assigned employees', assigned, true) + memberGroup('Available to assign', available, false);
  const dialog = selection ? '<dialog id="role-dialog" aria-labelledby="role-title"><header><h2 id="role-title">' +
    esc(t(selection)) + ' · ' + format.format(assigned.length) + '</h2><button type="button" class="button secondary" id="close-role" aria-label="' +
    t('Close') + '">×</button></header><form id="role-form">' +
    '<p class="hint">' + t(selectedJobTitle ? 'Each person has one job title. Selecting someone assigns them this title.' :
      'Each person has one role. Selecting someone moves them to this role.') + '</p>' +
    options + button(t('Save assignments')) + '</form></dialog>' : '';
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
  const sections = Object.entries(settingsSections).filter(([path]) => !superAdmin || path === 'settings/organization');
  return '<h1>' + t('Settings') + '</h1><div class="settings-grid">' +
    sections.map(([path, [name, description, icon]]) =>
      '<a class="settings-tile" href="#' + path + '"><span class="settings-icon" aria-hidden="true">' + icon + '</span>' +
      '<span><strong>' + t(name) + '</strong><span class="hint">' + t(description) + '</span></span></a>').join('') + '</div>';
}
const validOrganizationLogo = file => file.size > 0 && file.size <= 5 * 1024 * 1024 &&
  ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
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
    '<section class="card organization-logo-editor"><div><h2>' + t('Organization logo') + '</h2>' +
      '<small>' + t('Maximum logo size: 5 MB.') + '</small><div class="actions">' +
      '<label class="button secondary logo-upload">' + t('Upload logo') +
      '<input type="file" name="logo" accept="image/png,image/jpeg,image/webp"></label>' +
      '<button type="button" class="logo-remove" data-remove-organization-logo' + (profile.logo ? '' : ' hidden') + '>' +
      t('Remove image') + '</button><input type="hidden" name="removeLogo" value=""></div>' +
      '<small>' + t('PNG, JPG, JPEG or WebP. Recommended size: 120 × 36 px.') + '</small></div>' +
      '<div class="organization-logo-actions"><div class="organization-logo-preview"><img class="organization-logo"' +
      (profile.logo ? ' src="' + esc(profile.logo) + '"' : ' hidden') + ' alt="' + t('Organization logo') + '"></div>' +
      '<button type="submit" class="button primary">' + t('Save') + '</button></div></section>' +
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
function periodChoices(selected, field, focusId) {
  return '<div class="schedule-options">' + state.workPeriods.map(period =>
    '<label><input type="checkbox" name="' + field + '" value="' + esc(period.id) + '"' +
    (selected.includes(period.id) ? ' checked' : '') + (period.id === focusId ? ' autofocus' : '') +
    '><span><strong>' + esc(period.name) + '</strong><small><bdi>' + esc(period.start + ' – ' + period.end) + '</bdi></small></span></label>').join('') + '</div>';
}
function scheduleAssignmentDialog() {
  const { staffId, date, periodId } = selectedScheduleCell;
  const person = state.staff.find(item => item.id === staffId);
  const selected = effectivePeriodIds(state, person, date);
  const overridden = (state.workAssignments ?? []).some(item => item.staffId === staffId && item.date === date);
  return '<dialog class="catalog-dialog" id="schedule-assignment-dialog" aria-labelledby="schedule-assignment-title">' +
    '<header><h2 id="schedule-assignment-title">' + t('Assign periods') + '</h2>' +
    '<button type="button" id="close-schedule-assignment" class="button secondary compact" aria-label="' + t('Close') + '">×</button></header>' +
    '<p>' + esc(staffName(person)) + ' · <bdi>' + esc(date) + '</bdi></p>' +
    '<form id="schedule-assignment-form">' + periodChoices(selected, 'periodId', periodId) +
    '<label>' + t('Number of working days') + '<input name="repeat" type="number" min="1" max="366" step="1" required value="1"></label>' +
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
  const rows = state.staff.filter(person => person.status === 'Active').map(person => [
    '<strong>' + esc(person.name) + '</strong><small>' + esc(t(person.role ?? 'Unassigned')) + '</small>',
    ...days.map(day => {
      const date = day.toISOString().slice(0, 10);
      const selected = effectivePeriodIds(state, person, date);
      const scheduled = periods.filter(period => selected.includes(period.id)).sort((a, b) => a.start.localeCompare(b.start));
      const label = t(state.workSchedule.days.includes(day.getUTCDay()) ? 'Unassigned' : 'Rest day');
      if (!periods.length) return '<span class="hint">' + label + '</span>';
      const cell = ' data-schedule-staff="' + esc(person.id) + '" data-schedule-date="' + date + '"';
      return '<div class="schedule-cell">' + scheduled.map(period =>
        '<div class="schedule-period"><strong>' + esc(period.name) + '</strong><small><bdi>' +
        esc(period.start + ' – ' + period.end) + '</bdi></small><div class="schedule-period-actions">' +
        '<button type="button" class="button secondary compact" data-edit-assignment="' + esc(period.id) + '"' + cell +
        ' aria-label="' + esc(t('Edit assignment') + ' — ' + period.name) + '" title="' + t('Edit assignment') + '">✎</button>' +
        '<button type="button" class="button secondary compact" data-remove-assignment="' + esc(period.id) + '"' + cell +
        ' aria-label="' + esc(t('Remove assignment') + ' — ' + period.name) + '" title="' + t('Remove assignment') + '">×</button></div></div>').join('') +
        '<button type="button" class="schedule-add' + (scheduled.length ? ' has-periods' : '') + '"' + cell +
        ' aria-haspopup="dialog" aria-label="' + esc(t('Assign periods') + ' — ' + staffName(person) + ' — ' + dayLabel.format(day)) + '">+</button></div>';
    }),
  ]);
  const weekLabel = dateLabel.formatRange(days[0], days[6]);
  return '<section class="card weekly-schedule"><div class="schedule-week"><h2>' + esc(weekLabel) + '</h2>' +
    '<div class="actions"><button type="button" class="button secondary" data-week-step="-1">' + t('Previous week') + '</button>' +
    '<button type="button" class="button secondary" data-week-step="1">' + t('Next week') + '</button></div></div>' +
    (periods.length ? '' : '<p class="hint">' + t('Define a period in Work schedule settings to assign it here.') + '</p>') +
    table([t('Staff'), ...days.map(day => esc(dayLabel.format(day)))], rows, t('No active staff.')) +
    (selectedScheduleCell ? scheduleAssignmentDialog() : '') + '</section>';
}
function workPeriods() {
  const rows = (state.workPeriods ?? []).map(({ id, name, duration }) => {
    const elapsed = [Math.floor(duration / 60), duration % 60];
    const format = new Intl.NumberFormat(language, { minimumIntegerDigits: 2 });
    return ['<button type="button" class="period-name" data-edit-period="' + esc(id) + '">' + esc(name) + '</button>',
      '<bdi class="period-duration">' + elapsed.map(value => format.format(value)).join(':') + '</bdi>'];
  });
  return '<section class="card"><div class="period-toolbar"><button type="button" id="add-period" class="button primary" aria-expanded="' +
    addingPeriod + '"><span aria-hidden="true">+ </span>' + t('Define a new period') + '</button></div>' +
    (addingPeriod ? periodDialog() : '') +
    table([t('Period'), t('Duration')], rows.length ? rows : [[t('No periods yet.'), '—']], '') + '</section>';
}
function periodDialog() {
  const period = editingPeriod ?? {};
  const punchWindow = (key, label, fields) => '<details class="period-window" open><summary>' + t(label) +
    '</summary><div class="period-fields">' + fields.map(([field, caption, value]) =>
      '<label><span>' + t(caption) + '</span><input type="number" min="0" max="720" required name="' + key + '-' + field +
      '" value="' + esc(period[key]?.[field] ?? value) + '"></label>').join('') + '</div><p class="hint" data-window="' + key + '"></p></details>';
  return '<dialog id="period-dialog" aria-labelledby="period-title"><form id="period-form">' +
    '<header><h2 id="period-title">' + t(editingPeriod ? 'Edit period' : 'New period') + '</h2><button type="button" id="close-period" class="button secondary" aria-label="' + t('Close') + '">×</button></header>' +
    '<label>' + t('Period name') + '<input name="name" required maxlength="80" value="' + esc(period.name) + '" autofocus></label>' +
    '<div class="period-times"><label>' + t('Start time') + '<input type="time" name="start" value="' + esc(period.start ?? '08:00') + '" required></label>' +
    '<label>' + t('End time') + '<input type="time" name="end" value="' + esc(period.end ?? '17:00') + '" required></label></div>' +
    '<p>' + t('Duration') + ' <output id="period-duration"></output></p>' +
    punchWindow('arrival', 'Check-in rules', [['before', 'Before start (min)', 60], ['grace', 'Allowed lateness (min)', 0], ['after', 'After start (min)', 60]]) +
    punchWindow('departure', 'Check-out rules', [['before', 'Before end (min)', 60], ['grace', 'Allowed early departure (min)', 0], ['after', 'After end (min)', 60]]) +
    button(t('Save period')) + '</form></dialog>';
}
function updatePeriodPreview(form) {
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
  form.querySelector('#period-duration').textContent = format(end - start);
  for (const [key, time, status, direction] of [['arrival', start, 'Late after', 1], ['departure', end, 'Early before', -1]]) {
    const read = (field) => form.elements[key + '-' + field].valueAsNumber;
    form.querySelector('[data-window="' + key + '"]').textContent = t('Punch window') + ' ' +
      format(time - read('before')) + ' – ' + format(time + read('after')) + ' · ' +
      t(status) + ' ' + format(time + direction * read('grace'));
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
let leaveSettingsTab = 'annual';
function annualLeaveBalance(person, today, requests) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(person.joinDate ?? '')) return null;
  const joined = new Date(person.joinDate + 'T00:00:00Z');
  if (!Number.isFinite(joined.valueOf()) || joined.toISOString().slice(0, 10) !== person.joinDate) return null;
  const anniversary = year => {
    const month = joined.getUTCMonth();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(joined.getUTCDate(), lastDay)));
  };
  const iso = date => date.toISOString().slice(0, 10);
  const year = Math.max(joined.getUTCFullYear(), Number(today.slice(0, 4)));
  const startYear = iso(anniversary(year)) > today && year > joined.getUTCFullYear() ? year - 1 : year;
  const start = anniversary(startYear).valueOf();
  const next = anniversary(startYear + 1).valueOf();
  const day = 86400000;
  const intervals = requests.filter(item => item.staffId === person.id && item.type === 'Annual leave' && item.status === 'Approved')
    .map(item => [Math.max(start, Date.parse(item.date)), Math.min(next, Date.parse(item.end ?? item.date) + day)])
    .filter(([from, to]) => from < to).sort((a, b) => a[0] - b[0]);
  let used = 0;
  let countedThrough = start;
  for (const [from, to] of intervals) {
    used += Math.max(0, to - Math.max(from, countedThrough)) / day;
    countedThrough = Math.max(countedThrough, to);
  }
  const entitlement = Number.isFinite(person.annualLeaveDays) ? person.annualLeaveDays : null;
  return { start: iso(new Date(start)), end: iso(new Date(next - day)), entitlement, used,
    remaining: entitlement === null ? null : entitlement - used };
}

function annualLeaveBalances() {
  const rows = state.staff.filter(person => person.status !== 'Removed').map(person => {
    const balance = annualLeaveBalance(person, state.today, state.requests);
    return ['<strong>' + esc(staffName(person)) + '</strong>',
      ...[balance?.start, balance?.end, balance?.entitlement ?? person.annualLeaveDays, balance?.used, balance?.remaining]
        .map(value => '<bdi>' + esc(value ?? '—') + '</bdi>')];
  });
  return card(t('Annual leave balances'), table(['Staff member', 'Entitlement year start', 'Entitlement year end',
    'Annual entitlement (days)', 'Used (days)', 'Remaining (days)'].map(t), rows, t('No staff members yet.')));
}

function leaveTypes() {
  const annual = leaveSettingsTab === 'annual';
  const tabs = '<div class="schedule-tabs" role="group" aria-label="' + esc(t('Leaves')) + '">' +
    [['annual', 'Annual leave settings'], ['labor-office', 'Labor office leave']].map(([tab, label]) =>
      '<button type="button" data-leave-settings-tab="' + tab + '" aria-pressed="' + (leaveSettingsTab === tab) + '">' +
        esc(t(label)) + '</button>').join('') + '</div>';
  const rows = state.leaveTypes.filter(type => !annual || type === 'Annual leave').map(type => {
    const { maxDays, active, description } = state.leaveSettings[type];
    return [
      '<strong>' + esc(t(type)) + '</strong>' + (description ? '<small>' + esc(t(description)) + '</small>' : ''),
      ...(!annual ? [esc(maxDays ?? '—')] : []),
      '<button type="button" role="switch" class="leave-switch" aria-label="' + esc(t(type)) +
        '" aria-checked="' + active + '" data-leave-status="' + esc(type) + '"><span></span></button>',
    ];
  });
  const types = table((annual ? ['Leave type name', 'Status'] : ['Leave type name', 'Maximum days', 'Status']).map(t), rows, '', 'leave-types-table');
  const addType = annual ? '' : '<form id="leave-type-form"><label>' + t('Leave type name') + '<input name="name" required maxlength="60"></label>' +
    '<label>' + t('Maximum days') + '<input name="maxDays" type="number" min="0" step="1"></label>' +
    button(t('Add leave type')) + '</form>';
  return tabs + card(t(annual ? 'Annual leave settings' : 'Available leave types'), types + addType) + (annual ? annualLeaveBalances() : '');
}
let addingLocation = false;
let editingLocationId;
let locationMap;

function punchMethods() {
  const editing = state.locations.find(site => site.id === editingLocationId);
  const staff = state.staff.filter(person => person.status !== 'Removed');
  const rows = state.locations.map((site) => [
    '<button type="button" class="period-name" data-edit-location="' + esc(site.id) + '">' + esc(site.name) + '</button>',
    esc(site.radius), '<bdi>' + esc(site.latitude + ', ' + site.longitude) + '</bdi>',
    esc(site.staffIds?.length ? staff.filter(person => site.staffIds.includes(person.id)).length : t('All employees')),
    '<button type="button" class="button secondary" data-remove-location="' + esc(site.id) +
      '" aria-label="' + esc(t('Remove location') + ' — ' + site.name) + '">' + t('Remove location') + '</button>',
  ]);
  return card(t('Geographic locations'),
    table([t('Workplace'), t('Radius (metres)'), t('Coordinates'), t('Assigned employees'), t('Actions')], rows, t('No approved locations yet.'), 'location-table') +
    '<button id="add-location" class="button primary" aria-expanded="' + (addingLocation && !editing) + '">' +
    t('Add geographic location') + '</button>' +
    (addingLocation ? '<form id="location-form"><h3>' + t(editing ? 'Edit geographic location' : 'Add geographic location') + '</h3>' +
      '<p class="hint">' + t('Select the workplace on the map and set the radius in metres.') + '</p>' +
      '<div id="location-map" dir="ltr" role="region" aria-label="' + t('Workplace map') + '"></div>' +
      '<p id="map-status" class="hint" role="status" hidden></p>' +
      '<div class="fields"><label>' + t('Workplace name') + '<input name="name" required maxlength="120" value="' + esc(editing?.name ?? '') + '"></label>' +
      '<label>' + t('Radius (metres)') + '<input name="radius" type="number" required min="10" max="5000" value="' + esc(editing?.radius ?? 100) + '"></label>' +
      '<label>' + t('Latitude') + '<input name="latitude" type="number" required min="-90" max="90" step="any" value="' + esc(editing?.latitude ?? '') + '"></label>' +
      '<label>' + t('Longitude') + '<input name="longitude" type="number" required min="-180" max="180" step="any" value="' + esc(editing?.longitude ?? '') + '"></label></div>' +
      '<fieldset class="location-assignees"><legend>' + t('Assigned employees') + '</legend>' +
      '<p class="hint">' + t('Leave all unchecked to allow all employees at this location.') + '</p>' +
      '<div class="location-assignee-list">' + staff.map(person =>
        '<label class="role-member"><input type="checkbox" name="staffId" value="' + esc(person.id) + '"' +
        (editing?.staffIds?.includes(person.id) ? ' checked' : '') + '>' + esc(staffName(person)) + '</label>').join('') + '</div></fieldset>' +
      '<div class="actions"><button type="button" id="use-location" class="button secondary">' + t('Use my current location') +
      '</button>' + button(t('Save location')) + '<button type="button" id="close-location" class="button secondary">' + t('Cancel') + '</button></div></form>' : ''));
}

function mountLocationMap(form) {
  const L = window.L;
  const status = $('#map-status');
  function mapError() {
    status.textContent = t('Map unavailable. Enter coordinates or use your current location.');
    status.hidden = false;
  }
  if (!L) { mapError(); return; }
  const recent = state.locations.find(site => site.id === editingLocationId) ?? state.locations.at(-1);
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

const views = { home, requests, staff, attendance, leaves, settings, mobile };
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
        '" aria-haspopup="dialog" aria-label="' + t('Edit company') + '" title="' + t('Edit company') + '">♡</button>') +
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
    button(t('Add company')) + '</form></dialog>';
}
const route = () => {
  const hash = location.hash.slice(1);
  if (superAdmin) return Object.hasOwn(superAdminPages, hash) || hash === 'settings/organization' ? hash : 'home';
  return Object.hasOwn(views, hash) || Object.hasOwn(settingsSections, hash) ? hash : 'home';
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
  locationMap?.remove();
  locationMap = null;
  const page = route();
  const logout = $('#logout-form');
  logout.hidden = !(superAdmin || state.admin);
  logout.action = companyPrefix ? companyPrefix + '/logout' : '/admin/logout';
  $('#logout-button').textContent = t('Sign out');
  const logo = state.organization?.logo;
  $('.workspace-icon').innerHTML = logo ? '<img class="workspace-logo" alt="" src="' + esc(logo) + '">' : '▦';
  if (superAdmin) {
    const organization = page === 'settings/organization';
    const navPage = organization ? 'settings' : page;
    $('#company').textContent = 'Super Admin';
    $('#crumb').textContent = t(organization ? 'Organization information' : superAdminPages[page][0]);
    $('#switch').hidden = true;
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
  const navPage = section ? 'settings' : page;
  $('#company').textContent = state.company;
  $('#crumb').textContent = t(section ? section[0] : pages[page][0]);
  $('#switch').textContent = t(page === 'mobile' ? 'Management' : 'Employee');
  $('#nav').innerHTML = Object.entries(pages).filter(([key]) => key !== 'mobile').map(([key, [name, icon]]) =>
    '<a href="#' + key + '"' + (navPage === key ? ' aria-current="page"' : '') + '><span aria-hidden="true">' + icon + '</span>' + t(name) + '</a>').join('');
  $('#main').innerHTML = section
    ? '<a class="settings-back" href="#settings">' + t('Back to Settings') + '</a><h1>' +
      t(page === 'settings/work-schedule' ? 'Work schedules' : section[0]) + '</h1>' + section[3]()
    : views[page]();
  if (page === 'requests') {
    const panel = $('#manager-device-requests');
    panel.requestMarkup = requestInbox(requestManagerSession);
    refreshRequestInbox(panel);
  }
  if ($('#location-form')) mountLocationMap($('#location-form'));
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
    roleDialog.showModal();
  }
  const staffDialog = $('#staff-dialog');
  if (staffDialog) {
    if (editingStaff) {
      const form = $('#staff-form');
      const person = editingStaff;
      const values = { ...person, nameAr: person.nameAr || person.name, nameEn: person.nameEn || person.name,
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
    staffDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeStaffDialog();
    });
    staffDialog.showModal();
  }
  if (period) {
    const form = $('#period-form');
    updatePeriodPreview(form);
    period.addEventListener('cancel', event => {
      event.preventDefault();
      addingPeriod = false;
      render();
      $('#add-period')?.focus();
    });
    period.showModal();
  }
  $('#main').setAttribute('aria-busy', 'false');
}
function locate() {
  if (!navigator.geolocation) return Promise.reject(new Error('Location is unavailable in this browser.'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
    ({ code }) => reject(new Error(code === 1 ? 'Allow location access and try again.' : 'Could not get your location. Try again.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  ));
}
async function run(control, action, success) {
  control.disabled = true;
  try { await action(); if (success) say(success); }
  catch (error) { say(error.message, true); }
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
$('#switch').onclick = () => {
  if (companyPrefix) location.assign(companyPrefix + '/employee');
  else location.hash = route() === 'mobile' ? 'home' : 'mobile';
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
  const timeField = event.target.closest('.period-times input[type="time"]');
  if (timeField?.showPicker) {
    try {
      timeField.focus();
      timeField.showPicker();
      event.preventDefault();
    } catch {
      // Keep the browser's native time input behavior if the picker cannot be opened.
    }
  }
  const removeLogo = event.target.closest('[data-remove-organization-logo]');
  if (removeLogo) {
    const form = removeLogo.form;
    form.elements.logo.value = '';
    form.elements.removeLogo.value = 'true';
    const preview = form.querySelector('.organization-logo');
    preview.removeAttribute('src');
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
  const leaveSwitch = event.target.closest('[data-leave-status]');
  if (leaveSwitch) {
    const name = leaveSwitch.dataset.leaveStatus;
    run(leaveSwitch, async () => {
      await save('leave-types/status', { name, active: leaveSwitch.getAttribute('aria-checked') !== 'true' });
      $('[data-leave-status="' + CSS.escape(name) + '"]')?.focus();
    }, 'Leave type updated.');
    return;
  }
  const create = event.target.closest('[data-create-catalog]');
  if (create) {
    const dialog = $('#create-' + create.dataset.createCatalog);
    if (create.dataset.createCatalog === 'partner') {
      const form = $('#partner-form');
      form.reset();
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
  if (!target) return;
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
    form.dataset.partnerId = partner.id;
    for (const field of ['name', 'contactName', 'phone', 'email']) form.elements[field].value = partner[field] ?? '';
    $('#partner-dialog-title').textContent = t('Edit company');
    form.querySelector('button.primary').textContent = t('Save changes');
    form.closest('dialog').showModal();
    return;
  }
  if (target.dataset.deviceDecision) {
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
      if (staffInvitation?.staffId !== staffId) await save('staff/activation-link', { staffId });
      await navigator.clipboard.writeText(staffInvitation.url);
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
        staffInvitation = undefined;
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
  if (target.dataset.leaveSettingsTab) {
    leaveSettingsTab = target.dataset.leaveSettingsTab;
    render();
    $('[data-leave-settings-tab="' + CSS.escape(leaveSettingsTab) + '"]')?.focus();
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
  if (target.id === 'close-period') {
    addingPeriod = false;
    render();
    $('#add-period')?.focus();
  }
  if (target.dataset.removeLocation && window.confirm(t('Remove this approved attendance location?'))) {
    run(target, async () => {
      if (editingLocationId === target.dataset.removeLocation) {
        addingLocation = false;
        editingLocationId = undefined;
      }
      await save('locations/remove', { id: target.dataset.removeLocation });
      $('#add-location')?.focus();
    }, 'Location removed.');
  }
  if (target.id === 'punch') run(target, async () => save('punch', { ...await locate(), kind: target.dataset.kind }), 'Punch recorded.');
  if (target.dataset.decision) run(target, () => save('decision', { id: target.dataset.id, status: target.dataset.decision }), 'Decision saved.');
  if (target.dataset.editLocation || target.id === 'add-location' || target.id === 'close-location') {
    const wasAdding = addingLocation && !editingLocationId;
    editingLocationId = target.dataset.editLocation;
    addingLocation = Boolean(editingLocationId) || (target.id === 'add-location' && !wasAdding);
    render();
    $(addingLocation ? '#location-form input' : '#add-location')?.focus();
  }
  if (target.id === 'use-location') run(target, async () => {
    const { latitude, longitude } = await locate();
    const form = target.form;
    form.elements.latitude.value = latitude;
    form.elements.longitude.value = longitude;
    form.dispatchEvent(new Event('location-update'));
  }, 'Location selected. Save the location to apply it.');
});
$('#main').addEventListener('input', event => {
  if (event.target.id === 'attendance-search') {
    attendanceSearch = event.target.value;
    $('#attendance-results').innerHTML = attendanceTable(attendanceDate || state.today);
  }
  if (event.target.form?.id === 'period-form') updatePeriodPreview(event.target.form);
});
$('#main').addEventListener('change', (event) => {
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
    if (isTamheer) {
      probation.add(new Option('0', '0'));
      probation.value = annualLeave.value = '0';
    } else {
      probation.querySelector('[value="0"]')?.remove();
    }
    probation.disabled = annualLeave.disabled = isTamheer;
  }
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
  if (form.id === 'schedule-assignment-form') {
    const cell = selectedScheduleCell;
    event.submitter.disabled = true;
    try {
      selectedScheduleCell = undefined;
      const schedule = event.submitter.value === 'default' ? { useDefault: true } :
        { periodIds: fields.getAll('periodId'), repeat: form.elements.repeat.valueAsNumber };
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
      $('[data-create-catalog="' + kind + '"]')?.focus();
    }, role ? 'Role created.' : 'Job title added.');
  }
  if (form.id === 'role-form') run(event.submitter, async () => {
    const role = selectedStaffRole;
    const jobTitle = selectedJobTitle;
    await save(jobTitle ? 'job-titles/assign' : 'staff/roles', { role, jobTitle, staffIds: fields.getAll('member') });
    closeRoleDialog();
  }, selectedJobTitle ? 'Job title assignments saved.' : 'Role assignments saved.');
  if (form.id === 'period-form') run(event.submitter, async () => {
    const window = (key) => Object.fromEntries(['before', 'grace', 'after'].map(field => [field, Number(values[key + '-' + field])]));
    await save('work-periods', { id: editingPeriod?.id, name: values.name, start: values.start, end: values.end,
      arrival: window('arrival'), departure: window('departure') });
    addingPeriod = false;
    render();
    $('#add-period')?.focus();
  }, 'Period saved.');
  if (form.id === 'schedule-form') {
    const days = new FormData(form).getAll('day').map(Number);
    run(event.submitter, () => save('work-schedule', { days, start: values.start, end: values.end }), 'Settings saved.');
  }
  if (form.id === 'leave-type-form') run(event.submitter, () => save('leave-types', values), 'Leave type added.');
  if (form.id === 'location-form') {
    for (const name of ['latitude', 'longitude', 'radius']) values[name] = form.elements[name].valueAsNumber;
    values.staffIds = new FormData(form).getAll('staffId');
    delete values.staffId;
    if (editingLocationId) values.id = editingLocationId;
    run(event.submitter, async () => {
      await save('locations', values);
      addingLocation = false;
      editingLocationId = undefined;
      render();
      $('#add-location')?.focus();
    }, 'Location saved.');
  }
  if (form.id === 'staff-form') run(event.submitter, async () => {
    const periodIds = fields.getAll('defaultPeriodId');
    delete values.defaultPeriodId;
    if (editingStaff) {
      const staffId = editingStaff.id;
      const updates = Object.fromEntries(Object.entries(values).filter(([field, value]) =>
        value !== (form.initialValues.get(field) ?? '') && (value !== '' || field === 'managerId' || form.initialValues.has(field))));
      if (JSON.stringify(periodIds) !== JSON.stringify(form.initialValues.getAll('defaultPeriodId'))) updates.periodIds = periodIds;
      for (const field of ['contractMonths', 'probation', 'annualLeave']) {
        if (Object.hasOwn(updates, field)) updates[field] = updates[field] === '' ? null : Number(updates[field]);
      }
      if (Object.keys(updates).length) await save('staff/update', { staffId, ...updates });
      if (Object.hasOwn(updates, 'email') && staffInvitation?.staffId === staffId) staffInvitation = undefined;
    } else {
      if (values.contractMonths) values.contractMonths = Number(values.contractMonths);
      values.probation = values.contractType === 'Tamheer' ? 0 : Number(values.probation);
      values.annualLeave = values.contractType === 'Tamheer' ? 0 : Number(values.annualLeave);
      await save('staff', { ...values, periodIds });
    }
    closeStaffDialog();
  }, editingStaff ? 'Employee updated.' : 'Employee added.');
  if (form.id === 'request-form') run(event.submitter, () => save('requests', values), 'Request submitted.');
});

try {
  const response = await fetch(companyPrefix + (superAdmin ? '/api/partners' : '/api/state'));
  if (!response.ok) throw new Error('Could not load the workspace.');
  state = await response.json();
  render();
} catch (error) {
  $('#main').textContent = t(error.message);
  $('#main').setAttribute('aria-busy', 'false');
}
