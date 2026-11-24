import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
import {applyPunchCorrection} from '../public/punch-correction.js';
import {monthlyEmployeeSummary} from '../monthly-employee-mail.mjs';
for (const checkoutOnly of [false,true]) test(checkoutOnly ? 'HTTP checkout without arrival remains incomplete, rejects duplicates, and accepts later approved arrival correction' : 'HTTP session and punch endpoint agree after a missed prior-day checkout',async()=>{
 const root=path.resolve(import.meta.dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dawamkom-punch-session-'));
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.mjs')))fs.copyFileSync(path.join(root,f),path.join(dir,f));fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
 const now=Date.parse(checkoutOnly?'2026-11-21T15:30:00+03:00':'2026-11-21T08:00:00+03:00'),id='11111111-1111-4111-8111-111111111111',token='b'.repeat(64),hash=v=>createHash('sha256').update(v).digest('hex');
 const account={passwordHash:'fixture',sessionHash:hash(token),sessionExpires:now+3600000,browser:hash(token),employeeSessionExpires:now+3600000};
 const old={staffId:'s',kind:'in',date:'2026-11-19',time:'2026-11-19T07:54:00+03:00',shiftStart:Date.parse('2026-11-19T07:30:00+03:00')};
 const workspace={company:'Fictional',staffRoles:['Employee'],jobTitles:[],staff:[{id:'s',name:'Fictional',role:'Employee',status:'Active',account,periodIds:['day']}],locations:[],requests:[],punches:[old],workSchedule:{days:[0,1,2,3,4,5,6]},workPeriods:[{id:'day',name:'Day',kind:'fixed',start:'07:30',end:'15:30'}],workAssignments:[],leaveTypes:[],punchFromAnywhere:true};
 fs.writeFileSync(path.join(dir,'.dawamkom-partners.json'),JSON.stringify({partners:[{id,name:'Fictional',email:'owner@example.com',workspace}],profile:{name:'Fictional'},demoCompanyStatus:'deleted'}));
 const clock=path.join(dir,'fixture-clock.mjs');fs.writeFileSync(clock,`const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[${now}]));}static now(){return ${now};}};`);
 const env={...process.env,PORT:'0',DAWAMAK_HOST:'127.0.0.1',DAWAMAK_RUNTIME_MODE:'live'};for(const k of Object.keys(env))if(/AWS|STORAGE|SES|MAIL|OAUTH|GOOGLE|VAPID|PUSH|BOOTSTRAP|SAMPLE/.test(k)||k==='DAWAMAK_PORT')delete env[k];
 const child=spawn(process.execPath,['--import',pathToFileURL(clock).href,'server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
 try{
 const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),15000);child.stdout.on('data',v=>{const m=String(v).match(/port (\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.on('exit',c=>{clearTimeout(timer);reject(Error('Server exited '+c));});});
 const base=`http://127.0.0.1:${port}/company/${id}`,headers={Cookie:`dawamkom_employee=${token}; dawamkom_employee_session=${token}`};
 const session=await(await fetch(base+'/api/employee/session',{headers})).json();assert.equal(session.nextPunch,'in');assert.equal(session.punchedInAt,null);assert.equal(session.openShiftStart,null);
 const post=()=>fetch(base+'/api/employee/punch',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({kind:checkoutOnly?'out':'in'})});
 const response=await post();const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.saved,true);
 const repeat=await post();assert.equal(repeat.status,400);
 const rejection=await repeat.json();assert.equal(rejection.error,checkoutOnly?'You have already clocked out.':'You have already clocked in.');
 assert.equal(rejection.attemptRecorded,true);
 const updated=await(await fetch(base+'/api/employee/session',{headers})).json();assert.equal(updated.nextPunch,checkoutOnly?'in':'out');if(checkoutOnly)assert.equal(updated.punchedInAt,null);else assert.ok(updated.punchedInAt);
 const savedWorkspace=JSON.parse(fs.readFileSync(path.join(dir,'.dawamkom-partners.json'),'utf8')).partners[0].workspace;
 assert.equal(savedWorkspace.rejectedPunchAttempts.length,1);
 const attempt=savedWorkspace.rejectedPunchAttempts[0];
 assert.equal(attempt.staffId,'s');assert.equal(attempt.kind,checkoutOnly?'out':'in');
 assert.equal(attempt.time,new Date(now).toISOString());assert.equal(attempt.reason,rejection.error);
 const saved=savedWorkspace.punches;assert.equal(saved.length,2);assert.deepEqual(saved[0],old);assert.equal(saved[1].date,'2026-11-21');assert.equal(saved[1].kind,checkoutOnly?'out':'in');
 if(checkoutOnly){
   const person=savedWorkspace.staff[0],exit=structuredClone(saved[1]);
   const before=monthlyEmployeeSummary(savedWorkspace,person,'2026-11',now+7200000);assert.equal(before.workedMinutes,0);
   const correction=await fetch(base+'/api/employee/requests',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({type:'Missed punch',date:'2026-11-21',correctionReason:'Other',note:'Forgot arrival',proposedIn:'07:30'})});
   assert.equal(correction.status,200,JSON.stringify(await correction.json()));
   const pending=JSON.parse(fs.readFileSync(path.join(dir,'.dawamkom-partners.json'),'utf8')).partners[0].workspace;
   assert.equal(pending.requests[0].status,'Pending');assert.equal(pending.punches.length,2);
   applyPunchCorrection(savedWorkspace,person,{id:'approved-fixture',date:'2026-11-21',proposedIn:'07:30'},now+7200000);
   assert.deepEqual(savedWorkspace.punches.find(p=>p.date==='2026-11-21'&&p.kind==='out'),exit);
   assert.equal(monthlyEmployeeSummary(savedWorkspace,person,'2026-11',now+7200000).workedMinutes,480);
 }
 }finally{child.kill();await new Promise(resolve=>child.once('close',resolve));assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('dawamkom-punch-session-'));fs.rmSync(dir,{recursive:true,force:true});}
});
