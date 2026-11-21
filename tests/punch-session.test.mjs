import test from 'node:test';
import assert from 'node:assert/strict';
import {punchSession, punchTiming, flexibleDayTotals} from '../public/work-schedule.js';
const at=(day,time)=>Date.parse(`${day}T${time}:00+03:00`);
const window=(day,start='07:30',end='15:30')=>({start:at(day,start),end:at(day,end),arrivalStart:at(day,start)-3600000,arrivalEnd:at(day,start)+3600000,departureStart:at(day,end)-3600000,departureEnd:at(day,end)+3600000});
const entry=(day,time,extra={})=>({kind:'in',date:day,time:new Date(at(day,time)).toISOString(),...extra});
test('missing historical checkout does not block a new day and does not fabricate an old checkout',()=>{
 const punches=[entry('2026-11-19','07:54',{shiftStart:at('2026-11-19','07:30')})],snapshot=JSON.stringify(punches),windows=[window('2026-11-21')];
 const session=punchSession(punches,windows,at('2026-11-21','07:55'),'2026-11-21');
 assert.equal(session.nextPunch,'in');assert.equal(session.openPunch,null);assert.equal(JSON.stringify(punches),snapshot);
 assert.equal(punchTiming(windows,at('2026-11-21','07:55'),session.nextPunch,null,null).kind,'in');
});
test('same-day repeated clock-in stays blocked and current checkout remains available',()=>{
 const w=window('2026-11-21'),p=entry('2026-11-21','07:54',{shiftStart:w.start});
 const session=punchSession([p],[w],at('2026-11-21','08:00'),'2026-11-21');
 assert.equal(session.nextPunch,'out');assert.equal(session.openPunch,p);
 assert.equal(punchTiming([w],at('2026-11-21','15:30'),session.nextPunch,w.start,p).kind,'out');
});
test('overnight session survives midnight only through its checkout window',()=>{
 const w={...window('2026-11-20','22:00','23:00'),end:at('2026-11-21','06:00'),departureStart:at('2026-11-21','05:00'),departureEnd:at('2026-11-21','07:00')};
 const p=entry('2026-11-20','22:00',{shiftStart:w.start,shiftEnd:w.end});
 assert.equal(punchSession([p],[w],at('2026-11-21','06:15'),'2026-11-21').nextPunch,'out');
 assert.equal(punchSession([p],[w,window('2026-11-21','22:00','23:00')],at('2026-11-21','22:00'),'2026-11-21').nextPunch,'in');
});
test('legacy records and out-of-order historical imports use the latest real timestamp',()=>{
 const old=entry('2026-11-19','07:54'),current=entry('2026-11-21','07:55');
 assert.equal(punchSession([current,old],[window('2026-11-21')],at('2026-11-21','08:00'),'2026-11-21').openPunch,current);
 assert.equal(punchSession([old],[],at('2026-11-21','08:00'),'2026-11-21').nextPunch,'in');
});
test('a new split shift starts independently after a missed checkout',()=>{
 const first=window('2026-11-21','08:00','12:00'),second=window('2026-11-21','16:00','20:00');
 const p=entry('2026-11-21','08:00',{shiftStart:first.start,shiftEnd:first.end});
 assert.equal(punchSession([p],[first,second],at('2026-11-21','16:00'),'2026-11-21').nextPunch,'in');
});
test('an unfinished flexible session does not consume the following days hours',()=>{
 const old=entry('2026-11-19','09:00',{flexible:true,shiftStart:at('2026-11-19','09:00'),shiftEnd:at('2026-11-19','22:00')});
 const current=entry('2026-11-21','09:00',{flexible:true,shiftStart:at('2026-11-21','09:00'),shiftEnd:at('2026-11-21','22:00')});
 const out=entry('2026-11-21','11:00',{kind:'out',flexible:true});
 assert.equal(flexibleDayTotals([old,current,out],'2026-11-21',at('2026-11-21','12:00')).completedMilliseconds,2*3600000);
});
