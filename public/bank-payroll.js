import { payrollTotals } from './payroll-model.js';
export function bankPayrollRows(entries, bank, month) {
 if(!['snb','aljazira'].includes(bank))throw Error('Choose SNB or Bank AlJazira for a bank template.');
 const header=bank==='snb'?['البنك','رقم الحساب','إجمالي الراتب','ملاحظات','اسم الموظف','رقم الهوية أو الإقامة','عنوان الموظف','الراتب الأساسي','بدل سكن','بدلات أخرى','خصومات']:
 ['Employee Id/Iqama','Employee Account No/IBAN','Employee Name','Bank Code','Basic Salary ','Housing Allowance','Other Allowance','Deduction','Total Amount'];
 const rows=entries.map(entry=>{
  const payment=entry.payment??{}, account=String(payment.account??'').replace(/\s/g,'').toUpperCase();
  if(!/^(?:SA\d{22}|\d{10,24})$/.test(account)||!/^\d{10}$/.test(payment.identity??'')||!/^[A-Z0-9]{4}$/.test(payment.bankCode??'')||!entry.nameEn?.trim()||(bank==='snb'&&!payment.address?.trim()))
   throw Error('أكمل بيانات الدفع (الحساب، الهوية، رمز البنك، الاسم الإنجليزي والعنوان) للموظف: '+entry.name);
  const t=payrollTotals(entry), money=value=>value.toFixed(2);
  if(t.net<0)throw Error('لا يمكن تصدير راتب سالب: '+entry.name);
  return bank==='snb'?[payment.bankCode,account,money(t.net),'Salary '+month,entry.nameEn,payment.identity,payment.address,money(entry.base),money(entry.housing),money(entry.other+t.additions),money(t.deductions)]:
   [payment.identity,account,entry.nameEn,payment.bankCode,money(entry.base),money(entry.housing),money(entry.other+t.additions),money(t.deductions),money(t.net)];
 });
 return [header,...rows];
}
export function csvReport(rows) {
 return '\uFEFF'+rows.map(row=>row.map(value=>{
  const text=String(value); return '"'+text.replace(/"/g,'""')+'"';
 }).join(',')).join('\r\n')+'\r\n';
}
