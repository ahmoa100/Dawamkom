export const payrollBanks = [
 ['snb','البنك الأهلي السعودي','Saudi National Bank'],
 ['aljazira','بنك الجزيرة','Bank AlJazira'],
];
export const payrollCategories = [
  ['claim-add', 'addition', 'مطالبة مالية', 'Financial claim'],
  ['insurance-difference', 'addition', 'فرق أيام التأمينات الاجتماعية', 'Insurance day adjustment'],
  ['other-add', 'addition', 'إضافات أخرى', 'Other additions'],
  ['late', 'deduction', 'التأخر عن مواعيد الحضور للعمل', 'Late arrival'],
  ['early', 'deduction', 'ترك العمل أو الانصراف قبل الميعاد دون إذن أو عذر مقبول', 'Unexcused early departure'],
  ['stay', 'deduction', 'البقاء في أماكن العمل أو العودة إليها بعد انتهاء مواعيد العمل دون مبرر', 'Unauthorized presence after hours'],
  ['absence', 'deduction', 'الغياب دون إذن كتابي أو عذر مقبول', 'Unexcused absence'],
  ['consecutive', 'deduction', 'الانقطاع عن العمل دون سبب مشروع مدة تزيد على عشرة أيام متصلة', 'Extended consecutive absence'],
  ['intermittent', 'deduction', 'الغياب المتقطع دون سبب مشروع', 'Intermittent absence'],
  ['injury', 'deduction', 'التمارض أو ادعاء الإصابة أثناء العمل أو بسببه', 'Unsubstantiated injury or illness claim'],
  ['other-deduction', 'deduction', 'خصومات أخرى', 'Other deductions'],
  ['overtime', 'deduction', 'خصومات في حال تحويل راتب إضافي غير مستحق', 'Overpaid overtime'],
  ['claim-deduction', 'deduction', 'مطالبة مالية', 'Financial claim'],
  ['away', 'deduction', 'التواجد دون مبرر في غير مكان العمل أثناء وقت الدوام', 'Unexcused absence from workplace'],
  ['loan', 'deduction', 'سلفة شخصية تخصم من الراتب', 'Personal loan repayment'],
  ['unpaid', 'deduction', 'إجازة غير مدفوعة الأجر', 'Unpaid leave'],
];
export const payrollMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export function gosiRates(scheme, month, saned = true) {
  if (!['old','new'].includes(scheme)) return { pension:0, saned:0, total:0 };
  const pension = scheme === 'old' ? 9 : month >= '2028-07' ? 11 : month >= '2027-07' ? 10.5 : month >= '2026-07' ? 10 : month >= '2025-07' ? 9.5 : 9;
  return {pension,saned:saned ? .75 : 0,total:pension+(saned ? .75 : 0)};
}
export function payrollTotals(entry) {
  const gross = payrollMoney(entry.base + entry.housing + entry.other);
  const insurance = payrollMoney(entry.insuranceBase * entry.insuranceRate / 100 * entry.insuranceDays / 30);
  const adjustments = (entry.adjustments ?? []).filter(item => !item.removedAt);
  const additions = payrollMoney(adjustments.filter(item => item.kind === 'addition').reduce((sum, item) => sum + item.amount, 0));
  const deductions = payrollMoney(insurance + adjustments.filter(item => item.kind === 'deduction').reduce((sum, item) => sum + item.amount, 0));
  return { gross, insurance, additions, deductions, net: payrollMoney(gross + additions - deductions) };
}
export function payrollMonthBounds(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw new Error('Choose a valid payroll month.');
  const start = month + '-01';
  const date = new Date(start + 'T00:00:00Z'); date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return { start, end: date.toISOString().slice(0, 10) };
}
export function automaticInsurance(person, month) {
  if (person.contractType === 'Tamheer' || (person.nationality && person.nationality !== 'SA')) return {insuranceScheme:'none',insuranceSaned:false,insuranceBase:0,insuranceRate:0,insuranceDays:30,insuranceNeedsSetup:false,insuranceAutomatic:true};
  const joined=/^\d{4}-\d{2}-\d{2}$/.test(person.joinDate??'') && Number.isFinite(Date.parse(person.joinDate));
  const scheme=['old','new','none'].includes(person.gosiScheme)?person.gosiScheme:(person.nationality==='SA'&&joined?(person.joinDate<'2024-07-03'?'old':'new'):undefined);
  const configured=['old','new','none'].includes(scheme);
  const salaryBase=Number(person.salary?.monthlyBase??0)+Number(person.salary?.monthlyHousing??0)+Number(person.salary?.monthlyAllowances??0);
  const contributionBase=Number.isFinite(person.gosiBase)&&person.gosiBase>0?person.gosiBase:salaryBase;
  const hasBase=Number.isFinite(contributionBase)&&contributionBase>0;
  const needs=person.nationality==='SA' && (!configured || (scheme!=='none' && !hasBase));
  return {insuranceScheme:configured?scheme:'manual',insuranceSaned:person.gosiSaned!==false,
    insuranceBase:scheme==='none'?0:Math.max(0,Math.min(45000,contributionBase)),
    insuranceRate:gosiRates(scheme,month,person.gosiSaned!==false).total,insuranceDays:30,insuranceNeedsSetup:needs,insuranceAutomatic:true};
}
export function payrollEntry(person, month) {
  const base = Number(person.salary?.monthlyBase ?? 0), housing = Number(person.salary?.monthlyHousing ?? 0);
  const profileOtherAllowances = Number(person.salary?.monthlyOtherAllowances ?? 0);
  const other = payrollMoney(Number(person.salary?.monthlyAllowances ?? 0) + profileOtherAllowances);
  return { staffId: person.id, employeeNumber: String(person.employeeNumber ?? ''), name: person.nameAr || person.name,
    nameEn: person.nameEn || person.name, branchId: person.branchId ?? null, contractType: person.contractType ?? null, base, housing, other, profileOtherAllowances,
    payment: {identity:person.identityNumber??'',account:person.iban??'',bankCode:'',address:person.address??'',...person.bankPayment},
    ...automaticInsurance(person,month), adjustments: [] };
}
export function payrollEntries(workspace, month) {
  const saved = workspace.payrollRuns?.find(run => run.month === month);
  if (saved) {
    const entries=saved.status==='Approved'?saved.entries:saved.entries.map(entry=>{
      const person=workspace.staff.find(item=>item.id===entry.staffId);
      if(!person)return entry;
      const profileOtherAllowances = Number(person.salary?.monthlyOtherAllowances ?? 0);
      if (profileOtherAllowances !== (entry.profileOtherAllowances ?? 0)) {
        entry = {...entry, profileOtherAllowances, other: payrollMoney(Math.max(0, entry.other - (entry.profileOtherAllowances ?? 0) + profileOtherAllowances))};
      }
      if(person.contractType==='Tamheer'||(person.nationality && person.nationality!=='SA'))return {...entry,...automaticInsurance(person,month)};
      if(entry.insuranceOverride || (!entry.insuranceAutomatic && ['old','new','none'].includes(entry.insuranceScheme)) || (entry.insuranceScheme==='manual' && entry.insuranceRate>0)) {
        const rate=['old','new'].includes(entry.insuranceScheme)?gosiRates(entry.insuranceScheme,month,entry.insuranceSaned!==false).total:entry.insuranceRate;
        return {...entry,insuranceRate:rate,insuranceNeedsSetup:false,insuranceAutomatic:true};
      }
      return {...entry,...automaticInsurance(person,month)};
    });
    return withLoanRepayments(entries,workspace.loanSchedules,month);
  }
  const {end} = payrollMonthBounds(month);
  return withLoanRepayments(workspace.staff.filter(person => person.status !== 'Removed' && (!person.joinDate || person.joinDate <= end)).map(person=>payrollEntry(person,month)), workspace.loanSchedules, month);
}
export function payrollMonths(workspace) {
  const current = workspace.today.slice(0,7);
  const dates = [current, ...(workspace.payrollRuns ?? []).map(run => run.month),
    ...workspace.staff.filter(person => person.status !== 'Removed').map(person => person.joinDate?.slice(0,7)).filter(value => value && value <= current)];
  const first = dates.sort()[0], result = [];
  const cursor = new Date(current + '-01T00:00:00Z');
  while (cursor.toISOString().slice(0,7) >= first) {
    result.push(cursor.toISOString().slice(0,7)); cursor.setUTCMonth(cursor.getUTCMonth()-1);
  }
  return result;
}
export function hasEnglishPayrollName(name) {
  return typeof name === 'string' && /\p{Script=Latin}/u.test(name) && !/\p{Script=Arabic}/u.test(name);
}

export function payrollExportEntries(entries, staff, { bankTemplate = false } = {}) {
  const people = new Map(staff.map(person => [person.id, person]));
  const included = bankTemplate
    ? entries.filter(entry => (people.get(entry.staffId)?.contractType ?? entry.contractType) !== 'Tamheer')
    : entries;
  return included.map(entry => {
    const current = people.get(entry.staffId)?.nameEn;
    const nameEn = hasEnglishPayrollName(current) ? current : hasEnglishPayrollName(entry.nameEn) ? entry.nameEn : '';
    return {...entry, nameEn};
  });
}

export function payrollReportRows(entries, language) {
  const ar = language === 'ar';
  const used = payrollCategories.filter(([key]) => entries.some(entry => entry.adjustments?.some(item => !item.removedAt && item.category === key)));
  const headers = ar ? ['رقم الموظف','اسم الموظف','الراتب الأساسي','بدل سكن','أخرى','إجمالي الراتب','التأمينات الاجتماعية'] :
    ['Employee number','Employee name','Basic salary','Housing allowance','Other allowances','Gross salary','Social insurance'];
  headers.push(...used.map(item => item[ar ? 2 : 3]), ...(ar ? ['إجمالي الإضافات','إجمالي الخصومات','صافي الراتب'] : ['Total additions','Total deductions','Net salary']));
  const rows = entries.map(entry => {
    const totals = payrollTotals(entry);
    return [entry.employeeNumber, entry.nameEn, entry.base, entry.housing, entry.other, totals.gross, totals.insurance,
      ...used.map(([category]) => payrollMoney(entry.adjustments.filter(item => !item.removedAt && item.category === category).reduce((sum,item) => sum + item.amount,0))),
      totals.additions,totals.deductions,totals.net].map((value,index) => index < 2 ? String(value ?? '') : Number(value).toFixed(2));
  });
  if (rows.length) rows.push([ar ? 'الإجمالي' : 'Total','',...headers.slice(2).map((_,index) => payrollMoney(rows.reduce((sum,row) => sum+Number(row[index+2]),0)).toFixed(2))]);
  return [headers,...rows];
}

export function withLoanRepayments(entries, schedules=[], month) {
 return entries.map(entry=>{
  const adjustments=[...(entry.adjustments??[])];
  for(const schedule of schedules.filter(item=>item.staffId===entry.staffId)) for(const installment of schedule.installments.filter(item=>item.month===month)) {
   if(adjustments.some(item=>item.id===installment.id))continue;
   adjustments.push({id:installment.id,category:'loan',kind:'deduction',amount:installment.amount,createdAt:schedule.createdAt,
    description:'قسط سلفة '+installment.number+'/'+schedule.installments.length,system:'loan-repayment',requestId:schedule.requestId,installmentNumber:installment.number});
  }
  return {...entry,adjustments};
 });
}
