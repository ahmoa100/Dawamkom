import test from 'node:test';import assert from 'node:assert/strict';import {bankPayrollRows,snbCsvReport} from '../public/bank-payroll.js';import {excelFile} from '../public/report-files.js';import {mutatePayroll} from '../payroll.mjs';
const employee={staffId:'s',name:'Fictional',nameEn:'Fixture Employee',branchId:'a',base:4000,housing:500,other:100,insuranceBase:0,insuranceRate:0,insuranceDays:30,adjustments:[{kind:'deduction',amount:12.35}],payment:{identity:'1000000000',account:'00123456789012',bankCode:'NCBK',address:'Tabuk'}};
function unzipStored(bytes){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files=new Map();let offset=0;while(view.getUint32(offset,true)===0x04034b50){const size=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),start=offset+30+nameLength+extra;files.set(new TextDecoder().decode(bytes.slice(offset+30,offset+30+nameLength)),new TextDecoder().decode(bytes.slice(start,start+size)));offset=start+size;}return files;}
test('SNB CSV matches supplied dialect and eleven columns, preserving IDs and compact cent precision',()=>{const rows=bankPayrollRows([employee],'snb','2026-10'),text=snbCsvReport(rows);assert.equal(rows[0].join(','),'البنك,رقم الحساب,إجمالي الراتب,ملاحظات,اسم الموظف,رقم الهوية أو الإقامة,عنوان الموظف,الراتب الأساسي,بدل سكن,بدلات أخرى,خصومات');assert.equal(text.charCodeAt(0),0xfeff);assert.ok(text.endsWith('\r\n'));assert.equal(text.replaceAll('\r\n','').includes('\n'),false);assert.equal(text.includes('"'),false);assert.equal(rows[1][1],'00123456789012');assert.equal(rows[1][7],'4000');assert.equal(rows[1][10],'12.35');assert.equal(rows[1][2],'4587.65');assert.ok(snbCsvReport([['A,B','A"B','A\nB']]).includes('"A,B","A""B","A\nB"'));});
test('AlJazira XLSX matches Sheet1, LTR and nine template columns with numeric identity/pay and text accounts',async()=>{const rows=bankPayrollRows([employee],'aljazira','2026-10'),blob=excelFile({bankTemplate:true,bank:{id:'aljazira'},language:'ar',rows}),files=unzipStored(new Uint8Array(await blob.arrayBuffer()));const sheet=files.get('xl/worksheets/sheet1.xml'),strings=files.get('xl/sharedStrings.xml');assert.match(files.get('xl/workbook.xml'),/name="Sheet1"/);assert.match(sheet,/<dimension ref="A1:I2"/);assert.doesNotMatch(sheet,/rightToLeft="1"|<cols>/);assert.match(sheet,/<c r="A2"><v>1000000000<\/v>/);assert.match(sheet,/<c r="B2" t="s">/);assert.match(sheet,/<c r="I2"><v>4587.65<\/v>/);assert.match(strings,/>Basic Salary <\/t>/);assert.match(strings,/>00123456789012<\/t>/);assert.equal(rows[0].length,9);});
test('CSV export uses SNB template automatically and retains a general CSV for other banks without changing payroll',()=>{for(const bank of ['snb','aljazira']){const w={company:'Fixture',staff:[{id:'s',name:'Fictional',branchId:'a',status:'Active'}],payrollRuns:[{id:'run',month:'2026-10',status:'Approved',bank:{id:bank,name:bank,nameEn:bank},entries:[structuredClone(employee)]}]};const before=JSON.stringify(w.payrollRuns[0]);const id=mutatePayroll(w,{month:'2026-10',operation:'export',format:'csv',language:'ar'},{owner:true,now:'2026-11-22T00:00:00Z'});const report=w.issuedReports.find(r=>r.id===id);assert.equal(report.format,'csv');assert.equal(report.bankTemplate,bank==='snb');assert.equal(JSON.stringify(w.payrollRuns[0]),before);if(bank==='snb')assert.equal(report.rows[0].length,11);}});

test('new payroll files use the profile English name even for an older approved run', () => {
 const w = {
  company: 'Fixture',
  staff: [{id:'s', nameEn:'Corrected English Name', branchId:'a', status:'Active'}],
  payrollRuns: [{id:'run', month:'2026-10', status:'Approved', bank:{id:'snb'}, entries:[{...employee,nameEn:'اسم قديم'}]}],
 };
 const snapshot = structuredClone(w.payrollRuns[0]);
 for (const bankTemplate of [true,false]) {
  const id = mutatePayroll(w,{month:'2026-10',operation:'export',format:'xlsx',language:'ar',bankTemplate},{owner:true,now:'2026-11-22T00:00:00Z'});
  assert.equal(w.issuedReports.find(report=>report.id===id).rows[1][bankTemplate?4:1],'Corrected English Name');
 }
 assert.deepEqual(w.payrollRuns[0],snapshot);
});

test('SNB Excel keeps the reference columns left aligned and November values typed correctly', async () => {
 const rows = bankPayrollRows([employee], 'snb', '2026-11');
 const output = excelFile({bankTemplate:true,bank:{id:'snb'},language:'ar',rows});
 const files = unzipStored(new Uint8Array(await output.arrayBuffer()));
 const sheet = files.get('xl/worksheets/sheet1.xml');
 const strings = files.get('xl/sharedStrings.xml');
 assert.deepEqual(rows[0], ['البنك','رقم الحساب','إجمالي الراتب','ملاحظات','اسم الموظف','رقم الهوية أو الإقامة','عنوان الموظف','الراتب الأساسي','بدل سكن','بدلات أخرى','خصومات']);
 assert.deepEqual(rows[1], ['NCBK','00123456789012','4587.65','SALAY NOV  2026','Fixture Employee','1000000000','Tabuk','4000','500','100','12.35']);
 assert.match(sheet, /<dimension ref="A1:K2"/);
 assert.doesNotMatch(sheet, /rightToLeft="1"/);
 assert.equal([...sheet.matchAll(/<c r="[A-K][12]" s="1"/g)].length, 22);
 assert.match(files.get('xl/styles.xml'), /<alignment horizontal="left"/);
 assert.match(sheet, /<c r="B2" s="1" t="s">/);
 assert.match(sheet, /<c r="F2" s="1"><v>1000000000<\/v>/);
 assert.match(sheet, /<c r="K2" s="1"><v>12.35<\/v>/);
 assert.match(strings, /SALAY NOV  2026/);
 assert.match(files.get('xl/workbook.xml'), /name="bulkPayrollWps NOV 2026"/);
 assert.match(sheet, /width="23.63"/);
});
