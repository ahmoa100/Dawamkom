import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('follow-up assignment filters separate assigned tasks and mark pending unassigned tasks',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const code=src.slice(src.indexOf("let followUpFilter='all'"),src.indexOf('function openFollowUp('));
 const items=[{id:'one',name:'Needs owner',kind:'staff',status:'new'},{id:'two',name:'Assigned task',kind:'staff',status:'new',assignment:{assigneeId:'admin'}}];
 const context={language:'en',state:{today:'2026-11-21',locations:[],staff:[{id:'admin',name:'Administrator',status:'Active'}]},followUpItems:()=>items,isAdministrator:()=>true,staffName:p=>p.name,esc:s=>String(s??''),title:(a,b)=>a+b,card:(a,b)=>a+b};
 vm.createContext(context);vm.runInContext(code,context);
 const render=filter=>vm.runInContext(`followUpKind='${filter}';followup()`,context);
 const all=render('all');assert.match(all,/Pending assignment/);assert.match(all,/>Assigned<\/option>/);assert.match(all,/>Unassigned<\/option>/);
 assert.match(render('assigned'),/Assigned task/);assert.doesNotMatch(render('assigned'),/Needs owner|Pending assignment/);
 vm.runInContext("followUpAssignee='admin';",context);assert.doesNotMatch(render('all'),/Needs owner/);assert.match(render('all'),/Assigned task/);vm.runInContext("followUpAssignee='all';",context);
 assert.match(render('unassigned'),/Needs owner/);assert.doesNotMatch(render('unassigned'),/Assigned task/);
});
