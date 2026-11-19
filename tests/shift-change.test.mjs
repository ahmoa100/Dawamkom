import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {reassignShiftPunches, periodBounds} from '../public/work-schedule.js';
import {monthlyEmployeeSummary} from '../monthly-employee-mail.mjs';

for (const flexible of [false, true]) test(`retroactive ${flexible ? 'flexible' : 'fixed'} shift preserves punches and corrects attendance totals`, () => {
  const day='2026-10-15', person={id:'s0',periodIds:['old'],joinDate:day};
  const old={id:'old',start:'09:00',end:'17:00'};
  const period={id:'new',start:flexible?'09:00':'10:00',end:flexible?'22:00':'18:00',
    ...(flexible?{kind:'flexible',duration:480}:{})};
  const punches=['in','out'].map((kind,i)=>({staffId:'s0',date:day,kind,
    time:`${day}T${i?'18':'10'}:00:00+03:00`,shiftStart:periodBounds(old,day).start,device:'original-device'}));
  const workspace={workPeriods:[old,period],workAssignments:[],workSchedule:{days:[0,1,2,3,4,5,6]},punches,requests:[]};
  const original=structuredClone(punches);
  assert.equal(monthlyEmployeeSummary(workspace,person,'2026-10').lateMinutes,60);
  reassignShiftPunches(workspace,person,[day],period,'approved-request');
  workspace.workAssignments.push({staffId:person.id,date:day,periodId:period.id});
  const result=monthlyEmployeeSummary(workspace,person,'2026-10');
  assert.equal(result.lateMinutes,0);
  assert.equal(result.workedMinutes,480);
  assert.equal(result.workedDays,1);
  assert.ok(!result.absentDates.includes(day));
  assert.ok(!result.incompleteDates.includes(day));
  punches.forEach((p,i)=>{
    assert.equal(p.time,original[i].time);
    assert.equal(p.device,original[i].device);
    assert.equal(p.shiftChanges[0].shiftStart,original[i].shiftStart);
  });
});

test('shift change validates configured shifts and applies only after final approval, to the inclusive date range', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dawamkom-shift-change-'));
  for (const file of fs.readdirSync(root).filter(file => file.endsWith('.mjs')))
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  fs.cpSync(path.join(root, 'public'), path.join(dir, 'public'), {recursive:true});
  const id = '11111111-1111-4111-8111-111111111111';
  const tokens = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
  const today = new Date(Date.now()+10800000).toISOString().slice(0,10);
  const tomorrow = new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
  const lastDay = new Date(Date.parse(today)+2*86400000).toISOString().slice(0,10);
  const yesterday = new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
  const staff = tokens.map((token,i) => ({id:'s'+i, name:'QA '+i, email:'qa'+i+'@example.com',
    role:i ? 'Manager':'Employee', branchId:'branch', managerId:'s1', status:'Active', periodIds:['old'],
    account:{browser:createHash('sha256').update(token).digest('hex'), managerSessions:[createHash('sha256').update(token).digest('hex')]}}));
  const workspace = {company:'Shift QA', slug:id, staff, locations:[{id:'branch',name:'QA'}],
    workSchedule:{days:[0,1,2,3,4,5,6]}, workPeriods:[
      {id:'old',name:'Morning',start:'09:00',end:'12:00'},
      {id:'new',name:'Evening',start:'17:00',end:'20:00'}],
    workAssignments:[], punches:[], requests:[], leaveTypes:[], staffRoles:['Employee','Manager'],
    approvalChains:{'Shift change':['s1','s2']}};
  const file = path.join(dir, '.dawamkom-partners.json');
  fs.writeFileSync(file, JSON.stringify({partners:[{id,name:'QA',email:'qa@example.com',
    account:{passwordHash:'test-only'},workspace}],profile:{name:'QA'},demoCompanyStatus:'active'}));
  const env = {...process.env, PORT:'0', DAWAMAK_HOST:'127.0.0.1'};
  for (const key of ['DAWAMAK_STORAGE_BUCKET','DAWAMAK_MAIL_WEBHOOK','DAWAMAK_SES_FROM', 'DAWAMAK_PORT']) delete env[key];
  const child = spawn(process.execPath,['server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
  try {
    const port = await new Promise((resolve,reject) => {
      const timeout=setTimeout(()=>reject(Error('Server timeout')),10000);
      child.stdout.on('data', chunk=>{const m=String(chunk).match(/port (\d+)/);if(m){clearTimeout(timeout);resolve(m[1]);}});
      child.on('exit',code=>{clearTimeout(timeout);reject(Error('Server exited '+code));});
    });
    const base = 'http://127.0.0.1:'+port+'/company/'+id+'/api/employee/';
    const call = async (route, actor=0, body) => {
      const response=await fetch(base+route,{method:body?'POST':'GET',headers:{
        Cookie:'dawamkom_employee='+tokens[actor]+'; dawamkom_employee_session='+tokens[actor], 'Content-Type':'application/json'},
        ...(body ? {body:JSON.stringify(body)} : {})});
      return {status:response.status,data:await response.json()};
    };
    const session=await call('session');
    assert.equal(session.status,200);
    assert.ok(session.data.attendanceTypes.includes('Shift change'));
    assert.deepEqual(session.data.availablePeriods.map(p=>p.id),['old','new']);
    const request = {type:'Shift change',date:tomorrow,end:lastDay,periodId:'new'};
    assert.equal((await call('requests',0,{...request,end:today})).status,400);
    assert.equal((await call('requests',0,{...request,end:''})).status,400);
    assert.equal((await call('requests',0,{...request,end:'2099-01-01'})).status,400);
    assert.equal((await call('requests',0,{...request,periodId:'unknown'})).status,400);
    assert.equal((await call('requests',0,{...request,date:yesterday})).status,200);
    assert.equal((await call('requests',0,request)).status,200);
    const submitted=(await call('session')).data.ownRequests[0];
    assert.equal(submitted.periodName,'Evening');
    assert.equal(submitted.end,lastDay);
    const saved=()=>JSON.parse(fs.readFileSync(file,'utf8')).partners[0].workspace;
    assert.equal(saved().workAssignments.length,0);
    assert.equal((await call('team-decision',2,{id:submitted.id,status:'Approved'})).status,400);
    assert.equal((await call('team-decision',1,{id:submitted.id,status:'Approved'})).status,200);
    assert.equal(saved().requests[0].status,'Pending');
    assert.equal(saved().workAssignments.length,0);
    assert.equal((await call('session',2)).data.teamRequests[0].periodName,'Evening');
    assert.equal((await call('team-decision',2,{id:submitted.id,status:'Approved'})).status,200);
    assert.deepEqual(saved().workAssignments,[{staffId:'s0',date:tomorrow,periodId:'new'}, {staffId:'s0',date:lastDay,periodId:'new'}]);
    assert.deepEqual(saved().staff[0].periodIds,['old']);
    assert.equal(saved().requests.find(item=>item.id===submitted.id).status,'Approved');
    assert.equal((await call('team-decision',2,{id:submitted.id,status:'Approved'})).status,400);
    assert.equal((await call('requests',0,{...request,date:today})).status,200);
    const declined=(await call('session')).data.ownRequests[0];
    assert.equal((await call('team-decision',1,{id:declined.id,status:'Declined',rejectionNote:'No'})).status,200);
    assert.equal(saved().workAssignments.length,2);
    const retro=(await call('session')).data.ownRequests.find(item=>item.date===yesterday && item.status==='Pending');
    assert.ok(retro);
    assert.equal((await call('team-decision',1,{id:retro.id,status:'Approved'})).status,200);
    assert.equal(saved().workAssignments.length,2);
    assert.equal((await call('team-decision',2,{id:retro.id,status:'Approved'})).status,200);
    assert.ok(saved().workAssignments.some(item=>item.date===yesterday && item.periodId==='new'));
  } finally {
    child.kill();
    await new Promise(resolve=>child.once('close',resolve));
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('dawamkom-shift-change-'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
