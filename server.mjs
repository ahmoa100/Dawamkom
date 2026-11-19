import {runtime, assertRuntimeWrite} from './runtime-mode.mjs';
import {requestRecovery,consumeRecovery,RecoveryThrottle,recoveryMessage} from './password-recovery.mjs';
import {accountEmail,activationEmailSent,recordActivationEmail} from './public/account-email.js';
import { normalizeIban, validSaudiIban } from './public/saudi-iban.js';
import {claimMonthlyMessages, finishMonthlyMessage} from './monthly-employee-mail.mjs';
import { attendanceReminders, recordAttendanceReminder } from './attendance-reminders.mjs';
import { validateNotificationDisplay } from './public/notification-display.js';
import { assignBranchRole, managesBranch, roleBranches } from './public/branch-roles.js';
import { employeeRequestTypes, employeeRequestEnabled, effectiveRequestPreferences, loanRequestTerms } from './public/request-settings.js';
import { scheduleApprovedLoan } from './loans.mjs';
import { mutatePayroll, publicPayrollRuns } from './payroll.mjs';
import { updatedCompanyCredentials } from './company-credentials.mjs';
import { encouragementSettings, validateEncouragementPhrases, dailyGreetingDecision } from './public/employee-greetings.js';
import { annualLeaveBalance, annualLeaveRequired } from './public/leave-balance.js';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { employeePage } from './employee-page.mjs';
import { handleAdmin, isAdmin } from './admin-auth.mjs';
import { openStorage, storageConflict } from './storage.mjs';
import { notifyAttendance, validExpoPushToken, notifyApproval, pushPublicKey, pushSubscription } from './push.mjs';
import { allowsAnywhere, allowsCompanyLocation, defaultPeriodIds, effectivePeriodIds, flexibleDayTotals, isDefaultRestDay, isFlexiblePeriod, isScheduleRestDay, nextPeriodColor, periodColors, periodDisplayColor,
  periodBounds, punchTiming, scheduleWeekday, validPeriodColor, reassignShiftPunches } from './public/work-schedule.js';
import { annualLeaveDays, contractTerms, contractTypes, genders, jobTitles, nationalityCodes, probationDays, westernDigits } from './public/staff-options.js';
import { staffRoles } from './public/staff-options.js';

const releaseDigest = createHash('sha256');
for (const file of ['server.mjs', 'password-recovery.mjs', 'runtime-mode.mjs', 'monthly-employee-mail.mjs', 'employee-page.mjs', 'attendance-reminders.mjs', 'push.mjs', 'loans.mjs', 'payroll.mjs', 'admin-auth.mjs', 'storage.mjs', 'company-credentials.mjs', ...readdirSync(new URL('./public/', import.meta.url), {withFileTypes:true}).filter(entry => entry.isFile()).map(entry => 'public/' + entry.name)].sort()) {
  releaseDigest.update(file).update(readFileSync(new URL(file, import.meta.url)));
}
const releaseVersion = releaseDigest.digest('hex').slice(0,16);
const files = new Map([
  ['/forgot-password', ['password-recovery.html', 'text/html']],
  ['/reset-password', ['password-recovery.html', 'text/html']],
  ['/password-recovery.js', ['password-recovery.js', 'text/javascript']],
  ['/account-email.js', ['account-email.js', 'text/javascript']],
  ['/saudi-iban.js', ['saudi-iban.js', 'text/javascript']],
  ['/profile-avatar.js', ['profile-avatar.js', 'text/javascript']],
  ['/update-notice.js', ['update-notice.js', 'text/javascript']],
  ['/notification-display.js', ['notification-display.js', 'text/javascript']],
  ['/branch-roles.js', ['branch-roles.js', 'text/javascript']],
  ['/privacy', ['privacy.html', 'text/html']],
  ['/support', ['support.html', 'text/html']],
  ['/leave-balance.js', ['leave-balance.js', 'text/javascript']],
  ['/', ['index.html', 'text/html']],
  ['/demo', ['index.html', 'text/html']],
  ['/workspace-login.js', ['workspace-login.js', 'text/javascript']],
  ['/super-admin', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/request-settings.js', ['request-settings.js', 'text/javascript']],
  ['/bank-payroll.js', ['bank-payroll.js', 'text/javascript']],
  ['/payroll.js', ['payroll.js', 'text/javascript']],
  ['/payroll-model.js', ['payroll-model.js', 'text/javascript']],
  ['/device-interface.js', ['device-interface.js', 'text/javascript']],
  ['/setup-guide.js', ['setup-guide.js', 'text/javascript']],
  ['/ar.js', ['ar.js', 'text/javascript']],
  ['/staff-options.js', ['staff-options.js', 'text/javascript']],
  ['/theme.js', ['theme.js', 'text/javascript']],
  ['/theme.css', ['theme.css', 'text/css']],
  ['/ux.js', ['ux.js', 'text/javascript']],
  ['/ux-model.js', ['ux-model.js', 'text/javascript']],
  ['/work-schedule.js', ['work-schedule.js', 'text/javascript']],
  ['/report-files.js', ['report-files.js', 'text/javascript']],
  ['/employee.js', ['employee.js', 'text/javascript']],
  ['/employee-greetings.js', ['employee-greetings.js', 'text/javascript']],
  ['/employee-notifications-sw.js', ['employee-notifications-sw.js', 'text/javascript']],
  ['/company-auth.js', ['company-auth.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']],
  ['/leaflet.css', ['leaflet.css', 'text/css']],
  ['/brand-reference.png', ['brand-reference.png', 'image/png']],
  ['/apple-touch-icon.png', ['apple-touch-icon.png', 'image/png']],
  ['/app-icon-192.png', ['app-icon-192.png', 'image/png']],
  ['/app-icon-512.png', ['app-icon-512.png', 'image/png']],
  ['/punch-fingerprint.png', ['punch-fingerprint.png', 'image/png']],
]);
const dataFile = new URL('./.dawamak-demo.json', import.meta.url);
const tempFile = new URL('./.dawamak-demo.tmp', import.meta.url);
const host = process.env.DAWAMAK_HOST || '127.0.0.1';
const hostedDemo = host !== '127.0.0.1';
const previewLifetime = 8 * 60 * 60;
const digest = (value) => createHash('sha256').update(value).digest();
const date = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', dateStyle: 'short' }).format(new Date());
const leavePolicies = [
  ['Annual leave', null, true],
  ['Death of a spouse, ancestor or descendant', 5, false],
  ['Care for a child with special needs', 30, false, 'Starts immediately after birth and may be extended for one unpaid month.'],
  ['Hajj leave', 15, false],
  ['Marriage leave', 5, false],
  ['Maternity leave', 84, false, 'Six weeks are taken immediately after childbirth. The other six can start up to four weeks before the expected date.'],
  ['Newborn leave', 3, false, 'May be taken within seven days of birth.'],
  ['Death of a sibling', 3, false],
  ['Sick leave', 120, true],
  ['Legacy sick leave', 120, false],
  ['Exam leave', 0, false],
  ['Unpaid leave', 60, true],
  ['Widow leave', 130, false],
  ['Widow leave (non-Muslim)', 15, false],
];
const defaultLeaveTypes = leavePolicies.map(([name]) => name);
const defaultLeaveSettings = Object.fromEntries(leavePolicies.map(([name, maxDays, active, description]) =>
  [name, { maxDays, active, description }]));
const activeLeaveTypes = (workspace,person) => workspace.leaveTypes.filter(name => employeeRequestEnabled(workspace,person,name));
const attendanceTypes = ['Missed punch', 'Attendance excuse', 'Loan request', 'Shift change'];
const directApprovalStep = 'direct-manager';
const eligibleApprover = person => person?.status === 'Active' && person.role === 'Manager';
const currentApprover = request => request.approvalSteps?.[request.approvalIndex];
function requestApprovalSteps(workspace, type, employeeId) {
  if (!employeeRequestTypes(workspace).includes(type)) return;
  const employee = workspace.staff.find(person => person.id === employeeId);
  const configured = workspace.approvalChains?.[type];
  const steps = (configured ?? [directApprovalStep]).map(step =>
    step === directApprovalStep ? employee?.managerId : step);
  if (!configured && !steps.some(id => eligibleApprover(workspace.staff.find(person => person.id === id)))) return;
  demand(steps.every(id => eligibleApprover(workspace.staff.find(person => person.id === id))),
    'An approver is unavailable. Check the approval chain.');
  const approvers = [...new Set(steps)].filter(id => id !== employeeId);
  demand(approvers.length, 'An approver is unavailable. Check the approval chain.');
  return approvers;
}
const excuseTypes = ['Late arrival', 'Early departure', 'During work'];
const excuseReasons = ['Personal', 'Medical', 'Other'];
const correctionReasons = ['Forgot to punch', 'Mobile app issue', 'Internet issue', 'Off-site visit', 'Other'];
const attachmentMaxBytes = 2 * 1024 * 1024;
const attachmentBodyLimit = Math.ceil(attachmentMaxBytes / 3) * 4 + 8192;
const dayMilliseconds = 86_400_000;
const requestTimestamp = (timestamp, fallbackDay) => Date.parse(timestamp ?? (fallbackDay ? fallbackDay + 'T00:00:00+03:00' : ''));
function requestStatus(request, now = Date.now()) {
  const pendingSince = requestTimestamp(request.approvalStepStartedAt ?? request.submittedAt, request.submittedOn);
  return request.status === 'Pending' && now - pendingSince >= 3 * dayMilliseconds ? 'Cancelled' : request.status;
}
const requestSummary = ({ attachment, ...item }) => ({
  ...item, status: requestStatus(item),
  approverId: item.status === 'Pending' ? currentApprover(item) : item.decidedBy,
  ...(attachment ? { attachmentName: attachment.name } : {}),
});
let state = {
  company: 'XYZ Company', slug: 'xyz', site: 'Main office', latitude: null, longitude: null, radius: 100,
  staff: [
    { id: 'demo', name: 'Sara Ahmed', email: 'sara@example.com', role: 'Employee', status: 'Active' },
    { id: 'omar', name: 'Omar Khalid', email: 'omar@example.com', role: 'Manager', status: 'Active' },
    { id: 'noura', name: 'Noura Ali', email: 'noura@example.com', role: 'Employee', status: 'Active' },
  ],
  punches: [],
  leaveTypes: defaultLeaveTypes,
  leaveSettings: defaultLeaveSettings,
  jobTitles: [...jobTitles],
  staffRoles: [...staffRoles],
  workSchedule: { days: [0, 1, 2, 3, 4, 6], start: '09:00', end: '17:00' },
  workPeriods: [],
  workAssignments: [],
  requests: [{ id: 'sample', staffId: 'noura', type: 'Annual leave', date: date(), end: date(), note: 'Personal appointment', status: 'Pending' }],
};
const partnersFile = new URL('./.dawamkom-partners.json', import.meta.url);
const partnersTemp = new URL('./.dawamkom-partners.tmp', import.meta.url);
let partners = [];
let platformProfile = { name: 'Dawamkom' };
let demoCompanyStatus = 'active';
try {
  const saved = JSON.parse(readFileSync(partnersFile, 'utf8'));
  partners = Array.isArray(saved) ? saved : saved.partners;
  platformProfile = saved.profile ?? platformProfile;
  demoCompanyStatus = saved.demoCompanyStatus ?? 'active';
}
catch (error) { if (error.code !== 'ENOENT') throw error; }
async function persistPlatform(nextPartners, profile, nextDemoStatus = demoCompanyStatus) {
  assertRuntimeWrite();
  if (storage) {
    await storage.write({ state, partners: nextPartners, profile, demoCompanyStatus: nextDemoStatus });
  } else {
    writeFileSync(partnersTemp, JSON.stringify({ partners: nextPartners, profile, demoCompanyStatus: nextDemoStatus }, null, 2));
    renameSync(partnersTemp, partnersFile);
  }
  partners = nextPartners;
  platformProfile = profile;
  demoCompanyStatus = nextDemoStatus;
}
const demoSeed = structuredClone({ ...state, locations: [] });
const demos = new Map();
function demoWorkspace(req) {
  const now = Date.now();
  for (const [id, demo] of demos) {
    if (demo.expires <= now) demos.delete(id);
  }
  const id = req.headers.cookie?.match(/(?:^|;\s*)dawamak_demo=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if (demos.has(id)) return { demo: demos.get(id) };
  if (demos.size >= 250) demos.delete(demos.keys().next().value);
  const newId = randomUUID();
  const demo = { state: structuredClone(demoSeed), expires: now + previewLifetime * 1000 };
  demos.set(newId, demo);
  return { demo, cookie: `dawamak_demo=${newId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${previewLifetime}${host === '127.0.0.1' ? '' : '; Secure'}` };
}
try { state = JSON.parse(readFileSync(dataFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const storage = await openStorage();
function applyStorage(saved) {
  if (!saved) return;
  ({ state, partners, profile: platformProfile, demoCompanyStatus } = saved);
}
const initialSnapshot = await storage?.read({ bootstrap: process.env.DAWAMAK_STORAGE_BOOTSTRAP === '1' });
applyStorage(initialSnapshot);
state.locations ??= state.latitude === null ? [] : [{
  id: 'original', name: state.site, latitude: state.latitude, longitude: state.longitude, radius: state.radius,
}];
state.leaveTypes = [...new Set([...defaultLeaveTypes, ...(state.leaveTypes ?? [])])];
state.leaveSettings = Object.fromEntries(state.leaveTypes.map(name => [name,
  (Object.hasOwn(state.leaveSettings ?? {}, name) && state.leaveSettings[name]) ||
  (Object.hasOwn(defaultLeaveSettings, name) && defaultLeaveSettings[name]) ||
  { maxDays: null, active: true },
]));
state.jobTitles ??= [...jobTitles];
state.staffRoles ??= [...staffRoles];
state.workSchedule ??= structuredClone(demoSeed.workSchedule);
state.workPeriods ??= [];
for (const period of state.workPeriods) period.id ??= randomUUID();
state.workAssignments ??= [];

function demand(condition, message) {
  if (!condition) throw new Error(message);
}
function distance(lat, lng, site) {
  const rad = (degrees) => degrees * Math.PI / 180;
  const a = Math.sin(rad(lat - site.latitude) / 2) ** 2 +
    Math.cos(rad(site.latitude)) * Math.cos(rad(lat)) * Math.sin(rad(lng - site.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
const coordinate = (value, max) => Number.isFinite(value) && Math.abs(value) <= max;
function scheduledRange(assignment, period) {
  return { assignment, ...periodBounds(period, assignment.date), period };
}
const shiftDayBy = (day, offset) => new Date(Date.parse(day) + offset * dayMilliseconds).toISOString().slice(0, 10);
function effectiveRanges(workspace, person, day) {
  return effectivePeriodIds(workspace, person, day).flatMap(id => {
    const period = workspace.workPeriods.find(item => item.id === id);
    return period ? [scheduledRange({ date: day }, period)] : [];
  });
}
function employeePunchWindows(workspace, person, today) {
  const minute = 60_000;
  const dayStart = Date.parse(today + 'T00:00:00+03:00');
  return [-2, -1, 0, 1].flatMap(offset => effectiveRanges(workspace, person, shiftDayBy(today, offset)))
    .map(({ start, end, period }) => ({
      start, end,
      flexible: isFlexiblePeriod(period),
      arrivalStart: isFlexiblePeriod(period) ? start : start - (period.arrival?.before ?? 60) * minute,
      arrivalEnd: isFlexiblePeriod(period) ? end - 1 : start + (period.arrival?.after ?? 60) * minute,
      departureStart: isFlexiblePeriod(period) ? start : end - (period.departure?.before ?? 60) * minute,
      departureEnd: isFlexiblePeriod(period) ? end - 1 : end + (period.departure?.after ?? 60) * minute,
    }))
    .filter(shift => (shift.start >= dayStart && shift.start < dayStart + dayMilliseconds) ||
      (shift.start < dayStart && shift.departureEnd >= dayStart) ||
      shift.arrivalStart < dayStart + dayMilliseconds && shift.start >= dayStart + dayMilliseconds)
    .sort((a, b) => a.start - b.start);
}
function openPunchShift(windows, lastPunch) {
  if (lastPunch?.kind !== 'in') return null;
  if (lastPunch.shiftStart != null) return lastPunch.shiftStart;
  const time = Date.parse(lastPunch.time);
  return windows.find(shift => time >= shift.arrivalStart && time <= shift.arrivalEnd)?.start ?? null;
}
function employeeCalendar(workspace, employee, firstDay, today, now) {
  const punches = workspace.punches.filter(entry => entry.staffId === employee.id);
  const leaves = workspace.requests.filter(entry => entry.staffId === employee.id &&
    entry.status === 'Approved' && workspace.leaveTypes.includes(entry.type));
  const days = [];
  for (let day = firstDay; day.slice(0, 7) === firstDay.slice(0, 7); day = shiftDayBy(day, 1)) {
    const ranges = effectiveRanges(workspace, employee, day);
    const starts = new Set(ranges.map(range => range.start));
    const isLeave = leaves.some(leave => leave.date <= day && (leave.end ?? leave.date) >= day);
    const records = punches.filter(entry => entry.shiftStart == null ? entry.date === day : starts.has(entry.shiftStart));
    const windows = employeePunchWindows(workspace, employee, day).filter(window => starts.has(window.start));
    const checks = windows.map(window => {
      const entries = records.filter(entry => entry.shiftStart === window.start || (entry.shiftStart == null &&
        (windows.length === 1 || (entry.kind === 'in'
          ? Date.parse(entry.time) >= window.arrivalStart && Date.parse(entry.time) <= window.arrivalEnd
          : Date.parse(entry.time) >= window.departureStart && Date.parse(entry.time) <= window.departureEnd))));
      const arrival = entries.find(entry => entry.kind === 'in');
      const departure = entries.findLast(entry => entry.kind === 'out');
      if (arrival && departure && entries.at(-1)?.kind === 'out' && Date.parse(departure.time) >= Date.parse(arrival.time)) {
        const period = ranges.find(range => range.start === window.start)?.period;
        if (window.flexible && period?.duration > 0 && flexibleDayTotals(entries, day, now, window).completedMilliseconds < period.duration * 60000)
          return now > window.end ? 'issue' : 'pending';
        return 'complete';
      }
      return now > (arrival ? window.departureEnd : window.arrivalEnd) ? 'issue' : 'pending';
    });
    const status = isLeave || !ranges.length ? 'off' : day > today ? 'pending' :
      checks.includes('issue') ? 'issue' : checks.every(check => check === 'complete') ? 'complete' : 'pending';
    days.push({ date: day, status, leave: isLeave,
      periods: ranges.map(({ period }) => ({ name: period.name, start: period.start, end: period.end, flexible: isFlexiblePeriod(period) })),
      punches: records.map(({ kind, time }) => ({ kind, time })) });
  }
  return { today, days };
}
function validateWorkOverlap(workspace, person, overrideDay) {
  function validateDay(schedule, staff, day) {
    const ranges = effectiveRanges(schedule, staff, day);
    const nextDay = effectiveRanges(schedule, staff, shiftDayBy(day, 1));
    for (const range of ranges) {
      demand(![...ranges, ...nextDay].some(other => other !== range &&
        range.start < other.end && other.start < range.end), 'Assigned periods cannot overlap.');
    }
  }
  if (!overrideDay) {
    const baseline = { ...workspace, workAssignments: [] };
    for (let day = 0; day < 7; day++) validateDay(baseline, { ...person, joinDate: null }, shiftDayBy('2000-01-02', day));
  }
  const dates = overrideDay ? [overrideDay] : [...new Set(workspace.workAssignments
    .filter(entry => entry.staffId === person.id).map(entry => entry.date))];
  for (const day of dates) {
    validateDay(workspace, person, shiftDayBy(day, -1));
    validateDay(workspace, person, day);
  }
}
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const string = (value) => typeof value === 'string' ? value.trim() : '';
function staffPhoneKey(value) {
  const digits = westernDigits(string(value)).replace(/[\s()-]/g, '')
    .replace(/^(?:\+|00)/, '');
  return /^0?5\d{8}$/.test(digits) ? '966' + digits.replace(/^0/, '') : digits;
}
const logoMaxBytes = 5 * 1024 * 1024;
const organizationBodyLimit = Math.ceil(logoMaxBytes / 3) * 4 + 8192;
function organizationProfile(body, previous = {}) {
  const profile = {};
  for (const field of ['name', 'city', 'country', 'region', 'email', 'contactName', 'phone', 'address']) {
    profile[field] = string(body[field]);
    demand(profile[field].length <= 300, 'Organization information is too long.');
  }
  demand(profile.name && profile.name.length <= 120, 'Enter a company name.');
  demand(!profile.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email), 'Enter a valid email.');
  profile.logo = previous.logo ?? '';
  if (body.logo !== undefined) {
    const logo = body.logo;
    demand(typeof logo === 'string' && logo.length <= organizationBodyLimit &&
      (logo === '' || /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)),
    'Choose a PNG, JPEG or WebP image up to 5 MB.');
    if (logo) demand(Buffer.byteLength(logo.slice(logo.indexOf(',') + 1), 'base64') <= logoMaxBytes,
      'Choose a PNG, JPEG or WebP image up to 5 MB.');
    profile.logo = logo;
  }
  return profile;
}

function validateAnnualLeaveRequest(workspace, staffId, start, end, excludeId) {
  const person = workspace.staff.find(item => item.id === staffId);
  const requests = workspace.requests.map(item => ({ ...item, status: requestStatus(item) }));
  const balance = person && annualLeaveBalance(person, date(), requests, workspace.leavePreferences);
  if (balance?.available == null) return;
  const required = annualLeaveRequired(requests, staffId, date(), { date: start, end }, excludeId);
  demand(required <= balance.available + 1e-8, 'The request exceeds the available annual leave balance.');
}
function mutate(next, path, body, employeeId = 'demo', reviewer) {
  switch (path) {
    case '/api/request-preferences': {
      demand(employeeRequestTypes(next).includes(body.type) && typeof body.enabled === 'boolean','Choose a valid request type.');
      if(body.scopeBranchId) next.branchRequestPreferences={...next.branchRequestPreferences,[body.scopeBranchId]:{...next.branchRequestPreferences?.[body.scopeBranchId],[body.type]:body.enabled}};
      else next.requestPreferences={...next.requestPreferences,[body.type]:body.enabled};
      break;
    }
    case '/api/setup-guide': {
      demand(Number.isInteger(body.step) && body.step >= 0 && body.step <= 21, 'Invalid setup step.');
      next.setupGuide = { ...(body.step === 0 ? {} : next.setupGuide), step: body.step, ...(body.branchId ? { branchId: body.branchId } : {}) };
      break;
    }
    case '/api/encouragement-settings': {
      const previous = body.scopeBranchId ? next.branchEncouragementSettings?.[body.scopeBranchId] : next.encouragementSettings;
      const settings = { ...previous };
      if (Object.hasOwn(body, 'enabled')) {
        demand(typeof body.enabled === 'boolean', 'Choose a valid notification preference.');
        settings.enabled = body.enabled;
      }
      if (Object.hasOwn(body, 'phrases')) settings.phrases = validateEncouragementPhrases(body.phrases);
      if (body.scopeBranchId) next.branchEncouragementSettings = { ...next.branchEncouragementSettings, [body.scopeBranchId]: settings };
      else next.encouragementSettings = settings;
      break;
    }
    case '/api/notification-preferences': {
      const { key, enabled } = body;
      demand(['attendance', 'documents'].includes(key) && typeof enabled === 'boolean', 'Choose a valid notification preference.');
      next.notificationPreferences = { ...next.notificationPreferences, [key]: enabled };
      break;
    }
    case '/api/notification-settings': {
      const { key, rules, recipients } = body;
      const settings = { ...next.notificationSettings };
      if (key === 'display') {
        const display = validateNotificationDisplay(body.display);
        if (body.scopeUserId) next.notificationDisplayByUser = { ...next.notificationDisplayByUser, [body.scopeUserId]: display };
        else settings.display = display;
      } else if (key === 'attendance') {
        const names = ['beforeStart', 'beforeDeduction', 'beforeEnd', 'afterEnd'];
        demand(rules && names.every(name => typeof rules[name]?.enabled === 'boolean' &&
          Number.isInteger(rules[name].minutes) && rules[name].minutes >= 0 && rules[name].minutes <= 1440),
        'Choose reminder times from 0 to 1440 minutes.');
        settings.attendance = Object.fromEntries(names.map(name => [name,
          { enabled: rules[name].enabled, minutes: rules[name].minutes }]));
      } else {
        const eligible = new Set(next.staff.filter(person => person.status !== 'Removed').map(person => person.id));
        demand(key === 'documents' && (recipients === null ||
          (Array.isArray(recipients) && recipients.every(id => eligible.has(id)))), 'Choose valid notification recipients.');
        settings.documentRecipients = recipients === null ? null : [...new Set(recipients)];
      }
      next.notificationSettings = settings;
      break;
    }
    case '/api/documents': {
      const { name, mime, data, expiresOn } = body;
      const title = string(name);
      demand(title && title.length <= 180 && !/[\u0000-\u001f]/.test(title) &&
        ['application/pdf', 'image/png', 'image/jpeg'].includes(mime) &&
        typeof data === 'string' && data.length <= Math.ceil(attachmentMaxBytes / 3) * 4 &&
        data.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(data) &&
        (expiresOn === '' || validDate(expiresOn)), 'Choose a PDF, PNG or JPEG up to 2 MB and a valid expiry date.');
      const file = Buffer.from(data, 'base64');
      const signature = { 'application/pdf': '255044462d', 'image/png': '89504e470d0a1a0a', 'image/jpeg': 'ffd8ff' }[mime];
      demand(file.length <= attachmentMaxBytes && file.subarray(0, signature.length / 2).toString('hex') === signature,
        'Choose a PDF, PNG or JPEG up to 2 MB and a valid expiry date.');
      next.documents ??= [];
      if(body.replaceId){const existing=next.documents.find(item=>item.id===body.replaceId);demand(existing,'Document not found.');Object.assign(existing,{name:title,mime,data,expiresOn,updatedAt:new Date().toISOString()});}
      else next.documents.unshift({ id: randomUUID(), name: title, mime, data, expiresOn });
      break;
    }
    case '/api/documents/expiry': {
      const document = next.documents?.find(item => item.id === body.id);
      demand(document && (body.expiresOn === '' || validDate(body.expiresOn)), 'Choose a valid expiry date.');
      document.expiresOn = body.expiresOn;
      break;
    }
    case '/api/issued-reports': {
      const { type = 'attendance-follow-up', format, language, start, end, rows } = body;
      const titles = {
        'attendance-follow-up': ['تقرير متابعة الحضور والانصراف', 'Attendance follow-up report'],
        'attendance-summary': ['تقرير الحضور والانصراف', 'Attendance and clock-out report'],
        'attendance-performance': ['لوحة أداء الحضور والانصراف', 'Attendance performance dashboard'],
      };
      demand(Object.hasOwn(titles, type) && ['xlsx', 'pdf'].includes(format) && ['ar', 'en'].includes(language) &&
        validDate(start) && validDate(end) && start <= end && Array.isArray(rows) && rows.length > 1 &&
        Array.isArray(rows[0]) && rows[0].length >= 3 && rows[0].length <= 368 &&
        rows.every(row => Array.isArray(row) && row.length === rows[0].length &&
          row.every(cell => typeof cell === 'string' && cell.length <= 250)), 'Invalid report data.');
      const title = titles[type][language === 'ar' ? 0 : 1];
      next.issuedReports ??= [];
      next.issuedReports.unshift({ id: randomUUID(), createdAt: new Date().toISOString(),
        type, title, format, language, start, end, rows });
      break;
    }
    case '/api/job-titles/assign': {
      const { jobTitle, staffIds } = body;
      demand(next.jobTitles.includes(jobTitle) && Array.isArray(staffIds), 'Choose a valid job title and employees.');
      const staff = next.staff.filter(person => person.status !== 'Removed');
      const eligible = new Set(staff.map(person => person.id));
      demand(staffIds.every(id => eligible.has(id)), 'Choose a valid job title and employees.');
      const selected = new Set(staffIds);
      for (const person of staff) {
        if (selected.has(person.id)) person.jobTitle = jobTitle;
        else if (person.jobTitle === jobTitle) person.jobTitle = null;
      }
      break;
    }
    case '/api/staff/roles/create': {
      const name = string(body.name).normalize('NFC');
      demand(name && name.length <= 120, 'Enter a role name of up to 120 characters.');
      demand(!next.staffRoles.some(role => role.toLowerCase() === name.toLowerCase()), 'This role already exists.');
      next.staffRoles.push(name);
      break;
    }
    case '/api/job-titles/remove': {
      demand(next.jobTitles.includes(body.name), 'Job title not found.');
      next.jobTitles = next.jobTitles.filter(name => name !== body.name);
      for (const person of next.staff) {
        if (person.jobTitle === body.name) person.jobTitle = null;
      }
      break;
    }
    case '/api/staff/roles/remove': {
      const { role } = body;
      demand(next.staffRoles.includes(role), 'Role not found.');
      next.staffRoles = next.staffRoles.filter(name => name !== role);
      const removedManagers = new Set(next.staff.filter(person => role === 'Manager' && person.role === role).map(person => person.id));
      for (const person of next.staff) {
        if (person.role === role) person.role = null;
        if (removedManagers.has(person.managerId)) person.managerId = null;
      }
      break;
    }
    case '/api/job-titles': {
      const name = string(body.name).normalize('NFC');
      demand(name && name.length <= 120, 'Enter a job title of up to 120 characters.');
      demand(!next.jobTitles.some(title => title.toLowerCase() === name.toLowerCase()), 'This job title already exists.');
      next.jobTitles.push(name);
      break;
    }
    case '/api/work-periods': {
      const name = string(body.name);
      const { start, end, flexible, arrival, departure } = body;
      const flexibleDay = body.kind === 'flexible';
      demand(name && name.length <= 80, 'Enter a period name.');
      const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      demand((typeof start === 'string' && typeof end === 'string' && time.test(start) && time.test(end) && start !== end),
        'Choose different start and end times.');
      const validWindow = (window) => ['before', 'grace', 'after'].every(key =>
        Number.isInteger(window?.[key]) && window[key] >= 0 && window[key] <= 720);
      demand(flexibleDay || ((flexible === undefined || typeof flexible === 'boolean') && validWindow(arrival) && validWindow(departure)), 'Enter valid punch settings.');
      const toMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
      const windowDuration = (toMinutes(end) - toMinutes(start) + 1440) % 1440;
      const duration = flexibleDay ? body.duration : windowDuration;
      demand(!flexibleDay || (Number.isInteger(duration) && duration > 0 && duration <= windowDuration), 'Choose flexible hours within the period window.');
      const index = next.workPeriods.findIndex(period => period.id === body.id);
      demand(body.id === undefined || index >= 0, 'Period not found.');
      demand(body.color === undefined || validPeriodColor(body.color), 'Choose a valid period color.');
      const period = flexibleDay ? { id: body.id ?? randomUUID(), name, kind: 'flexible', start, end, duration } :
        { id: body.id ?? randomUUID(), name, start, end, duration,
          flexible: flexible ?? next.workPeriods[index]?.flexible ?? false, arrival, departure };
      period.color = body.color ?? (index < 0 ? nextPeriodColor(next.workPeriods) : periodDisplayColor(next.workPeriods[index], index));
      if (index >= 0) {
        const previous = next.workPeriods[index];
        next.workPeriods[index] = period;
        if (previous.start !== period.start || previous.end !== period.end || previous.kind !== period.kind) {
          for (const person of next.staff.filter(item => item.status !== 'Removed' &&
            (defaultPeriodIds(item).includes(period.id) || next.workAssignments.some(entry => entry.staffId === item.id && entry.periodId === period.id)))) {
            validateWorkOverlap(next, person);
          }
        }
      }
      else next.workPeriods.push(period);
      break;
    }
    case '/api/work-periods/duplicate': {
      const index = next.workPeriods.findIndex(period => period.id === body.id);
      demand(index >= 0, 'Period not found.');
      const source = next.workPeriods[index];
      const suffix = ' نسخة';
      const sourceColor = periodDisplayColor(source, index).toLowerCase();
      const suggestedColor = nextPeriodColor(next.workPeriods);
      const color = suggestedColor === sourceColor ? periodColors.find(item => item !== sourceColor) : suggestedColor;
      next.workPeriods.push({ ...structuredClone(source), id: randomUUID(), name: source.name.slice(0, 80 - suffix.length).trimEnd() + suffix, color });
      break;
    }
    case '/api/work-periods/remove': {
      const { id } = body;
      demand(next.workPeriods.some(period => period.id === id), 'Period not found.');
      next.workPeriods = next.workPeriods.map((period, index) => ({
        ...period, color: periodDisplayColor(period, index),
      })).filter(period => period.id !== id);
      for (const person of next.staff) {
        const ids = defaultPeriodIds(person);
        if (!ids.includes(id)) continue;
        person.periodIds = ids.filter(periodId => periodId !== id);
        person.periodId = person.periodIds[0] ?? '';
      }
      const assignmentKey = entry => JSON.stringify([entry.staffId, entry.date]);
      const remainingDates = new Set(next.workAssignments.filter(entry => entry.periodId !== id).map(assignmentKey));
      next.workAssignments = next.workAssignments.flatMap(entry => {
        if (entry.periodId !== id) return [entry];
        if (remainingDates.has(assignmentKey(entry))) return [];
        return [{ ...entry, periodId: null, restDay: false }];
      });
      break;
    }
    case '/api/work-assignments': {
      if (body.batch !== undefined) {
        demand(Array.isArray(body.batch) && body.batch.length > 0 && body.batch.length <= 3500 && body.batch.every(item => item && !Object.hasOwn(item,'batch')), 'Choose up to 500 employees for one week.');
        demand(new Set(body.batch.map(item=>JSON.stringify([item.staffId,item.date]))).size === body.batch.length, 'Choose unique employee dates.');
        for (const item of body.batch) mutate(next, path, item, employeeId, reviewer);
        break;
      }
      const { staffId, date, periodId } = body;
      const person = next.staff.find(item => item.id === staffId && ['Active', 'Pending activation'].includes(item.status));
      demand(validDate(date) && person, 'Choose an employee and a valid date.');
      const sameDay = entry => entry.staffId === staffId && entry.date === date;
      const removesManualPeriod = typeof body.removePeriodId === 'string' &&
        next.workAssignments.some(entry => sameDay(entry) && entry.periodId === body.removePeriodId);
      if (body.useDefault === true || removesManualPeriod) {
        next.workAssignments = next.workAssignments.filter(entry =>
          !sameDay(entry) || (body.useDefault !== true && entry.periodId !== body.removePeriodId));
        validateWorkOverlap(next, person, date);
        break;
      }
      const ids = body.restDay === true ? [] : typeof body.removePeriodId === 'string' ? effectivePeriodIds(next, person, date).filter(id => id !== body.removePeriodId) :
        body.periodIds ?? (periodId === '' ? [] : [periodId]);
      const available = new Set(next.workPeriods.map(period => period.id));
      demand(Array.isArray(ids) && ids.every(id => available.has(id)), 'Choose an available period.');
      const repeat = body.restDay === true ? 1 : body.repeat ?? 1;
      demand(Number.isInteger(repeat) && repeat >= 1 && repeat <= 366, 'Enter between 1 and 366 working days.');
      demand(repeat === 1 || next.workSchedule.days.some(day => !isDefaultRestDay(next, person, day)), 'Set working days and hours.');
      const dates = new Set([date]);
      for (let day = shiftDayBy(date, 1); dates.size < repeat; day = shiftDayBy(day, 1)) {
        demand(validDate(day), 'Choose an employee and a valid date.');
        if (!isDefaultRestDay(next, person, scheduleWeekday(day))) dates.add(day);
      }
      next.workAssignments = next.workAssignments.filter(entry => entry.staffId !== staffId || !dates.has(entry.date));
      const selected = ids.length ? [...new Set(ids)] : [null];
      for (const day of dates) {
        next.workAssignments.push(...selected.map(periodId => ({
          staffId, date: day, periodId,
          ...(periodId === null && body.restDay === false ? { restDay: false } : {}),
        })));
      }
      for (const day of dates) validateWorkOverlap(next, person, day);
      break;
    }
    case '/api/work-schedule': {
      const { days, start, end } = body;
      const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      demand(Array.isArray(days) && days.length && days.every(day => Number.isInteger(day) && day >= 0 && day <= 6) &&
        typeof start === 'string' && typeof end === 'string' && time.test(start) && time.test(end) && start < end,
      'Choose working days and an end time after the start time.');
      const recurringRestDays = (next.workSchedule.recurringRestDays ?? []).filter(day => !days.includes(day));
      next.workSchedule = { days: [...new Set(days)].sort(), start, end, recurringRestDays };
      for (const person of next.staff.filter(item => item.status !== 'Removed')) {
        validateWorkOverlap(next, person);
      }
      break;
    }
    case '/api/leave-types': {
      const name = string(body.name);
      demand(name && name.length <= 60 && ![...next.leaveTypes, ...attendanceTypes].some(type => type.toLowerCase() === name.toLowerCase()),
        'Enter a new leave type name.');
      next.leaveTypes.push(name);
      const maxDays = body.maxDays === '' || body.maxDays == null ? null : Number(body.maxDays);
      demand(maxDays === null || (Number.isSafeInteger(maxDays) && maxDays >= 0), 'Enter a valid maximum number of days.');
      Object.defineProperty(next.leaveSettings, name, { value: { maxDays, active: true }, enumerable: true, writable: true });
      break;
    }
    case '/api/leave-types/status': {
      const { name, active } = body;
      demand(next.leaveTypes.includes(name) && typeof active === 'boolean', 'Choose a valid leave type.');
      next.leaveSettings[name].active = active;
      break;
    }
    case '/api/leave-preferences': {
      demand(['full', 'accrued'].includes(body.availability) && ['reset', 'all', 'partial'].includes(body.remaining) &&
        Number.isFinite(body.carryoverDays) && body.carryoverDays >= 0 && body.carryoverDays <= 99999, 'Choose valid leave settings.');
      next.leavePreferences = { availability: body.availability, remaining: body.remaining, carryoverDays: body.carryoverDays };
      break;
    }
    case '/api/time-format': {
      demand(body.format === '12' || body.format === '24', 'Choose a valid time format.');
      next.timeFormat = body.format;
      break;
    }
    case '/api/organization': {
      next.organization = organizationProfile(body, next.organization);
      next.company = next.organization.name;
      break;
    }
    case '/api/settings': {
      const company = string(body.company), slug = string(body.slug).toLowerCase();
      demand(company && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug), 'Enter a company and valid subdomain.');
      Object.assign(next, { company, slug });
      break;
    }
    case '/api/attendance-methods': {
      const person = next.staff.find(item => item.id === body.staffId && item.status !== 'Removed');
      demand(person && ['company', 'anywhere'].includes(body.method) && typeof body.enabled === 'boolean',
        'Choose valid employees for this location.');
      person.attendanceMethods = { ...person.attendanceMethods, [body.method]: body.enabled };
      break;
    }
    case '/api/locations/anywhere': {
      demand(typeof body.enabled === 'boolean', 'Choose a valid status.');
      next.punchFromAnywhere = body.enabled;
      break;
    }
    case '/api/locations/branch': {
      const name = string(body.name);
      demand(name && name.length <= 120, 'Enter a workplace name.');
      const site = next.locations.find(item => item.id === body.id);
      demand(body.id === undefined || site, 'Workplace location not found.');
      if (site) site.name = name;
      else next.locations.push({ id: randomUUID(), name });
      break;
    }
    case '/api/locations': {
      const { latitude, longitude, radius, staffIds } = body;
      const site = body.id === undefined ? null : next.locations.find(item => item.id === body.id);
      demand(body.id === undefined || site, 'Workplace location not found.');
      const name = body.name === undefined ? site?.name : string(body.name);
      demand(name && name.length <= 120, 'Enter a workplace name.');
      demand(coordinate(latitude, 90) && coordinate(longitude, 180) && Number.isInteger(radius) && radius >= 10 && radius <= 5000, 'Enter valid coordinates and a radius between 10 and 5,000 metres.');
      const staff = new Set(next.staff.filter(person => person.status !== 'Removed').map(person => person.id));
      demand(staffIds === undefined || (Array.isArray(staffIds) && staffIds.every(id => staff.has(id))), 'Choose valid employees for this location.');
      const details = { name, latitude, longitude, radius, staffIds: [...new Set(staffIds ?? site?.staffIds ?? [])] };
      if (site) Object.assign(site, details);
      else next.locations.push({ id: randomUUID(), ...details });
      break;
    }
    case '/api/locations/remove': {
      const index = next.locations.findIndex((site) => site.id === body.id);
      demand(index !== -1, 'Workplace location not found.');
      next.locations.splice(index, 1);
      for (const person of next.staff) {
        if (person.branchId === body.id) person.branchId = null;
      }
      break;
    }
    case '/api/staff/password': {
      const person = next.staff.find(item => item.id === body.staffId && item.status === 'Active');
      demand(person, 'Employee not found.');
      const { password, confirmation } = body;
      demand(typeof password === 'string' && password.length >= 10 && password.length <= 128 &&
        /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[\p{P}\p{S}]/u.test(password),
        'Use 10–128 characters with uppercase, lowercase, a number and a symbol.');
      demand(password === confirmation, 'Passwords do not match.');
      const salt = secret();
      person.account = { ...person.account, salt, passwordHash: scryptSync(password, salt, 64).toString('hex'),
        sessionHash: null, managerSessions: [], managerSessionExpirations: {} };
      for (const key of ['pendingBrowser', 'pendingDevice', 'requestedAt', 'requestedOn', 'activationHash', 'activationExpires'])
        delete person.account[key];
      break;
    }
    case '/api/staff/update':
    case '/api/staff': {
      const editing = path === '/api/staff/update';
      const person = editing ? next.staff.find(item => item.id === body.staffId && item.status !== 'Removed') : null;
      demand(!editing || person, 'Employee not found.');
      const patch = body;
      if (Object.hasOwn(patch, 'iban')) {
        demand(typeof patch.iban === 'string', 'Enter a valid Saudi IBAN.');
        patch.iban = normalizeIban(patch.iban);
        demand(!patch.iban || validSaudiIban(patch.iban), 'Enter a valid Saudi IBAN.');
      }
      const changed = (...fields) => !person || fields.some(field => Object.hasOwn(patch, field));
      if (Object.hasOwn(patch,'gosiScheme')) demand(['','old','new','none'].includes(patch.gosiScheme), 'Choose valid insurance settings.');
      if (Object.hasOwn(patch,'gosiSaned')) demand(['yes','no'].includes(patch.gosiSaned), 'Choose valid insurance settings.');
      if (Object.hasOwn(patch,'gosiBase')) demand(patch.gosiBase === '' || (typeof patch.gosiBase === 'string' && /^\d{1,5}(?:\.\d{1,2})?$/.test(patch.gosiBase) && Number(patch.gosiBase)<=45000), 'Choose valid insurance settings.');
      const check = (fields, valid, message) => demand(!changed(...fields) || valid, message);
      if (person) body = { ...person, periodId: person.periodId ?? '', probation: person.probationDays,
        annualLeave: person.annualLeaveDays, salary: person.salary ? String(person.salary.monthlyBase) : '',
        allowances: person.salary ? String(person.salary.monthlyAllowances) : '', ...body };
      if (['old','new'].includes(body.gosiScheme)) demand(body.gosiBase != null && body.gosiBase !== '', 'Choose valid insurance settings.');
      const email = string(body.email).toLowerCase();
      const nameAr = string(body.nameAr), nameEn = string(body.nameEn), phone = string(body.phone);
      const { birthDate, gender, jobTitle, managerId, branchId, joinDate, periodId } = body;
      const { contractTerm, contractMonths, salary } = body;
      const nationality = string(body.nationality), identityNumber = string(body.identityNumber);
      const { contractType } = body;
      const isTamheer = contractType === 'Tamheer';
      const probation = isTamheer ? 0 : body.probation;
      const annualLeave = isTamheer ? 0 : body.annualLeave;
      check(['nationality'], nationalityCodes.includes(nationality), 'Enter a nationality and valid identity number.');
      check(['identityNumber'], /^[\p{Nd}]{5,20}$/u.test(identityNumber), 'Enter a nationality and valid identity number.');
      const contractError = 'Choose a contract type, probation period and annual leave allowance.';
      check(['contractType'], contractTypes.includes(contractType), contractError);
      check(['probation'], probationDays.includes(probation), contractError);
      check(['contractType', 'annualLeave'], annualLeaveDays.includes(annualLeave), contractError);
      const hasCurrentBalance = Object.hasOwn(patch, 'currentLeaveBalance');
      const currentBalance = body.currentLeaveBalance;
      if (hasCurrentBalance && currentBalance !== '') {
        demand((typeof currentBalance === 'string' || typeof currentBalance === 'number') &&
          /^-?\d{1,5}(?:\.\d{1,2})?$/.test(String(currentBalance)) &&
          Number(currentBalance) >= -99999 && Number(currentBalance) <= 99999,
          'Enter a valid current leave balance.');
      }

      check(['nameAr'], nameAr && nameAr.length <= 120, 'Enter both employee names.');
      check(['nameEn'], nameEn && nameEn.length <= 120, 'Enter both employee names.');
      check(['email'], email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email.');
      const digits = phone.replace(/[\s()-]/g, '');
      check(['phone'], /^\+?\p{Nd}{7,15}$/u.test(digits), 'Enter a valid phone number.');
      check(['birthDate'], validDate(birthDate) && birthDate <= date(), 'Enter valid birth and joining dates.');
      check(['joinDate'], validDate(joinDate), 'Enter valid birth and joining dates.');
      check(['birthDate', 'joinDate'], !birthDate || !joinDate || joinDate >= birthDate, 'Enter valid birth and joining dates.');
      check(['gender'], genders.includes(gender), 'Choose a gender and job title.');
      check(['jobTitle'], next.jobTitles.includes(jobTitle), 'Choose a gender and job title.');
      check(['managerId'], managerId == null || managerId === '' || (managerId !== person?.id &&
        next.staff.some(item => item.id === managerId && item.role === 'Manager' && item.status !== 'Removed')), 'Choose a direct manager.');
      check(['branchId'], branchId == null || branchId === '' || next.locations.some(branch => branch.id === branchId),
        'Choose an available branch.');
      const periodIds = patch.periodIds ?? (Object.hasOwn(patch, 'periodId') || !person
        ? (periodId ? [periodId] : []) : defaultPeriodIds(person));
      check(['periodIds', 'periodId'], Array.isArray(periodIds) &&
        periodIds.every(id => next.workPeriods.some(period => period.id === id)), 'Choose an available period.');
      check(['contractTerm', 'contractMonths'], contractTerms.includes(contractTerm) && (contractTerm !== 'Custom' ||
        (Number.isInteger(contractMonths) && contractMonths >= 1 && contractMonths <= 600)), 'Choose a valid contract term.');
      const money = value => typeof value === 'string' && /^\d{1,9}(?:\.\d{1,2})?$/.test(value);
      check(['salary'], money(salary) && Number(salary) > 0, 'Enter valid salary amounts.');
      check(['allowances'], money(body.allowances), 'Enter valid salary amounts.');
      const otherStaff = next.staff.filter(item => item.id !== person?.id && item.status !== 'Removed');
      const duplicateEmail = changed('email') && otherStaff.some(item => string(item.email).toLowerCase() === email);
      const phoneKey = staffPhoneKey(phone);
      const duplicatePhone = changed('phone') && otherStaff.some(item => staffPhoneKey(item.phone) === phoneKey);
      demand(!(duplicateEmail && duplicatePhone), 'That email and phone number are already on the staff list.');
      demand(!duplicateEmail, 'That email is already on the staff list.');
      demand(!duplicatePhone, 'That phone number is already on the staff list.');
      const details = { email, nameAr, nameEn, phone, birthDate, gender, jobTitle, nationality, identityNumber,
        contractType, managerId: managerId || null, branchId: branchId || null, joinDate, contractTerm };
      const managerTitle = isGeneralManager({ jobTitle }) || ['مدير خدمة', 'service manager'].includes(string(jobTitle).toLowerCase());
      const defaultRole = managerTitle && next.staffRoles.includes('Manager') ? 'Manager' : 'Employee';
      const record = person ?? { id: randomUUID(), role: next.staffRoles.includes(defaultRole) ? defaultRole : null,
        status: 'Pending activation', restWeekdays: [5] };
      if (person?.status === 'Pending activation' && changed('email') && email !== person.email && person.account) {
        delete person.account.activationHash;
        delete person.account.activationExpires;
      }
      for (const [key, value] of Object.entries(details)) if (changed(key)) record[key] = value;
      if (Object.hasOwn(patch, 'iban')) {
        record.iban = patch.iban;
        if (record.bankPayment) record.bankPayment = {...record.bankPayment,account:patch.iban};
      }
      if (Object.hasOwn(patch,'gosiScheme')) record.gosiScheme = patch.gosiScheme;
      if (Object.hasOwn(patch,'gosiSaned')) record.gosiSaned = patch.gosiSaned === 'yes';
      if (Object.hasOwn(patch,'gosiBase')) record.gosiBase = patch.gosiBase === '' ? null : Number(patch.gosiBase);
      if (changed('periodIds', 'periodId')) {
        record.periodIds = [...new Set(periodIds)];
        record.periodId = record.periodIds[0] ?? '';
      }
      if (changed('periodIds', 'periodId', 'joinDate')) validateWorkOverlap(next, record);
      if (changed('nameEn')) record.name = nameEn;
      if (changed('contractTerm', 'contractMonths')) record.contractMonths = contractTerm === 'Custom' ? contractMonths : null;
      if (changed('contractType', 'probation', 'annualLeave')) Object.assign(record, { probationDays: probation, annualLeaveDays: annualLeave });
      if (hasCurrentBalance) {
        if (currentBalance === '') {
          delete record.currentLeaveBalance;
          delete record.currentLeaveBalanceDate;
          delete record.currentLeaveBalanceAt;
        } else if (!person || Number(currentBalance) !== person.currentLeaveBalance) {
          record.currentLeaveBalance = Number(currentBalance);
          record.currentLeaveBalanceDate = date();
          record.currentLeaveBalanceAt = new Date().toISOString();
        }
      }
      if (changed('salary', 'allowances')) {
        record.salary = { ...record.salary, currency: record.salary?.currency ?? 'SAR' };
        if (changed('salary')) record.salary.monthlyBase = Number(salary);
        if (changed('allowances')) record.salary.monthlyAllowances = Number(body.allowances);
      }
      if (!person) next.staff.push(record);
      break;
    }
    case '/api/staff/roles': {
      const { role, staffIds } = body;
      if (body.branchAssignments) {
        demand(next.staffRoles.includes(role), 'Choose a valid role and employees.');
        assignBranchRole(next, role, body.branchAssignments);
        break;
      }
      demand(next.staffRoles.includes(role) && Array.isArray(staffIds), 'Choose a valid role and employees.');
      const staff = next.staff.filter(person => person.status !== 'Removed');
      const selected = new Set(staffIds);
      const eligible = new Set(staff.map(person => person.id));
      demand(staffIds.every(id => eligible.has(id)), 'Choose a valid role and employees.');
      for (const person of staff) {
        if (selected.has(person.id)) person.role = role;
        else if (person.role === role && role !== 'Employee') person.role = next.staffRoles.includes('Employee') ? 'Employee' : null;
      }
      break;
    }
    case '/api/staff/remove': {
      const person = next.staff.find(item => item.id === body.staffId && item.status !== 'Removed');
      demand(person, 'Employee not found.');
      const { id, name, nameAr, nameEn, role } = person;
      next.staff[next.staff.indexOf(person)] = { id, name, nameAr, nameEn, role, status: 'Removed' };
      next.workAssignments = next.workAssignments.filter(entry => entry.staffId !== id || entry.date < date());
      for (const member of next.staff) if (member.managerId === id) member.managerId = null;
      break;
    }
    case '/api/punch': {
      const person = next.staff.find(item => item.id === employeeId && item.status === 'Active');
      demand(person, 'Employee not found.');
      const { latitude, longitude, accuracy, kind } = body;
      demand(['in', 'out'].includes(kind), 'Invalid punch type.');
      const now = Date.now();
      const last = next.punches.findLast(entry => entry.staffId === employeeId);
      const nextPunch = last?.kind === 'in' ? 'out' : 'in';
      const windows = employeePunchWindows(next, person, date());
      const timing = punchTiming(windows, now, nextPunch, openPunchShift(windows, last), last);
      demand(!timing.cooldown, 'Wait before recording another punch.');
      demand(timing.allowed && (!windows.length || kind === timing.kind), 'Outside the punch time window.');
      demand(kind === nextPunch, kind === 'out' ? 'Clock in before clocking out.' : 'You have already clocked in.');
      let attendanceLocation;
      if (!allowsAnywhere(next, person)) {
        const locations = punchLocations(next, employeeId);
        demand(locations.length > 0, 'Ask your employer to set a workplace location first.');
        demand(coordinate(latitude, 90) && coordinate(longitude, 180) && Number.isFinite(accuracy) && accuracy >= 0, 'Your phone did not return a valid location.');
        const nearby = locations.map((site) => ({ site, metres: distance(latitude, longitude, site) }))
          .filter(({ site, metres }) => metres <= site.radius).sort((a, b) => a.metres - b.metres);
        demand(nearby.length, 'You are outside the approved workplace area.');
        const match = nearby.find(({ site, metres }) => metres + accuracy <= site.radius);
        demand(match, 'Location accuracy is too low. Move closer to the workplace centre and try again.');
        attendanceLocation = match.site.name;
      }
      next.punches.push({ staffId: employeeId, kind, date: date(), time: new Date(now).toISOString(),
        ...(attendanceLocation ? { site: attendanceLocation } : {}),
        ...(timing.shiftStart == null ? {} : { shiftStart: timing.shiftStart }),
        ...(timing.shiftEnd == null ? {} : { shiftEnd: timing.shiftEnd }),
        ...(timing.flexible ? { flexible: true } : {}),
        device: body.device });
      break;
    }
    case '/api/approval-chains': {
      const { type, steps } = body;
      demand(employeeRequestTypes(next).includes(type) && Array.isArray(steps) && steps.length > 0 &&
        new Set(steps).size === steps.length &&
        steps.every(step => step === directApprovalStep || eligibleApprover(next.staff.find(person => person.id === step))),
      'Choose distinct approvers with the Manager role.');
      (next.approvalChains ??= {})[type] = steps;
      break;
    }
    case '/api/requests': {
      demand(next.staff.some(person => person.id === employeeId && person.status === 'Active'), 'Employee not found.');
      const { type, date: start, end } = body;
      const note = string(body.note);
      const leave = next.leaveTypes.includes(type);
      demand(leave || type === 'Leave cancellation' || attendanceTypes.includes(type), 'Choose a request type.');
      demand(employeeRequestEnabled(next,next.staff.find(person=>person.id===employeeId),type),'This request type is disabled.');
      const correction = type === 'Missed punch' && body.correctionReason != null;
      demand(validDate(start) && note.length <= 1000 && (note || type === 'Shift change' || (correction && body.correctionReason !== 'Other')), 'Enter a valid date and a reason.');
      demand(!(leave || type === 'Shift change') || (validDate(end) && end >= start), 'Enter an end date on or after the start date.');
      const maxDays = leave ? next.leaveSettings[type].maxDays : null;
      demand(!(maxDays > 0) || (Date.parse(end) - Date.parse(start)) / 86400000 + 1 <= maxDays,
        'The request exceeds the maximum number of days.');
      if (type === 'Annual leave') validateAnnualLeaveRequest(next, employeeId, start, end);
      const details = type === 'Loan request' ? loanRequestTerms(body) : {};
      if (type === 'Shift change') {
        demand((Date.parse(end) - Date.parse(start)) / dayMilliseconds < 366, 'Choose a date range of up to 366 days.');
        const period = next.workPeriods.find(item => item.id === body.periodId);
        demand(period, 'Choose an available period.');
        Object.assign(details, { periodId: period.id, periodName: period.name });
      }
      if (type === 'Leave cancellation') {
        const original = next.requests.find(item => item.id === body.leaveRequestId && item.staffId === employeeId &&
          item.status === 'Approved' && next.leaveTypes.includes(item.type));
        demand(original && start >= date() && start <= (original.end ?? original.date), 'Choose an approved leave and a valid return date.');
        demand(!next.requests.some(item => item.type === 'Leave cancellation' && item.leaveRequestId === original.id &&
          requestStatus(item) === 'Pending'), 'A cancellation request is already pending for this leave.');
        Object.assign(details, { leaveRequestId: original.id, originalDate: original.date, originalEnd: original.end ?? original.date });
      }
      if (correction) {
        demand(correctionReasons.includes(body.correctionReason) && start <= date(), 'Choose a valid date and correction reason.');
        const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
        const { proposedIn, proposedOut } = body;
        demand((proposedIn || proposedOut) && [proposedIn, proposedOut].every(value =>
          value == null || (typeof value === 'string' && time.test(value))), 'Choose at least one valid proposed time.');
        Object.assign(details, { correctionReason: body.correctionReason, proposedIn, proposedOut });
      }
      if (type === 'Attendance excuse') {
        for (const [field, choices] of [['excuseType', excuseTypes], ['reason', excuseReasons]]) {
          if (body[field] == null) continue;
          demand(choices.includes(body[field]), 'Choose a valid permission type and reason.');
          details[field] = body[field];
        }
      }
      if (body.attachment != null) {
        const { name, data } = body.attachment;
        demand(typeof name === 'string' && name.length <= 180 && !/[\u0000-\u001f/\\]/u.test(name) && /\.(svg|png|jpe?g|pdf|docx?|gif)$/i.test(name) &&
          typeof data === 'string' && data.length <= Math.ceil(attachmentMaxBytes / 3) * 4 && data.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(data) &&
          Buffer.from(data, 'base64').length <= attachmentMaxBytes, 'Choose a supported attachment up to 2 MB.');
        details.attachment = { name, data };
      }
      const approvalSteps = requestApprovalSteps(next, type, employeeId);
      if (approvalSteps) Object.assign(details, { approvalSteps, approvalIndex: 0 });
      next.requests.push({ id: randomUUID(), staffId: employeeId, type, date: start, end: (leave || type === 'Shift change') ? end : start, note,
        status: 'Pending', submittedOn: date(), submittedAt: new Date().toISOString(), ...details });
      break;
    }
    case '/api/decision': {
      const request = next.requests.find((item) => item.id === body.id);
      demand(request && requestStatus(request) === 'Pending' && ['Approved', 'Declined'].includes(body.status), 'This request cannot be updated.');
      demand(body.rejectionNote === undefined || (typeof body.rejectionNote === 'string' && body.rejectionNote.length <= 2000),
        'Enter notes up to 2000 characters.');
      if (body.status === 'Approved' && request.type === 'Annual leave') validateAnnualLeaveRequest(next, request.staffId, request.date, request.end, request.id);
      if (request.approvalSteps) {
        demand(eligibleApprover(reviewer) && reviewer.id === currentApprover(request),
          'Only the current approver can decide this request.');
        request.approvalHistory ??= [];
        request.approvalHistory.push({ approverId: reviewer.id, status: body.status, at: new Date().toISOString() });
        if (body.status === 'Approved' && request.approvalIndex + 1 < request.approvalSteps.length) {
          request.approvalIndex++;
          request.approvalStepStartedAt = new Date().toISOString();
          break;
        }
      }
      if (body.status === 'Approved' && request.type === 'Leave cancellation') {
        const original = next.requests.find(item => item.id === request.leaveRequestId && item.staffId === request.staffId && item.status === 'Approved');
        demand(original && request.date >= request.submittedOn && request.date <= (original.end ?? original.date),
          'Choose an approved leave and a valid return date.');
        const originalEnd = original.end ?? original.date;
        const cancelledFrom = request.date < original.date ? original.date : request.date;
        request.refundedDays = (Date.parse(originalEnd) - Date.parse(cancelledFrom)) / dayMilliseconds + 1;
        request.originalApprovalAt = original.decidedAt ?? original.submittedAt ?? original.submittedOn ?? original.date;
        request.originalLeaveType = original.type;
        original.originalEnd ??= originalEnd;
        original.cancelledFrom = cancelledFrom;
        original.cancellationRequestId = request.id;
        if (cancelledFrom <= original.date) original.status = 'Cancelled';
        else original.end = new Date(Date.parse(cancelledFrom) - dayMilliseconds).toISOString().slice(0, 10);
      }
      if (body.status === 'Approved' && request.type === 'Shift change') {
        const person = next.staff.find(item => item.id === request.staffId && item.status === 'Active');
        const period = next.workPeriods.find(item => item.id === request.periodId);
        demand(person && period, 'Choose an available period.');
        const end = request.end ?? request.date;
        demand(validDate(end) && end >= request.date && (Date.parse(end) - Date.parse(request.date)) / dayMilliseconds < 366,
          'Choose a date range of up to 366 days.');
        const days = [];
        for (let day = request.date; day <= end; day = shiftDayBy(day, 1)) days.push(day);
        reassignShiftPunches(next, person, days, period, request.id);
        next.workAssignments = next.workAssignments.filter(item => item.staffId !== person.id || item.date < request.date || item.date > end);
        for (let day = request.date; day <= end; day = shiftDayBy(day, 1)) {
          next.workAssignments.push({ staffId: person.id, date: day, periodId: request.periodId });
        }
        for (let day = request.date; day <= end; day = shiftDayBy(day, 1)) validateWorkOverlap(next, person, day);
      }
      request.status = body.status;
      if (body.status === 'Declined') request.rejectionNote = string(body.rejectionNote);
      if (reviewer) request.decidedBy = reviewer.id;
      request.decidedAt = new Date().toISOString();
      scheduleApprovedLoan(next,request,date());
      break;
    }
    default: throw new Error('Unknown action.');
  }
}

function punchLocations(workspace, employeeId) {
  const person = workspace.staff.find(item => item.id === employeeId);
  if (!allowsCompanyLocation(person)) return [];
  return workspace.locations.filter(site => coordinate(site.latitude, 90) && coordinate(site.longitude, 180) &&
    (site.staffIds?.length ? site.staffIds.includes(employeeId) : person?.branchId ? person.branchId === site.id : true));
}

async function persist(next) {
  assertRuntimeWrite();
  if (storage) {
    await storage.write({ state: next, partners, profile: platformProfile, demoCompanyStatus });
  } else {
    writeFileSync(tempFile, JSON.stringify(next, null, 2));
    renameSync(tempFile, dataFile);
  }
  state = next;
}
const secret = () => randomBytes(32).toString('hex');
const hash = value => digest(value).toString('hex');
const browserKey = req => req.headers.cookie?.match(/(?:^|;\s*)dawamkom_employee=([a-f0-9]{64})(?:;|$)/)?.[1];
const employeeCookie = (value, prefix) => `dawamkom_employee=${value}; Path=${prefix}/; HttpOnly; SameSite=Strict; Max-Age=31536000${host === '127.0.0.1' ? '' : '; Secure'}`;
const employeeSessionKey = req => req.headers.cookie?.match(/(?:^|;\s*)dawamkom_employee_session=([a-f0-9]{64})(?:;|$)/)?.[1];
const loginAge = remember => remember === 'on' ? 30 * 86400 : 86400;
const employeeSessionCookie = (value, prefix, age = 0) =>
  `dawamkom_employee_session=${value}; Path=${prefix}/; HttpOnly; SameSite=Strict; Max-Age=${age}${hostedDemo ? '; Secure' : ''}`;
function addManagerSession(account, sessionHash, age, replace) {
  account.managerSessions = [...(account.managerSessions ?? []).filter(key => key !== replace), sessionHash].slice(-20);
  account.managerSessionExpirations = Object.fromEntries(account.managerSessions.flatMap(key => {
    const expires = key === sessionHash ? Date.now() + age * 1000 : account.managerSessionExpirations?.[key];
    return expires ? [[key, expires]] : [];
  }));
}
const isGeneralManager = person => ['مدير عام', 'general manager'].includes(string(person.jobTitle).toLowerCase());
const canReviewTeam = person => person.role === 'Manager' || isGeneralManager(person);
const directDeviceApprover = (workspace, person) => workspace.staff.find(manager =>
  manager.id === person.managerId && manager.id !== person.id && manager.status === 'Active' && canReviewTeam(manager));
function deviceRequestInbox(workspace, approver, includeAll = false) {
  const permits = id => includeAll || Boolean(approver && id === approver.id);
  const deviceRequests = workspace.staff.flatMap(person => {
    if (person.status !== 'Active' || !person.account?.pendingBrowser ||
      (!includeAll && approver?.role === 'Manager' && !managesBranch(approver, person.branchId))) return [];
    const manager = directDeviceApprover(workspace, person);
    if (!permits(manager?.id)) return [];
    return [{ staffId: person.id, requestId: person.account.requestedAt, name: person.nameAr || person.name,
      submittedOn: person.account.requestedOn, approverId: manager?.id }];
  });
  const deviceHistory = (workspace.browserRequestHistory ?? []).filter(item => permits(item.approverId) &&
    (includeAll || approver?.role !== 'Manager' || workspace.staff.some(person =>
      person.id === item.staffId && managesBranch(approver, person.branchId))));
  return { deviceRequests, deviceHistory };
}
function branchWorkspace(workspace, manager) {
  const staff = workspace.staff.filter(person => person.id === manager.id ||
    managesBranch(manager, person.branchId));
  const ids = new Set(staff.map(person => person.id));
  return { ...workspace, staff, notificationDisplayByUser: undefined,
    notificationSettings: { ...workspace.notificationSettings, display: workspace.notificationDisplayByUser?.[manager.id] ?? workspace.notificationSettings?.display }, encouragementSettings: encouragementSettings(workspace, manager.branchId),
    branchEncouragementSettings: undefined, setupGuide: undefined,
    requestPreferences: effectiveRequestPreferences(workspace,manager.branchId), branchRequestPreferences: undefined,
    loanSchedules: (workspace.loanSchedules??[]).filter(schedule=>ids.has(schedule.staffId)),
    payrollRuns: (workspace.payrollRuns ?? []).map(run => ({ ...run, bank: run.banks?.[manager.branchId] ?? run.bank, banks: undefined, entries: run.entries.filter(entry => ids.has(entry.staffId)) })),
    locations: workspace.locations.filter(site => managesBranch(manager, site.id)),
    requests: workspace.requests.filter(request => ids.has(request.staffId)),
    punches: workspace.punches.filter(punch => ids.has(punch.staffId)),
    workAssignments: workspace.workAssignments.filter(entry => ids.has(entry.staffId)),
    browserRequestHistory: (workspace.browserRequestHistory ?? []).filter(entry => ids.has(entry.staffId)),
    issuedReports: (workspace.issuedReports ?? []).filter(report => managesBranch(manager, report.branchId)),
    documents: [],
  };
}
function authorizeBranchAction(workspace, manager, path, body) {
  const permitted = new Set(branchWorkspace(workspace, manager).staff.map(person => person.id));
  const branchId = body.branchId || manager.branchId || roleBranches(manager)[0];
  const error = 'This action is outside your branch permissions.';
  if (path === '/api/notification-settings' && body.key === 'display') return;
  const staffActions = ['/api/staff/update', '/api/staff/remove', '/api/staff/activation-link', '/api/staff/password',
    '/api/work-assignments', '/api/attendance-methods'];
  if (['/api/payroll','/api/request-preferences'].includes(path)) { demand(manager.branchId, error); return; }
  if (path === '/api/encouragement-settings') { demand(manager.branchId, error); return; }
  if (path === '/api/work-assignments' && body.batch !== undefined) {
    demand(Array.isArray(body.batch) && body.batch.length > 0 && body.batch.length <= 3500, error);
    for (const entry of body.batch) { demand(entry && !Object.hasOwn(entry,'batch'),error); authorizeBranchAction(workspace,manager,path,entry); }
    return;
  }
  if (staffActions.includes(path)) {
    demand(permitted.has(body.staffId), error);
    if (Object.hasOwn(body, 'branchId')) demand(managesBranch(manager, body.branchId), error);
    if (body.managerId) demand(permitted.has(body.managerId), error);
    return;
  }
  if (path === '/api/staff') {
    demand(managesBranch(manager, branchId), error);
    body.branchId = branchId;
    if (body.managerId) demand(permitted.has(body.managerId), error);
    return;
  }
  if (path === '/api/decision') {
    demand(permitted.has(workspace.requests.find(request => request.id === body.id)?.staffId), error);
    return;
  }
  if (path === '/api/issued-reports') {
    demand(manager.branchId, error);
    return;
  }
  if (path === '/api/locations') {
    demand(managesBranch(manager, body.id), error);
    demand(!body.staffIds || body.staffIds.every(id => permitted.has(id)), error);
    return;
  }
  throw new Error(error);
}
const isDirectReport = (person, manager) => person && person.status === 'Active' &&
  person.id !== manager.id && person.managerId === manager.id;
const canUseMultipleDevices = person => person.role === 'Manager' || isGeneralManager(person);
function signedInEmployee(workspace, browser, sessionHash) {
  const now = Date.now();
  return workspace.staff.find(person => person.status === 'Active' && person.account && (
    (canUseMultipleDevices(person) && sessionHash && person.account.managerSessions?.includes(sessionHash) &&
      (person.account.managerSessionExpirations?.[sessionHash] ?? Infinity) > now) ||
    (browser && person.account.browser === browser &&
      (person.account.sessionHash === undefined || (sessionHash && person.account.sessionHash === sessionHash &&
        (person.account.employeeSessionExpires ?? Infinity) > now)))
  ));
}
function deviceLabel(req) {
  const agent = req.headers['user-agent'] ?? '';
  const platform = ['iPhone', 'iPad', 'Android', 'Windows', 'Macintosh', 'Linux'].find(name => agent.includes(name));
  const browser = [['Edg', 'Edge'], ['Firefox', 'Firefox'], ['Chrome', 'Chrome'], ['Safari', 'Safari']]
    .find(([token]) => agent.includes(token))?.[1];
  return [platform, browser].filter(Boolean).join(' · ') || 'Unknown device';
}
const publicState = workspace => ({
  ...workspace,
  payrollRuns: publicPayrollRuns(workspace.payrollRuns),
  documents: (workspace.documents ?? []).map(({ data, ...document }) => document),
  issuedReports: (workspace.issuedReports ?? []).map(({ rows, ...report }) => report),
  requests: workspace.requests.map(requestSummary),
  staff: workspace.staff.map(({ account, ...person }) => ({
    ...person, approvedDevice: canUseMultipleDevices(person) ? null : account?.browserDevice ?? null,
    canCopyActivation: person.status === 'Pending activation' && Boolean(account),
    activationEmailSent: person.status === 'Pending activation' && activationEmailSent(account,person.email),
  })),
  today: date(),
});
const invalidInvitation = 'رابط التفعيل غير صالح أو منتهي.';
function invitedEmployee(workspace, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return;
  const tokenHash = hash(token);
  return workspace.staff.find(person => person.status === 'Pending activation' &&
    person.account?.activationHash === tokenHash && person.account.activationExpires > Date.now());
}

async function deliverInvitation({ email, name, introduction, url }) {
  if (!runtime.delivery) return {delivery: 'manual', url};
  const message = {
    to: email,
    subject: 'مرحبًا بك في dawamkom | تفعيل حسابك',
    text: [
      'مرحبًا ' + name + '،',
      introduction,
      'افتح الرابط التالي لتعيين كلمة المرور وتأكيدها وتفعيل حسابك.',
      url,
      'الرابط صالح لمدة 48 ساعة.',
    ].join('\n\n'),
  };
  const sender = process.env.DAWAMAK_SES_FROM;
  const endpoint = process.env.DAWAMAK_MAIL_WEBHOOK;
  if (sender && process.env.DAWAMAK_PUBLIC_ORIGIN) {
    try {
      const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
      const client = new SESv2Client({ region: process.env.DAWAMAK_SES_REGION || 'us-east-1' });
      try {
        await client.send(new SendEmailCommand({
          FromEmailAddress: sender,
          Destination: { ToAddresses: [message.to] },
          Content: { Simple: {
            Subject: { Charset: 'UTF-8', Data: message.subject },
            Body: { Text: { Charset: 'UTF-8', Data: message.text } },
          } },
        }), { abortSignal: AbortSignal.timeout(5000) });
        return { delivery: 'sent', url };
      } finally {
        client.destroy();
      }
    } catch (error) {
      console.error('SES invitation failed:', error.name);
      return { delivery: 'manual', url };
    }
  }
  if (endpoint && process.env.DAWAMAK_PUBLIC_ORIGIN) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (process.env.DAWAMAK_MAIL_TOKEN ?? '') },
        body: JSON.stringify(message),
      });
      if (response.ok) return { delivery: 'sent', url };
    } catch { /* Keep the account and provide the link for manual delivery. */ }
  }
  return { delivery: 'manual', url };
}

async function deliverRecoveryMail(job, changed=false) {
  if(!runtime.delivery)return;
  const label=job.kind==='company'?'مسؤول الحساب':'الموظف';
  const subject=changed?'تم تغيير كلمة مرور حسابك في دوامكم':'إعادة تعيين كلمة المرور | دوامكم';
  const text=changed?'تم تغيير كلمة مرور حساب '+label+' في '+job.company+'. إذا لم تقم بهذا التغيير، تواصل معنا فورًا.':
    'وصلنا طلب لإعادة تعيين كلمة مرور حساب '+label+' في '+job.company+'. استخدم الرابط أدناه لتعيين كلمة مرور جديدة.';
  const note=changed?'سجّل الدخول باستخدام كلمة المرور الجديدة. لا نرسل كلمات المرور عبر البريد.':'الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة فقط. إذا لم تطلب التغيير، تجاهل هذه الرسالة؛ لن تتغير كلمة مرورك.';
  const message={to:job.email,subject,text:[text,changed?'':job.url,note].filter(Boolean).join('\n\n'),html:accountEmail({title:subject,name:job.name,text,url:changed?undefined:job.url,note})};
  try {
    if(process.env.DAWAMAK_SES_FROM){
      const {SESv2Client,SendEmailCommand}=await import('@aws-sdk/client-sesv2');
      const client=new SESv2Client({region:process.env.DAWAMAK_SES_REGION||'us-east-1',maxAttempts:1});
      try {await client.send(new SendEmailCommand({FromEmailAddress:process.env.DAWAMAK_SES_FROM,ReplyToAddresses:['info@dawamkom.net'],Destination:{ToAddresses:[message.to]},Content:{Simple:{Subject:{Charset:'UTF-8',Data:subject},Body:{Text:{Charset:'UTF-8',Data:message.text},Html:{Charset:'UTF-8',Data:message.html}}}}}),{abortSignal:AbortSignal.timeout(10000)});}
      finally {client.destroy();}
    }else if(process.env.DAWAMAK_MAIL_WEBHOOK){
      await fetch(process.env.DAWAMAK_MAIL_WEBHOOK,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+(process.env.DAWAMAK_MAIL_TOKEN??'')},body:JSON.stringify(message)});
    }
  }catch(error){console.error('Password recovery mail unavailable:',error.name);}
}
const recoveryThrottle=new RecoveryThrottle();

const invitationOrigin = () => process.env.DAWAMAK_PUBLIC_ORIGIN ??
  (!hostedDemo ? 'http://127.0.0.1:' + server.address().port : '');
const demoCompanyId = 'xyz-demo';
const sampleCompanyConfig = process.env.DAWAMAK_SAMPLE_COMPANY;
const publicPartners = () => [
  ...(sampleCompanyConfig || demoCompanyStatus === 'deleted' ? [] : [{
    id: demoCompanyId, name: state.company, email: state.organization?.email,
    phone: state.organization?.phone, contactName: state.organization?.contactName,
    active: true, suspended: demoCompanyStatus === 'suspended',
  }]),
  ...partners.map(({ id, name, email, phone, contactName, account, suspended }) =>
    ({ id, name, email, phone, contactName, active: Boolean(account?.passwordHash), suspended: Boolean(suspended),activationEmailSent:activationEmailSent(account,email) })),
];
const partnerOrganization = ({ name, email, phone, contactName }, profile) =>
  ({ name, phone, contactName: contactName ?? '', ...profile, email: profile?.email || email });
const newPartnerWorkspace = (company, slug) => ({
  ...structuredClone(demoSeed), staff: [], requests: [], company, slug, jobTitles: [...jobTitles],
});
if (sampleCompanyConfig && !initialSnapshot) {
  const profile = JSON.parse(sampleCompanyConfig);
  const email = string(profile.email).toLowerCase();
  const sample = { id: string(profile.id) || randomUUID(), name: string(profile.name),
    email, phone: string(profile.phone), contactName: string(profile.contactName) };
  if (!partners.some(item => item.id === sample.id || item.email === email)) {
    const workspace = newPartnerWorkspace(sample.name, sample.id);
    let account = {};
    if (profile.snapshot) {
      const { workspace: saved, account: savedAccount } = profile.snapshot;
      const credentials = ({ salt, passwordHash } = {}) =>
        /^[a-f0-9]{64}$/.test(salt) && /^[a-f0-9]{128}$/.test(passwordHash) ? { salt, passwordHash } : null;
      account = credentials(savedAccount);
      if (!account || !Array.isArray(saved?.staff) || saved.slug !== sample.id) {
        throw new Error('The sample company snapshot needs a matching workspace and company credentials.');
      }
      Object.assign(workspace, saved, { company: sample.name, slug: sample.id });
      workspace.staff = saved.staff.map(({ account: savedStaffAccount, canCopyActivation, approvedDevice, ...person }) => {
        if (person.status === 'Pending activation') return { ...person, account: {} };
        if (person.status !== 'Active') return person;
        const staffAccount = credentials(savedStaffAccount);
        if (!staffAccount) throw new Error('The sample company snapshot is missing credentials for an active employee.');
        return { ...person, account: staffAccount };
      });
    }
    workspace.organization = partnerOrganization(sample, workspace.organization);
    const seededPartners = [...partners, { ...sample, workspace, account, suspended: false }];
    if (storage) partners = seededPartners;
    else await persistPlatform(seededPartners, platformProfile);
  }
}
if (storage && !initialSnapshot) {
  await storage.write({ state, partners, profile: platformProfile, demoCompanyStatus });
}
const companyPage = (name, email, activate, unified = false, logo = '') => {
  const escape = value => value.replace(/[&<>"']/g, char => '&#' + char.charCodeAt(0) + ';');
  return '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="theme-color" content="#103c45"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">' +
    '<meta name="apple-mobile-web-app-title" content="دوامكم"><script src="/theme.js"></script><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/theme.css"><title>دوامكم</title>' +
    '<body class="workspace-login company-access"><main class="workspace-login-main preview-access">' +
    '<div class="workspace-login-brand brand">' + (logo ? '<span class="company-login-logo"><img src="' + escape(logo) +
      '" alt=""></span>' : '<span class="mark" aria-hidden="true"></span><span>دوامكم</span>') + '</div><h1>' +
    escape(name) + '</h1>' + (activate ? '<p><bdi>' + escape(email) + '</bdi></p>' : '') + '<form id="company-auth" data-action="' +
    (activate ? 'activate' : unified ? 'access' : 'login') + '">' +
    (unified ? '<label id="company-access-email">البريد الإلكتروني<input name="email" type="email" autocomplete="username" required></label>' : '') +
    '<label>كلمة المرور<input name="password" type="password" maxlength="128" required></label>' +
    (activate ? '<p>استخدم 10 أحرف على الأقل مع حرف إنجليزي كبير وصغير ورقم ورمز.</p><label>تأكيد كلمة المرور<input name="confirmation" type="password" maxlength="128" required></label>' : '') +
    (activate ? '' : '<label class="remember-login"><input type="checkbox" name="remember">تذكّرني على هذا الجهاز</label>') +
    '<button class="button primary">' + (activate ? 'تفعيل الشركة' : 'دخول') +
    '</button>' + (unified ? '<button id="company-access-change" class="button secondary" type="button" hidden>طلب تغيير المتصفح</button>' : '') +
    '<p role="status"></p></form>'+(activate?'':'<p><a href="/forgot-password" data-company-forgot>نسيت كلمة المرور؟</a></p>')+'</main><script type="module" src="/company-auth.js"></script></body></html>';
};
function appManifest(startUrl, scope) {
  return JSON.stringify({
    id: startUrl,
    name: 'دوامكم',
    short_name: 'دوامكم',
    lang: 'ar',
    dir: 'rtl',
    start_url: startUrl,
    scope,
    display: 'standalone',
    theme_color: '#17353c',
    background_color: '#131d21',
    icons: [192, 512].map(size => ({
      src: '/app-icon-' + size + '.png',
      sizes: size + 'x' + size,
      type: 'image/png',
    })),
  });
}
export async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const companyRoute = url.pathname.match(/^\/company\/([a-f0-9-]{36})(\/.*)?$/);
  const path = companyRoute ? companyRoute[2] || '/' : url.pathname;
  const partner = companyRoute && partners.find(item => item.id === companyRoute[1]);
  const companyPrefix = partner ? '/company/' + partner.id : '';
  const companyCredential = req.headers.cookie?.match(/(?:^|;\s*)dawamkom_company=([a-f0-9]{64})(?:;|$)/)?.[1];
  const signedIntoCompany = Boolean(partner && companyCredential && partner.account?.sessionHash === hash(companyCredential) &&
    partner.account.sessionExpires > Date.now());
  const key = browserKey(req);
  const browser = key && hash(key);
  const sessionKey = employeeSessionKey(req);
  const sessionHash = sessionKey && hash(sessionKey);
  const companyEmployee = partner && signedInEmployee(partner.workspace, browser, sessionHash);
  const canManageCompany = companyEmployee?.role === 'Manager';
  const hasCompanyAccess = signedIntoCompany || canManageCompany;
  if (!companyRoute && req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Cache-Control': 'no-store' });
    return res.end('OK');
  }
  let cookie;
  const send = (code, value, type = 'application/json') => {
    const headers = { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
    if (cookie) headers['Set-Cookie'] = cookie;
    res.writeHead(code, headers);
    res.end(type === 'application/json' ? JSON.stringify(value) : type === 'text/html' ? String(value).replaceAll('__DAWAMKOM_RELEASE__', releaseVersion) : value);
  };
  try {
    if (!companyRoute && req.method === 'GET' && path === '/api/version') return send(200, {version: releaseVersion});
    if(!companyRoute && ['/api/password-recovery','/api/password-reset'].includes(path)){
      if(req.method!=='POST')return send(405,{error:'Method not allowed.'});
      if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Expected JSON.'});
      const started=Date.now();
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>4096)return send(413,{error:'Request too large.'});chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{error:'الطلب غير صالح.'});}
      if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{error:'الطلب غير صالح.'});
      const origin=process.env.DAWAMAK_PUBLIC_ORIGIN||(!hostedDemo?'http://127.0.0.1:'+server.address().port:null);
      if(!origin)return send(503,{error:'الخدمة غير متاحة حاليًا.'});
      if(req.headers.origin && req.headers.origin!==new URL(origin).origin)return send(403,{error:'الطلب غير صالح.'});
      const source=hash(String(req.headers['x-forwarded-for']??req.socket.remoteAddress??'').split(',')[0].trim());
      const allowed=recoveryThrottle.allow(source);
      if(path==='/api/password-recovery'){
        const email=string(body.email).toLowerCase(),kind=body.kind??'all';
        if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['all','company','employee'].includes(kind)||body.companyId!==undefined&&!/^[a-f0-9-]{36}$/.test(body.companyId))return send(400,{error:'أدخل بريدًا إلكترونيًا صحيحًا.'});
        if(allowed){
          const next=structuredClone(partners);
          const jobs=requestRecovery(next,{email,kind,companyId:body.companyId},{origin});
          if(jobs.length){await persistPlatform(next,platformProfile);for(const job of jobs)setImmediate(()=>void deliverRecoveryMail(job)).unref();}
        }
        await new Promise(resolve=>setTimeout(resolve,Math.max(0,350-(Date.now()-started))));
        return send(200,{message:recoveryMessage});
      }
      if(!allowed)return send(429,{error:'محاولات كثيرة. حاول لاحقًا.'});
      const next=structuredClone(partners);let notice;
      try{notice=consumeRecovery(next,body);}catch(error){await new Promise(resolve=>setTimeout(resolve,Math.max(0,350-(Date.now()-started))));return send(400,{error:error.message});}
      await persistPlatform(next,platformProfile);
      setImmediate(()=>void deliverRecoveryMail(notice,true)).unref();
      return send(200,{message:'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.'});
    }
    if (!companyRoute && req.method === 'GET' && path === '/dawamkom.webmanifest') {
      return send(200, appManifest('/', '/'), 'application/manifest+json');
    }
    if (companyRoute) {
      if (!partner) return send(404, { error: 'الشركة غير موجودة.' });
      if (partner.suspended) return send(403, { error: 'تم إيقاف الوصول إلى حساب الشركة.' });
      if (req.method === 'GET' && path === '/api/company-session') {
        return send(hasCompanyAccess ? 200 : 401, { signedIn: hasCompanyAccess });
      }
      if (req.method === 'GET' && path === '/employee.webmanifest') {
        return send(200, appManifest(companyPrefix + '/employee', companyPrefix + '/'), 'application/manifest+json');
      }
      if (req.method === 'GET' && ['/activate', '/login', '/access'].includes(path)) {
        if (path !== '/activate' && hasCompanyAccess) {
          res.writeHead(303, { Location: companyPrefix + '/', 'Cache-Control': 'no-store' });
          return res.end();
        }
        return send(200, companyPage(partner.workspace.organization?.name || partner.workspace.company || partner.name,
          partner.email, path === '/activate', path === '/access', partner.workspace.organization?.logo), 'text/html');
      }
      if (req.method === 'POST' && ['/activate', '/login', '/access'].includes(path)) {
        if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'Expected JSON.' });
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4096) return send(413, { error: 'Request too large.' });
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks)); }
        catch { return send(400, { error: 'الطلب غير صالح.' }); }
        const current = partners.find(item => item.id === partner.id);
        if (!current) return send(404, { error: 'الشركة غير موجودة.' });
        if (current.suspended) return send(403, { error: 'تم إيقاف الوصول إلى حساب الشركة.' });
        const account = current.account;
        const password = body?.password;
        if (typeof password !== 'string' || password.length > 128) return send(400, { error: 'كلمة المرور غير صالحة.' });
        let credentials = account;
        if (path === '/activate') {
          if (typeof body.token !== 'string' || account?.activationHash !== hash(body.token) || account.activationExpires <= Date.now()) {
            return send(400, { error: invalidInvitation });
          }
          if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) ||
            !/[0-9]/.test(password) || !/[\p{P}\p{S}]/u.test(password) || password !== body.confirmation) {
            return send(400, { error: 'تأكد من شروط كلمة المرور وتطابقها.' });
          }
          const salt = secret();
          credentials = { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
        } else if ((path === '/access' && string(body.email).toLowerCase() !== current.email) || !account?.passwordHash ||
          !timingSafeEqual(scryptSync(password, account.salt, 64), Buffer.from(account.passwordHash, 'hex'))) {
          return send(401, { error: 'بيانات الدخول غير صحيحة.' });
        }
        const session = secret();
        const age = loginAge(body.remember);
        const updated = { ...current, account: { ...credentials, sessionHash: hash(session), sessionExpires: Date.now() + age * 1000 } };
        cookie = 'dawamkom_company=' + session + '; Path=' + companyPrefix + '/; HttpOnly; SameSite=Strict; Max-Age=' + age +
          (hostedDemo ? '; Secure' : '');
        if (path === '/access') {
          const manager = current.workspace.staff.find(person => person.email === current.email && person.status === 'Active' &&
            isGeneralManager(person) && person.account?.passwordHash);
          if (manager && timingSafeEqual(scryptSync(password, manager.account.salt, 64), Buffer.from(manager.account.passwordHash, 'hex'))) {
            const managerSession = secret();
            const account = { ...manager.account };
            addManagerSession(account, hash(managerSession), age);
            updated.workspace = { ...current.workspace, staff: current.workspace.staff.map(person => person.id === manager.id ? {
              ...person, account,
            } : person) };
            cookie = [cookie, employeeSessionCookie(managerSession, companyPrefix, age)];
          }
        }
        await persistPlatform(partners.map(item => item.id === current.id ? updated : item), platformProfile);
        return send(200, { url: companyPrefix + '/' });
      }
      if (path !== '/employee' && !path.startsWith('/api/employee/')) {
        if (!hasCompanyAccess) {
          if (path.startsWith('/api/')) return send(401, { error: 'سجّل الدخول إلى حساب الشركة.' });
          res.writeHead(303, { Location: companyPrefix + '/login', 'Cache-Control': 'no-store' });
          return res.end();
        }
        if (req.method === 'POST' && path === '/logout') {
          if (!signedIntoCompany) {
            const workspace = structuredClone(partner.workspace);
            const account = workspace.staff.find(person => person.id === companyEmployee.id).account;
            if (account.managerSessions?.includes(sessionHash)) {
              account.managerSessions = account.managerSessions.filter(key => key !== sessionHash);
              if (account.managerSessionExpirations) delete account.managerSessionExpirations[sessionHash];
            } else {
              account.sessionHash = null;
            }
            await persistPlatform(partners.map(item => item.id === partner.id ? { ...item, workspace } : item), platformProfile);
            res.writeHead(303, { Location: companyPrefix + '/employee', 'Cache-Control': 'no-store',
              'Set-Cookie': employeeSessionCookie('', companyPrefix) });
            return res.end();
          }
          const account = { ...partner.account };
          delete account.sessionHash;
          delete account.sessionExpires;
          const key = employeeSessionKey(req);
          const managerSession = key && hash(key);
          const manager = managerSession && partner.workspace.staff.find(person => person.email === partner.email &&
            person.account?.managerSessions?.includes(managerSession));
          const workspace = manager ? { ...partner.workspace, staff: partner.workspace.staff.map(person => person.id === manager.id ? {
            ...person, account: { ...person.account, managerSessions: person.account.managerSessions.filter(item => item !== managerSession) },
          } : person) } : partner.workspace;
          await persistPlatform(partners.map(item => item.id === partner.id ? { ...item, account, workspace } : item), platformProfile);
          const clearCompany = 'dawamkom_company=; Path=' + companyPrefix + '/; HttpOnly; Max-Age=0';
          res.writeHead(303, { Location: companyPrefix + '/login',
            'Set-Cookie': manager ? [clearCompany, employeeSessionCookie('', companyPrefix)] : clearCompany });
          return res.end();
        }
        if (path !== '/' && !path.startsWith('/api/')) return send(404, { error: 'Page not found.' });
      }
    }
    if (!partner && (path === '/super-admin' || path === '/api/partners' || path === '/api/platform-organization')) {
      if (hostedDemo && !isAdmin(req)) {
        if (path === '/super-admin') {
          res.writeHead(303, { Location: '/admin?next=super-admin', 'Cache-Control': 'no-store' });
          return res.end();
        }
        return send(403, { error: 'Administrator access required.' });
      }
      if (path !== '/super-admin') {
        if (req.method === 'GET') return send(200, { partners: publicPartners(), organization: platformProfile });
        if (req.method !== 'POST') return send(405, { error: 'Method not allowed.' });
        if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'Expected JSON.' });
        let body;
        try {
          let size = 0;
          const chunks = [];
          for await (const chunk of req) {
            size += chunk.length;
            if (size > (path === '/api/partners' ? 4096 : organizationBodyLimit)) return send(413, { error: 'Request too large.' });
            chunks.push(chunk);
          }
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch { return send(400, { error: 'Expected JSON.' }); }
        if (path === '/api/platform-organization') {
          let profile;
          try { profile = organizationProfile(body ?? {}, platformProfile); }
          catch (error) { return send(400, { error: error.message }); }
          await persistPlatform(partners, profile);
          return send(200, { partners: publicPartners(), organization: platformProfile });
        }
        if (body?.operation === 'status' || body?.operation === 'delete') {
          if (body.operation === 'status' && typeof body.suspended !== 'boolean') {
            return send(400, { error: 'حالة الشركة غير صالحة.' });
          }
          if (body.id === demoCompanyId) {
            if (demoCompanyStatus === 'deleted') return send(404, { error: 'الشركة غير موجودة.' });
            const status = body.operation === 'delete' ? 'deleted' : body.suspended ? 'suspended' : 'active';
            await persistPlatform(partners, platformProfile, status);
            return send(200, { partners: publicPartners(), organization: platformProfile });
          }
          const current = partners.find(item => item.id === body.id);
          if (!current) return send(404, { error: 'الشركة غير موجودة.' });
          if (body.operation === 'delete') {
            await persistPlatform(partners.filter(item => item.id !== current.id), platformProfile);
          } else {
            const account = { ...current.account };
            if (body.suspended) {
              delete account.sessionHash;
              delete account.sessionExpires;
            }
            const updated = { ...current, suspended: body.suspended, account };
            await persistPlatform(partners.map(item => item.id === current.id ? updated : item), platformProfile);
          }
          return send(200, { partners: publicPartners(), organization: platformProfile });
        }
        const manual = body?.operation === 'activation-link';
        const editing = body?.operation === 'update';
        const pending = manual ? partners.find(item => item.id === body.id && !item.suspended && !item.account?.passwordHash) : null;
        if (manual && !pending) return send(404, { error: 'الشركة غير متاحة للتفعيل.' });
        const details = pending ?? body;
        const name = string(details?.name), email = string(details?.email).toLowerCase(), phone = string(details?.phone);
        const contactName = string(details?.contactName);
        if (!contactName || contactName.length > 120) {
          return send(400, { error: 'أدخل اسم الشخص المخوّل (حتى 120 حرفًا).' });
        }
        if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          phone.length > 40 || !/^[+0-9٠-٩۰-۹().\s-]+$/.test(phone) || (phone.match(/[0-9٠-٩۰-۹]/g)?.length ?? 0) < 7) {
          return send(400, { error: 'Enter a company name, valid email and contact number.' });
        }
        if (editing) {
          const company = partners.find(item => item.id === body.id);
          if (!company) return send(404, { error: 'الشركة غير موجودة.' });
          if (partners.some(item => item.id !== company.id && item.email === email)) {
            return send(409, { error: 'البريد الإلكتروني مرتبط بشركة أخرى.' });
          }
          const profile = { name, email, phone, contactName };
          let account = company.email !== email && !company.account?.passwordHash ? {} : company.account;
          try { account = updatedCompanyCredentials(account, body.password, body.confirmation); }
          catch (error) { return send(400, { error: error.message }); }
          const record = { ...company, ...profile, account, workspace: { ...company.workspace, company: name,
            organization: { ...company.workspace.organization, ...profile } } };
          await persistPlatform(partners.map(item => item.id === company.id ? record : item), platformProfile);
          return send(200, { partners: publicPartners(), organization: platformProfile });
        }
        const origin = invitationOrigin();
        if (!origin) return send(503, { error: 'Configure the public invitation origin.' });
        const existing = partners.find(item => item.email === email);
        if (existing?.account?.passwordHash) return send(409, { error: 'هذه الشركة مفعّلة بالفعل.' });
        const token = secret(), id = existing?.id ?? randomUUID();
        const workspace = existing?.workspace ?? newPartnerWorkspace(name, id);
        const record = { id, name, email, phone, contactName, suspended: existing?.suspended ?? false,
          workspace: { ...workspace, organization: partnerOrganization({ name, email, phone, contactName }, existing?.workspace?.organization) },
          account: { activationHash: hash(token), activationExpires: Date.now() + 48 * 3600000 } };
        const nextPartners = [...partners.filter(item => item.id !== id), record];
        await persistPlatform(nextPartners, platformProfile);
        const url = new URL('/company/' + id + '/activate', origin);
        url.hash = 'activate=' + token;
        const invitation = manual ? { url: url.href } : await deliverInvitation({
          email, name: contactName, url: url.href,
          introduction: 'تمت إضافة شركة ' + name + ' إلى دوامكم. فعّل حسابك لإدارة الشركة.',
        });
        if(invitation.delivery==='sent'&&recordActivationEmail(record.account,email))await persistPlatform(nextPartners,platformProfile);
        return send(201, { partners: publicPartners(), organization: platformProfile, invitation });
      }
    }
    if (path === '/admin' || path.startsWith('/admin/')) return await handleAdmin(req, res, url);
    if (!companyRoute && req.method === 'GET' && path === '/') {
      return send(200, readFileSync(new URL('./public/workspace-login.html', import.meta.url)), 'text/html');
    }
    if (!companyRoute && path === '/api/workspace-lookup') {
      if (req.method !== 'POST') return send(405, { error: 'Method not allowed.' });
      if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'Expected JSON.' });
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024) return send(413, { error: 'Request too large.' });
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks)); }
      catch { return send(400, { error: 'Invalid request.' }); }
      const email = string(input?.email).toLowerCase();
      const name = string(input?.name).toLowerCase();
      if ((!email && !name) || (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) || name.length > 120) {
        return send(400, { error: 'Invalid search.' });
      }
      const matches = [];
      for (const company of partners) {
        if (company.suspended || !company.account?.passwordHash) continue;
        const prefix = '/company/' + company.id;
        const companyName = company.workspace.organization?.name || company.name;
        if (email ? company.email === email : companyName.toLowerCase() === name) {
          matches.push({ name: companyName, role: 'admin', url: prefix + '/login' });
        }
        if (email && company.workspace.staff.some(person => person.email === email && person.status === 'Active' && person.account?.passwordHash)) {
          matches.push({ name: companyName, role: 'employee', url: prefix + '/employee' });
        }
      }
      return send(200, { matches });
    }
    if (!companyRoute && demoCompanyStatus !== 'active' && (path === '/demo' || path === '/employee' || path.startsWith('/api/'))) {
      const deleted = demoCompanyStatus === 'deleted';
      const message = deleted ? 'تم حذف الشركة التجريبية.' : 'تم إيقاف الشركة التجريبية.';
      if (path.startsWith('/api/')) return send(deleted ? 404 : 403, { error: message });
      return send(deleted ? 404 : 403, '<!doctype html><html lang="ar" dir="rtl" data-theme="dark"><meta charset="utf-8"><script src="/theme.js"></script><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/theme.css"><main><p>' +
        message + '</p><a href="/super-admin#partners">إدارة الشركات</a></main></html>', 'text/html');
    }
    if (!companyRoute && demoCompanyStatus === 'active' && req.method === 'GET' && path === '/employee.webmanifest') {
      return send(200, appManifest('/employee', '/'), 'application/manifest+json');
    }
    if (req.method === 'GET' && path === '/employee') return send(200, employeePage.replace('<!-- company-workspace-link -->', ''), 'text/html');
    if (path === '/preview-access') {
      res.writeHead(303, { Location: '/demo#staff', 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (req.method === 'GET' && files.has(path)) {
      const [file, type] = files.get(path);
      return send(200, readFileSync(new URL('./public/' + file, import.meta.url)), type);
    }
    let demo;
    const workspace = partner
      ? { ...partner.workspace, organization: partnerOrganization(partner, partner.workspace.organization) }
      : state;
    const employee = partner ? companyEmployee : signedInEmployee(workspace, browser, sessionHash);
    const branchManager = partner && !signedIntoCompany && canManageCompany ? { ...employee,
      branchId: managesBranch(employee, employee.branchId) ? employee.branchId : roleBranches(employee)[0] ?? null } : null;
    const visibleWorkspace = source => branchManager ? branchWorkspace(source, branchManager) : source;
    const saveWorkspace = async next => {
      if (!partner) return persist(next);
      await persistPlatform(partners.map(item => item.id === partner.id ? { ...item, workspace: next } : item), platformProfile);
    };
    const admin = partner ? true : isAdmin(req);
    if (hostedDemo && !admin && path.startsWith('/api/') && !path.startsWith('/api/employee/')) ({ demo, cookie } = demoWorkspace(req));
    if (req.method === 'GET' && path === '/api/account') {
      if (!signedIntoCompany && !employee) return send(401, { error: 'سجّل الدخول أولًا.' });
      return send(200, signedIntoCompany ? { name: partner.contactName || partner.name, email: partner.email, owner: true, photo: partner.account.photo || '' } :
        { id: employee.id, name: employee.nameAr || employee.name, email: employee.email, owner: false, photo: employee.photo || '' });
    }
    if (req.method === 'GET' && path === '/api/state') return send(200, {
      ...publicState(visibleWorkspace(demo?.state ?? workspace)), admin, isCompanyOwner: Boolean(signedIntoCompany), canManageCompany });
    if (req.method === 'GET' && path === '/api/documents') {
      const document = visibleWorkspace(demo?.state ?? workspace).documents?.find(item => item.id === url.searchParams.get('id'));
      if (!document) return send(404, { error: 'Document not found.' });
      const extension = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }[document.mime];
      const name = document.name.replace(/\.(pdf|png|jpe?g)$/i, '') + '.' + extension;
      res.writeHead(200, { 'Content-Type': document.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(name.toWellFormed()).replace(/['()]/g, character => '%' + character.charCodeAt(0).toString(16)) });
      return res.end(Buffer.from(document.data, 'base64'));
    }
    if (req.method === 'GET' && path === '/api/payroll-attachment') {
      const run = visibleWorkspace(demo?.state ?? workspace).payrollRuns?.find(item => item.month === url.searchParams.get('month'));
      const entry = run?.entries.find(item => item.staffId === url.searchParams.get('staffId'));
      const attachment = entry?.adjustments.find(item => item.id === url.searchParams.get('id') && !item.removedAt)?.attachment;
      if (!attachment) return send(404, { error: 'Attachment not found.' });
      res.writeHead(200, { 'Content-Type': attachment.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(attachment.name.toWellFormed()).replace(/['()]/g, character => '%' + character.charCodeAt(0).toString(16)) });
      return res.end(Buffer.from(attachment.data, 'base64'));
    }
    if (req.method === 'GET' && path === '/api/issued-reports') {
      const report = visibleWorkspace(demo?.state ?? workspace).issuedReports?.find(item => item.id === url.searchParams.get('id'));
      return report ? send(200, report) : send(404, { error: 'Report not found.' });
    }
    if (req.method === 'GET' && path === '/api/requests') {
      const current = visibleWorkspace(demo?.state ?? workspace);
      return send(200, { requests: current.requests.map(requestSummary), leaveTypes: current.leaveTypes,
        ...deviceRequestInbox(current, employee, signedIntoCompany), deviceReviewerId: employee?.id,
        reviewerId: eligibleApprover(employee) ? employee.id : undefined, companyReviewer: signedIntoCompany,
        staff: current.staff.map(({ id, name, nameAr, nameEn, jobTitle, managerId }) => ({ id, name, nameAr, nameEn, jobTitle, managerId })) });
    }
    if (req.method === 'GET' && (path.startsWith('/api/request-attachment/') || path.startsWith('/api/employee/request-attachment/'))) {
      const own=path.startsWith('/api/employee/');
      const attachment = (own?workspace:visibleWorkspace(demo?.state ?? workspace)).requests.find(item => item.id === path.split('/').at(-1) && (!own || employee && item.staffId===employee.id))?.attachment;
      if (!attachment) return send(404, { error: 'Attachment not found.' });
      const filename = encodeURIComponent(attachment.name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16));
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': "attachment; filename*=UTF-8''" + filename,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(Buffer.from(attachment.data, 'base64'));
    }
    if (req.method === 'GET' && path === '/api/employee/session') {
      if (!employee) return send(401, { pending: Boolean(browser && workspace.staff.some(person => person.account?.pendingBrowser === browser)) });
      const today = date();
      const lastPunch = workspace.punches.findLast(entry => entry.staffId === employee.id);
      const punchedIn = lastPunch?.kind === 'in';
      const now = Date.now();
      const punchWindows = employeePunchWindows(workspace, employee, today);
      const midnight = Date.parse(today + 'T00:00:00+03:00');
      const shifts = [shiftDayBy(today, -1), today].flatMap(day => effectiveRanges(workspace, employee, day))
        .filter(shift => shift.end > midnight).sort((a, b) => a.start - b.start);
      const shift = shifts.find(item => item.end > now) ?? shifts.at(-1);
      const flexibleTotals = flexibleDayTotals(workspace.punches.filter(entry => entry.staffId === employee.id), today, now,
        shift && isFlexiblePeriod(shift.period) ? shift : undefined);
      const scheduledPeriods = shifts.filter(item => item.assignment.date === today || item.end > now)
        .map(({ period, start, end }) => ({ name: period.name, start, end, duration: period.duration, flexible: isFlexiblePeriod(period) }));
      const shiftStartsAt = shift ? new Date(shift.start).toISOString() : null;
      const shiftEndsAt = shift?.end ?? null;
      const previousShift = shift && shifts.findLast(item => item.end <= shift.start);
      const pendingPunch = punchedIn && (!previousShift || Date.parse(lastPunch.time) >= previousShift.end) &&
        (lastPunch.date === today || (shift && shift.assignment.date === lastPunch.date && shift.end > now));
      const ownRequests = workspace.requests.filter(item => item.staffId === employee.id).reverse();
      const displayRequest = request => {
        const {id,type,date,end,status,submittedOn,loanAmount,repaymentInstallments,periodId,periodName,note,rejectionNote,decidedAt} = request;
        return { id,type,date,end,status,submittedOn,loanAmount,repaymentInstallments,periodId,periodName,note,rejectionNote,decidedAt,
          ...(request.attachment ? {attachmentName:request.attachment.name} : {}),
          approvalSteps:(request.approvalSteps??[]).map((approverId,index)=>{const person=workspace.staff.find(p=>p.id===approverId);const history=request.approvalHistory?.find(h=>h.approverId===approverId);
            return {name:person?.nameAr||person?.name||'—',nameEn:person?.nameEn||person?.name||'—',status:history?.status??(index<(request.approvalIndex??0)||status==='Approved'?'Approved':index===(request.approvalIndex??0)&&status==='Pending'?'Pending':'Waiting'),at:history?.at};}),
        };
      };
      const homeRequests = ownRequests.flatMap(request => {
        const status = requestStatus(request, now);
        const resolvedAt = status === 'Cancelled' && request.status === 'Pending'
          ? requestTimestamp(request.approvalStepStartedAt ?? request.submittedAt, request.submittedOn) + 3 * dayMilliseconds
          : requestTimestamp(request.decidedAt, request.submittedOn);
        return status === 'Pending' || (['Approved', 'Declined', 'Cancelled'].includes(status) && now - resolvedAt < 7 * dayMilliseconds)
          ? [displayRequest({ ...request, status })] : [];
      });
      const team = canReviewTeam(employee) ? new Map(workspace.staff.filter(person => isDirectReport(person, employee) &&
        (!branchManager || managesBranch(branchManager, person.branchId)))
        .map(person => [person.id, person])) : new Map();
      const teamRequests = visibleWorkspace(workspace).requests.filter(request =>
        (requestStatus(request, now) === 'Pending' &&
          (request.approvalSteps ? eligibleApprover(employee) && currentApprover(request) === employee.id : team.has(request.staffId))) ||
        (request.status === 'Approved' && team.has(request.staffId) &&
          workspace.leaveTypes.includes(request.type) && (request.end ?? request.date) >= today))
        .reverse().map(({ id, staffId, type, date, end, status, submittedOn, note, loanAmount, repaymentInstallments, periodId, periodName }) => ({
          id, staffId, type, date, end, status, submittedOn, note, loanAmount, repaymentInstallments, periodId, periodName,
          employee: workspace.staff.find(person => person.id === staffId)?.nameAr ||
            workspace.staff.find(person => person.id === staffId)?.name,
        }));
      return send(200, { name: employee.nameAr || employee.name, today, leaveTypes: activeLeaveTypes(workspace,employee), attendanceTypes: [...attendanceTypes, 'Leave cancellation'].filter(type=>employeeRequestEnabled(workspace,employee,type)), excuseTypes, excuseReasons, correctionReasons,
        availablePeriods: workspace.workPeriods.map(({id, name, start, end, kind}) => ({id, name, start, end, kind})),
        company: workspace.company, jobTitle: employee.jobTitle, email: employee.email, joinDate: employee.joinDate,
        nameAr: employee.nameAr, nameEn: employee.nameEn, photo: employee.photo || '',
        encouragement: encouragementSettings(workspace, employee.branchId),
        profile: { phone: employee.phone, birthDate: employee.birthDate, nationality: employee.nationality,
          gender: employee.gender, identityNumber: employee.identityNumber, address: employee.address,
          salary: employee.salary ? { monthlyBase: employee.salary.monthlyBase,
            monthlyAllowances: employee.salary.monthlyAllowances, currency: employee.salary.currency } : null },
        leaveBalance: (() => {
          const requests = workspace.requests.map(item => ({ ...item, status: requestStatus(item, now) }));
          const balance = annualLeaveBalance(employee, today, requests, workspace.leavePreferences);
          if (!balance) return null;
          return { ...balance, available: balance.available === null ? null :
            Math.round((balance.available - annualLeaveRequired(requests, employee.id, today, {})) * 1e8) / 1e8 };
        })(),
        ownLeaveRequests: ownRequests.filter(item => workspace.leaveTypes.includes(item.type))
          .map(item => ({ id: item.id, type: item.type, date: item.date, end: item.end ?? item.date, status: requestStatus(item, now) })),
        cancellableLeaves: ownRequests.filter(item => item.status === 'Approved' && workspace.leaveTypes.includes(item.type) &&
          (item.end ?? item.date) >= today && !ownRequests.some(other => other.type === 'Leave cancellation' &&
            other.leaveRequestId === item.id && requestStatus(other, now) === 'Pending'))
          .map(({id, type, date, end}) => ({id, type, date, end})),
        pushPublicKey,
        attendanceReminders: (employee.account?.attendanceReminderHistory ?? []).slice(-30),
        manager: workspace.staff.find(person => person.id === employee.managerId && person.status !== 'Removed')?.name,
        recentPunches: workspace.punches.filter(entry => entry.staffId === employee.id).slice(-15).reverse()
          .map(({ kind, time }) => ({ kind, time })),
        shiftStartsAt, shiftEndsAt, scheduledPeriods, punchWindows, openShiftStart: openPunchShift(punchWindows, lastPunch), serverNow: now,
        timeFormat: workspace.timeFormat,
        flexibleDay: scheduledPeriods.some(period => period.flexible) || Boolean(lastPunch?.flexible),
        flexibleCompletedMilliseconds: flexibleTotals.completedMilliseconds,
        flexibleActiveSince: flexibleTotals.activeSince,
        flexibleActiveUntil: flexibleTotals.activeUntil,
        flexibleRequiredMinutes: scheduledPeriods.filter(period => period.flexible).reduce((total, period) => total + (period.duration ?? 0), 0),
        lastFlexiblePunch: lastPunch?.flexible ? { kind: lastPunch.kind, time: lastPunch.time, shiftEnd: lastPunch.shiftEnd, flexible: true } : null,
        punchedInAt: pendingPunch ? lastPunch.time : null,
        punchedOutToday: lastPunch?.kind === 'out' && lastPunch.date === today && (!shift || Date.parse(lastPunch.time) >= shift.start),
        homeRequests, canReviewTeam: canReviewTeam(employee), canManageCompany, reviewerId: eligibleApprover(employee) ? employee.id : undefined, teamRequests,
        ownRequests: ownRequests.slice(0, 30).map(request => displayRequest({ ...request, status: requestStatus(request, now) })),
        canReviewDeviceRequests: canReviewTeam(employee),
        ...deviceRequestInbox(workspace, employee),
        punchFromAnywhere: allowsAnywhere(workspace, employee),
        hasLocations: allowsAnywhere(workspace, employee) || punchLocations(workspace, employee.id).length > 0,
        nextPunch: punchedIn ? 'out' : 'in' });
    }
    if (req.method === 'GET' && path === '/api/employee/calendar') {
      if (!employee) return send(401, { error: 'سجّل الدخول أولًا.' });
      const firstDay = (url.searchParams.get('month') ?? '') + '-01';
      if (!validDate(firstDay)) return send(400, { error: 'اختر شهرًا صحيحًا.' });
      return send(200, employeeCalendar(workspace, employee, firstDay, date(), Date.now()));
    }
    if (req.method === 'GET' && path === '/api/employee/punches') {
      if (!employee) return send(401, { error: 'سجّل الدخول أولًا.' });
      const day = url.searchParams.get('date');
      if (!validDate(day) || day > date()) return send(400, { error: 'اختر تاريخًا صحيحًا.' });
      const logs = workspace.punches.filter(entry => entry.staffId === employee.id && entry.date === day);
      const recorded = entry => entry ? { time: entry.time, geofence: Boolean(entry.site) } : null;
      return send(200, { arrival: recorded(logs.find(entry => entry.kind === 'in')),
        departure: recorded(logs.findLast(entry => entry.kind === 'out')),
        inProgress: day === date() && logs.at(-1)?.kind === 'in' });
    }
    if (req.method !== 'POST' || !path.startsWith('/api/')) return send(404, { error: 'Page not found.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected JSON.' });
    let size = 0;
    const chunks = [];
    for await (const part of req) {
      size += part.length;
      if (size > (path === '/api/organization' ? organizationBodyLimit : ['/api/account/avatar','/api/employee/avatar'].includes(path) ? 700000 : ['/api/employee/requests', '/api/documents', '/api/payroll', '/api/work-assignments'].includes(path) ? attachmentBodyLimit :
        path === '/api/issued-reports' ? 2 * 1024 * 1024 : path === '/api/encouragement-settings' ? 256 * 1024 : 8192)) {
        return send(413, { error: 'Request too large.' });
      }
      chunks.push(part);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return send(400, { error: 'Invalid request.' }); }
    if (partner && !partners.includes(partner)) {
      const current = partners.find(item => item.id === partner.id);
      if (!current) return send(404, { error: 'الشركة غير موجودة.' });
      if (current.suspended) return send(403, { error: 'تم إيقاف الوصول إلى حساب الشركة.' });
      return send(409, { error: 'تغيّرت بيانات الشركة. أعد المحاولة.' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, { error: 'Invalid request.' });
    if (path === '/api/account/avatar' || path === '/api/employee/avatar') {
      if (!signedIntoCompany && !employee) return send(401, { error: 'سجّل الدخول أولًا.' });
      const photo=body.photo;
      if(typeof photo!=='string' || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) return send(400,{error:'اختر صورة PNG أو JPG صالحة.'});
      const image=Buffer.from(photo.slice(photo.indexOf(',')+1),'base64');
      const signature=photo.startsWith('data:image/png;')?'89504e470d0a1a0a':'ffd8ff';
      if(image.length>500000 || image.subarray(0,signature.length/2).toString('hex')!==signature) return send(400,{error:'الصورة غير صالحة أو حجمها أكبر من المسموح.'});
      if(signedIntoCompany) await persistPlatform(partners.map(item=>item.id===partner.id?{...item,account:{...item.account,photo}}:item),platformProfile);
      else {const changed=structuredClone(workspace);changed.staff.find(person=>person.id===employee.id).photo=photo;await saveWorkspace(changed);}
      return send(200,{saved:true,photo});
    }
    if (path === '/api/account/password') {
      if (!signedIntoCompany) return send(403, { error: 'سجّل الدخول بحساب مسؤول الحساب أولًا.' });
      const { password, confirmation } = body;
      const account = partner.account;
      if (typeof password !== 'string' || password.length < 10 || password.length > 128 || password !== confirmation ||
          !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[\p{P}\p{S}]/u.test(password))
        return send(400, { error: 'Use 10–128 characters with uppercase, lowercase, a number and a symbol.' });
      const salt = secret();
      await persistPlatform(partners.map(item => item.id === partner.id ? { ...item,
        account: { ...account, salt, passwordHash: scryptSync(password, salt, 64).toString('hex') } } : item), platformProfile);
      return send(200, { saved: true });
    }
    if (path.startsWith('/api/employee/')) {
      if (!partner && workspace !== state) return send(409, { error: 'تغيّرت بيانات الحساب. أعد المحاولة.' });
      if (path === '/api/employee/invitation') {
        const person = invitedEmployee(workspace, body.token);
        return person
          ? send(200, { email: person.email, company: person.account.company ?? workspace.company })
          : send(400, { error: invalidInvitation });
      }
      const next = structuredClone(workspace);
      if (path === '/api/employee/team-decision') {
        if (!employee) return send(401, { error: 'سجّل الدخول أولًا.' });
        const request = next.requests.find(item => item.id === body.id);
        const person = next.staff.find(item => item.id === request?.staffId);
        if (!person || (branchManager && !managesBranch(branchManager, person.branchId)) ||
          (!request.approvalSteps && (!canReviewTeam(employee) || !isDirectReport(person, employee)))) {
          return send(403, { error: 'الطلب مخصص للمدير المباشر.' });
        }
        try { mutate(next, '/api/decision', body, employee.id, employee); }
        catch (error) { return send(400, { error: error.message }); }
        await saveWorkspace(next);
        if (request.status === 'Approved') void notifyApproval(person.account, companyPrefix, request.id);
        return send(200, { saved: true, forwarded: request.status === 'Pending' });
      }
      if (path === '/api/employee/native-push-token') {
        if (!employee) return send(401, { error: 'سجّل الدخول أولًا.' });
        if (!validExpoPushToken(body.token)) return send(400, { error: 'تعذّر تفعيل الإشعارات.' });
        for (const person of next.staff) if (person.account?.nativePushTokens) {
          person.account.nativePushTokens = person.account.nativePushTokens.filter(item => item.token !== body.token);
        }
        const account = next.staff.find(person => person.id === employee.id).account;
        account.nativePushTokens = [...(account.nativePushTokens ?? []), { token: body.token, language: body.language === 'en' ? 'en' : 'ar', sessionKey: sessionHash }].slice(-4);
        if (partner) {
          const updated = partners.map(company => {
            if (company.id === partner.id) return { ...company, workspace: next };
            if (!company.workspace?.staff.some(person => person.account?.nativePushTokens?.some(item => item.token === body.token))) return company;
            const cleaned = structuredClone(company);
            for (const person of cleaned.workspace.staff) if (person.account?.nativePushTokens) person.account.nativePushTokens = person.account.nativePushTokens.filter(item => item.token !== body.token);
            return cleaned;
          });
          await persistPlatform(updated, platformProfile);
        } else await saveWorkspace(next);
        return send(200, { saved: true });
      }
      if (path === '/api/employee/push-subscription') {
        if (!employee) return send(401, { error: 'سجّل الدخول أولًا.' });
        if (!pushPublicKey) return send(503, { error: 'الإشعارات غير متاحة حاليًا.' });
        const subscription = pushSubscription(body.subscription, body.language);
        if (!subscription) return send(400, { error: 'تعذّر تفعيل الإشعارات.' });
        for (const person of next.staff) {
          if (person.account?.pushSubscriptions) {
            person.account.pushSubscriptions = person.account.pushSubscriptions.filter(item => item.endpoint !== subscription.endpoint);
          }
        }
        const account = next.staff.find(person => person.id === employee.id).account;
        account.pushSubscriptions = [...(account.pushSubscriptions ?? []), subscription].slice(-4);
        await saveWorkspace(next);
        return send(200, { saved: true });
      }
      if (path === '/api/employee/logout') {
        if (employee) {
          const account = next.staff.find(person => person.id === employee.id).account;
          if (account.nativePushTokens) account.nativePushTokens = account.nativePushTokens.filter(item => item.token !== body.nativePushToken && item.sessionKey !== sessionHash);
          if (account.pushSubscriptions) {
            account.pushSubscriptions = account.pushSubscriptions.filter(item => item.endpoint !== body.pushEndpoint);
          }
          if (account.managerSessions?.includes(sessionHash)) {
            account.managerSessions = account.managerSessions.filter(key => key !== sessionHash);
          } else {
            account.sessionHash = null;
          }
          await saveWorkspace(next);
        }
        cookie = employeeSessionCookie('', companyPrefix);
        return send(200, { signedOut: true });
      }
      if (path === '/api/employee/password') {
        if (!employee) return send(401, { error: 'سجّل الدخول أولًا.' });
        const { password, confirmation } = body;
        const account = next.staff.find(person => person.id === employee.id).account;
        if (typeof password !== 'string' || password.length < 10 || password.length > 128 || password !== confirmation ||
          !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[\p{P}\p{S}]/u.test(password)) {
          return send(400, { error: 'استخدم 10 أحرف على الأقل مع حرف كبير وحرف صغير ورقم ورمز، وتأكد من التطابق.' });
        }
        const credential = secret(), salt = secret();
        account.salt = salt;
        account.passwordHash = scryptSync(password, salt, 64).toString('hex');
        delete account.pendingBrowser;
        delete account.pendingDevice;
        delete account.requestedAt;
        delete account.requestedOn;
        const age = loginAge();
        if (canUseMultipleDevices(employee)) {
          account.managerSessions = [];
          addManagerSession(account, hash(credential), age);
          delete account.sessionHash;
          delete account.employeeSessionExpires;
        } else {
          account.sessionHash = hash(credential);
          account.employeeSessionExpires = Date.now() + age * 1000;
          delete account.managerSessions;
          delete account.managerSessionExpirations;
        }
        await saveWorkspace(next);
        cookie = employeeSessionCookie(credential, companyPrefix, age);
        return send(200, { saved: true });
      }
      if (path === '/api/employee/activate') {
        const person = invitedEmployee(next, body.token);
        if (!person) return send(400, { error: invalidInvitation });
        const { password, confirmation } = body;
        if (typeof password !== 'string' || password.length < 10 || password.length > 128 ||
            !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[\p{P}\p{S}]/u.test(password))
          return send(400, { error: 'استخدم من 10 إلى 128 حرفًا، مع حرف إنجليزي كبير وحرف صغير ورقم ورمز.' });
        if (password !== confirmation) return send(400, { error: 'كلمتا المرور غير متطابقتين.' });
        const salt = secret();
        person.account = { salt, passwordHash: scryptSync(body.password, salt, 64).toString('hex') };
        person.status = 'Active';
        await saveWorkspace(next);
        return send(200, { activated: true });
      }
      if (path === '/api/employee/login') {
        const person = next.staff.find(item => item.status === 'Active' && item.email === string(body.email).toLowerCase() && item.account?.passwordHash);
        if (typeof body.password !== 'string' || body.password.length > 128) return send(401, { error: 'بيانات الدخول غير صحيحة.' });
        const supplied = scryptSync(body.password, person?.account.salt ?? 'invalid-employee', 64);
        if (!person || !timingSafeEqual(supplied, Buffer.from(person.account.passwordHash, 'hex')))
          return send(401, { error: 'بيانات الدخول غير صحيحة.' });
        const age = loginAge(body.remember);
        if (canUseMultipleDevices(person)) {
          const credential = secret();
          addManagerSession(person.account, hash(credential), age, sessionHash);
          await saveWorkspace(next);
          cookie = employeeSessionCookie(credential, companyPrefix, age);
          return send(200, { approved: true });
        }
        if (!person.account.browser || (browser && person.account.browser === browser)) {
          const credential = secret();
          const newBinding = !person.account.browser;
          if (newBinding) person.account.browser = hash(credential);
          person.account.browserDevice ??= deviceLabel(req);
          const sessionCredential = secret();
          person.account.sessionHash = hash(sessionCredential);
          person.account.employeeSessionExpires = Date.now() + age * 1000;
          await saveWorkspace(next);
          cookie = employeeSessionCookie(sessionCredential, companyPrefix, age);
          if (newBinding) cookie = [employeeCookie(credential, companyPrefix), cookie];
          return send(200, { approved: true });
        }
        if (!body.requestChange) return send(403, { changeRequired: true });
        if (!directDeviceApprover(next, person)) {
          return send(409, { error: 'اطلب من الإدارة تعيين مدير مباشر نشط لديه صلاحية مدير قبل إرسال الطلب.' });
        }
        if (browser && person.account.pendingBrowser === browser) return send(202, { pending: true });
        const credential = secret();
        person.account.pendingBrowser = hash(credential);
        person.account.pendingDevice = deviceLabel(req);
        person.account.requestedAt = randomUUID();
        person.account.requestedOn = date();
        await saveWorkspace(next);
        cookie = employeeCookie(credential, companyPrefix);
        return send(202, { pending: true });
      }
      if (path === '/api/employee/device-approval') {
        if (!employee && !signedIntoCompany) return send(401, { error: 'سجّل الدخول للموافقة على الطلب.' });
        const person = next.staff.find(item => item.id === body.staffId && item.account?.pendingBrowser &&
          item.account.requestedAt === body.requestId);
        if (!person || !['approve', 'reject'].includes(body.decision)) return send(400, { error: 'الطلب غير متاح.' });
        const deviceApprover = directDeviceApprover(next, person);
        if (!signedIntoCompany && deviceApprover?.id !== employee?.id) return send(403, { error: 'الطلب مخصص للمدير المباشر.' });
        if (branchManager && !managesBranch(branchManager, person.branchId))
          return send(403, { error: 'This action is outside your branch permissions.' });
        if (body.rejectionNote !== undefined && (typeof body.rejectionNote !== 'string' || body.rejectionNote.length > 2000))
          return send(400, { error: 'Enter notes up to 2000 characters.' });
        if (body.decision === 'approve') {
          person.account.browser = person.account.pendingBrowser;
          person.account.browserDevice = person.account.pendingDevice;
          delete person.account.sessionHash;
        }
        delete person.account.pendingBrowser;
        delete person.account.pendingDevice;
        (next.browserRequestHistory ??= []).push({ staffId: person.id, requestId: body.requestId,
          approverId: signedIntoCompany ? deviceApprover?.id : employee.id,
          ...(signedIntoCompany ? { decidedByOwner: true } : {}),
          name: person.nameAr || person.name, submittedOn: person.account.requestedOn,
          status: body.decision === 'approve' ? 'Approved' : 'Declined',
          ...(body.decision === 'reject' ? { rejectionNote: string(body.rejectionNote) } : {}) });
        delete person.account.requestedOn;
        person.account.lastDeviceDecision = { decision: body.decision, at: new Date().toISOString() };
        const previousAccount = workspace.staff.find(item => item.id === person.id).account;
        if (body.decision === 'approve') delete person.account.pushSubscriptions;
        await saveWorkspace(next);
        if (body.decision === 'approve') void notifyApproval(previousAccount, companyPrefix, body.requestId);
        return send(200, { saved: true });
      }
      const action = { '/api/employee/punch': '/api/punch', '/api/employee/requests': '/api/requests' }[path];
      if (!action) return send(404, { error: 'Page not found.' });
      if (!employee) return send(401, { error: 'يلزم استخدام المتصفح المعتمد.' });
      try { mutate(next, action, { ...body, device: deviceLabel(req) }, employee.id); }
      catch (error) { return send(400, { error: error.message }); }
      let showEncouragement;
      if (action === '/api/punch') showEncouragement = false;
      if (action === '/api/punch' && encouragementSettings(next, employee.branchId).enabled) {
        const person = next.staff.find(item => item.id === employee.id);
        const today = next.punches.at(-1).date;
        const account = person.account ??= {};
        const shownOn = account.encouragementShownOn ?? (account.encouragementWeek?.shownDates?.includes(today) ? today : null);
        const decision = dailyGreetingDecision(shownOn, today);
        account.encouragementShownOn = decision.shownOn;
        showEncouragement = decision.show;
      }
      await saveWorkspace(next);
      return send(200, { saved: true, ...(showEncouragement === undefined ? {} : { showEncouragement }) });
    }
    const next = structuredClone(demo?.state ?? workspace);
    if (branchManager) {
      try { authorizeBranchAction(workspace, branchManager, path, body); }
      catch (error) { return send(403, { error: error.message }); }
    }
    if (path === '/api/setup-guide' && !signedIntoCompany) return send(403, { error: 'Account administrator access required.' });
    if (path === '/api/notification-settings') body.scopeUserId = branchManager?.id ?? null;
    if (path === '/api/request-preferences') body.scopeBranchId = branchManager?.branchId ?? null;
    if (path === '/api/encouragement-settings') body.scopeBranchId = branchManager?.branchId ?? null;
    if (path === '/api/payroll') {
      let payrollReportId;
      try { payrollReportId = mutatePayroll(next, body, { owner: signedIntoCompany || Boolean(demo) || (!partner && !hostedDemo), manager: branchManager }); }
      catch (error) { return send(400, { error: error.message }); }
      if (demo) demo.state = next; else await saveWorkspace(next);
      return send(200, { ...publicState(visibleWorkspace(next)), admin, isCompanyOwner: Boolean(signedIntoCompany), canManageCompany, payrollReportId });
    }
    const staffLink = path === '/api/staff/activation-link';
    if (!demo && !partner && path === '/api/staff/update' && workspace !== state) {
      return send(409, { error: 'تغيّرت بيانات الحساب. أعد المحاولة.' });
    }
    if (staffLink) {
      if (demo) return send(403, { error: 'Administrator access required.' });
      if (!partner && workspace !== state) return send(409, { error: 'تغيّرت بيانات الحساب. أعد المحاولة.' });
    } else {
      const companyApprover = signedIntoCompany && path === '/api/decision'
        ? next.staff.find(person => eligibleApprover(person) &&
          person.id === currentApprover(next.requests.find(request => request.id === body.id) ?? {})) : employee;
      try { mutate(next, path, body, undefined, companyApprover); }
      catch (error) { return send(400, { error: error.message }); }
      if (branchManager && path === '/api/issued-reports') next.issuedReports[0].branchId = branchManager.branchId;
    }
    if (!demo && (staffLink || path === '/api/staff')) {
      const person = staffLink ? next.staff.find(item => item.id === body.staffId && item.status === 'Pending activation') : next.staff.at(-1);
      if (!person) return send(404, { error: invalidInvitation });
      const token = secret();
      const origin = invitationOrigin();
      if (!origin) return send(503, { error: 'Configure the public invitation origin.' });
      const url = new URL(companyPrefix + '/employee', origin);
      url.hash = 'activate=' + token;
      person.account = { activationHash: hash(token), activationExpires: Date.now() + 48 * 60 * 60 * 1000, company: next.company };
      await saveWorkspace(next);
      const invitation = staffLink ? { url: url.href } : await deliverInvitation({
        email: person.email, name: person.nameAr || person.name, url: url.href,
        introduction: 'أضافتك شركة ' + next.company + ' إلى برنامج دوامكم.',
      });
      if(invitation.delivery==='sent'&&recordActivationEmail(person.account,person.email))await saveWorkspace(next);
      const currentWorkspace = partner ? partners.find(item => item.id === partner.id)?.workspace : state;
      return send(200, { ...publicState(visibleWorkspace(currentWorkspace ?? next)), invitation: { ...invitation, staffId: person.id }, admin,
        isCompanyOwner: Boolean(signedIntoCompany), canManageCompany });
    }
    if (demo) {
      demo.state = next;
    } else {
      await saveWorkspace(next);
      if (path === '/api/decision' && body.status === 'Approved') {
        const request = next.requests.find(item => item.id === body.id);
        const recipient = next.staff.find(person => person.id === request.staffId && person.status === 'Active');
        if (request.status === 'Approved') void notifyApproval(recipient?.account, companyPrefix, request.id);
      }
    }
    return send(200, { ...publicState(visibleWorkspace(next)), admin, isCompanyOwner: Boolean(signedIntoCompany), canManageCompany });
  } catch (error) {
    if (storageConflict(error)) return send(409, { error: 'تغيّرت البيانات أثناء الحفظ. أعد المحاولة.' });
    console.error(error);
    return send(500, { error: 'Dawamak could not complete the action.' });
  }
}
let requestQueue = Promise.resolve();
const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  res.setHeader('X-Dawamkom-Mode', runtime.mode);
  if (!runtime.permits(req.method, path)) {
    res.writeHead(503, {'Content-Type': path.startsWith('/api/') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8', 'Retry-After':'60', 'Cache-Control':'no-store'});
    return res.end(path.startsWith('/api/') ? JSON.stringify({error:'الخدمة متوقفة مؤقتًا للتحديث. حاول لاحقًا.'}) :
      '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دوامكم</title><main style="font:20px system-ui;max-width:600px;margin:15vh auto;padding:24px"><h1>دوامكم</h1><p>يجري تحديث الخدمة. سنعود قريبًا، شكرًا لتفهمك.</p></main></html>');
  }
  if (!storage || path === '/health' || path === '/api/version' || files.has(path) && !['/', '/demo', '/super-admin'].includes(path)) {
    return handleRequest(req, res);
  }
  // Read the latest snapshot and keep each read/modify/write sequence together within this process.
  requestQueue = requestQueue.then(async () => {
    if (res.destroyed) return;
    applyStorage(await storage.read());
    await handleRequest(req, res);
  }).catch(error => {
    console.error('Dawamkom storage request failed:', error.name);
    if (res.headersSent) return res.destroy();
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'تعذّر الوصول إلى البيانات. حاول مرة أخرى.' }));
  });
});
const port = Number(process.env.DAWAMAK_PORT || process.env.PORT || 4173);
server.listen(port, host, () => console.log('Dawamak is listening on port ' + server.address().port));

let reminderTickRunning = false;
async function runAttendanceReminders() {
  if (!runtime.background || reminderTickRunning) return;
  reminderTickRunning = true;
  requestQueue = requestQueue.then(async () => {
    if (storage) applyStorage(await storage.read());
    const now = Date.now();
    const nextPartners = structuredClone(partners);
    const jobs = [];
    for (const company of nextPartners) {
      if (company.suspended || !company.account?.passwordHash || !company.workspace) continue;
      for (const event of attendanceReminders(company.workspace, now)) {
        const person = company.workspace.staff.find(person => person.id === event.staffId);
        recordAttendanceReminder(person, event, now);
        jobs.push({account: person.account, prefix: '/company/' + company.id, event});
      }
    }
    if (!jobs.length) return;
    await persistPlatform(nextPartners, platformProfile);
    // Only send after the S3 conditional write succeeds. No duplicate push after a restart or write conflict.
    for (const job of jobs) void notifyAttendance(job.account, job.prefix, job.event);
  }).catch(error => { console.error('Attendance reminder cycle unavailable:', error.name); })
    .finally(() => { reminderTickRunning = false; });
}
setInterval(runAttendanceReminders, 30000).unref();


async function deliverMonthlyEmployeeMail(message) {
  if (!runtime.delivery) return {sent:false,error:'DeliveryDisabled'};
  if (process.env.DAWAMAK_SES_FROM) {
    let client;
    try {
      const {SESv2Client, SendEmailCommand} = await import('@aws-sdk/client-sesv2');
      client = new SESv2Client({region:process.env.DAWAMAK_SES_REGION || 'us-east-1',maxAttempts:1});
      const result = await client.send(new SendEmailCommand({FromEmailAddress:process.env.DAWAMAK_SES_FROM,
        Destination:{ToAddresses:[message.to]},Content:{Simple:{Subject:{Charset:'UTF-8',Data:message.subject},
          Body:{Text:{Charset:'UTF-8',Data:message.text}}}}}),{abortSignal:AbortSignal.timeout(10000)});
      return {sent:true,messageId:result.MessageId};
    } catch(error) {
      return {sent:false,error:error.name,uncertain: ['TimeoutError','AbortError','RequestTimeout','NetworkingError'].includes(error.name) ||
        error.$metadata?.httpStatusCode >= 500};
    } finally {client?.destroy();}
  }
  try {
    const response=await fetch(process.env.DAWAMAK_MAIL_WEBHOOK,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+(process.env.DAWAMAK_MAIL_TOKEN??'')},
      body:JSON.stringify({to:message.to,subject:message.subject,text:message.text})});
    return {sent:response.ok,uncertain:response.status>=500,error:response.ok?undefined:'HTTP '+response.status};
  } catch(error) {return {sent:false,uncertain:true,error:error.name};}
}
let monthlyMailRunning=false;
async function runMonthlyEmployeeMail() {
  if(!runtime.background || monthlyMailRunning) return;
  monthlyMailRunning=true;
  try {
    const claimed=requestQueue.then(async()=>{
      if(storage) applyStorage(await storage.read());
      const next=structuredClone(partners);
      const configured=Boolean(process.env.DAWAMAK_PUBLIC_ORIGIN && (process.env.DAWAMAK_SES_FROM || process.env.DAWAMAK_MAIL_WEBHOOK));
      const result=claimMonthlyMessages(next,Date.now(),configured?5:0);
      if(result.changed) await persistPlatform(next,platformProfile);
      return result.jobs;
    });
    requestQueue=claimed.then(()=>{},error=>console.error('Monthly report claim unavailable:',error.name));
    for(const job of await claimed) {
      const outcome=await deliverMonthlyEmployeeMail(job);
      const completed=requestQueue.then(async()=>{
        if(storage) applyStorage(await storage.read());
        const next=structuredClone(partners);
        if(finishMonthlyMessage(next,job,outcome,Date.now())) await persistPlatform(next,platformProfile);
      });
      requestQueue=completed.catch(error=>console.error('Monthly report receipt unavailable:',error.name));
      await completed;
      if(!outcome.sent) console.error('Monthly employee report not delivered:',outcome.error);
      // Respect the current SES sandbox sending rate; do not hold the application write queue while waiting.
      await new Promise(resolve=>setTimeout(resolve,1100));
    }
  } catch(error) {console.error('Monthly employee report cycle unavailable:',error.name);}
  finally {monthlyMailRunning=false;}
}
setTimeout(runMonthlyEmployeeMail,5000).unref();
setInterval(runMonthlyEmployeeMail,15*60000).unref();
