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

import { dailyGreetingDecision } from '../public/employee-greetings.js';
test('successful punches can show encouragement every day, once per day across sessions',()=>{
 let shownOn, appearances=0;
 for(const today of ['2026-11-18','2026-11-19','2026-11-20','2026-11-21','2026-11-22']) {
  for(let punch=0;punch<8;punch++) {
   const decision=dailyGreetingDecision(shownOn,today);
   shownOn=decision.shownOn;
   if(decision.show)appearances++;
  }
 }
 assert.equal(appearances,5);
});
test('the next month and year allow a new greeting while a same-day reload does not',()=>{
 assert.equal(dailyGreetingDecision('2026-11-18','2026-11-18').show,false);
 assert.equal(dailyGreetingDecision('2026-11-30','2026-12-01').show,true);
 assert.equal(dailyGreetingDecision('2026-12-31','2027-01-01').show,true);
});

test('administrators can independently enable or disable their branch; unconfigured branches inherit the company default', async () => {
  const { encouragementSettings } = await import('../public/employee-greetings.js');
  const workspace = { encouragementSettings: { enabled: false }, branchEncouragementSettings: {
    a: { enabled: true, phrases: [{ id: 1, ar: 'أهلًا', en: 'Welcome' }] }, b: { enabled: false } } };
  assert.equal(encouragementSettings(workspace, 'a').enabled, true);
  assert.equal(encouragementSettings(workspace, 'c').enabled, false);
  workspace.encouragementSettings.enabled = true;
  assert.equal(encouragementSettings(workspace, 'a').enabled, true);
  assert.equal(encouragementSettings(workspace, 'b').enabled, false);
  assert.equal(encouragementSettings(workspace, 'c').phrases.length, 114);
  assert.equal(encouragementSettings(workspace, 'a').phrases.length, 1);
});
test('custom phrases are bounded, bilingual, and selected instead of defaults', async () => {
  const { validateEncouragementPhrases } = await import('../public/employee-greetings.js');
  assert.throws(() => validateEncouragementPhrases([]));
  assert.throws(() => validateEncouragementPhrases([{ ar: 'أهلًا', en: '' }]));
  assert.throws(() => validateEncouragementPhrases([{ ar: 'أهلًا', en: 'x'.repeat(241) }]));
  const phrases = validateEncouragementPhrases([{ ar: ' أهلًا ', en: ' Welcome ' }]);
  assert.equal(pickEmployeeGreeting({ hour: 15, kind: 'in', phrases }).en, 'Welcome');
});
