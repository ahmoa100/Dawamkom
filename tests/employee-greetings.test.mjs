import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeGreetings, pickEmployeeGreeting } from '../public/employee-greetings.js';
test('all 114 approved bilingual phrases retain their original identifiers',()=>{
 assert.equal(employeeGreetings.length,114);assert.equal(new Set(employeeGreetings.map(p=>p.id)).size,114);
 for(const p of employeeGreetings){assert.ok(p.ar&&p.en);assert.equal(typeof p.morning,'boolean');}
});
test('a new selection never immediately repeats the previous phrase',()=>{
 for(const previous of employeeGreetings) for(const random of [0,0.5,0.999])
  assert.notEqual(pickEmployeeGreeting({hour:9,kind:'in',previousId:previous.id},()=>random).id,previous.id);
});
test('evening selections do not use morning greetings',()=>{
 for(let i=0;i<100;i++)assert.equal(pickEmployeeGreeting({hour:18,kind:'in'},()=>i/100).morning,false);
});
test('clock-out selections avoid phrases about starting the day',()=>{
 for(let i=0;i<100;i++)assert.equal(pickEmployeeGreeting({hour:10,kind:'out'},()=>i/100).opening,false);
});

import { weeklyGreetingDecision } from '../public/employee-greetings.js';
const workdays=['2026-11-15','2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-21'];
test('weekly plans choose one or two distinct remaining workdays',()=>{
 for(const sample of [0,0.25,0.75,0.999]) {
  const {state}=weeklyGreetingDecision(null,'2026-11-18',workdays,()=>sample);
  assert.ok(state.days.length>=1&&state.days.length<=2);
  assert.equal(new Set(state.days).size,state.days.length);
  assert.ok(state.days.every(day=>workdays.includes(day)&&day>='2026-11-18'));
 }
});
test('multiple punches or devices share a maximum of two weekly appearances',()=>{
 let state=null, appearances=0;
 for(const today of workdays)for(let punch=0;punch<8;punch++){
  const decision=weeklyGreetingDecision(state,today,workdays,()=>0.9);state=decision.state;
  if(decision.show)appearances++;
 }
 assert.equal(appearances,2);assert.equal(state.shownDates.length,2);
});
test('a one-day weekly plan appears only once',()=>{
 let state=null,appearances=0;
 for(const today of workdays){const decision=weeklyGreetingDecision(state,today,workdays,()=>0.2);state=decision.state;if(decision.show)appearances++;}
 assert.equal(appearances,1);
});
test('refreshing the weekly decision does not change the scheduled days',()=>{
 const first=weeklyGreetingDecision(null,'2026-11-18',workdays,()=>0.9);
 const second=weeklyGreetingDecision(first.state,'2026-11-18',workdays,()=>0);
 assert.deepEqual(second.state.days,first.state.days);assert.equal(second.show,false);
});
test('a new Sunday resets the weekly plan',()=>{
 const previous={weekStart:'2026-11-15',days:['2026-11-18','2026-11-19'],shownDates:['2026-11-18','2026-11-19']};
 const next=weeklyGreetingDecision(previous,'2026-11-22',['2026-11-22'],()=>0.9);
 assert.equal(next.state.weekStart,'2026-11-22');assert.equal(next.show,true);assert.equal(next.state.shownDates.length,1);
 assert.equal(previous.shownDates.length,2);
});
test('a late-week start does not schedule a surprise in the past',()=>{
 const {state,show}=weeklyGreetingDecision(null,'2026-11-21',workdays,()=>0.9);
 assert.deepEqual(state.days,['2026-11-21']);assert.equal(show,true);
});
