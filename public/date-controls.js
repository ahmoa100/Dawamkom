import {dateText,parseDateText,readableDateText} from './date-format.js';
const installed=new WeakSet();
function formatTextDates(root){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode()){
  if(node.parentElement?.closest('script,style,textarea,code,pre,[data-raw-date]'))continue;
  const text=readableDateText(node.nodeValue);if(text!==node.nodeValue)node.nodeValue=text;
 }
}
function attachCalendar(wrapper,picker,original,commit){
 const panel=document.createElement('div');
 panel.className='date-calendar';
 panel.setAttribute('popover','auto');
 const arabic=()=>document.documentElement.lang==='ar';
 const words=(ar,en)=>arabic()?ar:en;
 const button=(text,label=text)=>{
  const item=document.createElement('button');
  item.type='button';item.textContent=text;item.setAttribute('aria-label',label);
  return item;
 };
 let month;
 const step=offset=>{
  month.setUTCMonth(month.getUTCMonth()+offset);
  draw();
  panel.querySelector(offset<0?'[data-prev]':'[data-next]').focus();
 };
 const bound=iso=>(!original.min||iso>=original.min)&&(!original.max||iso<=original.max);
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh'}).format(new Date());
 const choose=iso=>{
  panel.hidePopover();
  picker.focus();
  commit(iso);
 };
 function draw(){
  const locale=arabic()?'ar-SA':'en-GB';
  const format=options=>new Intl.DateTimeFormat(locale,{timeZone:'UTC',calendar:'gregory',...options});
  const prev=button('‹',words('الشهر السابق','Previous month')),next=button('›',words('الشهر التالي','Next month'));
  prev.dataset.prev='';next.dataset.next='';
  prev.onclick=()=>step(-1);next.onclick=()=>step(1);
  const title=document.createElement('strong');
  title.setAttribute('aria-live','polite');
  title.textContent=format({month:'long',year:'numeric'}).format(month);
  const header=document.createElement('div');
  header.className='date-calendar-header';header.append(prev,title,next);
  const grid=document.createElement('div');grid.className='date-calendar-grid';
  for(let i=0;i<7;i++){
   const weekday=document.createElement('span');
   weekday.textContent=format({weekday:'short'}).format(new Date(Date.UTC(2024,0,7+i)));
   grid.append(weekday);
  }
  for(let i=0;i<month.getUTCDay();i++)grid.append(document.createElement('span'));
  const last=new Date(month);last.setUTCMonth(last.getUTCMonth()+1,0);
  const todayIso=today();
  for(let i=1;i<=last.getUTCDate();i++){
   const date=new Date(month);date.setUTCDate(i);
   const iso=date.toISOString().slice(0,10);
   const day=button(String(i),format({dateStyle:'full'}).format(date));
   day.disabled=!bound(iso);
   day.setAttribute('aria-pressed',String(original.value===iso));
   if(iso===todayIso)day.setAttribute('aria-current','date');
   day.onclick=()=>choose(iso);
   grid.append(day);
  }
  const now=button(words('اليوم','Today'));now.disabled=!bound(todayIso);
  now.onclick=()=>choose(todayIso);
  panel.replaceChildren(header,grid,now);
 }
 wrapper.append(panel);
 function open(){
  if(!panel.showPopover||original.disabled||original.readOnly)return;
  if(panel.matches(':popover-open')){panel.hidePopover();return;}
  month=new Date((original.value||today()).slice(0,7)+'-01T00:00:00Z');
  draw();
  panel.showPopover();
  const rect=picker.getBoundingClientRect(),size=panel.getBoundingClientRect();
  panel.style.left=Math.max(8,Math.min(rect.right-size.width,innerWidth-size.width-8))+'px';
  panel.style.top=Math.max(8,rect.bottom+size.height+8<=innerHeight?rect.bottom+4:rect.top-size.height-4)+'px';
  (panel.querySelector('[aria-pressed=true]:enabled')??panel.querySelector('[data-prev]')).focus();
 }
 picker.onclick=open;
 if(!panel.showPopover){picker.hidden=true;wrapper.classList.add('date-control-text-only');}
 return open;
}
export function mountDateControls(root=document){
 for(const original of root.querySelectorAll('input[type=date]')){
  if(installed.has(original)||original.dataset.nativeDate==='true')continue;installed.add(original);
  const wrapper=document.createElement('span');wrapper.className='date-control';
  const display=document.createElement('input');display.type='text';display.className='date-control-display';display.placeholder='dd/mm/yyyy';display.inputMode='numeric';display.autocomplete='off';display.dir='ltr';display.maxLength=10;display.lang='en-GB';
  const labelText=original.getAttribute('aria-label')||[...original.labels??[]].map(l=>l.textContent.trim()).join(' ')||original.name||'Date';
  display.setAttribute('aria-label',labelText+' (dd/mm/yyyy)');
  const picker=document.createElement('button');picker.type='button';picker.className='date-control-picker';picker.setAttribute('aria-label',document.documentElement.lang==='ar'?'اختيار التاريخ من التقويم':'Choose date from calendar');picker.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16"/></svg>';
  original.before(wrapper);wrapper.append(display,original,picker);original.classList.add('date-control-native');original.tabIndex=-1;original.setAttribute('aria-hidden','true');
  const nativeValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  const calendarOnly=original.dataset.calendarOnly==='true'&&typeof HTMLElement.prototype.showPopover==='function';
  const sync=()=>{
   display.value=dateText(nativeValue.get.call(original));display.disabled=original.disabled;display.readOnly=original.readOnly||calendarOnly;display.required=original.required;
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
   if(valid&&type==='change')display.value=dateText(iso);
   if(valid)original.dispatchEvent(new Event(type,{bubbles:true}));
  };
  display.addEventListener('input',e=>{e.stopPropagation();commit('input');});
  display.addEventListener('change',e=>{e.stopPropagation();commit('change');});
  display.addEventListener('blur',()=>{if(display.validity.valid)display.value=dateText(original.value);});
  const openCalendar=attachCalendar(wrapper,picker,original,iso=>{
   display.value=dateText(iso);
   commit('change');
  });
  if(calendarOnly){
   display.inputMode='none';
   display.addEventListener('click',openCalendar);
  }
  display.addEventListener('keydown',e=>{if((e.altKey&&e.key==='ArrowDown')||(calendarOnly&&['Enter',' '].includes(e.key))){e.preventDefault();openCalendar();}});

  original.addEventListener('input',e=>{if(e.isTrusted)sync();});original.addEventListener('change',e=>{if(e.isTrusted)sync();});
  original.form?.addEventListener('reset',()=>queueMicrotask(sync));
  new MutationObserver(sync).observe(original,{attributes:true,attributeFilter:['disabled','readonly','required','min','max','value','aria-label']});
 }
}
if(typeof document!=='undefined'){
 const start=()=>{mountDateControls();formatTextDates(document.body);new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length))mountDateControls();formatTextDates(document.body);}).observe(document.body,{childList:true,characterData:true,subtree:true});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
