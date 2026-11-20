const vendor='/vendor/document-reader/';
export function expiryCandidates(text) {
 const normalized=String(text).replace(/[٠-٩۰-۹]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.includes(c)?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
 const dates=[];
 for(const match of normalized.matchAll(/\b(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})\b/g)) {
  const [a,b,c]=match.slice(1).map(Number),year=a>=1900?a:c,month=b,day=a>=1900?c:a;
  if(year<1900||year>2200||month<1||month>12||day<1||day>31)continue;
  const date=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)continue;
  const context=normalized.slice(Math.max(0,match.index-65),match.index+match[0].length+35).replace(/\s+/g,' ');
  const labelled=/(انتهاء|الانقضاء|سارية.{0,12}حتى|صالح.{0,12}حتى|expir|valid.{0,12}(until|to))/i.test(context);
  if(!dates.some(item=>item.date===date))dates.push({date,context,labelled});
 }
 return dates.sort((a,b)=>Number(b.labelled)-Number(a.labelled)).slice(0,12);
}
let library;
async function ocrLibrary(){
 if(!library)library=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=vendor+'tesseract.min.js';script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{library=null;reject(Error('Could not load document reader.'));};document.head.append(script);});
 return library;
}
export async function readDocument(file,onProgress=()=>{}) {
 if(!file||file.size>2*1024*1024||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw Error('Choose a PDF, PNG or JPEG up to 2 MB.');
 let worker,pdf,task;
 const recognize=async source=>{
  if(!worker){const lib=await ocrLibrary();worker=await lib.createWorker('ara+eng',1,{workerPath:vendor+'worker.min.js',corePath:vendor,langPath:vendor,workerBlobURL:false,logger:m=>onProgress(m.status,Math.round((m.progress??0)*100))});}
  const result=await worker.recognize(source);return result.data.text;
 };
 try {
  let text='';
  if(file.type==='application/pdf') {
   const lib=await import('/vendor/document-reader/pdf.mjs');lib.GlobalWorkerOptions.workerSrc=vendor+'pdf.worker.mjs';
   task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});pdf=await task.promise;
   for(let i=1;i<=Math.min(pdf.numPages,5);i++){
    onProgress('page',i);const page=await pdf.getPage(i),content=await page.getTextContent();
    const extracted=content.items.map(item=>item.str??'').join(' ');text+='\n'+extracted;
    if(!expiryCandidates(extracted).some(item=>item.labelled)){
      const viewport=page.getViewport({scale:1.5});const canvas=document.createElement('canvas');canvas.width=Math.min(2400,Math.ceil(viewport.width));canvas.height=Math.ceil(viewport.height*canvas.width/viewport.width);
      const view=page.getViewport({scale:canvas.width/page.getViewport({scale:1}).width});
      await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;text+='\n'+await recognize(canvas);canvas.width=canvas.height=0;
    }
   }
   return {candidates:expiryCandidates(text),limited:pdf.numPages>5};
  }
  text=await recognize(file);return {candidates:expiryCandidates(text),limited:false};
 } finally {await worker?.terminate();await task?.destroy();}
}
export function mountDocumentReader(form,language) {
 const ar=language==='ar',L=(a,b)=>ar?a:b;
 const row=document.createElement('div');row.className='document-reader';
 const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent=L('قراءة تاريخ الانتهاء مجانًا','Read expiry date for free');
 const status=document.createElement('p');status.className='hint';status.setAttribute('role','status');
 status.textContent=L('تتم القراءة على جهازك. راجع التاريخ المقترح قبل اعتماده.','Read locally on your device. Review any suggested date before accepting.');
 const results=document.createElement('div');row.append(button,status,results);form.elements.file.closest('label').after(row);
 let generation=0;
 form.addEventListener('reset',()=>{generation++;results.replaceChildren();status.textContent=L('تتم القراءة على جهازك؛ اختر مستندًا ثم ابدأ القراءة.','Read locally: choose a document, then start reading.');});
 form.elements.file.addEventListener('change',()=>{generation++;results.replaceChildren();status.textContent=L('اختر قراءة المستند لاقتراح التاريخ.','Read the selected document to suggest a date.');});
 button.onclick=async()=>{
  const token=++generation,file=form.elements.file.files[0];if(!file){status.textContent=L('اختر مستندًا أولًا.','Choose a document first.');return;}
  button.disabled=true;results.replaceChildren();status.textContent=L('جارٍ تحميل القارئ وقراءة المستند… قد تستغرق القراءة الأولى وقتًا.','Loading reader and reading document… The first read may take a while.');
  try{
   const result=await readDocument(file);if(token!==generation||!form.isConnected)return;
   status.textContent=L('تواريخ مقترحة تحتاج مراجعتك؛ لا يتم حفظ أي تاريخ تلقائيًا. التواريخ الهجرية تُدخل يدويًا بعد التحقق.','Review suggested dates; nothing is saved automatically. Verify Hijri dates and enter the Gregorian date manually.')+(result.limited?L(' تمت قراءة أول خمس صفحات فقط.',' Only the first five pages were read.'):'');
   if(!result.candidates.length){status.textContent=L('لم نجد تاريخًا ميلاديًا واضحًا. أدخل تاريخ الانتهاء يدويًا بعد مراجعة المستند.','No clear Gregorian date found. Review the document and enter expiry manually.');return;}
   for(const candidate of result.candidates){const item=document.createElement('div'),choice=document.createElement('button'),context=document.createElement('small');
    choice.type='button';choice.className='button secondary compact';choice.textContent=candidate.date+' · '+L('استخدام بعد المراجعة','Use after review');
    context.textContent=candidate.context;item.append(choice,context);results.append(item);
    choice.onclick=()=>{form.elements.expiresOn.value=candidate.date;status.textContent=L('تم اختيار التاريخ. راجعه ثم احفظ المستند.','Date selected. Verify it and save the document.');};
   }
  }catch{if(token===generation)status.textContent=L('تعذرت قراءة المستند. يمكنك إدخال التاريخ يدويًا.','Reading failed. You can enter the date manually.');}
  finally{button.disabled=false;}
 };
}
