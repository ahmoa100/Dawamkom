export const payrollBanks = [
 ['alrajhi','مصرف الراجحي','Al Rajhi Bank'], ['snb','البنك الأهلي السعودي','Saudi National Bank'],
 ['riyad','بنك الرياض','Riyad Bank'], ['alinma','مصرف الإنماء','Alinma Bank'],
 ['sab','البنك السعودي الأول','Saudi Awwal Bank'], ['anb','البنك العربي الوطني','Arab National Bank'],
 ['albilad','بنك البلاد','Bank Albilad'], ['aljazira','بنك الجزيرة','Bank AlJazira'],
 ['bsf','البنك السعودي الفرنسي','Banque Saudi Fransi'], ['saib','البنك السعودي للاستثمار','Saudi Investment Bank'],
 ['gib','بنك الخليج الدولي','Gulf International Bank'], ['other','بنك آخر','Other bank'],
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
export function payrollEntry(person) {
  const base = Number(person.salary?.monthlyBase ?? 0), housing = Number(person.salary?.monthlyHousing ?? 0);
  const other = Number(person.salary?.monthlyAllowances ?? 0);
  return { staffId: person.id, employeeNumber: String(person.employeeNumber ?? ''), name: person.nameAr || person.name,
    nameEn: person.nameEn || person.name, branchId: person.branchId ?? null, base, housing, other,
    insuranceBase: base + housing, insuranceRate: 0, insuranceDays: 30, adjustments: [] };
}
export function payrollEntries(workspace, month) {
  const saved = workspace.payrollRuns?.find(run => run.month === month);
  if (saved) return saved.entries;
  const {end} = payrollMonthBounds(month);
  return workspace.staff.filter(person => person.status !== 'Removed' && (!person.joinDate || person.joinDate <= end)).map(payrollEntry);
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
export function payrollReportRows(entries, language) {
  const ar = language === 'ar';
  const used = payrollCategories.filter(([key]) => entries.some(entry => entry.adjustments?.some(item => !item.removedAt && item.category === key)));
  const headers = ar ? ['رقم الموظف','اسم الموظف','الراتب الأساسي','بدل سكن','أخرى','إجمالي الراتب','التأمينات الاجتماعية'] :
    ['Employee number','Employee name','Basic salary','Housing allowance','Other allowances','Gross salary','Social insurance'];
  headers.push(...used.map(item => item[ar ? 2 : 3]), ...(ar ? ['إجمالي الإضافات','إجمالي الخصومات','صافي الراتب'] : ['Total additions','Total deductions','Net salary']));
  const rows = entries.map(entry => {
    const totals = payrollTotals(entry);
    return [entry.employeeNumber, ar ? entry.name : entry.nameEn, entry.base, entry.housing, entry.other, totals.gross, totals.insurance,
      ...used.map(([category]) => payrollMoney(entry.adjustments.filter(item => !item.removedAt && item.category === category).reduce((sum,item) => sum + item.amount,0))),
      totals.additions,totals.deductions,totals.net].map((value,index) => index < 2 ? String(value ?? '') : Number(value).toFixed(2));
  });
  if (rows.length) rows.push([ar ? 'الإجمالي' : 'Total','',...headers.slice(2).map((_,index) => payrollMoney(rows.reduce((sum,row) => sum+Number(row[index+2]),0)).toFixed(2))]);
  return [headers,...rows];
}
