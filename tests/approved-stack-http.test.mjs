import {canReviewBrowserRequest} from '../public/browser-approval.js';
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

test('HTTP calendar recalculates legacy flexible punches against the effective period without editing records',async()=>{
 for(const scenario of ['complete','short','missing'])await fixture(async({call,read,yesterday})=>{
  const before=JSON.stringify(read().punches);
  const day=(await call('/api/employee/calendar?month='+yesterday.slice(0,7),'s')).data.days.find(d=>d.date===yesterday);
  assert.equal(day.status,scenario==='complete'?'complete':'issue');
  assert.equal(day.workedMinutes,scenario==='complete'?480:scenario==='short'?420:0);
  assert.deepEqual(day.missingPunchKinds,scenario==='missing'?['out']:[]);
  assert.equal(JSON.stringify(read().punches),before);
 },(w,{yesterday})=>{
  Object.assign(w.workPeriods[0],{kind:'flexible',start:'09:00',end:'22:00',duration:480});
  w.punches=['in',...(scenario==='missing'?[]:['out'])].map((kind,i)=>({staffId:'s',date:yesterday,kind,time:yesterday+'T'+(i?(scenario==='short'?'16:08':'17:08'):'09:08')+':00+03:00',shiftStart:Date.parse(yesterday+'T09:00:00+03:00'),flexible:false,device:'Unchanged legacy device'}));
 });
});

test('HTTP retroactive shift approval refreshes calendar color only after final approval and preserves raw punches',async()=>{
 for(const kind of ['fixed','flexible'])await fixture(async({call,read,yesterday})=>{
  const calendar=async()=>(await call('/api/employee/calendar?month='+yesterday.slice(0,7),'s')).data.days.find(d=>d.date===yesterday);
  const originals=read().punches.map(({kind,time,device})=>({kind,time,device}));
  assert.equal((await calendar()).status,'issue');
  const sent=await call('/api/employee/requests','s',{type:'Shift change',date:yesterday,end:yesterday,periodId:'replacement'});assert.equal(sent.status,200,JSON.stringify(sent.data));
  const request=(await call('/api/employee/session','s')).data.ownRequests.find(r=>r.type==='Shift change');
  assert.equal((await calendar()).status,'issue');
  assert.equal((await call('/api/employee/team-decision','m',{id:request.id,status:'Approved'})).status,200);
  assert.equal((await calendar()).status,'issue');
  assert.equal((await call('/api/employee/team-decision','hr',{id:request.id,status:'Approved'})).status,200);
  const day=await calendar();assert.equal(day.status,'complete');assert.equal(day.workedMinutes,480);assert.deepEqual(day.missingPunchKinds,[]);
  assert.deepEqual(read().punches.map(({kind,time,device})=>({kind,time,device})),originals);
 },(w,{yesterday})=>{
  Object.assign(w.workPeriods[0],{kind:'flexible',start:'09:00',end:'22:00',duration:540});
  w.workPeriods.push({id:'replacement',name:'Replacement',kind,start:kind==='fixed'?'10:00':'09:00',end:kind==='fixed'?'18:00':'22:00',duration:480});
  w.approvalChains['Shift change']=['m','hr'];
  w.punches=['in','out'].map((kind,i)=>({staffId:'s',date:yesterday,kind,time:yesterday+'T'+(i?'18:00':'10:00')+':00+03:00',shiftStart:Date.parse(yesterday+'T09:00:00+03:00'),flexible:true,device:'Original'}));
 });
});

test('HTTP administrators without an assigned direct manager auto-approve validated requests and keep system audit and loan effects',async()=>fixture(async({call,read,today,yesterday})=>{
 const send=async(body)=>{const r=await call('/api/employee/requests','hr',body);assert.equal(r.status,200,JSON.stringify(r.data));return read().requests.at(-1);};
 const leave=await send({type:'Annual leave',date:today,end:today,note:'Documentation'});assert.equal(leave.status,'Approved');assert.equal(leave.decidedBy,'system');assert.equal(leave.autoApproved,true);assert.equal(leave.approvalHistory[0].approverId,'system');
 const loan=await send({type:'Loan request',date:today,note:'Documentation',loanAmount:1000,repaymentInstallments:2});assert.equal(loan.status,'Approved');assert.equal(read().loanSchedules.find(s=>s.requestId===loan.id).amount,1000);
 const shift=await send({type:'Shift change',date:yesterday,end:yesterday,periodId:'day'});assert.equal(shift.status,'Approved');assert.ok(read().workAssignments.some(a=>a.staffId==='hr'&&a.date===yesterday));
 const corrected=await send({type:'Missed punch',date:yesterday,correctionReason:'Forgot to punch',proposedIn:'09:00',proposedOut:'17:00'});assert.equal(corrected.status,'Approved');assert.equal(read().punches.filter(p=>p.staffId==='hr').length,2);
 const before=JSON.stringify(read());assert.equal((await call('/api/employee/requests','hr',{type:'Loan request',date:today,note:'Invalid',loanAmount:-1,repaymentInstallments:2})).status,400);assert.equal(JSON.stringify(read()),before);
 const own=(await call('/api/employee/session','hr')).data.ownRequests;assert.ok(own.every(r=>r.autoApproved));
 const ordinary=await call('/api/employee/requests','s',{type:'Loan request',date:today,note:'Still reviewed',loanAmount:100,repaymentInstallments:1,autoApproved:true,decidedBy:'system'});assert.equal(ordinary.status,200);assert.equal(read().requests.at(-1).status,'Pending');assert.equal(read().requests.at(-1).autoApproved,undefined);
 const manager=await call('/api/employee/requests','m',{type:'Loan request',date:today,note:'Has direct manager',loanAmount:100,repaymentInstallments:1});assert.equal(manager.status,400);assert.match(manager.data.error,/approver/i);
},w=>{w.staff.find(p=>p.id==='hr').managerId=null;w.staff.find(p=>p.id==='s').managerId=null;w.staff.find(p=>p.id==='m').managerId='hr';w.rolePermissions.HR.values.requests=false;w.approvalChains['Loan request']=['role:Manager'];w.approvalChains['Annual leave']=['direct-manager'];}));

test('HTTP documented administrator browser change requires password and explicit request, audits automatic approval and revokes prior binding',async()=>fixture(async({call,read,tokens,hash})=>{
 const before=JSON.stringify(read());assert.equal((await call('/api/employee/login',null,{email:'hr@example.com',password:'Wrong123!',requestChange:true})).status,401);assert.equal(JSON.stringify(read()),before);
 const challenge=await call('/api/employee/login',null,{email:'hr@example.com',password:'FixtureOnly123!'});assert.equal(challenge.status,403);assert.equal(challenge.data.changeRequired,true);assert.equal(JSON.stringify(read()),before);
 const approved=await call('/api/employee/login',null,{email:'hr@example.com',password:'FixtureOnly123!',requestChange:true});assert.equal(approved.status,200);assert.equal(approved.data.approved,true);assert.equal(approved.data.autoApproved,true);
 const w=read(),account=w.staff.find(p=>p.id==='hr').account;assert.notEqual(account.browser,hash(tokens.hr));assert.equal(account.pendingBrowser,undefined);assert.equal(account.managerSessions,undefined);assert.equal(w.browserRequestHistory.at(-1).approverId,'system');assert.equal(w.browserRequestHistory.at(-1).status,'Approved');
 assert.equal((await call('/api/employee/session','hr')).status,401);
 const ordinary=await call('/api/employee/login',null,{email:'s@example.com',password:'FixtureOnly123!',requestChange:true});assert.notEqual(ordinary.status,200);
},w=>{w.staff.find(p=>p.id==='hr').managerId=null;w.staff.find(p=>p.id==='s').managerId=null;w.rolePermissions.HR.values.anyBrowser=false;w.approvalChains['Device change']=['direct-manager'];}));

test('HTTP document wallet is explicitly granted, covers company files, and revocation blocks metadata, download and mutation immediately',async()=>fixture(async({call,read,base,tokens})=>{
 const walletLink=base+'/access?view=documents';
 const signedOut=await fetch(walletLink,{redirect:'manual'});
 assert.equal(signedOut.status,200);
 assert.match(await signedOut.text(),/id="company-auth"/);
 const upload={name:'Fictional permit.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.4\nFictional fixture').toString('base64'),expiresOn:'2027-12-31'};
 assert.equal((await call('/api/documents','m',upload)).status,403);assert.equal((await call('/api/state','m')).data.documents.length,0);
 const values=Object.fromEntries(rolePermissionKeys.map(k=>[k,['documents','tasks','requests'].includes(k)]));
 assert.equal((await call('/api/role-permissions','owner',{role:'HR',expectedVersion:0,values,administrator:true})).status,200);
 const openWallet=await fetch(walletLink,{redirect:'manual',headers:{Cookie:`dawamkom_employee=${tokens.hr}; dawamkom_employee_session=${tokens.hr}`}});
 assert.equal(openWallet.status,303);
 assert.equal(new URL(openWallet.headers.get('location'),base).hash,'#documents');
 const created=await call('/api/documents','hr',upload);assert.equal(created.status,200,JSON.stringify(created.data));const doc=read().documents[0];
 const visible=(await call('/api/state','hr')).data;assert.equal(visible.documents[0].id,doc.id);assert.equal(visible.documents[0].data,undefined);assert.ok(!visible.staff.some(p=>p.id==='other'));
 const download=await fetch(base+'/api/documents?id='+doc.id,{headers:{Cookie:`dawamkom_employee=${tokens.hr}; dawamkom_employee_session=${tokens.hr}`}});assert.equal(download.status,200);assert.match(await download.text(),/^%PDF/);
 assert.equal((await call('/api/documents/expiry','hr',{id:doc.id,expiresOn:'2028-01-01'})).status,200);
 assert.equal((await call('/api/documents','hr',{...upload,replaceId:doc.id,name:'Renewed.pdf'})).status,200);
 values.documents=false;assert.equal((await call('/api/role-permissions','owner',{role:'HR',expectedVersion:1,values,administrator:true})).status,200);
 assert.equal((await call('/api/state','hr')).data.documents.length,0);assert.equal((await call('/api/documents?id='+doc.id,'hr')).status,404);assert.equal((await call('/api/documents/remove','hr',{id:doc.id})).status,403);
 values.documents=true;assert.equal((await call('/api/role-permissions','owner',{role:'HR',expectedVersion:2,values,administrator:true})).status,200);assert.equal((await call('/api/documents/remove','hr',{id:doc.id})).status,200);assert.equal(read().documents.length,0);
}));

test('HTTP bulk direct manager assignment validates every employee and changes only the selected manager fields',async()=>fixture(async({call,read})=>{
 const endpoint='/api/staff/assign-direct-manager',before=read().staff;
 assert.equal((await call(endpoint,'hr',{staffIds:['s'],managerId:'m'})).status,403);
 assert.equal((await call(endpoint,'m',{staffIds:['s','outside'],managerId:'m'})).status,403);
 assert.equal((await call(endpoint,'owner',{staffIds:['s','outside'],managerId:'m'})).status,400);
 assert.equal((await call(endpoint,'owner',{staffIds:['s','hr'],managerId:'m'})).status,400);
 assert.deepEqual(read().staff,before);
 const assigned=await call(endpoint,'m',{staffIds:['s','second'],managerId:'m'});
 assert.equal(assigned.status,200,JSON.stringify(assigned.data));
 assert.deepEqual(read().staff,before.map(person=>['s','second'].includes(person.id)?{...person,managerId:'m'}:person));
 assert.equal((await call(endpoint,'owner',{staffIds:['s'],managerId:'hr'})).status,400);
},workspace=>{
 const person=workspace.staff[0];
 person.managerId=null;
 workspace.staff.push({...person,id:'second',email:'second@example.com',account:undefined},
   {...person,id:'outside',email:'outside@example.com',branchId:'b',account:undefined});
}));

test('HTTP structure editor renames company and atomically assigns existing administrators per branch without changing roles or employees',async()=>fixture(async({call,read})=>{
 const before=structuredClone(read()),ids=w=>w.staff.filter(p=>p.status==='Active'&&['Manager','HR'].includes(p.role)&&(p.roleBranchIds?.[p.role]??[p.branchId]).includes('b')).map(p=>p.id).sort();
 const body={id:'b',name:'Renamed B',expectedName:'B',expectedAdministratorIds:ids(before),administratorIds:['m','hr','other']};
 assert.equal((await call('/api/organization/branch','m',body)).status,403);
 assert.equal((await call('/api/organization/branch','owner',{...body,administratorIds:['s']})).status,400);assert.deepEqual(read(),before);
 const saved=await call('/api/organization/branch','owner',body);assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.equal(read().locations.find(b=>b.id==='b').name,'Renamed B');assert.deepEqual(ids(read()),['hr','m','other']);
 for(const person of before.staff){const after=read().staff.find(p=>p.id===person.id);assert.equal(after.role,person.role);assert.equal(after.branchId,person.branchId);assert.deepEqual(after.account,person.account);}
 assert.deepEqual(read().staff.find(p=>p.id==='m').roleBranchIds.Manager,['a','b']);
 const snapshot=JSON.stringify(read());assert.equal((await call('/api/organization/branch','owner',body)).status,400);assert.equal(JSON.stringify(read()),snapshot);
 const rename={name:'New company display',expectedName:'Fictional'};assert.equal((await call('/api/organization/name','m',rename)).status,403);
 assert.equal((await call('/api/organization/name','owner',rename)).status,200);assert.equal(read().company,rename.name);assert.equal(read().organization.name,rename.name);assert.equal(read().organization.address,'Preserved address');assert.equal(read().organization.logo,'');
 assert.equal((await call('/api/organization/name','owner',rename)).status,400);
},w=>{w.organization={name:'Fictional',address:'Preserved address',logo:''};}));

 test('HTTP delegated permission distributor can configure branch administrators only in assigned branches, with minimal directory and immediate revocation',async()=>fixture(async({call,read})=>{
 const state=(await call('/api/state','m')).data;assert.equal(state.canManageRolePermissions,true);assert.deepEqual(state.branchAdministratorChoices.map(p=>p.id).sort(),['hr','m','other']);assert.ok(state.branchAdministratorChoices.every(p=>!('account' in p)&&!('email' in p)));assert.deepEqual(state.branchAdministratorChoices.find(p=>p.id==='other').roleBranchIds.HR,[]);
 const body={id:'a',name:'A',expectedName:'A',expectedAdministratorIds:['m','hr'],administratorIds:['m','hr','other']};
 assert.equal((await call('/api/organization/branch','m',{...body,id:'b',expectedName:'B',expectedAdministratorIds:['other']})).status,403);
 const saved=await call('/api/organization/branch','m',body);assert.equal(saved.status,200,JSON.stringify(saved.data));assert.deepEqual(read().staff.find(p=>p.id==='other').roleBranchIds.HR,['b','a']);assert.equal(read().locations[0].administratorHistory.at(-1).by,'m');
 assert.equal((await call('/api/organization/name','m',{name:'Changed',expectedName:'Fictional'})).status,403);
 assert.equal((await call('/api/role-permissions','owner',{role:'Manager',expectedVersion:0,values:Object.fromEntries(rolePermissionKeys.map(k=>[k,true])),managePermissions:false})).status,200);
 assert.equal((await call('/api/state','m')).data.branchAdministratorChoices,undefined);assert.equal((await call('/api/organization/branch','m',{...body,expectedAdministratorIds:['m','hr','other']})).status,403);
 },w=>{w.rolePermissions.Manager={managePermissions:true,administrator:true,values:{}};}));

test('HTTP schedule grant permits assigned branch rename, denies other branches and branch creation, and revokes immediately',async()=>fixture(async({call,read})=>{
 assert.equal((await call('/api/locations/branch','m',{id:'a',name:'Renamed A'})).status,200);assert.equal(read().locations[0].name,'Renamed A');
 assert.equal((await call('/api/locations/branch','m',{id:'b',name:'Wrong'})).status,403);assert.equal((await call('/api/locations/branch','m',{name:'New'})).status,403);
 const values=Object.fromEntries(rolePermissionKeys.map(k=>[k,false]));
 assert.equal((await call('/api/role-permissions','owner',{role:'Manager',expectedVersion:0,values})).status,200);
 assert.equal((await call('/api/locations/branch','m',{id:'a',name:'Wrong'})).status,403);assert.equal(read().locations[0].name,'Renamed A');
}));

test('HTTP employee permission roles have an assignment path with delegation, scope, stale checks and owner-only distribution membership',async()=>fixture(async({call,read})=>{
 const change={staffId:'s',permissionRole:'HR',expectedPermissionRole:'Employee'};
 assert.equal((await call('/api/staff/update','hr',change)).status,403);
 assert.equal((await call('/api/staff/update','m',{...change,staffId:'other',expectedPermissionRole:'HR'})).status,403);
 assert.equal((await call('/api/staff/update','m',change)).status,200);const person=read().staff.find(p=>p.id==='s');assert.equal(person.role,'HR');assert.deepEqual(person.roleBranchIds.HR,['a']);assert.equal(person.permissionRoleHistory.at(-1).by,'m');
 assert.equal((await call('/api/staff/update','m',change)).status,409);
 assert.equal((await call('/api/staff/update','m',{staffId:'s',permissionRole:'Manager',expectedPermissionRole:'HR'})).status,403);
 assert.equal((await call('/api/staff/update','m',{staffId:'m',permissionRole:'HR',expectedPermissionRole:'Manager'})).status,403);
 assert.equal((await call('/api/staff/update','owner',{staffId:'s',permissionRole:'Manager',expectedPermissionRole:'HR'})).status,200);assert.equal(read().staff.find(p=>p.id==='s').role,'Manager');
 assert.equal((await call('/api/staff/update','m',{staffId:'s',permissionRole:'Missing',expectedPermissionRole:'Manager'})).status,400);
 const added=await call('/api/staff','owner',{nameAr:'موظف تجريبي',nameEn:'Fictional hire',email:'new@example.com',phone:'0551112233',birthDate:'1990-01-01',gender:'Male',jobTitle:'Receptionist',nationality:'SA',identityNumber:'1234567890',branchId:'a',managerId:'',joinDate:'2025-01-01',contractTerm:'One year',contractType:'Annual',probation:90,annualLeave:21,salary:'4000',allowances:'0',periodIds:[],permissionRole:'HR'});
 assert.equal(added.status,200,JSON.stringify(added.data));assert.equal(read().staff.at(-1).role,'HR');assert.deepEqual(read().staff.at(-1).roleBranchIds.HR,['a']);
},w=>{w.jobTitles=['Receptionist'];w.rolePermissions.Manager={managePermissions:true,administrator:true,values:{staffEdit:true}};}));

test('HTTP browser requests expose every current role reviewer to desktop and mobile, and a second role holder advances one stage',async()=>fixture(async({call,read,hash,tokens})=>{
 const sent=await call('/api/employee/login',null,{email:'s@example.com',password:'FixtureOnly123!',requestChange:true});assert.equal(sent.status,202,JSON.stringify(sent.data));const requestId=read().staff.find(p=>p.id==='s').account.requestedAt;
 for(const who of ['hr','other']){const inbox=await call('/api/requests',who);assert.equal(inbox.status,200);const request=inbox.data.deviceRequests.find(r=>r.requestId===requestId);assert.ok(request);assert.deepEqual(request.approverIds,['hr','other']);assert.equal(canReviewBrowserRequest(request,inbox.data.deviceReviewerId,inbox.data.companyReviewer),true);const mobile=(await call('/api/employee/session',who)).data;assert.equal(mobile.deviceRequests[0].requestId,requestId);}
 assert.equal((await call('/api/requests','m')).data.deviceRequests.length,0);assert.equal((await call('/api/requests','s')).status,401);
 const step=await call('/api/employee/device-approval','other',{staffId:'s',requestId,decision:'approve'});assert.equal(step.status,200);assert.equal(step.data.forwarded,true);assert.equal(read().staff.find(p=>p.id==='s').account.browser,hash(tokens.s));
 assert.equal((await call('/api/requests','hr')).data.deviceRequests.length,0);const next=(await call('/api/requests','m')).data;assert.equal(next.deviceRequests.length,1);assert.equal(canReviewBrowserRequest(next.deviceRequests[0],next.deviceReviewerId),true);
 assert.equal((await call('/api/employee/device-approval','m',{staffId:'s',requestId,decision:'approve'})).status,200);assert.equal((await call('/api/requests','m')).data.deviceRequests.length,0);
 assert.equal(canReviewBrowserRequest({approverId:'legacy'},'legacy'),true);assert.equal(canReviewBrowserRequest({approverId:'legacy'},undefined),false);assert.equal(canReviewBrowserRequest({approverIds:[],approverId:'legacy'},'legacy'),false);
},w=>{w.staff.find(p=>p.id==='other').branchId='a';}));
