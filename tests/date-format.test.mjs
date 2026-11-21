import test from 'node:test';
import assert from 'node:assert/strict';
import {dateText,parseDateText,dateFormatter} from '../public/date-format.js';
test('dates display day/month/year while parsing back to unchanged ISO storage',()=>{
 for(const [iso,shown]of [['2026-11-21','21/11/2026'],['2000-02-29','29/02/2000'],['2027-01-05','05/01/2027']]){assert.equal(dateText(iso),shown);assert.equal(parseDateText(shown),iso);}
 assert.equal(parseDateText('٢١/١١/٢٠٢٦'),'2026-11-21');assert.equal(parseDateText('۲۱/۱۱/۲۰۲۶'),'2026-11-21');
 for(const value of ['31/02/2026','29/02/2025','11/21/2026','2026-11-21','1/2/2026'])assert.equal(parseDateText(value),null);
 assert.equal(dateText(1500),'1500');assert.equal(dateText('SAR 1500'),'SAR 1500');assert.equal(dateText('report-2026-11-21.pdf'),'report-2026-11-21.pdf');
 assert.equal(dateText('2026-11-20T22:30:00Z'),'21/11/2026');
});
test('localized labels retain weekday/time and use identical Gregorian numeric dates in both languages',()=>{
 for(const locale of ['ar-SA','en']){assert.match(dateFormatter(locale,{dateStyle:'full'}).format(Date.parse('2026-11-21')),/21\/11\/2026/);assert.equal(dateFormatter(locale).formatRange('2026-11-21','2026-11-22'),'21/11/2026 — 22/11/2026');}
});
