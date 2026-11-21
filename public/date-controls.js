import {dateText,parseDateText,readableDateText} from './date-format.js';
const installed=new WeakSet();
function formatTextDates(root){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode()){
  if(node.parentElement?.closest('script,style,textarea,code,pre,[data-raw-date]'))continue;
  const text=readableDateText(node.nodeValue);if(text!==node.nodeValue)node.nodeValue=text;
 }
}
export function mountDateControls(root=document){
 for(const original of root.querySelectorAll('input[type=date]')){
  if(installed.has(original)||original.dataset.nativeDate==='true')continue;installed.add(original);
  const wrapper=document.createElement('span');wrapper.className='date-control';
  const display=document.createElement('input');display.type='text';display.className='date-control-display';display.placeholder='dd/mm/yyyy';display.inputMode='numeric';display.autocomplete='off';display.dir='ltr';display.maxLength=10;display.lang='en-GB';
  const labelText=original.getAttribute('aria-label')||[...original.labels??[]].map(l=>l.textContent.trim()).join(' ')||original.name||'Date';
  display.setAttribute('aria-label',labelText+' (dd/mm/yyyy)');
  const picker=document.createElement('button');picker.type='button';picker.className='date-control-picker';picker.setAttribute('aria-label',document.documentElement.lang==='ar'?'اختيار التاريخ من التقويم':'Choose date from calendar');picker.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16"/></svg>';
  picker.onclick=()=>{try{original.showPicker();}catch{display.focus();}};
  original.before(wrapper);wrapper.append(display,original,picker);original.classList.add('date-control-native');original.tabIndex=-1;original.setAttribute('aria-hidden','true');
  const nativeValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  const sync=()=>{
   display.value=dateText(nativeValue.get.call(original));display.disabled=original.disabled;display.readOnly=original.readOnly;display.required=original.required;
   picker.disabled=original.disabled||original.readOnly;
   display.setCustomValidity('');
   const label=original.getAttribute('aria-label');if(label)display.setAttribute('aria-label',label+' (dd/mm/yyyy)');
   if(original.id){display.id=original.id+'-display';for(const label of document.querySelectorAll('label[for]'))if(label.htmlFor===original.id)label.htmlFor=display.id;}
  };
  Object.defineProperty(original,'value',{configurable:true,get(){return nativeValue.get.call(this);},set(value){nativeValue.set.call(this,value);sync();}});
  sync();
  const commit=type=>{
   const entered=display.value,iso=entered?parseDateText(entered):'';
   nativeValue.set.call(original,iso??'');
   const valid=iso!==null&&(!iso||(!original.min||iso>=original.min)&&(!original.max||iso<=original.max));
   display.setCustomValidity(valid?'':document.documentElement.lang==='ar'?'أدخل تاريخًا صحيحًا بصيغة يوم/شهر/سنة ضمن المدة المسموحة.':'Enter a valid dd/mm/yyyy date within the allowed range.');
   original.dispatchEvent(new Event(type,{bubbles:true}));
  };
  display.addEventListener('input',e=>{e.stopPropagation();commit('input');});
  display.addEventListener('change',e=>{e.stopPropagation();commit('change');});
  display.addEventListener('keydown',e=>{if(e.altKey&&e.key==='ArrowDown'){e.preventDefault();try{original.showPicker();}catch{}}});
  original.addEventListener('input',e=>{if(e.isTrusted)sync();});original.addEventListener('change',e=>{if(e.isTrusted)sync();});
  original.form?.addEventListener('reset',()=>queueMicrotask(sync));
  new MutationObserver(sync).observe(original,{attributes:true,attributeFilter:['disabled','readonly','required','min','max','value','aria-label']});
 }
}
if(typeof document!=='undefined'){
 const start=()=>{mountDateControls();formatTextDates(document.body);new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length))mountDateControls();formatTextDates(document.body);}).observe(document.body,{childList:true,characterData:true,subtree:true});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
