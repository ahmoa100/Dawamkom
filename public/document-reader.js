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
    const lines=new Map();for(const item of content.items){const y=Math.round(item.transform?.[5]??0);if(!lines.has(y))lines.set(y,[]);lines.get(y).push(item);}
    const extracted=[...lines.entries()].sort((a,b)=>b[0]-a[0]).map(([,items])=>items.sort((a,b)=>(a.transform?.[4]??0)-(b.transform?.[4]??0)).map(item=>item.str??'').filter(s=>s.trim()).join('\t')).join('\n');text+='\n'+extracted;
    if(!expiryCandidates(extracted).some(item=>item.labelled)){
      const base=page.getViewport({scale:1}),scale=Math.min(1.5,2400/base.width,2400/base.height),viewport=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const view=page.getViewport({scale:canvas.width/page.getViewport({scale:1}).width});
      await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;text+='\n'+await recognize(canvas);canvas.width=canvas.height=0;
    }
   }
   return {text,candidates:expiryCandidates(text),limited:pdf.numPages>5};
  }
  text=await recognize(file);return {text,candidates:expiryCandidates(text),limited:false};
 } finally {await worker?.terminate();await task?.destroy();}
}
// Read and save one file at a time to bound OCR memory and allow partial failures.
export async function uploadDocuments(files,upload,onProgress=()=>{},language='ar',reader=readDocument) {
 const L=(ar,en)=>language==='ar'?ar:en;
 if(!files.length)throw Error(L('اختر مستندًا أولًا.','Choose a document first.'));
 const results=[];
 for(const [index,file] of files.entries()){
  onProgress(`${index+1}/${files.length} · ${file.name} · `+L('جارٍ القراءة والرفع…','Reading and uploading…'));
  try{
   if(!file.size||file.size>2*1024*1024||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw Error('Invalid document.');
   let result;try{result=await reader(file);}catch{result={candidates:[],failed:true};}
   // Unlabelled dates may be issue/birth dates: never treat them as expiry automatically.
   const labelled=result.candidates.filter(item=>item.labelled);
   const suggestedExpiresOn=labelled.length===1?labelled[0].date:'';
   const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   await upload({name:file.name,mime:file.type,data:btoa(binary),expiresOn:'',suggestedExpiresOn});
   results.push({name:file.name,uploaded:true,suggestedExpiresOn});
  }catch(error){results.push({name:file.name,error:error.message});}
 }
 return results;
}
