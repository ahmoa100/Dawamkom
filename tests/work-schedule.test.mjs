import test from 'node:test';
import assert from 'node:assert/strict';
import { periodBounds, punchTiming, flexibleDayTotals } from '../public/work-schedule.js';
const day='2026-11-18', at=t=>Date.parse(day+'T'+t+':00+03:00');
const period={kind:'flexible',start:'09:00',end:'22:00',duration:480};
const bounds=periodBounds(period,day);
const window={...bounds,flexible:true,arrivalStart:bounds.start,arrivalEnd:bounds.end-1,departureStart:bounds.start,departureEnd:bounds.end-1};
const punch=(kind,time)=>({kind,time:new Date(at(time)).toISOString(),flexible:true,shiftStart:bounds.start,shiftEnd:bounds.end});
test('flexible period retains a bounded window independent of required hours',()=>{
 assert.equal(bounds.start,at('09:00'));assert.equal(bounds.end,at('22:00'));assert.equal((bounds.end-bounds.start)/60000,780);
});
test('new flexible arrivals are allowed only inside the window',()=>{
 for(const time of ['08:59','22:00','23:00']) assert.equal(punchTiming([window],at(time),'in',null).allowed,false);
 assert.equal(punchTiming([window],at('09:00'),'in',null).allowed,true);
 assert.equal(punchTiming([window],at('21:59'),'in',null).allowed,true);
});
test('multiple sessions accumulate and may be opened again without a cooldown',()=>{
 const punches=[punch('in','09:00'),punch('out','11:00'),punch('in','13:00'),punch('out','14:00'),punch('in','19:00'),punch('out','20:00')];
 assert.equal(flexibleDayTotals(punches,day,at('22:00'),bounds).completedMilliseconds,4*3600000);
 assert.equal(punchTiming([window],at('20:01'),'in',null,punches.at(-1)).allowed,true);
 assert.equal(punchTiming([window],at('19:01'),'out',bounds.start,punches.at(-2)).allowed,true);
});
test('late closure is permitted but counts no time beyond the original window',()=>{
 const punches=[punch('in','21:00'),punch('out','23:00')];
 assert.equal(punchTiming([window],at('23:00'),'out',bounds.start,punches[0]).allowed,true);
 assert.equal(flexibleDayTotals(punches,day,at('23:00'),bounds).completedMilliseconds,3600000);
});
test('active elapsed time is capped at the end of the window',()=>{
 const totals=flexibleDayTotals([punch('in','21:00')],day,at('23:00'),bounds);
 assert.equal(totals.activeUntil,at('22:00'));assert.equal(totals.activeSince,at('21:00'));
});
test('overnight windows accumulate against their assigned shift',()=>{
 const night=periodBounds({kind:'flexible',start:'21:00',end:'03:00'},day);
 const records=[{kind:'in',time:new Date(at('22:00')).toISOString(),flexible:true,shiftEnd:night.end},{kind:'out',time:'2026-11-19T02:00:00+03:00',flexible:true}];
 assert.equal((night.end-night.start)/3600000,6);
 assert.equal(flexibleDayTotals(records,day,night.end,night).completedMilliseconds,4*3600000);
});
test('existing flexible periods without a window keep their legacy all-day behavior',()=>{
 const legacy=periodBounds({kind:'flexible'},day);assert.equal(legacy.end-legacy.start,86400000);
});

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const appSource=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const reportSource=appSource.slice(appSource.indexOf('function attendanceReportSummary('),appSource.indexOf('function mountAttendanceReport('));
function flexibleReport(sessions, followUp=false){
 const day='2026-11-17', bounds=periodBounds(period,day);
 const punches=sessions.flatMap(([arrival,departure])=>['in','out'].map((kind,index)=>({staffId:'staff',kind,date:day,time:day+'T'+[arrival,departure][index]+':00+03:00',shiftStart:bounds.start,shiftEnd:bounds.end,flexible:true})));
 class ReportDate extends Date { static now(){return Date.parse('2026-11-19T20:00:00Z');} }
 const context={state:{today:'2026-11-18',staff:[{id:'staff',name:'Test'}],workPeriods:[{...period,id:'flex'}],punches,requests:[],leaveTypes:[]},Date:ReportDate,Intl,Map,Set,Math,language:'en',periodBounds,effectivePeriodIds:()=>['flex'],isFlexiblePeriod:p=>p.kind==='flexible',isScheduleRestDay:()=>false,esc:x=>String(x??''),t:x=>x,staffName:p=>p.name,table:(headers,rows)=>rows};
 vm.createContext(context);vm.runInContext(reportSource,context);
 return context.attendanceReportSummary(new Set(['staff']),Date.parse(day),Date.parse(day),followUp)[0];
}
test('report marks a flexible day short when four of eight required hours were completed',()=>{
 const sessions=[['09:00','11:00'],['13:00','14:00'],['19:00','20:00']];
 const summary=flexibleReport(sessions);assert.equal(summary[2],'<bdi>4:00</bdi>');assert.equal(summary[10],0);
 assert.match(flexibleReport(sessions,true)[2],/Hours shortfall/);
});
test('report counts eight accumulated hours and caps late checkout at the window end',()=>{
 const sessions=[['09:00','11:00'],['13:00','16:00'],['19:00','23:00']];
 const summary=flexibleReport(sessions);assert.equal(summary[2],'<bdi>8:00</bdi>');assert.equal(summary[10],1);
 assert.match(flexibleReport(sessions,true)[2],/>Present</);
});
