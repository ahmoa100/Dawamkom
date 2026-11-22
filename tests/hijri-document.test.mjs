import test from 'node:test';
import assert from 'node:assert/strict';
import {expiryCandidates,hijriToGregorian,documentDateFacts,documentDisplayName,uploadDocuments} from '../public/document-reader.js';
import {suggestDocument} from '../document-suggestions.mjs';
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

test('AI suggestion uses verified issue and expiry excerpts with Hijri conversion',async()=>{
 const text='تاريخ الإصدار: ١٤٤٥/٠٦/٠٨\nتاريخ انتهاء الشهادة: ١٤٤٩/٠٦/٠٢';
 const proposal={title:'شهادة المنشأة.pdf',issueEvidence:'تاريخ الإصدار: ١٤٤٥/٠٦/٠٨',expiryEvidence:'تاريخ انتهاء الشهادة: ١٤٤٩/٠٦/٠٢'};
 const fetcher=async(url,request)=>{
  assert.equal(url.href,'http://127.0.0.1:11434/api/chat');
  assert.equal(JSON.parse(request.body).stream,false);
  return Response.json({done:true,message:{content:JSON.stringify(proposal)}});
 };
 const suggest=()=>suggestDocument(text,'ar',{ollama:'http://127.0.0.1:11434',model:'fixture',fetcher});
 const result=await suggest();
 assert.notEqual(result.issue.date,result.expiry.date);
 assert.equal(result.expiry.date,'2027-11-01');
 assert.equal(result.expiry.hijri,'1449-06-02');
 proposal.expiryEvidence=proposal.issueEvidence;
 assert.equal((await suggest()).expiry.date,'2027-11-01');
 proposal.expiryEvidence='تاريخ انتهاء الشهادة: ١٤٥٠/٠٦/٠٢';
 assert.equal((await suggest()).expiry.date,'2027-11-01');
 const issueOnly='تاريخ الإصدار: ٠٢/٠٤/٢٠١٣';
 assert.equal((await suggestDocument(issueOnly,'ar',{ollama:'http://127.0.0.1:11434',model:'fixture',fetcher})).expiry,null);
});

test('printed layout distinguishes expiry and issue in columns and OCR lines',()=>{
 const columns=documentDateFacts('تاريخ الإنتهاء\tتاريخ الإصدار\tرقم الترخيص\n١٨-٠٢-١٤٤٩\t١٠-٠٤-١٤٤٨\t٤٨-٠٠١٦٠٠١٥٣-٢');
 assert.equal(columns.issue.originalDate,'1448-04-10');
 assert.equal(columns.expiry.originalDate,'1449-02-18');
 const line=documentDateFacts('16/02/2027 \u200fتاريخ الإصدار: 16/11/2026 + تاريخ انتهاء الصلاحية:\u200e');
 assert.equal(line.issue.date,'2026-11-16');
 assert.equal(line.expiry.date,'2027-02-16');
});

test('English date labels keep Gregorian issue separate from Hijri expiry',()=>{
 const dates=documentDateFacts('Issued on: 2026-11-16\nDate of expiration: ١٤٤٩/٠٦/٠٢');
 assert.equal(dates.issue.date,'2026-11-16');
 assert.equal(dates.expiry.date,'2027-11-01');
 assert.equal(dates.expiry.originalDate,'1449-06-02');
 assert.equal(documentDateFacts('Issued on: 2026-11-16').expiry,null);
});

test('upload review saves only confirmed metadata and skips rejected files',async()=>{
 const file=new File(['%PDF-1'], 'شهادة.PDF (1).docx',{type:'application/pdf'});
 assert.equal(documentDisplayName(file.name),'شهادة (1)');
 assert.equal(documentDisplayName('عقد فرع.docx'),'عقد فرع');
 const reader=async()=>({text:'Issue date 2026-01-01',candidates:[]});
 const saved=[];
 await uploadDocuments([file,file],body=>saved.push(body),()=>{},'ar',reader,
  (item)=>saved.length ? null : {name:documentDisplayName(item.name),expiresOn:'2027-12-31'});
 assert.equal(saved.length,1);
 assert.equal(saved[0].name,'شهادة (1)');
 assert.equal(saved[0].expiresOn,'2027-12-31');
});
