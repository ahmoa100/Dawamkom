const vendor='/vendor/document-reader/';
export const documentMaxBytes = 10 * 1024 * 1024;
const hijriFormatter=new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
const hijriCache=new Map();
export function hijriToGregorian(year,month,day){
 if(!Number.isInteger(year)||year<1356||year>1500||month<1||month>12||day<1||day>30)return null;
 const key=[year,month,day].join('-');if(hijriCache.has(key))return hijriCache.get(key);
 const approximate=Math.floor(year*0.970224+621.5774),target=year*10000+month*100+day;
 let low=Math.floor(Date.UTC(approximate-2,0,1)/86400000),high=Math.floor(Date.UTC(approximate+3,0,1)/86400000),result=null;
 while(low<=high){const mid=Math.floor((low+high)/2),parts=Object.fromEntries(hijriFormatter.formatToParts(mid*86400000).map(p=>[p.type,p.value])),value=Number(parts.year)*10000+Number(parts.month)*100+Number(parts.day);
  if(value===target){result=new Date(mid*86400000).toISOString().slice(0,10);break;}if(value<target)low=mid+1;else high=mid-1;
 }
 hijriCache.set(key,result);return result;
}
export function expiryCandidates(text) {
 const normalized=String(text).normalize('NFKC').replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069ـ\u064b-\u065f]/g,'').replace(/[٠-٩۰-۹]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.includes(c)?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
 const dates=[];
 for(const match of normalized.matchAll(/\b(\d{1,4})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{1,4})\b/g)) {
  const [a,b,c]=match.slice(1).map(Number),year=a>=1300?a:c,month=b,day=a>=1300?c:a;
  const calendar=year>=1356&&year<=1500?'hijri':'gregorian';
  if(month<1||month>12||day<1||day>31)continue;
  const originalDate=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  let date;
  if(calendar==='hijri')date=hijriToGregorian(year,month,day);
  else if(year>=1900&&year<=2200){const parsed=new Date(originalDate+'T00:00:00Z');if(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===originalDate)date=originalDate;}
  if(!date)continue;
  // Keep context on the same printed line, so an issue date on a nearby row is not labelled expiry.
  const before=normalized.slice(Math.max(0,match.index-90),match.index).split('\n').at(-1),after=normalized.slice(match.index+match[0].length,match.index+match[0].length+90).split('\n')[0];
  const context=(before+match[0]+after).replace(/\s+/g,' ');
  const labelled=/(انتهاء|الانقضاء|تنتهي|ينتهي|سارية.{0,20}حتى|صالح.{0,30}(حتى|تنتهي)|expir|valid.{0,12}(until|to))/i.test(before+' '+after);
  const existing=dates.find(item=>item.date===date);
  if(existing){existing.labelled ||= labelled;if(calendar==='hijri')Object.assign(existing,{calendar,originalDate});}
  else dates.push({date,calendar,originalDate,context,labelled});
 }
 return dates.sort((a,b)=>Number(b.labelled)-Number(a.labelled)).slice(0,12);
}
export function labelDatesByNearbyWords(dates,words,pageWidth){
 const found=[];
 for(const word of words){const label=String(word.text??'').normalize('NFKC').replace(/[ـ\u064b-\u065f]/g,'');
  if(!/(تنتهي|ينتهي|انتهاء|expir)/i.test(label)||!word.bbox)continue;
  const b=word.bbox,arabic=/[\u0600-\u06ff]/.test(label),cy=(b.y0+b.y1)/2;
  const nearby=dates.filter(d=>Math.abs((d.bbox.y0+d.bbox.y1)/2-cy)<=Math.max(b.y1-b.y0,d.bbox.y1-d.bbox.y0)*1.4&&(arabic?(d.bbox.x0+d.bbox.x1)/2<b.x0:(d.bbox.x0+d.bbox.x1)/2>b.x1)).map(d=>({...d,distance:arabic?Math.max(0,b.x0-d.bbox.x1):Math.max(0,d.bbox.x0-b.x1)})).filter(d=>d.distance<pageWidth*.35).sort((a,b)=>a.distance-b.distance);
  if(nearby.length&&(!nearby[1]||nearby[1].distance-nearby[0].distance>10)){const {bbox,distance,...date}=nearby[0];if(!found.some(d=>d.date===date.date))found.push({...date,labelled:true,context:label+' · '+date.originalDate,labelSource:'ocr-layout'});}
 }
 return found;
}
const recognizedWords=data=>(data.blocks??[]).flatMap(block=>(block.paragraphs??[]).flatMap(paragraph=>(paragraph.lines??[]).flatMap(line=>line.words??[])));
let library;
async function ocrLibrary(){
 if(!library)library=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=vendor+'tesseract.min.js';script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{library=null;reject(Error('Could not load document reader.'));};document.head.append(script);});
 return library;
}
export async function readDocument(file,onProgress=()=>{}) {
 if(!file||file.size>documentMaxBytes||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw Error('Choose a PDF, PNG or JPEG up to 10 MB.');
 let worker,pdf,task;
 const recognize=async source=>{
  if(!worker){const lib=await ocrLibrary();worker=await lib.createWorker('ara+eng',1,{workerPath:vendor+'worker.min.js',corePath:vendor,langPath:vendor,workerBlobURL:false,logger:m=>onProgress(m.status,Math.round((m.progress??0)*100))});}
  const result=await worker.recognize(source,{}, {blocks:true});return result.data;
 };
 try {
  let text='',layoutCandidates=[];
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
      await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
      const recognized=await recognize(canvas);text+='\n'+recognized.text;
      const nativeDates=content.items.flatMap(item=>{const found=expiryCandidates(item.str??'');if(found.length!==1)return [];const [x0,y0]=view.convertToViewportPoint(item.transform[4],item.transform[5]),[x1,y1]=view.convertToViewportPoint(item.transform[4]+item.width,item.transform[5]+item.height);return [{...found[0],bbox:{x0:Math.min(x0,x1),x1:Math.max(x0,x1),y0:Math.min(y0,y1),y1:Math.max(y0,y1)}}];});
      layoutCandidates.push(...labelDatesByNearbyWords(nativeDates,recognizedWords(recognized),canvas.width));
      canvas.width=canvas.height=0;
    }
   }
   const candidates=expiryCandidates(text);for(const recovered of layoutCandidates){const i=candidates.findIndex(c=>c.date===recovered.date);if(i<0)candidates.push(recovered);else candidates[i]={...candidates[i],...recovered};}candidates.sort((a,b)=>Number(b.labelled)-Number(a.labelled));
   return {text,candidates,limited:pdf.numPages>5};
  }
  text=(await recognize(file)).text;return {text,candidates:expiryCandidates(text),limited:false};
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
   if(!file.size)throw Error(L('الملف فارغ.','The file is empty.'));
   if(file.size>documentMaxBytes)throw Error(L('حجم الملف يتجاوز 10 ميجابايت.','The file exceeds 10 MB.'));
   if(!['application/pdf','image/png','image/jpeg'].includes(file.type))throw Error(L('صيغة الملف غير مدعومة؛ اختر PDF أو PNG أو JPEG.','Unsupported file type; choose PDF, PNG or JPEG.'));
   let result;try{result=await reader(file);}catch{result={candidates:[],failed:true};}
   // Unlabelled dates may be issue/birth dates: never treat them as expiry automatically.
   const labelled=result.candidates.filter(item=>item.labelled);
   const suggestedExpiresOn=labelled.length===1?labelled[0].date:'';
   const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
   const suggestedHijri=labelled.length===1&&labelled[0].calendar==='hijri'?labelled[0].originalDate:'';
   await upload({name:file.name,mime:file.type,data:btoa(binary),expiresOn:'',suggestedExpiresOn,suggestedHijri});
   results.push({name:file.name,uploaded:true,suggestedExpiresOn});
  }catch(error){results.push({name:file.name,error:error.message});}
 }
 return results;
}
