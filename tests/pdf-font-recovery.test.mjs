import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverArabicIdentityMap} from '../public/pdf-font-recovery.js';
import {labelDatesByNearbyWords} from '../public/document-reader.js';
test('embedded Arabic cmap recovery uses glyph mappings, never a guessed numeric offset',()=>{
 const mappings=Array.from({length:10},(_,i)=>({charCode:0x660+i,glyphId:100+i*3}));mappings.push({charCode:47,glyphId:17});
 const codes=new Map([[900,103],[901,17]]),r=recoverArabicIdentityMap(mappings,codes);assert.equal(r.get(900),'١');assert.equal(r.get(901),'/');
 assert.equal(recoverArabicIdentityMap(mappings.slice(0,9),codes),null);
 assert.equal(recoverArabicIdentityMap(mappings.map(m=>({...m,glyphId:1})),codes),null);
});
test('Arabic expiry labels select the date on their left, not nearby issue or start dates',()=>{
 const date=(d,x)=>({date:d,originalDate:d,calendar:'gregorian',bbox:{x0:x,y0:90,x1:x+80,y1:110}});
 const words=[{text:'وتنتهي',bbox:{x0:900,y0:90,x1:970,y1:110}}];
 assert.equal(labelDatesByNearbyWords([date('2023-12-21',100),date('2027-11-01',750)],words,1200)[0].date,'2027-11-01');
 assert.equal(labelDatesByNearbyWords([date('2019-12-26',1000)],words,1200).length,0);
 assert.equal(labelDatesByNearbyWords([date('2027-11-01',750),date('2027-11-02',755)],words,1200).length,0);
});
