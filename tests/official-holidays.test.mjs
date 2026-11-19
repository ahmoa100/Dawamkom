import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticHolidayCalendar,holidayOccurrences,officialHolidaysOn,refreshHolidayCalendar} from '../public/official-holidays.js';
import {effectivePeriodIds,isScheduleRestDay} from '../public/work-schedule.js';
import {attendanceState} from '../public/ux-model.js';
test('enabled official holidays replace scheduled work without deleting assignments, branch overrides stay scoped',()=>{
 const p={id:'p',branchId:'a',periodIds:['work']},w={workPeriods:[{id:'work',start:'09:00',end:'17:00'}],workSchedule:{days:[0,1,2,3,4,5,6]},workAssignments:[{staffId:'p',date:'2026-09-23',periodId:'work'}],officialHolidaySettings:{national:{enabled:true,days:1}},branchOfficialHolidaySettings:{b:{national:{enabled:false}}}};
 assert.equal(officialHolidaysOn(w,p,'2026-09-23')[0].name,'National Day');
 assert.deepEqual(effectivePeriodIds(w,p,'2026-09-23'),[]);assert.equal(w.workAssignments.length,1);
 assert.equal(isScheduleRestDay(w,p,'2026-09-23'),true);assert.equal(attendanceState(w,p,'2026-09-23'),'National Day');
 assert.deepEqual(effectivePeriodIds(w,{...p,branchId:'b'},'2026-09-23'),['work']);
 w.officialHolidaySettings.national.startOverrides={2026:'2026-09-24'};
 assert.equal(officialHolidaysOn(w,p,'2026-09-23').length,0);assert.equal(officialHolidaysOn(w,p,'2026-09-24').length,1);
 assert.equal(holidayOccurrences(w,'national',2027)[0].start,'2027-09-23');
});
test('automatic calendar uses Umm al-Qura, validates online responses and retains cached data on failure',async()=>{
 const calendar=automaticHolidayCalendar(2027);assert.deepEqual(calendar.dates.fitr,['2027-03-09']);assert.deepEqual(calendar.dates.foundation,['2027-02-22']);
 const before=JSON.stringify(calendar);
 await assert.rejects(refreshHolidayCalendar(2027,async()=>({ok:true,json:async()=>({data:{hijri:{method:'BAD'}}})})));
 assert.equal(JSON.stringify(automaticHolidayCalendar(2027)),before);
 const online=await refreshHolidayCalendar(2027,async url=>{
  const [day,month,year]=url.split('/').at(-1).split('?')[0].split('-').map(Number);
  const g=month===9?(year===1448?[8,3,2027]:[25,2,2028]):(year===1448?[15,5,2027]:[3,5,2028]);
  return {ok:true,json:async()=>({data:{hijri:{method:'UAQ',day,month:{number:month},year},gregorian:{day:g[0],month:{number:g[1]},year:g[2]}}})};
 });
 assert.equal(online.source,'AlAdhan · Umm al-Qura');assert.deepEqual(online.dates.fitr,['2027-03-09']);
 const w={officialHolidayCalendar:{2027:online},officialHolidaySettings:{fitr:{enabled:true,days:4,startOverrides:{2027:'2027-03-10'}}}};
 assert.equal(holidayOccurrences(w,'fitr',2027)[0].start,'2027-03-10');
});
