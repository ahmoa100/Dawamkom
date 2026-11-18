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
