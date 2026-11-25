import { hasEnglishPayrollName, payrollTotals } from './payroll-model.js';
export function bankPayrollRows(entries, bank, month) {
 if(!['snb','aljazira'].includes(bank))throw Error('Choose SNB or Bank AlJazira for a bank template.');
 const header=bank==='snb'?['البنك','رقم الحساب','إجمالي الراتب','ملاحظات','اسم الموظف','رقم الهوية أو الإقامة','عنوان الموظف','الراتب الأساسي','بدل سكن','بدلات أخرى','خصومات']:
 ['Employee Id/Iqama','Employee Account No/IBAN','Employee Name','Bank Code','Basic Salary ','Housing Allowance','Other Allowance','Deduction','Total Amount'];
 const statementNote=bank==='snb'
  ? 'SALAY '+new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z')).toUpperCase()+'  '+month.slice(0,4)
  : null;
 const rows=entries.map(entry=>{
  const payment=entry.payment??{}, account=String(payment.account??'').replace(/\s/g,'').toUpperCase();
  const identity=String(payment.identity??'').trim(), bankCode=String(payment.bankCode??'').trim();
  const name=hasEnglishPayrollName(entry.nameEn)?entry.nameEn:'', address=payment.address?.trim()??'';
  if((account&&!/^(?:SA\d{22}|\d{10,24})$/.test(account))||(identity&&!/^\d{10}$/.test(identity))||(bankCode&&!/^[A-Z0-9]{4}$/.test(bankCode)))
   throw Error('صيغة بيانات الدفع غير صحيحة للموظف: '+entry.name);
  const t=payrollTotals(entry), money=value=>bank==='snb'?String(Number(value.toFixed(2))):value.toFixed(2);
  if(t.net<0)throw Error('لا يمكن تصدير راتب سالب: '+entry.name);
  return bank==='snb'?[bankCode,account,money(t.net),statementNote,name,identity,address,money(entry.base),money(entry.housing),money(entry.other+t.additions),money(t.deductions)]:
   [identity,account,name,bankCode,money(entry.base),money(entry.housing),money(entry.other+t.additions),money(t.deductions),money(t.net)];
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
