import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

test('role chain can be saved and any scoped holder advances exactly one stage, preserving legacy chains',async()=>{
 const root=path.resolve(import.meta.dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dawamkom-role-chain-'));
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.mjs')))fs.copyFileSync(path.join(root,f),path.join(dir,f));
 fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
 const id='11111111-1111-4111-8111-111111111111',actors=['e','hr1','hr2','other','manager'],tokens=actors.map((_,i)=>String(i+1).repeat(64)),owner='f'.repeat(64),hash=t=>createHash('sha256').update(t).digest('hex');
 const tomorrow=new Date(Date.now()+10800000+86400000).toISOString().slice(0,10);
 const staff=actors.map((id,i)=>({id,name:id,email:id+'@example.com',role:i===0?'Employee':i===4?'Manager':'HR',branchId:i===3?'b':'a',status:'Active',account:{browser:hash(tokens[i]),managerSessions:[hash(tokens[i])]},periodIds:['old']}));
 const w={company:'Fictional',slug:id,staff,staffRoles:['Employee','HR','Manager'],jobTitles:[],rolePermissions:{HR:{values:{requests:true}}},locations:[{id:'a',name:'A'},{id:'b',name:'B'}],workSchedule:{days:[0,1,2,3,4,5,6]},workPeriods:[{id:'old',name:'Old',start:'09:00',end:'17:00'},{id:'new',name:'New',start:'10:00',end:'18:00'}],workAssignments:[],requests:[],punches:[],leaveTypes:[],approvalChains:{'Missed punch':['hr1']}};
 const file=path.join(dir,'.dawamkom-partners.json');
 fs.writeFileSync(file,JSON.stringify({partners:[{id,name:'Fictional',email:'owner@example.com',account:{passwordHash:'test-only',sessionHash:hash(owner),sessionExpires:Date.now()+3600000},workspace:w}],profile:{name:'QA'},demoCompanyStatus:'deleted'}));
 const env={...process.env,PORT:'0',DAWAMAK_HOST:'127.0.0.1',DAWAMAK_RUNTIME_MODE:'live'};
 for(const k of Object.keys(env))if(/AWS|STORAGE|SES|MAIL|OAUTH|GOOGLE|VAPID|PUSH|BOOTSTRAP|SAMPLE/.test(k)||k==='DAWAMAK_PORT')delete env[k];
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Timeout')),15000);child.stdout.on('data',v=>{const m=String(v).match(/port (\d+)/);if(m){clearTimeout(t);resolve(m[1]);}});child.on('exit',c=>{clearTimeout(t);reject(Error('Exit '+c));});});
  const base='http://127.0.0.1:'+port+'/company/'+id;
  const call=async(route,actor,body)=>{const token=tokens[actors.indexOf(actor)],r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:actor==='owner'?'dawamkom_company='+owner:'dawamkom_employee='+token+'; dawamkom_employee_session='+token},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
  assert.equal((await call('approval-chains','owner',{type:'Shift change',steps:['role:HR','role:Manager']})).status,200);
  assert.equal((await call('approval-chains','owner',{type:'Shift change',steps:['role:Employee']})).status,400);
  assert.equal((await call('employee/requests','e',{type:'Shift change',date:tomorrow,end:tomorrow,periodId:'new'})).status,200);
  const snapshot=()=>JSON.parse(fs.readFileSync(file)).partners[0].workspace;
  const request=snapshot().requests.at(-1),decision={id:request.id,status:'Approved'};
  assert.deepEqual(request.approvalSteps,['role:HR','role:Manager']);
  assert.deepEqual(snapshot().approvalChains['Missed punch'],['hr1']);
  for(const actor of ['hr1','hr2'])assert.ok((await call('employee/session',actor)).data.teamRequests.some(r=>r.id===request.id));
  assert.ok(!(await call('employee/session','other')).data.teamRequests.some(r=>r.id===request.id));
  assert.notEqual((await call('employee/team-decision','other',decision)).status,200);
  assert.equal((await call('employee/team-decision','hr2',decision)).status,200);
  assert.equal(snapshot().requests.at(-1).approvalIndex,1);
  assert.notEqual((await call('employee/team-decision','hr1',decision)).status,200);
  const progress=(await call('employee/session','e')).data.homeRequests.find(r=>r.id===request.id);
  assert.equal(progress.approvalSteps[0].name,'HR');assert.equal(progress.approvalSteps[0].status,'Approved');assert.ok(progress.approvalSteps[0].at);
  assert.equal((await call('employee/team-decision','manager',decision)).status,200);
  assert.equal(snapshot().requests.at(-1).status,'Approved');
  assert.equal(snapshot().requests.at(-1).approvalHistory[0].approverId,'hr2');
  assert.notEqual((await call('employee/team-decision','hr2',decision)).status,200);
 }finally{child.kill();await new Promise(r=>child.once('close',r));assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('dawamkom-role-chain-'));fs.rmSync(dir,{recursive:true,force:true});}
});
