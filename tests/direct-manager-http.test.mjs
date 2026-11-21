import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

test('create/edit accept custom branch administrators; scoped directory reveals no other-branch HR data',async()=>{
 const root=path.resolve(import.meta.dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dawamkom-direct-manager-'));
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.mjs')))fs.copyFileSync(path.join(root,f),path.join(dir,f));
 fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
 const hash=t=>createHash('sha256').update(t).digest('hex'),owner='f'.repeat(64),manager='a'.repeat(64),id='11111111-1111-4111-8111-111111111111';
 const staff=[{id:'m',name:'Manager A',email:'m@example.com',role:'Manager',status:'Active',branchId:'a',account:{browser:hash(manager),managerSessions:[hash(manager)]}},
  {id:'hr',name:'HR both',email:'private@example.com',phone:'private-phone',salary:{monthlyBase:99999},role:'HR',status:'Active',branchId:'b',roleBranchIds:{HR:['a','b']}},
  {id:'wrong',name:'HR B',role:'HR',status:'Active',branchId:'b'},
  {id:'pending',name:'Pending HR',role:'HR',status:'Pending activation',branchId:'a'},
  {id:'e',name:'Staff A',role:'Employee',status:'Active',branchId:'a'}];
 const w={company:'Fictional',slug:id,staff,staffRoles:['Employee','Manager','HR'],rolePermissions:{HR:{administrator:true}},jobTitles:['Assistant'],locations:[{id:'a',name:'A'},{id:'b',name:'B'}],workSchedule:{days:[0,1,2,3,4,6]},workPeriods:[],workAssignments:[],requests:[],punches:[],leaveTypes:[]};
 const file=path.join(dir,'.dawamkom-partners.json');fs.writeFileSync(file,JSON.stringify({partners:[{id,name:'Fictional',email:'owner@example.com',account:{passwordHash:'test-only',sessionHash:hash(owner),sessionExpires:Date.now()+3600000},workspace:w}],profile:{name:'QA'},demoCompanyStatus:'deleted'}));
 const env={...process.env,PORT:'0',DAWAMAK_HOST:'127.0.0.1',DAWAMAK_RUNTIME_MODE:'preview',DAWAMAK_PUBLIC_ORIGIN:'https://example.test'};
 for(const k of Object.keys(env))if(/AWS|STORAGE|SES|MAIL|OAUTH|GOOGLE|VAPID|PUSH|BOOTSTRAP|SAMPLE/.test(k)||k==='DAWAMAK_PORT')delete env[k];
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Timeout')),15000);child.stdout.on('data',v=>{const m=String(v).match(/port (\d+)/);if(m){clearTimeout(t);resolve(m[1]);}});child.on('exit',c=>{clearTimeout(t);reject(Error('Exit '+c));});});
  const base='http://127.0.0.1:'+port+'/company/'+id;
  const call=async(route,who,body)=>{const r=await fetch(base+'/api/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:who==='owner'?'dawamkom_company='+owner:'dawamkom_employee='+manager+'; dawamkom_employee_session='+manager},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
  const scoped=await call('state','manager');assert.equal(scoped.status,200);
  assert.ok(!scoped.data.staff.some(p=>p.id==='hr'));
  const choice=scoped.data.directManagerChoices.find(p=>p.id==='hr');assert.ok(choice);assert.equal(choice.email,undefined);assert.equal(choice.salary,undefined);assert.equal(choice.phone,undefined);assert.deepEqual(choice.roleBranchIds.HR,['a']);
  assert.ok(!scoped.data.directManagerChoices.some(p=>['wrong','pending'].includes(p.id)));
  for(const who of ['owner','manager']){
   assert.equal((await call('staff/update',who,{staffId:'e',managerId:'hr'})).status,200);
   assert.notEqual((await call('staff/update',who,{staffId:'e',managerId:'wrong'})).status,200);
   assert.notEqual((await call('staff/update',who,{staffId:'e',managerId:'pending'})).status,200);
   assert.notEqual((await call('staff/update',who,{staffId:'m',managerId:'m'})).status,200);
  }
  assert.equal((await call('staff/update','owner',{staffId:'e',managerId:'m'})).status,200);
  assert.notEqual((await call('staff/update','owner',{staffId:'e',branchId:'b'})).status,200);
  assert.equal((await call('staff/update','owner',{staffId:'e',branchId:'',managerId:''})).status,200);
  const body={nameAr:'موظف تجريبي',nameEn:'Fictional employee',email:'new@example.com',phone:'0530000000',birthDate:'1990-01-01',gender:'Male',jobTitle:'Assistant',nationality:'SA',identityNumber:'1234567890',branchId:'a',managerId:'hr',joinDate:'2026-11-21',contractType:'Annual',contractTerm:'One year',probation:90,annualLeave:21,salary:'4000',allowances:'0',periodIds:[]};
  const added=await call('staff','manager',body);assert.equal(added.status,200,JSON.stringify(added.data));
  assert.equal(added.data.staff.find(p=>p.email===body.email).managerId,'hr');
 }finally{child.kill();await new Promise(r=>child.once('close',r));assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('dawamkom-direct-manager-'));fs.rmSync(dir,{recursive:true,force:true});}
});
