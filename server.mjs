import { createServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { employeePage } from './employee-page.mjs';
import { handleAdmin, isAdmin } from './admin-auth.mjs';
import { annualLeaveDays, contractTerms, contractTypes, genders, jobTitles, nationalityCodes, probationDays } from './public/staff-options.js';
import { staffRoles } from './public/staff-options.js';

const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/demo', ['index.html', 'text/html']],
  ['/workspace-login.js', ['workspace-login.js', 'text/javascript']],
  ['/super-admin', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/ar.js', ['ar.js', 'text/javascript']],
  ['/staff-options.js', ['staff-options.js', 'text/javascript']],
  ['/employee.js', ['employee.js', 'text/javascript']],
  ['/company-auth.js', ['company-auth.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']],
  ['/leaflet.css', ['leaflet.css', 'text/css']],
  ['/brand-reference.png', ['brand-reference.png', 'image/png']],
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
const activeLeaveTypes = workspace => workspace.leaveTypes.filter(name => workspace.leaveSettings[name].active);
const attendanceTypes = ['Missed punch', 'Attendance excuse'];
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
  workSchedule: { days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00' },
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
function persistPlatform(nextPartners, profile, nextDemoStatus = demoCompanyStatus) {
  writeFileSync(partnersTemp, JSON.stringify({ partners: nextPartners, profile, demoCompanyStatus: nextDemoStatus }, null, 2));
  renameSync(partnersTemp, partnersFile);
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
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const string = (value) => typeof value === 'string' ? value.trim() : '';
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

function mutate(next, path, body, employeeId = 'demo') {
  switch (path) {
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
      demand(name && name.length <= 80, 'Enter a period name.');
      const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      demand(typeof start === 'string' && typeof end === 'string' && time.test(start) && time.test(end) && start !== end,
        'Choose different start and end times.');
      const validWindow = (window) => ['before', 'grace', 'after'].every(key =>
        Number.isInteger(window?.[key]) && window[key] >= 0 && window[key] <= 720);
      demand(typeof flexible === 'boolean' && validWindow(arrival) && validWindow(departure), 'Enter valid punch settings.');
      const toMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
      const duration = (toMinutes(end) - toMinutes(start) + 1440) % 1440;
      const index = next.workPeriods.findIndex(period => period.id === body.id);
      demand(body.id === undefined || index >= 0, 'Period not found.');
      const period = { id: body.id ?? randomUUID(), name, start, end, duration, flexible, arrival, departure };
      if (index >= 0) next.workPeriods[index] = period;
      else next.workPeriods.push(period);
      break;
    }
    case '/api/work-assignments': {
      const { staffId, date, periodId } = body;
      demand(validDate(date) && next.staff.some(person => person.id === staffId && person.status === 'Active'),
        'Choose an active employee and a valid date.');
      demand(periodId === '' || next.workPeriods.some(period => period.id === periodId), 'Choose an available period.');
      next.workAssignments = next.workAssignments.filter(entry => entry.staffId !== staffId || entry.date !== date);
      if (periodId) next.workAssignments.push({ staffId, date, periodId });
      break;
    }
    case '/api/work-schedule': {
      const { days, start, end } = body;
      const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
      demand(Array.isArray(days) && days.length && days.every(day => Number.isInteger(day) && day >= 0 && day <= 6) &&
        typeof start === 'string' && typeof end === 'string' && time.test(start) && time.test(end) && start < end,
      'Choose working days and an end time after the start time.');
      next.workSchedule = { days: [...new Set(days)].sort(), start, end };
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
    case '/api/locations': {
      const { latitude, longitude, radius } = body;
      const name = string(body.name);
      demand(name && name.length <= 120, 'Enter a workplace name.');
      demand(coordinate(latitude, 90) && coordinate(longitude, 180) && Number.isInteger(radius) && radius >= 10 && radius <= 5000, 'Enter valid coordinates and a radius between 10 and 5,000 metres.');
      next.locations.push({ id: randomUUID(), name, latitude, longitude, radius });
      break;
    }
    case '/api/locations/remove': {
      const index = next.locations.findIndex((site) => site.id === body.id);
      demand(index !== -1, 'Workplace location not found.');
      next.locations.splice(index, 1);
      break;
    }
    case '/api/staff/update':
    case '/api/staff': {
      const editing = path === '/api/staff/update';
      const person = editing ? next.staff.find(item => item.id === body.staffId && item.status !== 'Removed') : null;
      demand(!editing || person, 'Employee not found.');
      const patch = body;
      const changed = (...fields) => !person || fields.some(field => Object.hasOwn(patch, field));
      const check = (fields, valid, message) => demand(!changed(...fields) || valid, message);
      if (person) body = { ...person, periodId: person.periodId ?? '', probation: person.probationDays,
        annualLeave: person.annualLeaveDays, salary: person.salary ? String(person.salary.monthlyBase) : '',
        allowances: person.salary ? String(person.salary.monthlyAllowances) : '', ...body };
      const email = string(body.email).toLowerCase();
      const nameAr = string(body.nameAr), nameEn = string(body.nameEn), phone = string(body.phone);
      const { birthDate, gender, jobTitle, managerId, joinDate, periodId } = body;
      const { contractTerm, contractMonths, salary } = body;
      const nationality = string(body.nationality), identityNumber = string(body.identityNumber);
      const { contractType } = body;
      const isTamheer = contractType === 'Tamheer';
      const probation = isTamheer ? 0 : body.probation;
      const annualLeave = isTamheer ? 0 : body.annualLeave;
      check(['nationality'], nationalityCodes.includes(nationality), 'Enter a nationality and valid identity number.');
      check(['identityNumber'], /^[\p{Nd}]{5,20}$/u.test(identityNumber), 'Enter a nationality and valid identity number.');
      check(['contractType', 'probation', 'annualLeave'], contractTypes.includes(contractType) && (isTamheer ||
        (probationDays.includes(probation) && annualLeaveDays.includes(annualLeave))),
        'Choose a contract type, probation period and annual leave allowance.');
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
      check(['periodId'], periodId === '' || next.workPeriods.some(period => period.id === periodId), 'Choose an available period.');
      check(['contractTerm', 'contractMonths'], contractTerms.includes(contractTerm) && (contractTerm !== 'Custom' ||
        (Number.isInteger(contractMonths) && contractMonths >= 1 && contractMonths <= 600)), 'Choose a valid contract term.');
      const money = value => typeof value === 'string' && /^\d{1,9}(?:\.\d{1,2})?$/.test(value);
      check(['salary'], money(salary) && Number(salary) > 0, 'Enter valid salary amounts.');
      check(['allowances'], money(body.allowances), 'Enter valid salary amounts.');
      check(['email'], !next.staff.some(item => item.id !== person?.id && item.email === email), 'That email is already on the staff list.');
      const details = { email, nameAr, nameEn, phone, birthDate, gender, jobTitle, nationality, identityNumber,
        contractType, managerId: managerId || null, joinDate, periodId, contractTerm };
      const record = person ?? { id: randomUUID(), role: next.staffRoles.includes('Employee') ? 'Employee' : null, status: 'Pending activation' };
      if (person?.status === 'Pending activation' && changed('email') && email !== person.email && person.account) {
        delete person.account.activationHash;
        delete person.account.activationExpires;
      }
      for (const [key, value] of Object.entries(details)) if (changed(key)) record[key] = value;
      if (changed('nameEn')) record.name = nameEn;
      if (changed('contractTerm', 'contractMonths')) record.contractMonths = contractTerm === 'Custom' ? contractMonths : null;
      if (changed('contractType', 'probation', 'annualLeave')) Object.assign(record, { probationDays: probation, annualLeaveDays: annualLeave });
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
      demand(next.staff.some(person => person.id === employeeId && person.status === 'Active'), 'Employee not found.');
      const { latitude, longitude, accuracy, kind } = body;
      demand(['in', 'out'].includes(kind), 'Invalid punch type.');
      demand(next.locations.length > 0, 'Ask your employer to set a workplace location first.');
      demand(coordinate(latitude, 90) && coordinate(longitude, 180) && Number.isFinite(accuracy) && accuracy >= 0, 'Your phone did not return a valid location.');
      const nearby = next.locations.map((site) => ({ site, metres: distance(latitude, longitude, site) }))
        .filter(({ site, metres }) => metres <= site.radius).sort((a, b) => a.metres - b.metres);
      demand(nearby.length, 'You are outside the approved workplace area.');
      const match = nearby.find(({ site, metres }) => metres + accuracy <= site.radius);
      demand(match, 'Location accuracy is too low. Move closer to the workplace centre and try again.');
      const last = next.punches.findLast((entry) => entry.staffId === employeeId);
      demand(kind === (last?.kind === 'in' ? 'out' : 'in'), 'Your attendance changed. Refresh before trying again.');
      next.punches.push({ staffId: employeeId, kind, date: date(), time: new Date().toISOString(), site: match.site.name,
        device: body.device });
      break;
    }
    case '/api/requests': {
      demand(next.staff.some(person => person.id === employeeId && person.status === 'Active'), 'Employee not found.');
      const { type, date: start, end } = body;
      const note = string(body.note);
      const leave = next.leaveTypes.includes(type);
      demand(leave || attendanceTypes.includes(type), 'Choose a request type.');
      demand(!leave || next.leaveSettings[type].active, 'This leave type is inactive.');
      demand(validDate(start) && note && note.length <= 1000, 'Enter a valid date and a reason.');
      demand(!leave || (validDate(end) && end >= start), 'Enter an end date on or after the start date.');
      const maxDays = leave ? next.leaveSettings[type].maxDays : null;
      demand(!(maxDays > 0) || (Date.parse(end) - Date.parse(start)) / 86400000 + 1 <= maxDays,
        'The request exceeds the maximum number of days.');
      next.requests.push({ id: randomUUID(), staffId: employeeId, type, date: start, end: leave ? end : start, note, status: 'Pending' });
      break;
    }
    case '/api/decision': {
      const request = next.requests.find((item) => item.id === body.id);
      demand(request?.status === 'Pending' && ['Approved', 'Declined'].includes(body.status), 'This request cannot be updated.');
      request.status = body.status;
      break;
    }
    default: throw new Error('Unknown action.');
  }
}

function persist(next) {
  writeFileSync(tempFile, JSON.stringify(next, null, 2));
  renameSync(tempFile, dataFile);
  state = next;
}
const secret = () => randomBytes(32).toString('hex');
const hash = value => digest(value).toString('hex');
const browserKey = req => req.headers.cookie?.match(/(?:^|;\s*)dawamkom_employee=([a-f0-9]{64})(?:;|$)/)?.[1];
const employeeCookie = (value, prefix) => `dawamkom_employee=${value}; Path=${prefix}/; HttpOnly; SameSite=Strict; Max-Age=31536000${host === '127.0.0.1' ? '' : '; Secure'}`;
const employeeSessionKey = req => req.headers.cookie?.match(/(?:^|;\s*)dawamkom_employee_session=([a-f0-9]{64})(?:;|$)/)?.[1];
const employeeSessionCookie = (value, prefix) =>
  `dawamkom_employee_session=${value}; Path=${prefix}/; HttpOnly; SameSite=Strict; Max-Age=${value ? 31536000 : 0}${hostedDemo ? '; Secure' : ''}`;
const isGeneralManager = person => ['مدير عام', 'general manager'].includes(string(person.jobTitle).toLowerCase());
const directGeneralManager = (workspace, person) => workspace.staff.find(manager =>
  manager.id === person.managerId && manager.id !== person.id && manager.status === 'Active' && isGeneralManager(manager));
const canUseMultipleDevices = person => person.role === 'Manager' || isGeneralManager(person);
function deviceLabel(req) {
  const agent = req.headers['user-agent'] ?? '';
  const platform = ['iPhone', 'iPad', 'Android', 'Windows', 'Macintosh', 'Linux'].find(name => agent.includes(name));
  const browser = [['Edg', 'Edge'], ['Firefox', 'Firefox'], ['Chrome', 'Chrome'], ['Safari', 'Safari']]
    .find(([token]) => agent.includes(token))?.[1];
  return [platform, browser].filter(Boolean).join(' · ') || 'Unknown device';
}
const publicState = workspace => ({
  ...workspace,
  staff: workspace.staff.map(({ account, ...person }) => ({
    ...person, approvedDevice: canUseMultipleDevices(person) ? null : account?.browserDevice ?? null,
    canCopyActivation: person.status === 'Pending activation' && Boolean(account),
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
    ({ id, name, email, phone, contactName, active: Boolean(account?.passwordHash), suspended: Boolean(suspended) })),
];
const partnerOrganization = ({ name, email, phone, contactName }, profile) =>
  ({ name, phone, contactName: contactName ?? '', ...profile, email: profile?.email || email });
const newPartnerWorkspace = (company, slug) => ({
  ...structuredClone(demoSeed), staff: [], requests: [], company, slug, jobTitles: [...jobTitles],
});
if (sampleCompanyConfig) {
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
    persistPlatform([...partners, { ...sample, workspace, account, suspended: false }], platformProfile);
  }
}
const companyPage = (name, email, activate) => {
  const escape = value => value.replace(/[&<>"']/g, char => '&#' + char.charCodeAt(0) + ';');
  return '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="theme-color" content="#103c45"><link rel="stylesheet" href="/style.css"><title>دوامكم</title>' +
    '<body class="workspace-login company-access"><main class="workspace-login-main preview-access">' +
    '<div class="workspace-login-brand brand"><span class="mark" aria-hidden="true"></span><span>دوامكم</span></div><h1>' +
    escape(name) + '</h1>' + (activate ? '<p><bdi>' + escape(email) + '</bdi></p>' : '') + '<form id="company-auth" data-action="' +
    (activate ? 'activate' : 'login') + '"><label>كلمة المرور<input name="password" type="password" maxlength="128" required></label>' +
    (activate ? '<p>استخدم 10 أحرف على الأقل مع حرف إنجليزي كبير وصغير ورقم ورمز.</p><label>تأكيد كلمة المرور<input name="confirmation" type="password" maxlength="128" required></label>' : '') +
    '<button class="button primary">' + (activate ? 'تفعيل الشركة' : 'دخول') +
    '</button><p role="status"></p></form></main><script type="module" src="/company-auth.js"></script></body></html>';
};
export async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const companyRoute = url.pathname.match(/^\/company\/([a-f0-9-]{36})(\/.*)?$/);
  const path = companyRoute ? companyRoute[2] || '/' : url.pathname;
  const partner = companyRoute && partners.find(item => item.id === companyRoute[1]);
  const companyPrefix = partner ? '/company/' + partner.id : '';
  if (!companyRoute && req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Cache-Control': 'no-store' });
    return res.end('OK');
  }
  let cookie;
  const send = (code, value, type = 'application/json') => {
    const headers = { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
    if (cookie) headers['Set-Cookie'] = cookie;
    res.writeHead(code, headers);
    res.end(type === 'application/json' ? JSON.stringify(value) : value);
  };
  try {
    if (companyRoute) {
      if (!partner) return send(404, { error: 'الشركة غير موجودة.' });
      if (partner.suspended) return send(403, { error: 'تم إيقاف الوصول إلى حساب الشركة.' });
      if (req.method === 'GET' && ['/activate', '/login'].includes(path)) {
        return send(200, companyPage(partner.name, partner.email, path === '/activate'), 'text/html');
      }
      if (req.method === 'POST' && ['/activate', '/login'].includes(path)) {
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
        } else if (!account?.passwordHash ||
          !timingSafeEqual(scryptSync(password, account.salt, 64), Buffer.from(account.passwordHash, 'hex'))) {
          return send(401, { error: 'بيانات الدخول غير صحيحة.' });
        }
        const session = secret();
        const updated = { ...current, account: { ...credentials, sessionHash: hash(session), sessionExpires: Date.now() + 86400000 } };
        persistPlatform(partners.map(item => item.id === current.id ? updated : item), platformProfile);
        cookie = 'dawamkom_company=' + session + '; Path=' + companyPrefix + '/; HttpOnly; SameSite=Strict; Max-Age=86400' +
          (hostedDemo ? '; Secure' : '');
        return send(200, { url: companyPrefix + '/' });
      }
      if (path !== '/employee' && !path.startsWith('/api/employee/')) {
        const credential = req.headers.cookie?.match(/(?:^|;\s*)dawamkom_company=([a-f0-9]{64})(?:;|$)/)?.[1];
        if (!credential || partner.account?.sessionHash !== hash(credential) || partner.account.sessionExpires <= Date.now()) {
          if (path.startsWith('/api/')) return send(401, { error: 'سجّل الدخول إلى حساب الشركة.' });
          res.writeHead(303, { Location: companyPrefix + '/login', 'Cache-Control': 'no-store' });
          return res.end();
        }
        if (req.method === 'POST' && path === '/logout') {
          const account = { ...partner.account };
          delete account.sessionHash;
          delete account.sessionExpires;
          persistPlatform(partners.map(item => item.id === partner.id ? { ...item, account } : item), platformProfile);
          res.writeHead(303, { Location: companyPrefix + '/login',
            'Set-Cookie': 'dawamkom_company=; Path=' + companyPrefix + '/; HttpOnly; Max-Age=0' });
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
          persistPlatform(partners, profile);
          return send(200, { partners: publicPartners(), organization: platformProfile });
        }
        if (body?.operation === 'status' || body?.operation === 'delete') {
          if (body.operation === 'status' && typeof body.suspended !== 'boolean') {
            return send(400, { error: 'حالة الشركة غير صالحة.' });
          }
          if (body.id === demoCompanyId) {
            if (demoCompanyStatus === 'deleted') return send(404, { error: 'الشركة غير موجودة.' });
            const status = body.operation === 'delete' ? 'deleted' : body.suspended ? 'suspended' : 'active';
            persistPlatform(partners, platformProfile, status);
            return send(200, { partners: publicPartners(), organization: platformProfile });
          }
          const current = partners.find(item => item.id === body.id);
          if (!current) return send(404, { error: 'الشركة غير موجودة.' });
          if (body.operation === 'delete') {
            persistPlatform(partners.filter(item => item.id !== current.id), platformProfile);
          } else {
            const account = { ...current.account };
            if (body.suspended) {
              delete account.sessionHash;
              delete account.sessionExpires;
            }
            const updated = { ...current, suspended: body.suspended, account };
            persistPlatform(partners.map(item => item.id === current.id ? updated : item), platformProfile);
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
          const account = company.email !== email && !company.account?.passwordHash ? {} : company.account;
          const record = { ...company, ...profile, account, workspace: { ...company.workspace, company: name,
            organization: { ...company.workspace.organization, ...profile } } };
          persistPlatform(partners.map(item => item.id === company.id ? record : item), platformProfile);
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
        persistPlatform(nextPartners, platformProfile);
        const url = new URL('/company/' + id + '/activate', origin);
        url.hash = 'activate=' + token;
        const invitation = manual ? { url: url.href } : await deliverInvitation({
          email, name: contactName, url: url.href,
          introduction: 'تمت إضافة شركة ' + name + ' إلى دوامكم. فعّل حسابك لإدارة الشركة.',
        });
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
      return send(deleted ? 404 : 403, '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><main><p>' +
        message + '</p><a href="/super-admin#partners">إدارة الشركات</a></main></html>', 'text/html');
    }
    if (req.method === 'GET' && path === '/employee') return send(200, employeePage, 'text/html');
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
    const saveWorkspace = next => {
      if (!partner) return persist(next);
      persistPlatform(partners.map(item => item.id === partner.id ? { ...item, workspace: next } : item), platformProfile);
    };
    const admin = partner ? true : isAdmin(req);
    if (hostedDemo && !admin && path.startsWith('/api/') && !path.startsWith('/api/employee/')) ({ demo, cookie } = demoWorkspace(req));
    if (req.method === 'GET' && path === '/api/state') return send(200, { ...publicState(demo?.state ?? workspace), admin });
    const key = browserKey(req);
    const browser = key && hash(key);
    const sessionKey = employeeSessionKey(req);
    const sessionHash = sessionKey && hash(sessionKey);
    const employee = workspace.staff.find(person => person.status === 'Active' && person.account && (
      (canUseMultipleDevices(person) && sessionHash && person.account.managerSessions?.includes(sessionHash)) ||
      (browser && person.account.browser === browser &&
        (person.account.sessionHash === undefined || (sessionHash && person.account.sessionHash === sessionHash)))
    ));
    if (req.method === 'GET' && path === '/api/employee/session') {
      return employee ? send(200, { name: employee.nameAr || employee.name, today: date(), leaveTypes: activeLeaveTypes(workspace),
        canReviewDeviceRequests: isGeneralManager(employee),
        deviceRequests: workspace.staff.filter(person => person.account?.pendingBrowser &&
          directGeneralManager(workspace, person)?.id === employee.id).map(person => ({
          staffId: person.id, requestId: person.account.requestedAt, name: person.nameAr || person.name,
        })),
        hasLocations: Boolean(workspace.locations.length), nextPunch: workspace.punches.findLast(entry => entry.staffId === employee.id)?.kind === 'in' ? 'out' : 'in' })
        : send(401, { pending: Boolean(browser && workspace.staff.some(person => person.account?.pendingBrowser === browser)) });
    }
    if (req.method !== 'POST' || !path.startsWith('/api/')) return send(404, { error: 'Page not found.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Expected JSON.' });
    let size = 0;
    const chunks = [];
    for await (const part of req) {
      size += part.length;
      if (size > (path === '/api/organization' ? organizationBodyLimit : 8192)) return send(413, { error: 'Request too large.' });
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
    if (path.startsWith('/api/employee/')) {
      if (!partner && workspace !== state) return send(409, { error: 'تغيّرت بيانات الحساب. أعد المحاولة.' });
      if (path === '/api/employee/invitation') {
        const person = invitedEmployee(workspace, body.token);
        return person
          ? send(200, { email: person.email, company: person.account.company ?? workspace.company })
          : send(400, { error: invalidInvitation });
      }
      const next = structuredClone(workspace);
      if (path === '/api/employee/logout') {
        if (employee) {
          const account = next.staff.find(person => person.id === employee.id).account;
          if (account.managerSessions?.includes(sessionHash)) {
            account.managerSessions = account.managerSessions.filter(key => key !== sessionHash);
          } else {
            account.sessionHash = null;
          }
          saveWorkspace(next);
        }
        cookie = employeeSessionCookie('', companyPrefix);
        return send(200, { signedOut: true });
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
        saveWorkspace(next);
        return send(200, { activated: true });
      }
      if (path === '/api/employee/login') {
        const person = next.staff.find(item => item.status === 'Active' && item.email === string(body.email).toLowerCase() && item.account?.passwordHash);
        if (typeof body.password !== 'string' || body.password.length > 128) return send(401, { error: 'بيانات الدخول غير صحيحة.' });
        const supplied = scryptSync(body.password, person?.account.salt ?? 'invalid-employee', 64);
        if (!person || !timingSafeEqual(supplied, Buffer.from(person.account.passwordHash, 'hex')))
          return send(401, { error: 'بيانات الدخول غير صحيحة.' });
        if (canUseMultipleDevices(person)) {
          const credential = secret();
          person.account.managerSessions = [...(person.account.managerSessions ?? []).filter(key => key !== sessionHash), hash(credential)].slice(-20);
          saveWorkspace(next);
          cookie = employeeSessionCookie(credential, companyPrefix);
          return send(200, { approved: true });
        }
        if (!person.account.browser || (browser && person.account.browser === browser)) {
          const credential = secret();
          const newBinding = !person.account.browser;
          if (newBinding) person.account.browser = hash(credential);
          person.account.browserDevice ??= deviceLabel(req);
          const sessionCredential = secret();
          person.account.sessionHash = hash(sessionCredential);
          saveWorkspace(next);
          cookie = employeeSessionCookie(sessionCredential, companyPrefix);
          if (newBinding) cookie = [employeeCookie(credential, companyPrefix), cookie];
          return send(200, { approved: true });
        }
        if (!body.requestChange) return send(403, { changeRequired: true });
        if (!directGeneralManager(next, person)) {
          return send(409, { error: 'اطلب من الإدارة تعيين مدير مباشر بمسمى مدير عام قبل إرسال الطلب.' });
        }
        if (browser && person.account.pendingBrowser === browser) return send(202, { pending: true });
        const credential = secret();
        person.account.pendingBrowser = hash(credential);
        person.account.pendingDevice = deviceLabel(req);
        person.account.requestedAt = randomUUID();
        saveWorkspace(next);
        cookie = employeeCookie(credential, companyPrefix);
        return send(202, { pending: true });
      }
      if (path === '/api/employee/device-approval') {
        if (!employee) return send(401, { error: 'سجّل الدخول للموافقة على الطلب.' });
        const person = next.staff.find(item => item.id === body.staffId && item.account?.pendingBrowser &&
          item.account.requestedAt === body.requestId);
        if (!person || !['approve', 'reject'].includes(body.decision)) return send(400, { error: 'الطلب غير متاح.' });
        if (directGeneralManager(next, person)?.id !== employee.id) return send(403, { error: 'الطلب مخصص للمدير المباشر.' });
        if (body.decision === 'approve') {
          person.account.browser = person.account.pendingBrowser;
          person.account.browserDevice = person.account.pendingDevice;
          delete person.account.sessionHash;
        }
        delete person.account.pendingBrowser;
        delete person.account.pendingDevice;
        person.account.lastDeviceDecision = { decision: body.decision, at: new Date().toISOString() };
        saveWorkspace(next);
        return send(200, { saved: true });
      }
      const action = { '/api/employee/punch': '/api/punch', '/api/employee/requests': '/api/requests' }[path];
      if (!action) return send(404, { error: 'Page not found.' });
      if (!employee) return send(401, { error: 'يلزم استخدام المتصفح المعتمد.' });
      try { mutate(next, action, { ...body, device: deviceLabel(req) }, employee.id); }
      catch (error) { return send(400, { error: error.message }); }
      saveWorkspace(next);
      return send(200, { saved: true });
    }
    const next = structuredClone(demo?.state ?? workspace);
    const staffLink = path === '/api/staff/activation-link';
    if (!demo && !partner && path === '/api/staff/update' && workspace !== state) {
      return send(409, { error: 'تغيّرت بيانات الحساب. أعد المحاولة.' });
    }
    if (staffLink) {
      if (demo) return send(403, { error: 'Administrator access required.' });
      if (!partner && workspace !== state) return send(409, { error: 'تغيّرت بيانات الحساب. أعد المحاولة.' });
    } else {
      try { mutate(next, path, body); }
      catch (error) { return send(400, { error: error.message }); }
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
      saveWorkspace(next);
      const invitation = staffLink ? { url: url.href } : await deliverInvitation({
        email: person.email, name: person.nameAr || person.name, url: url.href,
        introduction: 'أضافتك شركة ' + next.company + ' إلى برنامج دوامكم.',
      });
      const currentWorkspace = partner ? partners.find(item => item.id === partner.id)?.workspace : state;
      return send(200, { ...publicState(currentWorkspace ?? next), invitation: { ...invitation, staffId: person.id }, admin });
    }
    if (demo) {
      demo.state = next;
    } else {
      saveWorkspace(next);
    }
    return send(200, { ...publicState(next), admin });
  } catch (error) {
    console.error(error);
    return send(500, { error: 'Dawamak could not complete the action.' });
  }
}
const server = createServer(handleRequest);
const port = Number(process.env.DAWAMAK_PORT || process.env.PORT || 4173);
server.listen(port, host, () => console.log('Dawamak is listening on port ' + server.address().port));
