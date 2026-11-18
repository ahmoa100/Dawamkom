import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

test('shift change validates configured shifts and applies only after final approval, to one date', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dawamkom-shift-change-'));
  for (const file of fs.readdirSync(root).filter(file => file.endsWith('.mjs')))
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  fs.cpSync(path.join(root, 'public'), path.join(dir, 'public'), {recursive:true});
  const id = '11111111-1111-4111-8111-111111111111';
  const tokens = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
  const today = new Date(Date.now()+10800000).toISOString().slice(0,10);
  const tomorrow = new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
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
    const request = {type:'Shift change',date:tomorrow,periodId:'new'};
    assert.equal((await call('requests',0,{...request,periodId:'unknown'})).status,400);
    assert.equal((await call('requests',0,{...request,date:yesterday})).status,400);
    assert.equal((await call('requests',0,request)).status,200);
    const submitted=(await call('session')).data.ownRequests[0];
    assert.equal(submitted.periodName,'Evening');
    const saved=()=>JSON.parse(fs.readFileSync(file,'utf8')).partners[0].workspace;
    assert.equal(saved().workAssignments.length,0);
    assert.equal((await call('team-decision',2,{id:submitted.id,status:'Approved'})).status,400);
    assert.equal((await call('team-decision',1,{id:submitted.id,status:'Approved'})).status,200);
    assert.equal(saved().requests[0].status,'Pending');
    assert.equal(saved().workAssignments.length,0);
    assert.equal((await call('session',2)).data.teamRequests[0].periodName,'Evening');
    assert.equal((await call('team-decision',2,{id:submitted.id,status:'Approved'})).status,200);
    assert.deepEqual(saved().workAssignments,[{staffId:'s0',date:tomorrow,periodId:'new'}]);
    assert.deepEqual(saved().staff[0].periodIds,['old']);
    assert.equal(saved().requests[0].status,'Approved');
    assert.equal((await call('team-decision',2,{id:submitted.id,status:'Approved'})).status,400);
    assert.equal((await call('requests',0,{...request,date:today})).status,200);
    const declined=(await call('session')).data.ownRequests[0];
    assert.equal((await call('team-decision',1,{id:declined.id,status:'Declined',rejectionNote:'No'})).status,200);
    assert.equal(saved().workAssignments.length,1);
  } finally {
    child.kill();
    await new Promise(resolve=>child.once('close',resolve));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
