import { managesBranch, roleBranches } from './public/branch-roles.js';
import { hasRolePermission, payrollNoticeEligible } from './public/role-permissions.js';
import { randomUUID } from 'node:crypto';
import { bankPayrollRows } from './public/bank-payroll.js';
import { payrollBanks, payrollCategories, payrollEntries, payrollExportEntries, payrollMoney, payrollMonthBounds, payrollReportRows, gosiRates, resolvedPayrollAbsenceIds, isPayrollAbsence } from './public/payroll-model.js';
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
export function canApprovePayrollRun(workspace, run, manager) {
  if (!manager || !hasRolePermission(workspace, manager, 'payrollView') ||
      !hasRolePermission(workspace, manager, 'payrollApprove') || !run.entries.length) return false;
  const people = new Map(workspace.staff.map(person => [person.id, person]));
  return run.entries.every(entry => managesBranch(manager, entry.branchId) &&
    managesBranch(manager, people.get(entry.staffId)?.branchId));
}
export const canConfigurePayrollNotices = (workspace, manager) => Boolean(manager && manager.status === 'Active' &&
  ['notifications','payrollView','payrollApprove'].every(key => hasRolePermission(workspace, manager, key)) &&
  roleBranches(manager).length && workspace.locations.every(branch => managesBranch(manager, branch.id)));

export function payrollNoticeRecipients(workspace, run) {
  const settings = workspace.payrollNotificationSettings;
  if (!settings?.enabled) return [];
  const staff = new Map(workspace.staff.map(person => [person.id, person]));
  return settings.recipientIds.filter(id => {
    const person = staff.get(id);
    return payrollNoticeEligible(workspace, person) && run.entries.some(entry =>
      managesBranch(person, entry.branchId) && managesBranch(person, staff.get(entry.staffId)?.branchId));
  });
}

export function payrollAlerts(workspace, person) {
  if (!payrollNoticeEligible(workspace, person)) return [];
  const staff = new Map(workspace.staff.map(item => [item.id, item]));
  return (workspace.payrollRuns ?? []).filter(run => run.payrollNotice?.inApp &&
    run.payrollNotice.ids.includes(person.id) && run.entries.some(entry =>
      managesBranch(person, entry.branchId) && managesBranch(person, staff.get(entry.staffId)?.branchId)))
    .slice(-24).map(({id,month,approvedAt}) => ({id,month,approvedAt,canOpen:hasRolePermission(workspace,person,'payrollView')}));
}
export function mutatePayroll(workspace, body, { owner, manager, now = new Date().toISOString() }) {
  const {month, operation} = body;
  const bounds = payrollMonthBounds(month);
  requireValue(month <= new Date(Date.parse(now) + 3*60*60*1000).toISOString().slice(0,7), 'Future payroll months cannot be prepared.');
  requireValue(['prepare','salary','payment','adjustment','edit-adjustment','remove-adjustment','approve','export','bank'].includes(operation), 'Invalid payroll action.');
  const runs = workspace.payrollRuns ??= [];
  let run = runs.find(item => item.month === month);
  if (!run) { run = {id:randomUUID(),month,status:'Draft',createdAt:now,entries:payrollEntries(workspace,month)}; runs.push(run); }
  const permitted = entry => owner || (managesBranch(manager ?? {}, entry.branchId) && workspace.staff.some(person => person.id === entry.staffId && managesBranch(manager, person.branchId)));
  requireValue(owner || roleBranches(manager ?? {}).length, 'This action is outside your branch permissions.');
  if (run.status !== 'Approved') run.entries=payrollEntries(workspace,month,Date.parse(now));
  if (operation === 'prepare') {
    if (run.status !== 'Approved') {
      const ids = new Set(run.entries.map(entry => entry.staffId));
      const additional = payrollEntries({ ...workspace, payrollRuns: [] }, month).filter(entry => !ids.has(entry.staffId));
      if (additional.length) { run.entries.push(...additional); run.version=(run.version??0)+1; }
    }
    return;
  }
  if (operation === 'bank') {
    const bank = payrollBanks.find(item => item[0] === body.bankId);
    requireValue(bank, 'Choose Saudi National Bank or Bank AlJazira.');
    const selected = {id:bank[0],name:bank[1],nameEn:bank[2]};
    if (owner) run.bank=selected; else run.banks={...run.banks,[manager.branchId]:selected};
    return;
  }
  if (operation === 'export') {
    requireValue(['xlsx','pdf','csv'].includes(body.format) && ['ar','en'].includes(body.language), 'Invalid report data.');
    const branchId = body.branchId;
    if (branchId != null) {
      requireValue(typeof branchId === 'string' && (owner || managesBranch(manager, branchId)), 'This action is outside your branch permissions.');
    }
    const selectedBank = payrollBanks.find(item => item[0] === body.bankId);
    const savedBank = !owner && run.banks?.[manager.branchId] || run.bank;
    const template = body.bankTemplate ?? (body.format === 'csv' && savedBank?.id === 'snb');
    if (template && body.bankId != null) requireValue(selectedBank, 'Choose Saudi National Bank or Bank AlJazira.');
    const bank = selectedBank ? {id:selectedBank[0],name:selectedBank[1],nameEn:selectedBank[2]} : savedBank;
    if (template || body.bankTemplate == null) requireValue(bank, 'Choose a bank.');
    const entries = payrollExportEntries(run.entries.filter(entry => permitted(entry) && (branchId == null || entry.branchId === branchId)), workspace.staff, {bankTemplate:template});
    requireValue(entries.length, template ? 'لا يوجد موظفون مؤهلون للتصدير البنكي بعد استثناء تمهير.' : 'No employees in this payroll.');
    requireValue(!entries.some(entry=>entry.insuranceNeedsSetup),'Complete GOSI classification and contribution base before exporting payroll.');
    const title = (body.language === 'ar' ? 'كشف الرواتب' : 'Payroll statement') + ' — ' + month +
      (run.status === 'Approved' ? '' : body.language === 'ar' ? ' (مسودة)' : ' (Draft)');
    const report = {id:randomUUID(),createdAt:now,type:'payroll',title,company:workspace.company,...(template||body.bankTemplate==null?{bank}:{}),format:template?(bank.id==='snb'&&body.format==='csv'?'csv':'xlsx'):body.format,language:body.language,
      ...bounds,bankTemplate:template,rows:template?bankPayrollRows(entries,bank.id,month):payrollReportRows(entries,body.language),
      ...(owner?{}:{branchId:branchId??manager.branchId,branchIds:[...new Set(entries.flatMap(entry=>[
        entry.branchId,workspace.staff.find(person=>person.id===entry.staffId)?.branchId,
      ]))]})};
    (workspace.issuedReports ??= []).unshift(report); return report.id;
  }
  const paymentEntry = operation==='payment' && run.entries.find(item=>item.staffId===body.staffId);
  if (operation === 'payment') {
    requireValue(paymentEntry && permitted(paymentEntry),'This action is outside your branch permissions.');
    requireValue(body.expectedVersion===(run.version??0),'Payroll changed. Review it again before editing.');
    const payment={};
    for(const key of ['account','identity','bankCode','address']) {
      requireValue(typeof body[key]==='string'&&body[key].length<=120,'Enter valid payment details.');
      payment[key]=body[key].trim();
    }
    payment.bankCode=payment.bankCode.toUpperCase();
    paymentEntry.payment={...payment,updatedAt:now};
    const person=workspace.staff.find(item=>item.id===paymentEntry.staffId);
    if(person) person.bankPayment={...payment};

    run.version=(run.version??0)+1; return;
  }
  requireValue(run.status !== 'Approved', 'Approved payroll is locked.');
  if (operation === 'approve') {
    requireValue(owner || canApprovePayrollRun(workspace, run, manager),
      'Approving this payroll requires approval permission for every branch in the run.');
    requireValue(run.entries.length, 'No employees in this payroll.');
    requireValue(body.expectedVersion === (run.version ?? 0), 'Payroll changed. Review it again before approving.');
    requireValue(JSON.stringify(body.resolvedAbsenceIds ?? []) === JSON.stringify(resolvedPayrollAbsenceIds(run.entries)),
      'Attendance changed. Refresh and review the payroll before approving.');
    requireValue(!run.entries.some(entry=>entry.insuranceNeedsSetup),'Complete GOSI classification and contribution base before approving payroll.');
    const noticeIds = payrollNoticeRecipients(workspace, run);
    if (noticeIds.length) run.payrollNotice = {ids:noticeIds, inApp:workspace.payrollNotificationSettings.inApp,
      email:workspace.payrollNotificationSettings.email};
    run.status='Approved'; run.approvedAt=now; run.approvedBy=owner?'account-administrator':manager.id; run.version=(run.version??0)+1; return;
  }
  requireValue(body.expectedVersion === (run.version ?? 0), 'Payroll changed. Review it again before editing.');
  const entry = run.entries.find(item => item.staffId === body.staffId);
  requireValue(entry && permitted(entry), 'This action is outside your branch permissions.');
  if (operation === 'salary') {
    if (body.insuranceScheme !== undefined) {
      requireValue(['manual','old','new','none'].includes(body.insuranceScheme) && typeof body.insuranceSaned === 'boolean','Choose valid insurance settings.');
      if (body.insuranceScheme !== 'manual') {
        requireValue(body.insuranceBase<=45000 && (!['old','new'].includes(body.insuranceScheme) || body.insuranceBase>0),'Choose valid insurance settings.');
        body.insuranceRate=gosiRates(body.insuranceScheme,month,body.insuranceSaned).total;
      }
    }
    entry.insuranceOverride=true;
    entry.insuranceNeedsSetup=false;
    const fields=['base','housing','other','insuranceBase','insuranceRate','insuranceDays'];
    requireValue(fields.every(key=>typeof body[key]==='number' && Number.isFinite(body[key]) && body[key]>=0 && body[key]<=100000000) &&
      body.insuranceRate<=100 && Number.isInteger(body.insuranceDays) && body.insuranceDays<=30,'Enter valid payroll amounts and insurance settings.');
    for (const key of fields) entry[key]=payrollMoney(body[key]);
    if (body.insuranceScheme !== undefined) {
      entry.insuranceScheme=body.insuranceScheme;
      entry.insuranceSaned=body.insuranceSaned;
    } else entry.insuranceScheme='manual';
  } else if (operation === 'adjustment' || operation === 'edit-adjustment') {
    const existing = body.adjustmentId === undefined ? null : entry.adjustments.find(item=>item.id===body.adjustmentId && !item.removedAt);
    if (body.adjustmentId !== undefined || operation === 'edit-adjustment')
      requireValue(existing && !existing.system && (body.category===undefined || existing.category===body.category), 'Payroll adjustment not found.');
    const category=payrollCategories.find(item=>item[0]===(existing?.category??body.category));
    requireValue(category && typeof body.amount==='number' && Number.isFinite(body.amount) && body.amount>0 && body.amount<=100000000,'Enter a valid adjustment amount.');
    requireValue(typeof body.description==='string' && body.description.trim() && body.description.length<=1000,'Enter a description of up to 1000 characters.');
    const attendanceDate = body.attendanceDate ?? existing?.attendanceDate ?? '';
    if (attendanceDate || (category[0] === 'absence' && !existing)) {
      requireValue(category[0] === 'absence' && typeof attendanceDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(attendanceDate) && attendanceDate >= bounds.start && attendanceDate <= bounds.end &&
        Number.isFinite(Date.parse(attendanceDate)) && new Date(attendanceDate).toISOString().slice(0,10) === attendanceDate &&
        attendanceDate <= new Date(Date.parse(now) + 10800000).toISOString().slice(0,10),
      'Choose the absence date within the payroll month.');
      if (!existing || (existing.attendanceDate && attendanceDate !== existing.attendanceDate)) {
        const person = workspace.staff.find(item=>item.id===entry.staffId);
        requireValue(person && isPayrollAbsence(workspace,person,attendanceDate,Date.parse(now)),
          'The employee does not have an absence on this date.');
      }
      requireValue(!entry.adjustments.some(item=>item!==existing && !item.removedAt &&
        item.category==='absence' && item.attendanceDate===attendanceDate), 'This absence already has a payroll deduction.');
    }
    const attachment=body.attachment;
    if (attachment) requireValue(typeof attachment.name==='string' && attachment.name.length<=180 &&
      ['image/png','image/jpeg','application/pdf'].includes(attachment.mime) && typeof attachment.data==='string' &&
      /^[A-Za-z0-9+/]*={0,2}$/.test(attachment.data) && Buffer.from(attachment.data,'base64').length>0 && Buffer.from(attachment.data,'base64').length<=2*1024*1024,'Choose a PDF, PNG or JPEG up to 2 MB.');
    const actor=owner?'account-administrator':manager.id;
    const values={amount:payrollMoney(body.amount),description:body.description.trim(),
      ...(attendanceDate ? {attendanceDate} : {}),
      ...(attachment?{attachment:{name:attachment.name,mime:attachment.mime,data:attachment.data}}:{})};
    if(existing) Object.assign(existing,values,{updatedAt:now,updatedBy:actor});
    else entry.adjustments.push({id:randomUUID(),category:category[0],kind:category[1],...values,createdAt:now,createdBy:actor});
  } else {
    const adjustment=entry.adjustments.find(item=>item.id===body.adjustmentId && !item.removedAt);
    requireValue(adjustment,'Payroll adjustment not found.');
    requireValue(adjustment.system !== 'loan-repayment','Scheduled loan repayments cannot be removed manually.');
    adjustment.removedAt=now;
  }
  run.version=(run.version??0)+1; run.updatedAt=now;
}
export function publicPayrollRuns(runs=[]) {
  return runs.map(({payrollNotice, ...run})=>({...run,entries:run.entries.map(entry=>({...entry,adjustments:entry.adjustments.map(({attachment,...item})=>
    ({...item,...(attachment?{attachment:{name:attachment.name,mime:attachment.mime}}:{})}))}))}));
}
