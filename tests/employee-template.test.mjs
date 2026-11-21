import test from 'node:test';
import assert from 'node:assert/strict';
import {employeeTemplate} from '../public/employee-template.js';
import {importFields,guessColumns,mappedEmployee} from '../public/employee-import.js';
test('template headers map in both languages and preserves text identifiers',async()=>{
 for(const lang of ['ar','en']){
 const headers=importFields.map(f=>f[lang==='ar'?1:2]);const map=guessColumns(headers);
 importFields.forEach(([key],i)=>assert.equal(map[key],i,key));
 const values={nameAr:'موظف تجريبي',identityNumber:'0012345678',phone:'0501234567',joinDate:'19/11/2025',currentLeaveBalance:'-2.5',contractTerm:'مخصص',contractMonths:'18',managerId:'manager@example.com'};
 const state={locations:[],jobTitles:[],staff:[{id:'m1',role:'Manager',email:'manager@example.com'}]};
 const employee=mappedEmployee(importFields.map(([key])=>values[key]??''),map,state);
 assert.equal(employee.phone,'0501234567');assert.equal(employee.identityNumber,'0012345678');assert.equal(employee.currentLeaveBalance,'-2.5');assert.equal(employee.joinDate,'2025-11-19');assert.equal(employee.contractTerm,'Custom');assert.equal(employee.managerId,'m1');
 const blob=employeeTemplate(importFields,state,lang);const bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);assert.ok(blob.size<2*1024*1024);
 }
});
