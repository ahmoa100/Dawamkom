import {readDocument} from './document-reader.js';
import {enrichmentPlan} from './employee-enrichment.js';
export function delimitedRows(text){
 text=String(text).replace(/^\uFEFF/,'');
 const first=text.split(/\r?\n/).find(line=>line.trim())??'';
 const delimiter=['\t',';',',','|'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
 if(!first.includes(delimiter))return text.trim().split(/\r?\n/).map(line=>line.trim().split(/\s{2,}/));
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===delimiter&&!quoted){row.push(cell.trim());cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
}
export const importFields=[
 ['nameAr','الاسم العربي','Arabic name',['الاسم العربي','الاسم بالعربي','arabic name','namear']],
 ['nameEn','الاسم الإنجليزي','English name',['الاسم الانجليزي','الاسم بالانجليزي','english name','nameen','employee name','name','اسم الموظف']],
 ['email','البريد الإلكتروني','Email',['البريد الالكتروني','البريد','email','e-mail']],
 ['phone','الجوال','Phone',['الجوال','رقم الجوال','الهاتف','phone','mobile']],
 ['identityNumber','الهوية / الإقامة','Identity / residence',['رقم الهوية','الهوية','رقم الاقامة','الاقامة','identity number','iqama','id number']],
 ['nationality','الجنسية (رمز الدولة)','Nationality (country code)',['الجنسية','nationality']],
 ['birthDate','تاريخ الميلاد','Date of birth',['تاريخ الميلاد','birth date','date of birth','dob']],
 ['joinDate','تاريخ الانضمام','Joining date',['تاريخ الانضمام','تاريخ الالتحاق','تاريخ المباشرة','joining date','join date','start date']],
 ['gender','الجنس','Gender',['الجنس','gender','sex']],
 ['salary','الراتب الأساسي','Basic salary',['الراتب الاساسي','الراتب','basic salary','salary']],
 ['allowances','البدلات','Allowances',['البدلات','allowances']],
 ['jobTitle','المسمى الوظيفي','Job title',['المسمى الوظيفي','الوظيفة','job title','position']],
 ['branchId','الفرع','Branch',['الفرع','branch']],
 ['contractType','نوع العقد','Contract type',['نوع العقد','contract type']],
 ['contractTerm','مدة العقد','Contract term',['مدة العقد','contract term']],
 ['annualLeave','الاستحقاق السنوي','Annual leave',['الاستحقاق السنوي','annual leave']],
 ['probation','فترة التجربة','Probation days',['فترة التجربة','probation']],
 ['iban','الآيبان','IBAN',['الايبان','iban']],
 ['residencyExpiryDate','انتهاء الإقامة','Residence expiry',['انتهاء الاقامة','residence expiry']],
];
const normalize=value=>String(value??'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/[\s_.-]/g,'');
export function guessColumns(headers){return Object.fromEntries(importFields.map(([key,ar,en,aliases])=>[key,headers.findIndex(header=>aliases.some(alias=>normalize(alias)===normalize(header)))]));}
function dateValue(value){
 if(/^\d{5}$/.test(value)){const number=Number(value);if(number>20000&&number<80000)return new Date(Date.UTC(1899,11,30)+number*86400000).toISOString().slice(0,10);}
 const m=String(value).match(/^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})$/);if(!m)return value;
 return (m[1].length===4?[m[1],m[2],m[3]]:[m[3],m[2],m[1]]).map((s,i)=>i?String(s).padStart(2,'0'):s).join('-');
}
export function mappedEmployee(row,mapping,state){
 const body=Object.fromEntries(importFields.map(([key])=>[key,mapping[key]>=0?String(row[mapping[key]]??'').trim():'' ]));
 for(const key of ['phone','identityNumber','salary','allowances','annualLeave','probation'])body[key]=body[key].replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c));
 for(const key of ['birthDate','joinDate','residencyExpiryDate'])body[key]=dateValue(body[key]);
 const norm=normalize(body.nationality);if(['سعودي','سعودية','saudi','saudiarabia'].includes(norm))body.nationality='SA';else body.nationality=body.nationality.toUpperCase();
 body.gender=({'ذكر':'Male','انثى':'Female','male':'Male','female':'Female'})[normalize(body.gender)]??body.gender;
 body.contractType=({'سنوي':'Annual','تمهير':'Tamheer','annual':'Annual','tamheer':'Tamheer'})[normalize(body.contractType)]??body.contractType;
 body.contractTerm=({'سنة':'One year','سنه':'One year','1':'One year','oneyear':'One year','سنتان':'Two years','2':'Two years'})[normalize(body.contractTerm)]??body.contractTerm;
 body.branchId=state.locations.find(x=>x.id===body.branchId||normalize(x.name)===normalize(body.branchId))?.id??'';
 body.jobTitle=state.jobTitles.find(x=>normalize(x)===normalize(body.jobTitle))??body.jobTitle;
 return body;
}
async function xlsxRows(file){
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);const entries=new Map();if(bytes.length<22)throw Error('Invalid XLSX file.');let end=bytes.length-22;
 while(end>=Math.max(0,bytes.length-65557)&&view.getUint32(end,true)!==0x06054b50)end--;
 if(end<Math.max(0,bytes.length-65557))throw Error('Invalid XLSX file.');let at=view.getUint32(end+16,true);const count=view.getUint16(end+10,true);if(count>2000)throw Error('Workbook too large.');
 for(let i=0;i<count;i++){
  if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)throw Error('Invalid XLSX file.');
  const length=view.getUint16(at+28,true),name=new TextDecoder().decode(bytes.subarray(at+46,at+46+length));
  entries.set(name,{method:view.getUint16(at+10,true),size:view.getUint32(at+24,true),packed:view.getUint32(at+20,true),offset:view.getUint32(at+42,true)});at+=46+length+view.getUint16(at+30,true)+view.getUint16(at+32,true);
 }
 const xml=async name=>{
  const e=entries.get(name);if(!e)return null;if(e.size>8*1024*1024)throw Error('Worksheet too large.');
  const start=e.offset+30+view.getUint16(e.offset+26,true)+view.getUint16(e.offset+28,true);let data=bytes.slice(start,start+e.packed);
  if(e.method===8){const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));const reader=stream.getReader();let chunks=[],size=0;for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8*1024*1024){await reader.cancel();throw Error('Worksheet too large.');}chunks.push(r.value);}data=new Uint8Array(await new Blob(chunks).arrayBuffer());}else if(e.method!==0)throw Error('Unsupported workbook compression.');
  const doc=new DOMParser().parseFromString(new TextDecoder().decode(data),'application/xml');if(doc.querySelector('parsererror'))throw Error('Invalid worksheet.');return doc;
 };
 const strings=[...(await xml('xl/sharedStrings.xml'))?.getElementsByTagName('si')??[]].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent).join(''));
 const sheet=entries.has('xl/worksheets/sheet1.xml')?'xl/worksheets/sheet1.xml':[...entries.keys()].find(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k));if(!sheet)throw Error('No worksheet.');
 const doc=await xml(sheet);return [...doc.getElementsByTagName('row')].slice(0,501).map(row=>{const values=[];for(const cell of row.getElementsByTagName('c')){let col=0;for(const c of(cell.getAttribute('r')??'A').replace(/\d/g,''))col=col*26+c.charCodeAt(0)-64;if(col>100)continue;const value=cell.getElementsByTagName('v')[0]?.textContent??[...cell.getElementsByTagName('t')].map(t=>t.textContent).join('');values[col-1]=cell.getAttribute('t')==='s'?strings[Number(value)]??'':value;}return values;}).filter(row=>row.some(Boolean));
}
export async function employeeFileRows(file){
 if(file.size>2*1024*1024)throw Error('Maximum file size is 2 MB.');
 if(/\.xlsx$/i.test(file.name))return xlsxRows(file);
 if(/\.(csv|tsv|txt)$/i.test(file.name))return delimitedRows(await file.text());
 const result=await readDocument(file);const rows=delimitedRows(result.text);if(rows.length<2||rows[0].length<2)throw Error('No readable table found. Use an Excel or CSV export.');return rows;
}
export function openEmployeeImport({state,language,esc,t,companyPrefix,onComplete}){
 const L=(ar,en)=>language==='ar'?ar:en,dialog=document.createElement('dialog');dialog.className='catalog-dialog employee-import-dialog';
 dialog.innerHTML='<header><h2>'+L('استيراد موظفين','Import employees')+'</h2><button type="button" class="button secondary compact" data-close aria-label="'+t('Close')+'">×</button></header><p class="hint">'+L('Excel XLSX وCSV، أو جدول واضح في PDF أو صورة. القراءة محلية ومجانية؛ راجع الحقول قبل إنشاء الحسابات وإرسال دعوات التفعيل. حد الملف 2 ميجابايت، و50 موظفًا في الدفعة. ملفات XLSX: الورقة الأولى فقط؛ PDF: أول خمس صفحات.','XLSX, CSV, or a readable table in PDF/image. Free local reading; review fields before creating accounts and sending activation invitations. 2 MB per file, 50 employees per batch. XLSX: first worksheet; PDF: first five pages.')+'</p><input type="file" multiple accept=".xlsx,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg"><button type="button" class="button secondary" data-read>'+L('قراءة الملفات','Read files')+'</button><p role="status" data-status></p><div data-preview></div>';
 document.body.append(dialog);let busy=false;dialog.querySelector('[data-close]').onclick=()=>{if(!busy)dialog.close();};dialog.oncancel=e=>{if(busy)e.preventDefault();};dialog.onclose=()=>dialog.remove();dialog.showModal();
 const status=dialog.querySelector('[data-status]'),preview=dialog.querySelector('[data-preview]');
 dialog.querySelector('[data-read]').onclick=async e=>{
  const files=[...dialog.querySelector('input[type=file]').files];if(!files.length)return;busy=true;e.currentTarget.disabled=true;preview.replaceChildren();const batches=[];
  try{for(const file of files){status.textContent=L('جارٍ قراءة ','Reading ')+file.name;try{const rows=await employeeFileRows(file);if(rows.length>1)batches.push({name:file.name,headers:Array.from({length:rows[0].length},(_,i)=>rows[0][i]||('Column '+(i+1))),rows:rows.slice(1)});}catch(error){const p=document.createElement('p');p.textContent=file.name+': '+error.message;preview.append(p);}}
   if(batches.reduce((n,b)=>n+b.rows.length,0)>50)throw Error(L('الحد 50 موظفًا في الدفعة.','Limit: 50 employees per batch.'));
   for(const batch of batches){const section=document.createElement('section');section.className='card';const mapping=guessColumns(batch.headers);
    section.innerHTML='<h3>'+esc(batch.name)+'</h3><p>'+L('راجع مطابقة الأعمدة ثم افتح معاينة الموظفين.','Review column mapping, then preview employees.')+'</p><div class="fields">'+importFields.map(([key,ar,en])=>'<label>'+esc(L(ar,en))+'<select data-map="'+key+'"><option value="-1">'+L('غير موجود — يُستكمل في المعاينة','Missing — complete in preview')+'</option>'+batch.headers.map((h,i)=>'<option value="'+i+'"'+(mapping[key]===i?' selected':'')+'>'+esc(h)+'</option>').join('')+'</select></label>').join('')+'</div><button class="button secondary" type="button" data-review>'+L('معاينة وتعديل','Preview and edit')+'</button><div data-rows></div>';
    preview.append(section);section.querySelector('[data-review]').onclick=()=>{const map=Object.fromEntries([...section.querySelectorAll('[data-map]')].map(el=>[el.dataset.map,Number(el.value)]));section.dataset.reviewed='true';const area=section.querySelector('[data-rows]');area.replaceChildren();
     for(const row of batch.rows){const body=mappedEmployee(row,map,state),details=document.createElement('details');details.className='employee-import-row';
      details.innerHTML='<summary>'+esc(body.nameAr||body.nameEn||body.email||L('موظف — أكمل البيانات','Employee — complete details'))+'</summary><div class="fields">'+importFields.map(([key,ar,en])=>{const options=key==='gender'?[['Male',L('ذكر','Male')],['Female',L('أنثى','Female')]]:key==='nationality'?null:key==='jobTitle'?state.jobTitles.map(v=>[v,t(v)]):key==='branchId'?state.locations.map(v=>[v.id,v.name]):key==='contractType'?[['Annual',L('سنوي','Annual')],['Tamheer',L('تمهير','Tamheer')]]:key==='contractTerm'?[['One year',L('سنة','One year')],['Two years',L('سنتان','Two years')]]:key==='annualLeave'?[[0,'0'],[21,'21'],[30,'30']]:key==='probation'?[[0,'0'],[90,'90'],[180,'180']]:null;
       const optional=['branchId','iban','residencyExpiryDate'].includes(key),attrs=' name="'+key+'"'+(!optional?' required':'');
       return '<label>'+esc(L(ar,en))+(options?'<select'+attrs+'><option value=""></option>'+options.map(([v,label])=>'<option value="'+esc(v)+'"'+(String(v)===body[key]?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select>':'<input'+attrs+' type="'+(/Date$/.test(key)?'date':key==='email'?'email':'text')+'" value="'+esc(body[key])+'">')+'</label>';}).join('')+'</div><p data-result role="status"></p>';
      const skip=document.createElement('button');skip.type='button';skip.className='button secondary compact';skip.textContent=L('استبعاد هذا الموظف','Exclude this employee');skip.onclick=()=>details.remove();details.append(skip);area.append(details);
     }
    };
   }
   if(batches.length){const create=document.createElement('button');create.type='button';create.className='button primary';create.textContent=L('تأكيد إنشاء الحسابات وإرسال الدعوات','Confirm account creation and send invitations');preview.append(create);
    create.onclick=async()=>{if([...preview.querySelectorAll('section')].some(s=>!s.dataset.reviewed)){status.textContent=L('افتح معاينة كل ملف أولًا.','Preview each file first.');return;}const items=[...preview.querySelectorAll('.employee-import-row:not([data-created])')];if(!items.length){status.textContent=L('افتح المعاينة أولًا.','Open the preview first.');return;}
     for(const item of items)for(const field of item.querySelectorAll('input,select'))if(!field.checkValidity()){item.open=true;field.focus();field.reportValidity();return;}
     const emails=new Set(state.staff.filter(p=>p.status!=='Removed').map(p=>p.email?.toLowerCase()));for(const item of items){const email=item.querySelector('[name=email]').value.trim().toLowerCase();if(emails.has(email)){item.open=true;item.querySelector('[data-result]').textContent=L('البريد مكرر. صححه أو احذف الصف من الملف.','Duplicate email. Correct it or remove the row from the file.');return;}emails.add(email);}
     busy=true;create.disabled=true;dialog.querySelector('[data-read]').disabled=true;let count=0;
     try{for(const item of items){const body=Object.fromEntries([...item.querySelectorAll('input,select')].map(f=>[f.name,f.value]));body.probation=Number(body.probation);body.annualLeave=Number(body.annualLeave);body.periodIds=[];
       const result=item.querySelector('[data-result]');try{const response=await fetch(companyPrefix+'/api/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error);item.dataset.created='true';item.querySelectorAll('input,select').forEach(f=>f.disabled=true);result.textContent=data.invitation?.delivery==='sent'?L('أُنشئ الحساب وأُرسلت الدعوة.','Account created; invitation sent.'):L('أُنشئ الحساب. راجع حالة إرسال التفعيل في قائمة الموظفين.','Account created. Check activation delivery in the staff list.');count++;}catch(error){item.open=true;result.textContent=error.message;}}
      status.textContent=L('تم إنشاء ','Created ')+count+L(' حساب. راجع حالة كل صف؛ لا تعِد إنشاء الحسابات الناجحة.',' accounts. Review each row; successful accounts will not be created again.');await onComplete();
     }finally{busy=false;create.disabled=false;dialog.querySelector('[data-read]').disabled=false;}
    };
   }status.textContent=L('انتهت القراءة. راجع الأعمدة والبيانات قبل التأكيد.','Reading complete. Review mapping and data before confirmation.');
  }catch(error){status.textContent=error.message;}finally{busy=false;dialog.querySelector('[data-read]').disabled=false;}
 };
}
export function openEmployeeAdditionalImport({state,language,esc,t,companyPrefix,onComplete}){
 const L=(ar,en)=>language==='ar'?ar:en,dialog=document.createElement('dialog');dialog.className='catalog-dialog employee-import-dialog';
 dialog.innerHTML='<header><h2>'+L('استيراد بيانات إضافية للموظفين المسجلين','Import additional data for existing employees')+'</h2><button type="button" class="button secondary compact" data-close aria-label="'+t('Close')+'">×</button></header><p class="hint">'+L('تتم المطابقة بالهوية/الإقامة أو البريد، وليس بالاسم وحده. نكمل الحقول الفارغة التي تختارها فقط، دون تغيير البيانات الموجودة أو إنشاء حسابات أو إرسال دعوات. حتى 50 صفًا، و2 ميجابايت لكل ملف.','Match by identity/residence number or email, never name alone. Fill only selected empty fields. Existing values are preserved; no accounts or invitations are created. Up to 50 rows, 2 MB per file.')+'</p><input type="file" multiple accept=".xlsx,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg"><button type="button" class="button secondary" data-read>'+L('قراءة الملفات','Read files')+'</button><p role="status" data-status></p><div data-preview></div>';
 document.body.append(dialog);let busy=false;const proposals=new Map(),status=dialog.querySelector('[data-status]'),preview=dialog.querySelector('[data-preview]'),read=dialog.querySelector('[data-read]');
 dialog.querySelector('[data-close]').onclick=()=>{if(!busy)dialog.close();};dialog.oncancel=e=>{if(busy)e.preventDefault();};dialog.onclose=()=>dialog.remove();dialog.showModal();
 read.onclick=async()=>{
  const files=[...dialog.querySelector('input[type=file]').files];if(!files.length||busy)return;busy=true;read.disabled=true;preview.replaceChildren();proposals.clear();let count=0;
  try{
   for(const file of files){
    status.textContent=L('جارٍ قراءة ','Reading ')+file.name;
    let rows;try{rows=await employeeFileRows(file);}catch(error){const note=document.createElement('p');note.textContent=file.name+': '+error.message;preview.append(note);continue;}
    if(rows.length<2)continue;count+=rows.length-1;if(count>50)throw Error(L('الحد 50 صفًا في الدفعة.','Limit: 50 rows per batch.'));
    const headers=Array.from({length:rows[0].length},(_,i)=>rows[0][i]||('Column '+(i+1))),mapping=guessColumns(headers),section=document.createElement('section');section.className='card';
    section.innerHTML='<h3>'+esc(file.name)+'</h3><div class="fields">'+importFields.map(([key,ar,en])=>'<label>'+esc(L(ar,en))+'<select data-map="'+key+'"><option value="-1">'+L('غير موجود','Not available')+'</option>'+headers.map((h,i)=>'<option value="'+i+'"'+(mapping[key]===i?' selected':'')+'>'+esc(h)+'</option>').join('')+'</select></label>').join('')+'</div><button type="button" class="button secondary" data-review>'+L('معاينة البيانات الإضافية','Preview additional data')+'</button><div data-rows></div>';preview.append(section);
    section.querySelector('[data-review]').onclick=()=>{
     if(busy)return;section.dataset.reviewed='true';const area=section.querySelector('[data-rows]');for(const el of area.children)proposals.delete(el);area.replaceChildren();
     const map=Object.fromEntries([...section.querySelectorAll('[data-map]')].map(el=>[el.dataset.map,Number(el.value)]));
     for(const row of rows.slice(1)){
      const source=mappedEmployee(row,map,state),plan=enrichmentPlan(state.staff,source),person=state.staff.find(p=>p.id===plan.staffId),details=document.createElement('details');details.className='employee-import-row';
      const message={unmatched:L('لا يوجد تطابق بالهوية أو البريد؛ لن يُنشأ موظف جديد.','No identity/email match; no new employee will be created.'),ambiguous:L('أكثر من تطابق؛ راجع الهوية والبريد.','Multiple matches; review identity and email.'),conflict:L('الهوية والبريد متعارضان؛ يلزم مراجعة الملف.','Identity and email conflict; review the file.'),unchanged:L('لا توجد بيانات ناقصة يمكن استكمالها.','No missing fields to fill.')}[plan.status];
      details.innerHTML='<summary>'+esc(person?.nameAr||person?.name||source.nameAr||source.nameEn||source.email||L('صف غير مطابق','Unmatched row'))+' · '+(plan.status==='matched'?Object.keys(plan.changes).length+' '+L('حقول ناقصة','missing fields'):esc(message))+'</summary>'+(plan.status==='matched'?'<div class="fields">'+Object.entries(plan.changes).map(([key,value])=>{const field=importFields.find(f=>f[0]===key);const display=key==='branchId'?state.locations.find(l=>l.id===value)?.name||value:value;return '<label><input type="checkbox" data-field="'+key+'" checked> '+esc(L(field[1],field[2]))+'<bdi>'+esc(display)+'</bdi></label>';}).join('')+'</div>':'')+'<p data-result role="status"></p>';
      area.append(details);if(plan.status==='matched')proposals.set(details,{source,staffId:plan.staffId});
     }
    };
   }
   if(count){const confirm=document.createElement('button');confirm.type='button';confirm.className='button primary';confirm.textContent=L('تأكيد استكمال البيانات الناقصة','Confirm filling missing data');preview.append(confirm);
    confirm.onclick=async()=>{
     if(busy)return;if([...preview.querySelectorAll('section')].some(s=>!s.dataset.reviewed)){status.textContent=L('افتح معاينة كل ملف أولًا.','Preview every file first.');return;}
     const selected=[...proposals].filter(([el])=>!el.dataset.updated&&el.querySelector('[data-field]:checked'));if(!selected.length){status.textContent=L('لا توجد حقول محددة للاستكمال.','No fields selected.');return;}
     busy=true;confirm.disabled=read.disabled=true;let updated=0;
     try{for(const [el,data]of selected){const fields=[...el.querySelectorAll('[data-field]:checked')].map(f=>f.dataset.field),result=el.querySelector('[data-result]');try{
       const response=await fetch(companyPrefix+'/api/staff/enrich',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,fields})}),body=await response.json();if(!response.ok)throw Error(body.error);
       el.dataset.updated='true';el.querySelectorAll('input').forEach(f=>f.disabled=true);result.textContent=L('تم استكمال البيانات.','Missing data updated.');updated++;
      }catch(error){el.open=true;result.textContent=error.message;}}
      status.textContent=L('تم تحديث ','Updated ')+updated+L(' صفوف. راجع نتيجة كل صف.',' rows. Review each result.');await onComplete();
     }finally{busy=false;confirm.disabled=read.disabled=false;}
    };
   }
   status.textContent=L('راجع مطابقة الأعمدة ثم افتح المعاينة قبل التأكيد.','Review column mapping and open the preview before confirming.');
  }catch(error){status.textContent=error.message;preview.querySelectorAll('button').forEach(b=>b.disabled=true);}finally{busy=false;read.disabled=false;}
 };
}
