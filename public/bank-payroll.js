import { payrollTotals } from './payroll-model.js';
export function bankPayrollRows(entries, bank, month) {
 if(!['snb','aljazira'].includes(bank))throw Error('Choose SNB or Bank AlJazira for a bank template.');
 const header=bank==='snb'?['البنك','رقم الحساب','إجمالي الراتب','ملاحظات','اسم الموظف','رقم الهوية أو الإقامة','عنوان الموظف','الراتب الأساسي','بدل سكن','بدلات أخرى','خصومات']:
 ['Employee Id/Iqama','Employee Account No/IBAN','Employee Name','Bank Code','Basic Salary ','Housing Allowance','Other Allowance','Deduction','Total Amount'];
 const statementNote=bank==='snb'
  ? 'SALAY '+new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z')).toUpperCase()+' '+month.slice(0,4)
  : null;
 const rows=entries.map(entry=>{
  const payment=entry.payment??{}, account=String(payment.account??'').replace(/\s/g,'').toUpperCase();
  if(!/^(?:SA\d{22}|\d{10,24})$/.test(account)||!/^\d{10}$/.test(payment.identity??'')||!/^[A-Z0-9]{4}$/.test(payment.bankCode??'')||!entry.nameEn?.trim()||(bank==='snb'&&!payment.address?.trim()))
   throw Error('أكمل بيانات الدفع (الحساب، الهوية، رمز البنك، الاسم الإنجليزي والعنوان) للموظف: '+entry.name);
  const t=payrollTotals(entry), money=value=>bank==='snb'?String(Number(value.toFixed(2))):value.toFixed(2);
  if(t.net<0)throw Error('لا يمكن تصدير راتب سالب: '+entry.name);
  return bank==='snb'?[payment.bankCode,account,money(t.net),statementNote,entry.nameEn,payment.identity,payment.address,money(entry.base),money(entry.housing),money(entry.other+t.additions),money(t.deductions)]:
   [payment.identity,account,entry.nameEn,payment.bankCode,money(entry.base),money(entry.housing),money(entry.other+t.additions),money(t.deductions),money(t.net)];
 });
 return [header,...rows];
}
export function csvReport(rows) {
 return '\uFEFF'+rows.map(row=>row.map(value=>{
  const text=String(value); return '"'+text.replace(/"/g,'""')+'"';
 }).join(',')).join('\r\n')+'\r\n';
}

// SNB reference: UTF-8 BOM, comma separators, CRLF, and quotes only when CSV escaping requires them.
export function snbCsvReport(rows){
 return '\uFEFF'+rows.map(row=>row.map(value=>{const text=String(value??'');return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}).join(',')).join('\r\n')+'\r\n';
}
