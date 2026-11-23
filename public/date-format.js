const validIso=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function dateText(value,{timeZone='Asia/Riyadh'}={}){
 if(value===null||value===undefined||value==='')return '';
 if(typeof value==='string'&&validIso(value))return value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4);
 if(value instanceof Date||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)){
  const parsed=new Date(value);if(!Number.isFinite(parsed.getTime()))return String(value);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',calendar:'gregory',numberingSystem:'latn',timeZone}).formatToParts(parsed).map(p=>[p.type,p.value]));
  return parts.day+'/'+parts.month+'/'+parts.year;
 }
 return String(value);
}
export function parseDateText(value){
 const text=String(value??'').trim().replace(/[٠-٩۰-۹]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.includes(c)?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
 const m=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)??text.match(/^(\d{2})(\d{2})(\d{4})$/);if(!m)return null;
 const iso=m[3]+'-'+m[2]+'-'+m[1];return validIso(iso)?iso:null;
}
export function readableDateText(value){
 const text=String(value??'');
 if(/https?:\/\/|[\w.+-]+@[\w.-]+|\.(?:pdf|xlsx?|csv|png|jpe?g|docx?|zip)\b/i.test(text))return text;
 return text.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g,iso=>dateFormatter('en-GB',{timeStyle:'short',timeZone:'Asia/Riyadh'}).format(iso)).replace(/\b\d{4}-\d{2}-\d{2}\b/g,iso=>dateText(iso));
}
export function dateFormatter(locale='en-GB',options={}){
 const timeZone=options.timeZone??'UTC';
 return {format(value){
  const parsed=new Date(value);if(!Number.isFinite(parsed.getTime()))return '—';
  let text=dateText(parsed,{timeZone});
  if(options.weekday||options.dateStyle==='full')text=new Intl.DateTimeFormat(locale,{weekday:options.weekday??'long',timeZone,calendar:'gregory'}).format(parsed)+' · '+text;
  if(options.timeStyle)text+=' · '+new Intl.DateTimeFormat(locale,{timeStyle:options.timeStyle,timeZone}).format(parsed);
  return text;
 },formatRange(start,end){return this.format(start)+' — '+this.format(end);}};
}
