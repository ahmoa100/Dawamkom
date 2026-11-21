import {rolePermissionKeys} from '../public/role-permissions.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash,scryptSync} from 'node:crypto';
async function fixture(run,configure){
 const root=path.resolve(import.meta.dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dawamkom-approved-ux-'));
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.mjs')))fs.copyFileSync(path.join(root,f),path.join(dir,f));fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
 const id='11111111-1111-4111-8111-111111111111',tokens={owner:'a'.repeat(64),s:'b'.repeat(64),m:'c'.repeat(64),hr:'d'.repeat(64),other:'e'.repeat(64)},hash=v=>createHash('sha256').update(v).digest('hex');
 const account=t=>({salt:'fictional-test',passwordHash:scryptSync('FixtureOnly123!','fictional-test',64).toString('hex'),browser:hash(t),sessionHash:hash(t),sessionExpires:Date.now()+3600000,employeeSessionExpires:Date.now()+3600000});
 const person=(key,role,branchId='a')=>({id:key,name:key,email:key+'@example.com',status:'Active',role,branchId,managerId:'m',account:account(tokens[key]),nationality:'EG',residencyExpiryDate:'2026-12-01',joinDate:'2025-01-01',annualLeaveDays:21,periodIds:['day']});
 const today=new Date(Date.now()+10800000).toISOString().slice(0,10),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
 const workspace={company:'Fictional',staffRoles:['Employee','Manager','HR'],rolePermissions:{HR:{administrator:true,values:{requests:true,tasks:true}}},staff:[person('s','Employee'),person('m','Manager'),person('hr','HR'),person('other','HR','b')],locations:[{id:'a',name:'A'},{id:'b',name:'B'}],requests:[],punches:[{staffId:'s',kind:'in',date:yesterday,time:yesterday+'T09:00:00+03:00',site:'Fixture site',device:'iPhone'},{staffId:'s',kind:'out',date:yesterday,time:yesterday+'T17:00:00+03:00',site:'Fixture site',device:'iPhone'}],workPeriods:[{id:'day',name:'Day',kind:'fixed',start:'09:00',end:'17:00'}],workSchedule:{days:[0,1,2,3,4,5,6]},workAssignments:[],leaveTypes:['Annual leave'],leaveSettings:{'Annual leave':{maxDays:30,active:true}},followUpAssignments:[{itemId:'residence:s:2026-12-01',assigneeId:'m',status:'new',dueOn:'2026-11-28',version:1}],approvalChains:{'Device change':['role:HR','role:Manager']}};
 configure?.(workspace,{today,yesterday});
 const file=path.join(dir,'.dawamkom-partners.json');fs.writeFileSync(file,JSON.stringify({partners:[{id,name:'Fictional',email:'owner@example.com',account:account(tokens.owner),workspace}],profile:{name:'Fictional'},demoCompanyStatus:'deleted'}));
 const env={...process.env,PORT:'0',DAWAMAK_HOST:'127.0.0.1',DAWAMAK_RUNTIME_MODE:'live'};for(const key of Object.keys(env))if(/AWS|STORAGE|SES|MAIL|OAUTH|GOOGLE|VAPID|PUSH|BOOTSTRAP|SAMPLE/.test(key)||key==='DAWAMAK_PORT')delete env[key];
 const child=spawn(process.execPath,['server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
 try{
 const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),15000);child.stdout.on('data',v=>{const m=String(v).match(/port (\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.on('exit',c=>reject(Error('exit '+c)));});
 const base=`http://127.0.0.1:${port}/company/${id}`,cookie=who=>who==='owner'?`dawamkom_company=${tokens.owner}`:`dawamkom_employee=${tokens[who]}; dawamkom_employee_session=${tokens[who]}`;
 const call=async(route,who,body,customCookie)=>{const response=await fetch(base+route,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json',Cookie:customCookie??(who?cookie(who):'')}});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};};
 await run({call,read:()=>JSON.parse(fs.readFileSync(file)).partners[0].workspace,edit:fn=>{const state=JSON.parse(fs.readFileSync(file));fn(state.partners[0].workspace);fs.writeFileSync(file,JSON.stringify(state));},hash,tokens,today,yesterday,base});
 }finally{child.kill();await new Promise(resolve=>child.once('close',resolve));assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.match(path.basename(dir),/^dawamkom-approved-ux-/);fs.rmSync(dir,{recursive:true,force:true});}
}
test('HTTP genuine browser change follows configured role stages, binds only after final approval and never enters employee request types',async()=>fixture(async({call,read,hash,tokens})=>{
 const config=await call('/api/approval-chains','owner',{type:'Device change',steps:['role:HR','role:Manager']});assert.equal(config.status,200,JSON.stringify(config.data));
 const own=await call('/api/employee/session','s');assert.ok(!own.data.attendanceTypes.includes('Device change'));assert.ok(!own.data.leaveTypes.includes('Device change'));
 assert.equal((await call('/api/employee/requests','s',{type:'Device change',date:own.data.today,note:'Not manual'})).status,400);
 const discovery=await call('/api/employee/login',null,{email:'s@example.com',password:'FixtureOnly123!'});assert.equal(discovery.status,403);assert.equal(discovery.data.changeRequired,true);
 const started=await call('/api/employee/login',null,{email:'s@example.com',password:'FixtureOnly123!',requestChange:true});assert.equal(started.status,202,JSON.stringify(started.data));
 const pending=read().staff.find(p=>p.id==='s').account,requestId=pending.requestedAt,candidate=pending.pendingBrowser;assert.notEqual(candidate,hash(tokens.s));assert.equal(pending.browser,hash(tokens.s));assert.deepEqual(pending.pendingApprovalSteps,['role:HR','role:Manager']);
 assert.equal((await call('/api/employee/session','hr')).data.deviceRequests.length,1);assert.equal((await call('/api/employee/session','m')).data.deviceRequests.length,0);assert.equal((await call('/api/employee/session','other')).data.deviceRequests.length,0);
 const decision={staffId:'s',requestId,decision:'approve'};assert.equal((await call('/api/employee/device-approval','m',decision)).status,403);assert.equal((await call('/api/employee/device-approval','other',decision)).status,403);
 const first=await call('/api/employee/device-approval','hr',decision);assert.equal(first.status,200);assert.equal(first.data.forwarded,true);assert.equal(read().staff.find(p=>p.id==='s').account.browser,hash(tokens.s));assert.equal((await call('/api/employee/device-approval','hr',decision)).status,403);
 assert.equal((await call('/api/employee/session','m')).data.deviceRequests.length,1);
 const final=await call('/api/employee/device-approval','m',decision);assert.equal(final.status,200,JSON.stringify(final.data));const saved=read().staff.find(p=>p.id==='s').account;assert.equal(saved.browser,candidate);assert.equal(saved.pendingBrowser,undefined);assert.equal(saved.pendingApprovalSteps,undefined);assert.equal(read().browserRequestHistory.at(-1).approvalHistory.length,2);assert.equal((await call('/api/employee/device-approval','m',decision)).status,400);
}));
test('HTTP scoped team totals, truthful daily hours and mobile follow-up reassignment/receipt/close share permission checks',async()=>fixture(async({call,read,yesterday})=>{
 const summary=(await call('/api/employee/session','m')).data.teamSummary;assert.equal(summary.staff,3);
 const calendar=await call('/api/employee/calendar?month='+yesterday.slice(0,7),'s'),day=calendar.data.days.find(d=>d.date===yesterday);assert.equal(day.workedMinutes,480);assert.equal(day.punches[0].site,'Fixture site');assert.equal(day.punches[0].device,'iPhone');
 const itemId='residence:s:2026-12-01';assert.equal((await call('/api/employee/follow-up/options?itemId='+encodeURIComponent(itemId),'s')).status,403);
 const options=await call('/api/employee/follow-up/options?itemId='+encodeURIComponent(itemId),'m');assert.equal(options.status,200);assert.deepEqual(options.data.assignees.map(p=>p.id).sort(),['hr','m']);assert.ok(options.data.assignees.every(p=>!('email' in p)&&!('account' in p)));
 assert.equal((await call('/api/employee/follow-up/receive','hr',{itemId,expectedVersion:1})).status,400);
 const cross=await call('/api/employee/follow-up/update','m',{itemId,expectedVersion:1,assigneeId:'other',status:'new'});assert.equal(cross.status,400);assert.equal(read().followUpAssignments[0].version,1);
 const reassigned=await call('/api/employee/follow-up/update','m',{itemId,expectedVersion:1,assigneeId:'hr',status:'new'});assert.equal(reassigned.status,200);assert.equal((await call('/api/employee/follow-up/receive','m',{itemId,expectedVersion:2})).status,400);
 const values=Object.fromEntries(rolePermissionKeys.map(k=>[k,k==='requests']));
 assert.equal((await call('/api/role-permissions','owner',{role:'HR',expectedVersion:0,values,administrator:true})).status,200);
 const denied=await call('/api/employee/follow-up/receive','hr',{itemId,expectedVersion:2});assert.equal(denied.status,400);assert.match(denied.data.error,/permission/);assert.equal((await call('/api/employee/follow-up/options?itemId='+encodeURIComponent(itemId),'hr')).status,403);assert.equal(read().followUpAssignments[0].status,'new');
 values.tasks=true;assert.equal((await call('/api/role-permissions','owner',{role:'HR',expectedVersion:1,values,administrator:true})).status,200);
 assert.equal((await call('/api/employee/follow-up/receive','hr',{itemId,expectedVersion:2})).status,200);assert.equal(read().followUpAssignments[0].status,'in-progress');
 const version=read().followUpAssignments[0].version;
 const closed=await call('/api/employee/follow-up/update','hr',{itemId,expectedVersion:version,assigneeId:'hr',status:'completed'});assert.equal(closed.status,200,JSON.stringify(closed.data));assert.equal(read().followUpAssignments[0].status,'completed');
 assert.equal((await call('/api/employee/follow-up/options?itemId='+encodeURIComponent(itemId),'hr')).status,404);
}));

test('HTTP calendar distinguishes missing punches without fabricating attendance',async()=>{
 for(const kind of ['in','out',null]) await fixture(async({call,read,yesterday})=>{
  const day=(await call('/api/employee/calendar?month='+yesterday.slice(0,7),'s')).data.days.find(d=>d.date===yesterday);
  assert.deepEqual(day.missingPunchKinds,kind?[kind==='in'?'out':'in']:[]);
  assert.equal(day.punches.length,kind?1:0);assert.equal(read().punches.length,kind?1:0);
 },w=>{w.punches=w.punches.filter(p=>p.kind===kind);});
 await fixture(async({call,today})=>{const day=(await call('/api/employee/calendar?month='+today.slice(0,7),'s')).data.days.find(d=>d.date===today);assert.deepEqual(day.missingPunchKinds,[]);},(w,{today})=>{w.workPeriods[0].start='23:00';w.workPeriods[0].end='23:59';w.punches=[{staffId:'s',kind:'in',date:today,time:today+'T23:00:00+03:00'}];});
});

test('HTTP fresh follow-up choices include authorized cross-branch administrators without exposing their employee profiles',async()=>fixture(async({call})=>{
 const state=(await call('/api/state','m')).data;assert.ok(!state.staff.some(p=>p.id==='hr'));assert.ok(!state.staff.some(p=>p.id==='gm'));assert.ok(state.followUpAssigneeChoices.some(p=>p.id==='hr'));assert.ok(state.followUpAssigneeChoices.some(p=>p.id==='gm'));assert.ok(state.followUpAssigneeChoices.every(p=>!('email' in p)&&!('salary' in p)&&!('account' in p)));
 const body={items:[{itemId:'residence:s:2026-12-01',expectedVersion:1}]};
 assert.ok([401,403].includes((await call('/api/follow-up/choices','s',body)).status));
 const options=await call('/api/follow-up/choices','m',body);assert.equal(options.status,200,JSON.stringify(options.data));assert.deepEqual(options.data.assignees.map(p=>p.id).sort(),['gm','hr','m']);assert.ok(options.data.assignees.every(p=>Object.keys(p).every(k=>['id','name','nameEn','role'].includes(k))));
 assert.equal((await call('/api/follow-up/choices','m',{items:[{itemId:'residence:other:2026-12-01',expectedVersion:0}]})).status,404);
 assert.equal((await call('/api/follow-up/choices','m',{items:[{...body.items[0],expectedVersion:99}]})).status,409);
 const bulk=await call('/api/follow-up/choices','owner',{items:[...body.items,{itemId:'residence:other:2026-12-01',expectedVersion:0}]});assert.deepEqual(bulk.data.assignees.map(p=>p.id),['hr']);
 const values=Object.fromEntries(rolePermissionKeys.map(k=>[k,false]));assert.equal((await call('/api/role-permissions','owner',{role:'General Manager',expectedVersion:0,values})).status,200);
 const fresh=await call('/api/follow-up/choices','m',body);assert.ok(!fresh.data.assignees.some(p=>p.id==='gm'));
},w=>{w.staff.find(p=>p.id==='hr').branchId='b';w.staff.find(p=>p.id==='hr').roleBranchIds={HR:['a','b']};w.staffRoles.push('General Manager');w.rolePermissions['General Manager']={values:{tasks:true}};w.staff.push({...w.staff.find(p=>p.id==='other'),id:'gm',name:'General manager fixture',role:'General Manager',roleBranchIds:{'General Manager':['a']},email:'gm@example.com'});}));
