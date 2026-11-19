import { normalizeSearch, scheduleWeekPlan } from './ux-model.js';

const q = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
export const readPreference = (key, fallback) => { try { return JSON.parse(localStorage.getItem('dawamkom-ux:' + key)) ?? fallback; } catch { return fallback; } };
export const writePreference = (key, value) => { try { localStorage.setItem('dawamkom-ux:' + key, JSON.stringify(value)); } catch { /* Private mode is supported. */ } };
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
let latest;
let tableObservers=[];
const words = (en, ar) => (latest?.language ?? document.documentElement.lang) === 'ar' ? ar : en;
const icons = {
  partners: '<path d="M3 21V3h12v18M15 9h6v12M6 7h6M6 11h6M6 15h6M8 21v-3h3v3"/>',
  edit: '<path d="m4 16 12-12 4 4L8 20l-5 1zM14 6l4 4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-5-5 3-3m-6 0 3-3"/>',
  home: '<path d="m3 11 9-8 9 8M5 9v12h14V9M9 21v-8h6v8"/>',
  requests: '<path d="M7 3h10l4 4v14H7zM17 3v5h4M10 12h8M10 16h8M3 6v13"/>',
  staff: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2"/>',
  attendance: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  leaves: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18m-13 5 3 3 5-5"/>',
  reports: '<path d="M4 21V3h16v18zM8 16v-4M12 16V8M16 16v-6"/>',
  payroll: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 8h2M17 16h2"/>',
  documents: '<path d="M4 5h6l2 3h8v13H4zM4 8h16"/>',
  settings: '<circle cx="12" cy="12" r="4"/><path d="m9 2-1 3-3 1-3 3 2 3-1 4 3 2 3 4 3-1 4 1 2-4 3-2-1-4 2-3-3-3-3-1-1-3z"/>',
  organization: '<path d="M3 21V3h12v18M15 9h6v12M6 7h6M6 11h6M6 15h6M8 21v-3h3v3"/>',
  'punch-methods': '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0"/><circle cx="12" cy="10" r="2"/>',
  'work-schedule': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18M7 14h3M14 17h3"/>',
  'staff-roles': '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 9-5m3 0 5 2v4l-5 3-5-3v-4z"/>',
  'approval-chain': '<path d="M4 5h5v5H4zM15 14h5v5h-5zM9 7h8v7M13 12l4 3 3-3"/>',
  notifications: '<path d="M5 17h14l-2-3V8a5 5 0 0 0-10 0v6zM10 21h4"/>',
};
export function icon(name) { return '<svg viewBox="0 0 24 24" class="ux-icon" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] ?? icons.requests) + '</svg>'; }

export function fieldError(field, message) {
  if (!field) return;
  field.setAttribute('aria-invalid', 'true');
  let note = field.parentElement.querySelector('.ux-field-error');
  if (!note) { note = el('span', '', 'ux-field-error'); note.id = 'field-error-' + crypto.randomUUID(); note.setAttribute('role', 'alert'); field.after(note); }
  note.textContent = message;
  const descriptions = new Set((field.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)); descriptions.add(note.id);
  field.setAttribute('aria-describedby', [...descriptions].join(' '));
  field.focus();
}
export function actionError(message, root = q('dialog[open] form') ?? q('#main')) {
  if (!root) return;
  let note = q('.ux-action-error', root);
  if (!note) { note = el('p', '', 'ux-action-error'); note.setAttribute('role', 'alert'); root.prepend(note); }
  note.textContent = message;
}

function mountFilters(root, { key, items, target, groups = [], statuses = [] }) {
  if (!root || q('.ux-list-toolbar', root)) return;
  const saved = readPreference(key, { search: '', branch: '', status: '' });
  const params=new URLSearchParams(location.hash.split('?')[1]??'');
  for(const name of ['search','branch','status'])if(params.has(name))saved[name]=params.get(name);
  const toolbar = el('div', null, 'ux-list-toolbar');
  const input = el('input'); input.type = 'search'; input.value = saved.search;
  input.placeholder = words('Name, email or phone', 'الاسم، البريد أو الجوال'); input.setAttribute('aria-label', input.placeholder);
  const branch = el('select'); branch.setAttribute('aria-label', words('Branch', 'الفرع'));
  branch.append(new Option(words('All branches', 'كل الفروع'), ''), ...groups.map(item => new Option(item.name, item.id)));
  branch.value = saved.branch;
  const status = el('select'); status.setAttribute('aria-label', words('Status', 'الحالة'));
  status.append(new Option(words('All statuses', 'كل الحالات'), ''), ...statuses.map(([id, name]) => new Option(name, id))); status.value = saved.status;
  const reset = el('button', words('Reset filters', 'مسح المرشحات'), 'button secondary compact'); reset.type = 'button';
  const count = el('output', '', 'ux-result-count'); count.setAttribute('aria-live', 'polite');
  toolbar.append(input); if (groups.length) toolbar.append(branch); if (statuses.length) toolbar.append(status); toolbar.append(reset, count);
  root.prepend(toolbar);
  const empty = el('p', words('No results. Try another name or clear filters.', 'لا توجد نتائج. جرّب اسمًا آخر أو امسح المرشحات.'), 'ux-no-results'); empty.hidden = true; root.append(empty);
  const update = () => {
    const query = normalizeSearch(input.value), filtered = Boolean(query || branch.value || status.value);
    let matches = 0;
    for (const item of items) {
      const visible = (!query || normalizeSearch(item.search).includes(query)) && (!branch.value || item.branch === branch.value) && (!status.value || item.status === status.value);
      const row = target(item); if (row) row.hidden = !visible;
      if (visible) matches++;
    }
    for (const group of all('[data-staff-branch]', root)) {
      const rows = all('tbody tr', group), visible = rows.some(row => !row.hidden);
      group.hidden = !visible;
      if (filtered && visible) group.open = true;
    }
    empty.hidden = matches > 0 || items.length === 0;
    count.textContent = words(`${matches} of ${items.length}`, `${matches} من ${items.length}`) + (filtered ? words(' · filters active', ' · مرشحات مفعّلة') : '');
    reset.disabled = !filtered;
    writePreference(key, { search: input.value, branch: branch.value, status: status.value });
    root.dispatchEvent(new Event('ux-filtered'));
  };
  input.oninput = branch.onchange = status.onchange = update;
  reset.onclick = () => { input.value = branch.value = status.value = ''; history.replaceState(history.state,'',location.pathname+location.hash.split('?')[0]); update(); input.focus(); };
  update();
}

export function mountAttendanceFilters(options=latest) {
  if(!options)return;latest=options;
  const toolbar=q('.attendance-toolbar');if(!toolbar)return;
  const key=options.companyPrefix+':attendance-status';
  let select=q('#ux-attendance-status'),count=q('#ux-attendance-count');
  if(!select){select=el('select');select.id='ux-attendance-status';select.setAttribute('aria-label',words('Attendance status','حالة الحضور'));select.append(new Option(words('All attendance states','كل حالات الحضور'),''),...['Not started','Awaiting clock-in','Working','Present','Incomplete record','Absent','Approved leave','Not required'].map(status=>new Option(options.t(status),status)));const params=new URLSearchParams(location.hash.split('?')[1]??'');select.value=params.get('status')??readPreference(key,'');count=el('output');count.id='ux-attendance-count';count.setAttribute('aria-live','polite');toolbar.append(select,count);}
  const update=()=>{const rows=all('#attendance-results tbody tr');let visible=0;for(const row of rows){row.hidden=Boolean(select.value&&row.cells[1]?.textContent.trim()!==options.t(select.value));if(!row.hidden)visible++;}count.textContent=words(`${visible} employees`,`${visible} موظف`);writePreference(key,select.value);};select.onchange=()=>{history.replaceState(history.state,'',location.pathname+location.hash.split('?')[0]);update();};update();
}

function mountStaff(options) {
  const { state, companyPrefix, staffName, t } = options;
  const root = q('.staff-directory'); if (!root) return;
  const rows = new Map(all('.staff-profile-name', root).map(link => [link.getAttribute('href').split('/')[1], link.closest('tr')]));
  const statuses = [...new Set(state.staff.filter(p => p.status !== 'Removed').map(p => p.status))].map(status => [status, t(status)]);
  mountFilters(root, { key: companyPrefix + ':staff', groups: state.locations, statuses,
    items: state.staff.filter(p => rows.has(p.id)).map(p => ({ id: p.id, branch: p.branchId, status: p.status, search: [p.name,p.nameAr,p.nameEn,p.email,p.phone].join(' ') })), target: item => rows.get(item.id) });
  const savedGroups = readPreference(companyPrefix + ':groups', []);
  for (const group of all('[data-staff-branch]', root)) {
    if (savedGroups.includes(group.dataset.staffBranch)) group.open = true;
    group.addEventListener('toggle', () => writePreference(companyPrefix + ':groups', all('[data-staff-branch][open]', root).map(g => g.dataset.staffBranch)));
  }
  for (const [id, row] of rows) {
    row.classList.add('ux-clickable-row');
    row.addEventListener('click', event => { if (!event.target.closest('a,button,input,select')) q('.staff-profile-name', row).click(); });
  }
  const restore = readPreference(companyPrefix + ':staff-scroll', {});
  for (const [index, wrap] of all('.table-wrap', root).entries()) {
    wrap.scrollTop = restore[index] ?? 0;
    wrap.addEventListener('scroll', () => { restore[index] = wrap.scrollTop; writePreference(companyPrefix + ':staff-scroll', restore); }, { passive: true });
  }
}

function mountDocuments(options) {
  const { state, companyPrefix } = options, root = q('.document-wallet'); if (!root) return;
  const rows = all('tbody tr', root);
  const counts = { expired: 0, soon: 0, valid: 0, none: 0 };
  const items = (state.documents ?? []).map((document, index) => {
    const status = !document.expiresOn ? 'none' : document.expiresOn < state.today ? 'expired' : Date.parse(document.expiresOn) - Date.parse(state.today) <= 30 * 86400000 ? 'soon' : 'valid';
    counts[status]++; return { index, search: document.name, status };
  });
  mountFilters(root, { key: companyPrefix + ':documents', items, target: item => rows[item.index], statuses: [
    ['expired', words('Expired', 'منتهي')], ['soon', words('Expiring within 30 days', 'ينتهي خلال 30 يومًا')], ['valid', words('Valid', 'ساري')], ['none', words('No expiry date', 'بلا تاريخ انتهاء')],
  ].map(([key, label]) => [key, label + ' (' + counts[key] + ')']) });
  if (!items.length) root.append(el('p', words('Upload a PDF, PNG or JPEG up to 2 MB. Add an expiry date to receive reminders.', 'ارفع PDF أو PNG أو JPEG حتى 2 ميجابايت. أضف تاريخ انتهاء لتفعيل التنبيه.'), 'hint'));
  for (const [index, row] of rows.entries()) {
    const documentRecord = state.documents[index];
    const actions = el('div', null, 'actions');
    const preview = el('button', words('Preview','معاينة'),'button secondary compact'), replace = el('button',words('Replace / renew','استبدال / تجديد'),'button secondary compact'); preview.type=replace.type='button';
    actions.append(preview,replace); row.cells[0].append(actions);
    preview.onclick=async()=>{
      preview.disabled=true;
      try {
        const response=await fetch(companyPrefix+'/api/documents?id='+encodeURIComponent(documentRecord.id)); if(!response.ok)throw Error(words('Could not load the document.','تعذّر تحميل المستند.'));
        const blob=await response.blob(), url=URL.createObjectURL(blob), dialog=el('dialog',null,'catalog-dialog ux-document-preview');
        const close=el('button',words('Close','إغلاق'),'button secondary');close.onclick=()=>dialog.close();
        const frame=el(documentRecord.mime==='application/pdf'?'iframe':'img'); frame.src=url;frame.setAttribute('title',documentRecord.name);if(frame.tagName==='IMG')frame.alt=documentRecord.name;
        dialog.append(el('h2',documentRecord.name),close,frame);document.body.append(dialog);dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);dialog.remove();});dialog.showModal();
      } catch(error){actionError(error.message,root);}finally{preview.disabled=false;}
    };
    replace.onclick=()=>{
      const dialog=q('#document-upload-dialog'),form=q('form',dialog);form.reset();form.dataset.replaceId=documentRecord.id;
      q('h2',dialog).textContent=words('Replace / renew document','استبدال / تجديد المستند'); form.elements.expiresOn.value=documentRecord.expiresOn??'';
      dialog.showModal();
    };
  }
}

export function mountRequestFilters(options = latest) {
  if (!options) return;
  latest=options;
  const panel=q('#manager-device-requests');if(!panel||q('.ux-list-toolbar',panel))return;
  const rows=all('tbody tr',panel),key=options.companyPrefix+':requests';
  const saved=readPreference(key,{search:'',type:'',from:'',to:''}),toolbar=el('div',null,'ux-list-toolbar');
  const search=el('input');search.type='search';search.placeholder=words('Search employee or request','ابحث بالموظف أو الطلب');search.setAttribute('aria-label',search.placeholder);search.value=saved.search;
  const type=el('select');type.setAttribute('aria-label',words('Request type','نوع الطلب'));type.append(new Option(words('All request types','كل أنواع الطلبات'),''),...(options.state.leaveTypes??[]).concat(['Missed punch','Attendance excuse','Loan request','Shift change','Leave cancellation','Browser change']).map(value=>new Option(options.t(value),options.t(value))));type.value=saved.type;
  const from=el('input'),to=el('input');for(const [field,label,value]of [[from,words('Submitted from','تاريخ التقديم من'),saved.from],[to,words('Submitted to','تاريخ التقديم إلى'),saved.to]]){field.type='date';field.setAttribute('aria-label',label);field.value=value;}
  const reset=el('button',words('Reset filters','مسح المرشحات'),'button secondary compact');reset.type='button';const count=el('output');count.setAttribute('aria-live','polite');
  toolbar.append(search,type,from,to,reset,count);q('.request-filters',panel)?.after(toolbar);
  const update=()=>{let visible=0;for(const row of rows){const date=row.cells[4]?.textContent??'';row.hidden=!normalizeSearch(row.textContent).includes(normalizeSearch(search.value))||(type.value&&!row.cells[1]?.textContent.includes(type.value))||(from.value&&date<from.value)||(to.value&&date>to.value);if(!row.hidden)visible++;}count.textContent=words(`${visible} requests`,`${visible} طلب`);writePreference(key,{search:search.value,type:type.value,from:from.value,to:to.value});};
  search.oninput=type.onchange=from.onchange=to.onchange=update;reset.onclick=()=>{search.value=type.value=from.value=to.value='';update();};update();
}

function columnChooser(options) {
  if(!location.hash.startsWith('#reports/')&&!location.hash.startsWith('#leaves'))return;
  for(const wrap of all('.table-wrap')){
    const table=q('table',wrap),headers=all('thead tr:last-child th',table);if(headers.length<4||q('.ux-columns',wrap.parentElement))continue;
    const key=options.companyPrefix+':columns:'+location.hash,hidden=new Set(readPreference(key,[]));
    const menu=el('details',null,'ux-columns');menu.append(el('summary',words('Columns','الأعمدة'),'button secondary compact'));
    const choices=el('div',null,'ux-column-options');menu.append(choices);wrap.before(menu);
    const boxes=headers.map((header,index)=>{const label=el('label'),box=el('input');box.type='checkbox';box.checked=!hidden.has(index);box.disabled=index===0;label.append(box,document.createTextNode(header.textContent));choices.append(label);return box;});
    const apply=()=>{const invisible=boxes.flatMap((box,index)=>box.checked?[]:[index]);for(const row of all('tbody tr,thead tr:last-child',table))[...row.cells].forEach((cell,index)=>cell.hidden=invisible.includes(index));for(const row of all('thead tr:not(:last-child)',table)){let index=0;for(const cell of row.cells){const original=Number(cell.dataset.uxColspan??cell.colSpan);cell.dataset.uxColspan=String(original);const visible=Array.from({length:original},(_,i)=>index+i).filter(i=>!invisible.includes(i)).length;cell.hidden=!visible;cell.colSpan=Math.max(1,visible);index+=original;}}writePreference(key,invisible);};boxes.forEach(box=>box.onchange=apply);apply();
  }
}

function mountPartners(options) {
  const root=q('.partners-card');if(!root)return;
  const rows=all('tbody tr',root),items=options.state.partners.map((p,index)=>({index,search:[p.name,p.email,p.contactName,p.phone].join(' '),status:p.suspended?'Suspended':p.active?'Active':'Pending activation'}));
  mountFilters(root,{key:'partners',items,target:item=>rows[item.index],statuses:['Active','Pending activation','Suspended'].map(status=>[status,options.t(status)])});
  const headers=all('thead th',root);if(headers[5])headers[5].textContent=words('Company access','إتاحة الحساب');if(headers[6])headers[6].textContent=words('Company actions','إجراءات الشركة');
}

function datePresets(options) {
  for(const form of all('dialog form')) {
    const start=form.elements.start,end=form.elements.end;
    if(!start||!end||start.type!=='date'||q('.ux-period-presets',form))continue;
    const label=el('label',words('Quick period','فترة سريعة'),'ux-period-presets'),select=el('select');
    select.append(new Option(words('Custom dates','تاريخ مخصص'),''),new Option(words('Current month','الشهر الحالي'),'0'),new Option(words('Previous month','الشهر السابق'),'1'),new Option(words('Last three months','آخر ثلاثة أشهر'),'3'));
    label.append(select);form.prepend(label);
    select.onchange=()=>{if(select.value==='')return;const date=new Date(options.state.today+'T00:00:00Z'),first=new Date(date);first.setUTCDate(1);if(select.value==='1')first.setUTCMonth(first.getUTCMonth()-1);if(select.value==='3')first.setUTCMonth(first.getUTCMonth()-2);const last=select.value==='1'?new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),0)):new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0));start.value=first.toISOString().slice(0,10);end.value=last.toISOString().slice(0,10);for(const field of [start,end]){field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));}};
  }
}

function appearanceSettings() {
  all('.ux-appearance').forEach(card=>card.remove());
  const dropdown=q('.account-dropdown'),topbar=q('.management-topbar-actions');
  const host=q('#account-menu')?.hidden && location.pathname.includes('super-admin') ? topbar : dropdown;
  if(!host)return;
  let row=q('.ux-theme-menu',host);
  if(!row){
    row=el('div',null,'ux-theme-menu');
    const label=el('span');label.dataset.themeLabel='';
    const toggle=el('button',null,'ux-theme-switch');toggle.type='button';toggle.dataset.themeToggle='';toggle.setAttribute('role','switch');toggle.append(el('span'));
    toggle.onclick=()=>window.dawamkomTheme?.set(window.dawamkomTheme.get()==='light'?'dark':'light');
    row.append(label,toggle);
    const language=q('#account-language-slot',host);if(language)language.after(row);else host.append(row);
  }
  q('[data-theme-label]',row).textContent=words('Light mode','الوضع الفاتح');
  const toggle=q('[data-theme-toggle]',row);toggle.setAttribute('aria-label',words('Light mode','الوضع الفاتح'));toggle.setAttribute('aria-checked',String(window.dawamkomTheme?.get()==='light'));
}

function scheduleTools(options) {
  const root = q('.weekly-schedule'); if (!root) return;
  const toolbar = el('div', null, 'ux-list-toolbar'), copy = el('button', words('Copy last week…', 'نسخ الأسبوع السابق…'), 'button secondary');
  const assign = el('button', words('Assign to employees…', 'إسناد لموظفين…'), 'button secondary'); copy.type = assign.type = 'button';
  toolbar.append(copy, assign); root.insertBefore(toolbar, q('.schedule-search', root));
  const open = copying => {
    const dialog = el('dialog', null, 'catalog-dialog'); dialog.setAttribute('aria-label', copying ? copy.textContent : assign.textContent);
    const heading = el('h2', copying ? copy.textContent : assign.textContent), form = el('form');
    const start = new Date(options.state.today + 'T00:00:00Z'); start.setUTCDate(start.getUTCDate() - start.getUTCDay() + options.scheduleWeek * 7);
    const day = start.toISOString().slice(0,10), date = el('p', day + ' → ' + new Date(+start+6*86400000).toISOString().slice(0,10), 'hint');
    const search = el('input'); search.type = 'search'; search.placeholder = words('Search employees', 'بحث الموظفين'); search.setAttribute('aria-label', search.placeholder);
    const people = el('fieldset', null, 'ux-bulk-people'); people.append(el('legend', words('Employees', 'الموظفون')));
    for (const person of options.state.staff.filter(p => ['Active','Pending activation'].includes(p.status))) {
      const label = el('label'), box = el('input'); box.type = 'checkbox'; box.value = person.id; box.name = 'people'; label.append(box, document.createTextNode(options.staffName(person))); people.append(label);
    }
    search.oninput = () => all('label', people).forEach(label => label.hidden = !normalizeSearch(label.textContent).includes(normalizeSearch(search.value)));
    const periods = el('fieldset',null,'ux-bulk-periods'); periods.append(el('legend', words('Periods', 'الفترات')));
    for (const period of options.state.workPeriods ?? []) {
      const label=el('label',null,'ux-bulk-period'),box=el('input'),details=el('span');
      box.type='checkbox';box.name='periods';box.value=period.id;
      details.append(el('strong',period.name));
      if(period.start&&period.end)details.append(el('small',period.start+' – '+period.end));
      label.append(box,details);periods.append(label);
    }
    const submit=el('button',words('Apply','تطبيق'),'button primary'),cancel=el('button',words('Cancel','إلغاء'),'button secondary');
    submit.type='submit';cancel.type='button';cancel.onclick=()=>dialog.close();
    const actions=el('div',null,'ux-bulk-actions');actions.append(cancel,submit);
    form.append(search,people);if(!copying)form.append(periods);form.append(date,actions);dialog.append(heading,form);document.body.append(dialog);
    form.onsubmit=async event=>{
      event.preventDefault();
      const ids=all('input[name=people]:checked',form).map(box=>box.value),periodIds=all('input[name=periods]:checked',form).map(box=>box.value);
      if(!ids.length||(!copying&&!periodIds.length)){actionError(words('Choose employees and at least one period.','اختر الموظفين وفترة واحدة على الأقل.'),form);return;}
      const batch=scheduleWeekPlan(options.state,ids,day,{copy:copying,periodIds});
      submit.disabled=true;
      try{await options.save('work-assignments',{batch});form.dataset.uxDirty='';dialog.close();}
      catch(error){actionError(error.message,form);}
      finally{submit.disabled=false;}
    };
    dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
  };
  copy.onclick = () => open(true); assign.onclick = () => open(false);
}

export function mountManagerUX(options) {
  latest = options;
  tableObservers.forEach(observer=>observer.disconnect());tableObservers=[];
  const { state, companyPrefix, superAdmin } = options;
  for (const wrap of all('.table-wrap')) { wrap.tabIndex = 0; wrap.setAttribute('role','region'); wrap.setAttribute('aria-label', (q('h1')?.textContent ?? words('Data','البيانات')) + ' · ' + words('Scrollable table','جدول قابل للتمرير')); }
  for(const table of all('.table-wrap table')){
    const first=q('thead tr:last-child th',table);
    if(first&&/^(Employee number|Staff ID|الرقم الوظيفي|رقم الموظف)$/i.test(first.textContent.trim())){
      table.classList.add('ux-freeze-two');
      const position=()=>table.style.setProperty('--ux-identity-offset',first.getBoundingClientRect().width+'px');
      const observer=new ResizeObserver(position);observer.observe(first);tableObservers.push(observer);position();
    }
  }
  for (const link of all('#nav a')) { const name = link.hash.slice(1); const span = q('span[aria-hidden]',link); if (span) span.innerHTML = icon(name); }
  for (const link of all('.settings-tile')) { const span = q('.settings-icon',link); if (span) span.innerHTML = icon(link.hash.split('/').at(-1)); }
  for (const button of all('button[aria-label]')) if (!button.title && !q('input',button)) button.title = button.getAttribute('aria-label');
  for(const button of all('button')){
    const glyph=button.textContent.trim(),name=glyph==='✎'?'edit':glyph==='×'?'close':['⧉','⎘'].includes(glyph)?'copy':null;
    if(name){button.innerHTML=icon(name);if(!button.hasAttribute('aria-label'))button.setAttribute('aria-label',words(name==='close'?'Close':name==='edit'?'Edit':'Copy',name==='close'?'إغلاق':name==='edit'?'تعديل':'نسخ'));}
  }
  for(const [selector,name,label]of [['#account-profile-link','user',options.t('View personal profile')],['#account-password-link','key',options.t('Change password')]]){const link=q(selector);if(link)link.innerHTML=label+' '+icon(name);}
  const environment = q('#demo-label'); if (environment) environment.textContent = ['localhost','127.0.0.1'].includes(location.hostname) ? words('Local preview','معاينة محلية') : '';
  if (environment?.textContent === '') environment.closest('.sidebar-foot').hidden = true;
  const topbar = q('.management-topbar-actions');
  q('.ux-scope')?.remove();
  if (!superAdmin && topbar) {
    const scope = el('span', state.isCompanyOwner ? words('Account administrator · all branches','مسؤول الحساب · كل الفروع') : words('Manager · assigned employees','مدير · الموظفون ضمن صلاحيتك'), 'ux-scope');
    const person=state.staff?.find(item=>item.id===options.accountIdentity?.id);if(!state.isCompanyOwner&&person){const ids=person.roleBranchIds?.[person.role]??(person.branchId?[person.branchId]:[]);scope.textContent=options.t(person.role)+' · '+(ids.map(id=>state.locations.find(site=>site.id===id)?.name).filter(Boolean).join('، ')||words('No branches assigned','لم تُسند فروع'));}
    scope.title = words('Lists and actions follow your assigned permissions.','تتبع القوائم والإجراءات نطاق صلاحياتك المسندة.'); topbar.prepend(scope);
  }
  mountStaff(options); mountDocuments(options); scheduleTools(options); mountRequestFilters(options); mountAttendanceFilters(options); columnChooser(options); mountPartners(options); datePresets(options);
  appearanceSettings();
  document.documentElement.dataset.density = 'compact';
  all('.ux-density').forEach(button => button.remove());
  if (q('[data-request-preference], [data-notification-preference], [data-leave-status]')) q('#main h1')?.after(el('p',words('Switches save automatically. Other forms use the Save button.','تُحفظ المفاتيح تلقائيًا. استخدم زر الحفظ للنماذج الأخرى.'),'ux-save-note'));
  if (location.hash==='#settings/approval-chain') q('#main h1')?.after(el('p',words('Set who approves each request. Request availability is managed in Request and leave settings.','حدد من يعتمد كل طلب. تُدار إتاحة الطلبات من إعدادات الطلبات والإجازات.'),'hint'));
  if (location.hash==='#settings/requests') {
    const note=el('p',words('Availability controls what employees may submit; leave policy controls balances; Approval chains controls the reviewers.','الإتاحة تحدد ما يمكن للموظف تقديمه؛ وسياسة الإجازة تضبط الأرصدة؛ وسلسلة الموافقات تحدد المسؤولين.'),'hint'); q('#main h1')?.after(note);
    const link=el('a',words('Manage approval chains →','إدارة سلسلة الموافقات ←'),'settings-back');link.href='#settings/approval-chain';note.after(link);
  }
  if (location.hash==='#settings/staff-roles') q('#main h1')?.after(el('p',words('Account administrator: all branches. Managers: assigned employees and branches. Employees: their own records. Job titles and access roles are separate.','مسؤول الحساب: جميع الفروع. المدير: الموظفون والفروع المسندة. الموظف: سجلاته فقط. المسمى الوظيفي منفصل عن دور الصلاحية.'),'hint'));
  for (const hint of all('.weekly-schedule .hint, .staff-default-periods .hint')) if (hint.textContent.includes('عرّف فترة') || hint.textContent.includes('Define a period')) { const link=el('a',words(' Define period →',' تعريف فترة ←')); link.href='#settings/work-schedule';hint.append(link); }
}

// Guard drafts consistently, including dynamically created dialogs.
document.addEventListener('input', event => {
  const field = event.target, form = field.closest?.('form');
  if (!form || field.type==='search' || form.id==='employee-auth' || form.id==='workspace-search') return;
  form.dataset.uxDirty='true';
  if (field.getAttribute('aria-invalid')==='true') { field.removeAttribute('aria-invalid'); q('.ux-field-error',field.parentElement)?.remove(); }
  let indicator=q('.ux-unsaved',form);if(!indicator){indicator=el('p',words('Unsaved changes','تغييرات غير محفوظة'),'ux-unsaved');indicator.setAttribute('role','status');form.prepend(indicator);}
},true);
document.addEventListener('change',event=>{if(event.target.matches?.('input,select,textarea')&&event.target.type!=='search')event.target.dispatchEvent(new Event('input',{bubbles:true}));},true);
document.addEventListener('invalid', event => { if(event.target.closest('form'))fieldError(event.target,event.target.validationMessage); },true);
const dirtyForms=()=>all('form[data-ux-dirty=true]').filter(form=>!form.closest('[hidden]')&&(!form.closest('dialog')||form.closest('dialog').open));
function confirmDiscard(replay) {
  if(q('#ux-discard-dialog'))return;
  const dialog=el('dialog',null,'catalog-dialog');dialog.id='ux-discard-dialog';dialog.setAttribute('aria-labelledby','ux-discard-title');
  const title=el('h2',words('Unsaved changes','تغييرات غير محفوظة'));title.id='ux-discard-title';
  const note=el('p',words('You have changes that have not been saved. Continue editing or discard them?','لديك تغييرات لم تُحفظ. هل تتابع التعديل أم تتجاهلها؟'));
  const keep=el('button',words('Continue editing','متابعة التعديل'),'button primary'),discard=el('button',words('Discard changes','تجاهل التغييرات'),'button secondary');keep.type=discard.type='button';
  keep.onclick=()=>dialog.close();
  discard.onclick=()=>{for(const form of dirtyForms()){delete form.dataset.uxDirty;q('.ux-unsaved',form)?.remove();}dialog.close();replay();};
  dialog.append(title,note,keep,discard);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();keep.focus();
}
document.addEventListener('click',event=>{
  const target=event.target.closest?.('a,button');if(!target||target.matches('[data-close-time-picker],[data-remove-phrase]'))return;
  const leaving=target.matches('a[href^="#"],a[href^="/support"],a[href^="/privacy"], [data-schedule-tab], [data-organization-tab], [data-profile-tab]')||
    (target.type!=='submit'&&(target.textContent.trim()==='×'||target.getAttribute('aria-label')===words('Close','إغلاق')||(target.getAttribute('aria-label')===words('Back','رجوع')&&target.closest('dialog'))||/close|cancel/i.test(target.id+' '+Object.keys(target.dataset).join(' '))));
  if(leaving&&dirtyForms().length){event.preventDefault();event.stopImmediatePropagation();confirmDiscard(()=>target.isConnected&&target.click());}
},true);
document.addEventListener('cancel',event=>{const form=q('form[data-ux-dirty=true]',event.target);if(form){event.preventDefault();event.stopImmediatePropagation();const target=event.target;confirmDiscard(()=>{if(target.dispatchEvent(new Event('cancel',{cancelable:true})))target.close();});}},true);
window.addEventListener('beforeunload',event=>{if(dirtyForms().length){event.preventDefault();event.returnValue='';}});

document.addEventListener('reset',event=>{const form=event.target;delete form.dataset.uxDirty;form.querySelectorAll('.ux-unsaved,.ux-field-error,.ux-action-error').forEach(node=>node.remove());form.querySelectorAll('[aria-invalid]').forEach(node=>node.removeAttribute('aria-invalid'));},true);
