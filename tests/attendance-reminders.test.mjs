import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceReminders,recordAttendanceReminder} from '../attendance-reminders.mjs';
const now=s=>Date.parse('2026-11-18T'+s+':00+03:00');
const fixture=()=>({notificationPreferences:{attendance:true},notificationSettings:{attendance:{
 beforeStart:{enabled:true,minutes:10},beforeDeduction:{enabled:true,minutes:5},beforeEnd:{enabled:true,minutes:10},afterEnd:{enabled:true,minutes:5}}},
 staff:[{id:'s',status:'Active',account:{},periodIds:['p']}],workPeriods:[{id:'p',start:'09:00',end:'17:00'}],
 workSchedule:{days:[0,1,2,3,4,6]},workAssignments:[],requests:[],leaveTypes:['Annual leave'],punches:[]});
test('four approved messages use configured minutes and Riyadh shift boundaries',()=>{
 for(const [time,kind,text] of [['08:50','beforeStart','دوامك يبدأ خلال 10 دقيقة'],['09:05','beforeDeduction','لم تقم بتسجيل بصمة دخول'],
 ['16:50','beforeEnd','دوامك ينتهي خلال 10 دقيقة'],['17:05','afterEnd','لم تقم بتسجيل بصمة خروج']]){
  const e=attendanceReminders(fixture(),now(time));assert.equal(e.length,1);assert.equal(e[0].kind,kind);assert.equal(e[0].bodyAr,text);
 }
 assert.equal(attendanceReminders(fixture(),now('08:52')).length,0);
});
test('branch managers control reminder enablement and timing without changing another branch',()=>{
 const w=fixture();w.staff[0].branchId='a';
 w.staff.push({...w.staff[0],id:'other',branchId:'b',account:{}});
 w.notificationPreferences.attendance=false;
 w.branchNotificationPreferences={a:{attendance:true}};
 w.branchNotificationSettings={a:{attendance:{...w.notificationSettings.attendance,beforeStart:{enabled:true,minutes:20}}}};
 assert.deepEqual(attendanceReminders(w,now('08:40')).map(event=>event.staffId),['s']);
 assert.equal(attendanceReminders(w,now('08:50')).length,0);
 w.notificationPreferences.attendance=true;w.branchNotificationPreferences.a.attendance=false;
 assert.deepEqual(attendanceReminders(w,now('08:50')).map(event=>event.staffId),['other']);
});
test('matching in/out punches suppress only the appropriate shift reminder',()=>{
 const w=fixture();w.punches=[{staffId:'s',kind:'in',time:new Date(now('08:45')).toISOString(),shiftStart:now('09:00')}];
 assert.equal(attendanceReminders(w,now('08:50')).length,0);assert.equal(attendanceReminders(w,now('09:05')).length,0);
 assert.equal(attendanceReminders(w,now('16:50')).length,1);
 w.punches.push({staffId:'s',kind:'out',time:new Date(now('16:40')).toISOString(),shiftStart:now('09:00')});
 assert.equal(attendanceReminders(w,now('16:50')).length,0);assert.equal(attendanceReminders(w,now('17:05')).length,0);
});
test('disabled rules, rest days, approved leave and inactive employees do not receive reminders',()=>{
 for(const update of [w=>w.notificationPreferences.attendance=false,w=>w.notificationSettings.attendance.beforeStart.enabled=false,
 w=>w.staff[0].status='Suspended',w=>w.workSchedule.days=[],w=>w.requests.push({staffId:'s',type:'Annual leave',status:'Approved',date:'2026-11-18',end:'2026-11-20'})]){
  const w=fixture();update(w);assert.equal(attendanceReminders(w,now('08:50')).length,0);
 }
});
test('persisted claims prevent duplicates after restarts and earlier shift punches do not suppress another shift',()=>{
 const w=fixture(),t=now('08:50'),event=attendanceReminders(w,t)[0];recordAttendanceReminder(w.staff[0],event,t);
 assert.equal(attendanceReminders(structuredClone(w),t+30000).length,0);
 const second=fixture();second.punches=[{staffId:'s',kind:'out',time:new Date(now('08:40')).toISOString(),shiftStart:now('06:00')}];
 assert.equal(attendanceReminders(second,now('16:50')).length,1);
});
test('overnight and flexible periods retain correct reminder boundaries',()=>{
 const w=fixture();w.workPeriods[0]={id:'p',kind:'flexible',start:'22:00',end:'06:00',duration:240};
 const time=Date.parse('2026-11-19T05:50:00+03:00');const events=attendanceReminders(w,time);
 assert.equal(events.length,1);assert.equal(events[0].kind,'beforeEnd');assert.equal(events[0].date,'2026-11-18');
});
