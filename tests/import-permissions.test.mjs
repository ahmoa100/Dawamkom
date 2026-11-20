import test from 'node:test';
import assert from 'node:assert/strict';
import {permissionsFor,updateRolePermissions,authorizeRoleAction,hasAdministration} from '../public/role-permissions.js';
import {delimitedRows,guessColumns,mappedEmployee} from '../public/employee-import.js';
import {uploadDocuments} from '../public/document-reader.js';
test('role action revocation, custom grants, optimistic version and strict keys',()=>{
 const w={staffRoles:['Manager','Employee','HR']},manager={role:'Manager'},hr={role:'HR'};
 assert.equal(hasAdministration(w,manager),true);assert.equal(hasAdministration(w,hr),false);
 const values=permissionsFor(w,'Manager');values.periods=false;values.requests=false;
 updateRolePermissions(w,{role:'Manager',values,expectedVersion:0});
 assert.throws(()=>authorizeRoleAction(w,manager,'/api/work-periods',{}),/role permissions/);
 assert.throws(()=>authorizeRoleAction(w,manager,'/api/decision',{}),/role permissions/);
 authorizeRoleAction(w,manager,'/api/staff',{});
 assert.throws(()=>updateRolePermissions(w,{role:'Manager',values,expectedVersion:0}),/changed/);
 assert.throws(()=>updateRolePermissions(w,{role:'HR',values:{...values,unknown:true},expectedVersion:0}),/valid/);
 const grant=permissionsFor(w,'HR');grant.payrollExport=true;updateRolePermissions(w,{role:'HR',values:grant,expectedVersion:0});
 assert.equal(hasAdministration(w,hr),true);authorizeRoleAction(w,hr,'/api/payroll',{operation:'export'});
 assert.throws(()=>authorizeRoleAction(w,hr,'/api/payroll',{operation:'approve'}),/role permissions/);
 assert.throws(()=>authorizeRoleAction(w,hr,'/api/payroll',{operation:'payment'}),/role permissions/);
});
test('CSV quoting and bilingual header mapping preserve identifiers and dates',()=>{
 const rows=delimitedRows('\uFEFFالاسم العربي;Email;رقم الهوية;تاريخ الانضمام\n"أحمد; علي";a@example.com;0012345678;19/11/2025');
 const map=guessColumns(rows[0]);assert.equal(map.email,1);assert.equal(map.identityNumber,2);
 const p=mappedEmployee(rows[1],map,{locations:[],jobTitles:[]});assert.equal(p.nameAr,'أحمد; علي');assert.equal(p.identityNumber,'0012345678');assert.equal(p.joinDate,'2025-11-19');assert.equal(p.salary,'');
 assert.deepEqual(delimitedRows('name,email\n"A\nB",a@example.com')[1],['A\nB','a@example.com']);
});
test('multi-document upload isolates failures and suggestions never confirm an expiry',async()=>{
 const file=name=>new File(['%PDF-1.0'],name,{type:'application/pdf'}),saved=[];
 const files=[file('a.pdf'),file('bad.pdf'),file('b.pdf')];
 const result=await uploadDocuments(files,async body=>{if(body.name==='bad.pdf')throw Error('Storage failed');saved.push(body);},()=>{},'en',async()=>({candidates:[{date:'2027-12-31',labelled:true}]}));
 assert.equal(saved.length,2);assert.equal(result[1].error,'Storage failed');assert.equal(saved[0].expiresOn,'');assert.equal(saved[0].suggestedExpiresOn,'2027-12-31');
 const fallback=[];await uploadDocuments([file('c.pdf')],async b=>fallback.push(b),()=>{},'en',async()=>{throw Error('OCR unavailable');});assert.equal(fallback[0].suggestedExpiresOn,'');
});
