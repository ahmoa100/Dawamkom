import test from 'node:test';
import assert from 'node:assert/strict';
import {expiryCandidates,hijriToGregorian,uploadDocuments} from '../public/document-reader.js';
test('Hijri certificate expiry uses Umm al-Qura and retains original date',()=>{
 const result=expiryCandidates('وتنتهي صلاحية الشهادة في: ١٤٤٩/٠٦/٠٢ هـ')[0];
 assert.equal(result.originalDate,'1449-06-02');assert.equal(result.date,'2027-11-01');assert.equal(result.labelled,true);
 assert.equal(expiryCandidates('تاريخ الإصدار: 1445/06/08\nوتنتهي صلاحية الشهادة في: 1449/06/02')[0].originalDate,'1449-06-02');
 assert.equal(expiryCandidates('Expiry date: 31 / 12 / 2027')[0].date,'2027-12-31');
 assert.equal(hijriToGregorian(1449,13,1),null);assert.equal(hijriToGregorian(1449,1,31),null);
 const combined=expiryCandidates('انتهاء 1449/06/02\nExpiry 2027-11-01');assert.equal(combined.length,1);assert.equal(combined[0].calendar,'hijri');
});
test('upload preserves Hijri provenance without activating an expiry date',async()=>{
 let saved;await uploadDocuments([new File(['%PDF-1'], 'test.pdf',{type:'application/pdf'})],async b=>saved=b,()=>{},'ar',async()=>({candidates:expiryCandidates('وتنتهي صلاحية الشهادة في: 1449/06/02')}));
 assert.equal(saved.suggestedHijri,'1449-06-02');assert.equal(saved.suggestedExpiresOn,'2027-11-01');assert.equal(saved.expiresOn,'');
});
