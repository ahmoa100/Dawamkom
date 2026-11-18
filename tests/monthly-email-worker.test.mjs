import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {previousReportMonth} from '../monthly-employee-mail.mjs';

test('monthly worker sends private individual emails, saves receipts and never resends after restart',async()=>{
  const root=path.resolve(import.meta.dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dawamkom-mail-test-'));
  for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.mjs'))) fs.copyFileSync(path.join(root,file),path.join(dir,file));
  fs.cpSync(path.join(root,'public'),path.join(dir,'public'),{recursive:true});
  const messages=[];
  const provider=http.createServer(async(req,res)=>{
    let body='';for await(const data of req)body+=data;
    messages.push(JSON.parse(body));res.end('{}');
  });
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const id='11111111-1111-4111-8111-111111111111',month=previousReportMonth(Date.now()),token='a'.repeat(64);
  const workspace={company:'QA',slug:id,staff:[{id:'s',name:'Staff QA',status:'Active',email:'staff@example.com',account:{}},
    {id:'m',name:'Manager QA',role:'Manager',status:'Active',email:'manager@example.com',account:{managerSessions:[createHash('sha256').update(token).digest('hex')]}}],
    workSchedule:{days:[]},workPeriods:[],workAssignments:[],punches:[],requests:[{id:'private',staffId:'s',type:'Attendance excuse',status:'Approved',
      date:month+'-01',submittedOn:month+'-01',note:'STAFF PRIVATE REQUEST'}],leaveTypes:[],locations:[]};
  const file=path.join(dir,'.dawamkom-partners.json');
  fs.writeFileSync(file,JSON.stringify({partners:[{id,name:'QA',account:{passwordHash:'test'},monthlyReportStartMonth:month,workspace}],profile:{name:'QA'},demoCompanyStatus:'active'}));
  const env={...process.env,PORT:'0',DAWAMAK_HOST:'127.0.0.1',DAWAMAK_PUBLIC_ORIGIN:'https://www.dawamkom.net',
    DAWAMAK_MAIL_WEBHOOK:'http://127.0.0.1:'+provider.address().port};
  for(const key of ['DAWAMAK_SES_FROM','DAWAMAK_STORAGE_BUCKET','DAWAMAK_PORT'])delete env[key];
  let child;
  const start=()=>new Promise((resolve,reject)=>{
    child=spawn(process.execPath,['server.mjs'],{cwd:dir,env,stdio:['ignore','pipe','pipe']});
    const timeout=setTimeout(()=>reject(Error('Server startup timeout')),10000);
    child.stdout.on('data',data=>{const m=String(data).match(/port (\d+)/);if(m){clearTimeout(timeout);resolve(m[1]);}});
    child.once('exit',code=>{clearTimeout(timeout);reject(Error('Server exited '+code));});
  });
  const stop=()=>new Promise(resolve=>{child.once('close',resolve);child.kill();});
  try {
    const port=await start();
    const deadline=Date.now()+15000;
    let receipts;
    while(Date.now()<deadline){
      receipts=JSON.parse(fs.readFileSync(file,'utf8')).partners[0].workspace.staff.map(p=>p.account.monthlyReports?.[0]?.status);
      if(receipts.every(status=>status==='sent'))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.deepEqual(receipts,['sent','sent']);assert.equal(messages.length,2);
    const staff=messages.find(m=>m.to==='staff@example.com'),manager=messages.find(m=>m.to==='manager@example.com');
    assert.ok(staff.text.includes('STAFF PRIVATE REQUEST'));assert.equal(manager.text.includes('STAFF PRIVATE REQUEST'),false);
    const response=await fetch('http://127.0.0.1:'+port+'/company/'+id+'/api/state',{headers:{Cookie:'dawamkom_employee_session='+token}});
    const state=await response.json();assert.equal(response.status,200);
    assert.equal(state.staff.some(p=>p.account||p.monthlyReports),false);
    await stop();await start();
    await new Promise(resolve=>setTimeout(resolve,6500));
    assert.equal(messages.length,2);
  } finally {
    if(child && child.exitCode===null)await stop();
    await new Promise(resolve=>provider.close(resolve));
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('dawamkom-mail-test-'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
