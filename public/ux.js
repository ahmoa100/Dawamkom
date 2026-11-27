import {permissionsFor} from './role-permissions.js';
import { normalizeSearch, scheduleWeekPlan } from './ux-model.js';
import { documentReminderDays } from './notification-preferences.js';
import { showWalletPreview } from './document-wallet.js';

const q = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
export const readPreference = (key, fallback) => { try { return JSON.parse(localStorage.getItem('dawamkom-ux:' + key)) ?? fallback; } catch { return fallback; } };
export const writePreference = (key, value) => { try { localStorage.setItem('dawamkom-ux:' + key, JSON.stringify(value)); } catch { /* Private mode is supported. */ } };
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
let latest;
let tableObservers=[];
const pageFilters = new Map();
export const readPageFilter = (key, fallback) => pageFilters.get(key) ?? fallback;
export const writePageFilter = (key, value) => pageFilters.set(key, value);
export const resetPageFilters = () => pageFilters.clear();
const words = (en, ar) => (latest?.language ?? document.documentElement.lang) === 'ar' ? ar : en;
const icons = {
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>',
  renew: '<path d="M3 10a9 9 0 0 1 15-5l3 3M21 3v5h-5M21 14a9 9 0 0 1-15 5l-3-3M3 21v-5h5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  followup: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
  tasks: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m7 9 2 2 3-4M13 10h4M7 16h10"/>',
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
  const saved = readPageFilter(key, { search: '', branch: '', status: '' });
  const params=new URLSearchParams(location.hash.split('?')[1]??'');
  for(const name of ['search','branch','status'])if(params.has(name))saved[name]=params.get(name);
  if (['search','branch','status'].some(name=>params.has(name))) history.replaceState(history.state,'',location.pathname+location.hash.split('?')[0]);
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
      const rows = all('.staff-profile-name', group).map(link => link.closest('tr'));
      const visible = rows.filter(row => !row.hidden).length;
      group.hidden = Boolean(branch.value && group.dataset.staffBranch !== branch.value);
      group.toggleAttribute('data-no-filter-matches', filtered && !visible);
      const format = new Intl.NumberFormat(document.documentElement.lang || 'ar');
      q('summary span', group).textContent = filtered
        ? words(format.format(visible) + ' of ' + format.format(rows.length), format.format(visible) + ' من ' + format.format(rows.length))
        : format.format(rows.length);
      if (filtered && visible) group.open = true;
    }
    empty.hidden = matches > 0 || items.length === 0;
    count.textContent = words(`${matches} of ${items.length}`, `${matches} من ${items.length}`) + (filtered ? words(' · filters active', ' · مرشحات مفعّلة') : '');
    reset.disabled = !filtered;
    writePageFilter(key, { search: input.value, branch: branch.value, status: status.value });
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
  if(!select){select=el('select');select.id='ux-attendance-status';select.setAttribute('aria-label',words('Attendance status','حالة الحضور'));select.append(new Option(words('All attendance states','كل حالات الحضور'),''),...['Not started','Awaiting clock-in','Working','Present','Incomplete record','Absent','Approved leave','Not required'].map(status=>new Option(options.t(status),status)));const params=new URLSearchParams(location.hash.split('?')[1]??'');select.value=params.get('status')??readPageFilter(key,'');if(params.has('status'))history.replaceState(history.state,'',location.pathname+location.hash.split('?')[0]);count=el('output');count.id='ux-attendance-count';count.setAttribute('aria-live','polite');q('.attendance-toolbar-filters',toolbar).append(select);toolbar.append(count);}
  toolbar.insertBefore(select,q('.attendance-date-controls',toolbar));
  const update=()=>{const rows=all('#attendance-results tbody tr').filter(row=>row.cells.length>1);let visible=0;for(const row of rows){row.hidden=Boolean(select.value&&q('[data-attendance-status]',row)?.dataset.attendanceStatus!==select.value);if(!row.hidden)visible++;}count.textContent=words(`${visible} employees`,`${visible} موظف`);writePageFilter(key,select.value);};select.onchange=()=>{history.replaceState(history.state,'',location.pathname+location.hash.split('?')[0]);update();};update();
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
  }
  const restore = readPreference(companyPrefix + ':staff-scroll', {});
  for (const [index, wrap] of all('.table-wrap', root).entries()) {
    wrap.scrollTop = restore[index] ?? 0;
    wrap.addEventListener('scroll', () => { restore[index] = wrap.scrollTop; writePreference(companyPrefix + ':staff-scroll', restore); }, { passive: true });
  }
}

function mountDocuments(options) {
  const { state, companyPrefix } = options, root = q('.document-wallet'); if (!root) return;
  const rows = new Map(all('[data-rename-document]',root).map(button=>[button.dataset.renameDocument,button.closest('tr')]));
  const lead = documentReminderDays(state.notificationSettings);
  const counts = { expired: 0, soon: 0, valid: 0, none: 0 };
  const items = (state.documents ?? []).map(document => {
    const status = !document.expiresOn ? 'none' : document.expiresOn < state.today ? 'expired' : Date.parse(document.expiresOn) - Date.parse(state.today) <= lead * 86400000 ? 'soon' : 'valid';
    counts[status]++; return { id:document.id, search: document.name, status };
  });
  mountFilters(root, { key: companyPrefix + ':documents', items, target: item => rows.get(item.id), statuses: [
    ['expired', words('Expired', 'منتهي')], ['soon', words('Expiring within '+lead+' days', 'ينتهي خلال '+lead+' يومًا')], ['valid', words('Valid', 'ساري')], ['none', words('No expiry date', 'بلا تاريخ انتهاء')],
  ].map(([key, label]) => [key, label + ' (' + counts[key] + ')']) });
  const search = q('.ux-list-toolbar input',root);
  if(search){search.placeholder=words('Search by document name','بحث باسم المستند');search.setAttribute('aria-label',search.placeholder);}
  for (const documentRecord of state.documents ?? []) {
    const actions = q('.document-actions',rows.get(documentRecord.id));
    const iconButton = (name,label) => {
      const button = el('button',null,'button secondary compact');
      button.type='button';button.title=label;button.setAttribute('aria-label',label);button.innerHTML=icon(name);
      return button;
    };
    const preview = iconButton('eye',words('Preview','معاينة'));
    const replace = iconButton('renew',words('Replace / renew','استبدال / تجديد'));
    actions.prepend(preview,replace);
    preview.onclick=()=> void showWalletPreview(documentRecord,
      companyPrefix+'/api/documents?id='+encodeURIComponent(documentRecord.id), (ar,en)=>words(en,ar));
    replace.onclick=()=>{
      const dialog=q('#document-upload-dialog'),form=q('form',dialog);form.reset();form.dataset.replaceId=documentRecord.id;
      form.elements.branchId.closest('label').hidden=true;
      q('h2',dialog).textContent=words('Replace / renew document','استبدال / تجديد المستند'); form.elements.file.multiple=false;
      dialog.showModal();
    };
  }
}

export function mountRequestFilters(options = latest) {
  if (!options) return;
  latest=options;
  const panel=q('#manager-device-requests');if(!panel||q('.ux-list-toolbar',panel))return;
  const rows=all('tbody tr',panel),key=options.companyPrefix+':requests';
  const saved=readPageFilter(key,{search:'',type:'',from:'',to:''}),toolbar=el('div',null,'ux-list-toolbar requests-list-toolbar');
  const search=el('input');search.type='search';search.placeholder=words('Search employee or request','ابحث بالموظف أو الطلب');search.setAttribute('aria-label',search.placeholder);search.value=saved.search;
  const type=el('select');type.setAttribute('aria-label',words('Request type','نوع الطلب'));type.append(new Option(words('All request types','كل أنواع الطلبات'),''),...(options.state.leaveTypes??[]).concat(['Missed punch','Attendance excuse','Loan request','Shift change','Leave cancellation','Browser change']).map(value=>new Option(options.t(value),options.t(value))));type.value=saved.type;
  const from=el('input'),to=el('input');for(const [field,label,value]of [[from,words('Submitted from','تاريخ التقديم من'),saved.from],[to,words('Submitted to','تاريخ التقديم إلى'),saved.to]]){field.type='date';field.setAttribute('aria-label',label);field.value=value;}
  const reset=el('button',words('Reset filters','مسح المرشحات'),'button secondary compact');reset.type='button';const count=el('output');count.setAttribute('aria-live','polite');
  const dates=el('div',null,'requests-date-filters');
  dates.append(from,to);
  toolbar.append(search,type,dates,reset,count);
  const bulk=q('[data-queue-visible-approvals]',panel);
  if(bulk){const wrapper=bulk.parentElement;toolbar.append(bulk);wrapper.remove();}
  q('.request-filters',panel)?.after(toolbar);
  const update=()=>{let visible=0;for(const row of rows){const date=row.querySelector('[data-request-date]')?.dataset.requestDate??'';row.hidden=!normalizeSearch(row.textContent).includes(normalizeSearch(search.value))||(type.value&&!row.cells[1]?.textContent.includes(type.value))||(from.value&&date<from.value)||(to.value&&date>to.value);if(!row.hidden)visible++;}count.textContent=words(`${visible} requests`,`${visible} طلب`);writePageFilter(key,{search:search.value,type:type.value,from:from.value,to:to.value});};
  search.oninput=type.onchange=from.onchange=to.onchange=update;reset.onclick=()=>{search.value=type.value=from.value=to.value='';update();};update();
}

function columnChooser(options) {
  if(!location.hash.startsWith('#reports/')&&!location.hash.startsWith('#leaves'))return;
  for(const wrap of all('.table-wrap')){
    const table=q('table',wrap),headers=all('thead tr:last-child th',table);if(headers.length<4||q('.ux-columns',wrap.parentElement))continue;
    const key=options.companyPrefix+':columns:'+location.hash,hidden=new Set(readPreference(key,[]));
    const menu=el('details',null,'ux-columns');menu.append(el('summary',words('Columns','الأعمدة'),'button secondary compact'));
    const choices=el('div',null,'ux-column-options');menu.append(choices);wrap.before(menu);
    const boxes=headers.map((header,index)=>{const label=el('label'),box=el('input');box.type='checkbox';box.disabled=index===0||(table.classList.contains('has-leave-balance-actions')&&index===headers.length-1);box.checked=box.disabled||!hidden.has(index);label.append(box,document.createTextNode(header.textContent));choices.append(label);return box;});
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
    if (window.ReactNativeWebView) {
      const toggle=el('button',null,'ux-theme-switch');toggle.type='button';toggle.dataset.themeToggle='';toggle.setAttribute('role','switch');toggle.append(el('span'));
      toggle.onclick=()=>window.dawamkomTheme?.set(window.dawamkomTheme.get()==='light'?'dark':'light');
      row.append(label,toggle);
    } else {
      const picker=el('div',null,'ux-theme-segments');picker.dataset.themeSegments='';picker.setAttribute('role','radiogroup');
      row.append(label,picker);
    }
    const language=q('#account-language-slot',host);if(language)language.after(row);else host.append(row);
  }
  q('[data-theme-label]',row).textContent=words('Appearance','المظهر');
  const picker=q('[data-theme-segments]',row);
  if(picker){
    picker.setAttribute('aria-label',words('Appearance','المظهر'));
    const current=window.dawamkomTheme?.get() || 'dark';
    picker.dataset.selected=current;
    picker.replaceChildren(...[['light',words('Light','فاتح')],['medium',words('Medium','متوسط')],['dark',words('Dark','داكن')]].map(([value,text])=>{
      const option=el('label',text), control=el('input');
      control.type='radio';control.name='dawamkom-appearance';control.value=value;
      control.dataset.themeOption='';control.checked=value===current;
      option.prepend(control);return option;
    }));
  }
  const toggle=q('[data-theme-toggle]',row);
  if(toggle){q('[data-theme-label]',row).textContent=words('Light mode','الوضع الفاتح');toggle.setAttribute('aria-label',words('Light mode','الوضع الفاتح'));toggle.setAttribute('aria-checked',String(window.dawamkomTheme?.get()==='light'));}
}

function scheduleTools(options) {
  const root = q('.weekly-schedule'); if (!root) return;
  const toolbar = el('div', null, 'schedule-toolbar'), copy = el('button', words('Copy last week…', 'نسخ الأسبوع السابق…'), 'button secondary');
  const assign = el('button', words('Assign schedule', 'إسناد دوام'), 'button primary'); copy.type = assign.type = 'button';copy.dataset.requiredPermission=assign.dataset.requiredPermission='schedules';
  const overflow = el('details', null, 'schedule-overflow');
  const trigger = el('summary', '⋯', 'button secondary');
  trigger.setAttribute('aria-label', words('Week actions', 'إجراءات الأسبوع'));
  overflow.append(trigger, copy);
  toolbar.append(assign, overflow);
  q('.schedule-filters', root).append(toolbar);
  const open = copying => {
    const dialog = el('dialog', null, 'catalog-dialog'); dialog.setAttribute('aria-label', copying ? copy.textContent : assign.textContent);
    const heading = el('h2', copying ? copy.textContent : assign.textContent), form = el('form');
    const start = new Date(options.state.today + 'T00:00:00Z'); start.setUTCDate(start.getUTCDate() - start.getUTCDay() + options.scheduleWeek * 7);
    const day = start.toISOString().slice(0,10);
    const range = offset => new Date(+start + offset * 86400000).toISOString().slice(0,10) + ' – ' + new Date(+start + (offset + 6) * 86400000).toISOString().slice(0,10);
    const date = el('p', copying ? words('Source: ', 'المصدر: ') + range(-7) : range(0), 'hint');
    const search = el('input'); search.type = 'search'; search.placeholder = words('Search employees', 'بحث الموظفين'); search.setAttribute('aria-label', search.placeholder);
    const people = el('fieldset', null, 'ux-bulk-people'); people.append(el('legend', words('Employees', 'الموظفون')));
    const branch = q('#schedule-branch', root)?.value;
    for (const person of options.state.staff.filter(p => (!branch || p.branchId === branch) && ['Active','Pending activation'].includes(p.status))) {
      const label = el('label'), box = el('input'); box.type = 'checkbox'; box.value = person.id; box.name = 'people'; label.append(box, document.createTextNode(options.staffName(person))); people.append(label);
    }
    const employeeLabels = all('label', people);
    const select = el('input'); select.type = 'checkbox';
    const selectLabel = el('label'), selectText = el('span');
    selectLabel.append(select, selectText);
    people.querySelector('legend').after(selectLabel);
    const visibleBoxes = () => employeeLabels.filter(label => !label.hidden).map(label => q('input', label));
    const syncSelection = () => {
      const visible = visibleBoxes(), checked = visible.filter(box => box.checked).length;
      select.disabled = !visible.length;
      select.checked = visible.length > 0 && checked === visible.length;
      select.indeterminate = checked > 0 && checked < visible.length;
      selectText.textContent = words('Select all results', 'تحديد كل نتائج البحث') + ' (' + visible.length + ')';
      if (copying) submit.textContent = words('Copy schedule', 'نسخ الجدول') + ' (' + employeeLabels.filter(label => q('input', label).checked).length + ')';
    };
    search.oninput = () => {
      employeeLabels.forEach(label => label.hidden = !normalizeSearch(label.textContent).includes(normalizeSearch(search.value)));
      syncSelection();
    };
    select.onchange = () => visibleBoxes().forEach(box => { box.checked = select.checked; });
    people.addEventListener('change', syncSelection);
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
    form.append(search,people);if(!copying)form.append(periods);form.append(date);
    if (copying) form.append(el('p', words('Destination: ', 'الوجهة: ') + range(0), 'hint'));
    form.append(actions);
    syncSelection();
    dialog.append(heading,form);document.body.append(dialog);
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
  copy.onclick = () => { overflow.open = false; open(true); }; assign.onclick = () => open(false);
}


// Reflect server action grants before users fill a form or start a mutation.
const actionControlGroups=[
 ['staffCreate','#add-staff,#import-staff'],
 ['staffEdit','[data-edit-staff]'],['staffRemove','[data-remove-staff]'],
 ['staffAccess','#staff-password-form,[data-staff-send],[data-staff-link],[data-staff-recovery]'],
 ['periods','#add-period,#period-form,[data-edit-period],[data-delete-period],[data-duplicate-period],[data-period-branch]'],
 ['schedules','[data-required-permission="schedules"],.schedule-add,#schedule-assignment-form,#location-form,[data-edit-assignment],[data-remove-assignment],[data-edit-location],[data-edit-attendance-method],[data-attendance-staff]'],
 ['requests','[data-decision],[data-device-staff]'],
 ['requestsSettings','[data-request-preference],[data-request-contracts],[data-holiday-toggle],[data-holiday-edit]'],
 ['notifications','[data-edit-notification],[data-notification-preference],#notification-settings-form,#encouragement-settings-form,#attendance-report-settings-form,#follow-up-mail-settings-form'],
 ['approvalChains','[data-edit-approval],#approval-chain-form'],
 ['documents','#open-document-upload,#document-upload-form,.document-expiry-form,[data-delete-document]'],
 ['payrollEdit','[data-adjustment-category],[data-payroll-adjust],[data-payroll-salary],[data-remove-payroll-adjustment],#payroll-deduction-date'],
 ['payrollApprove','#approve-payroll'],['payrollExport','[data-payroll-export]'],['payrollPayment','[data-payroll-payment],#payroll-bank'],
 ['reports','#attendance-report-form,#absence-report-form'],
 ['owner','[data-create-catalog],[data-remove-role],[data-remove-job-title],[data-job-title],#role-form,#create-role-form,#job-title-form,#time-format-form,#organization-form,#schedule-form,#leave-preferences-form,#leave-type-form,[data-leave-status],#add-branch,#add-branch-from-locations,[data-remove-location]'],
];
function reflectActionGrants(){
 if(!latest?.companyPrefix||latest.superAdmin||latest.state.isCompanyOwner)return;
 const person=latest.state.staff?.find(p=>p.id===latest.accountIdentity?.id);if(!person)return;
 const grants=permissionsFor(latest.state,person.role),denied=words('Your role does not allow this action.','لا يملك دورك صلاحية هذا الإجراء.');
 for(const [key,selector] of actionControlGroups){
  if(key!=='owner'&&grants[key])continue;
  for(const element of all(selector)){
   const controls=element.matches('form')?all('input,select,textarea,button[type="submit"],button:not([type])',element):[element];
   for(const control of controls){control.disabled=true;control.title=key==='owner'?words('Only the account administrator can change this company-wide setting.','هذا الإعداد العام متاح لمسؤول الحساب فقط.'):denied;}
  }
 }
 for(const control of all('[data-open-payroll]'))if(!grants.payrollEdit&&!latest.state.payrollRuns?.some(run=>run.month===control.dataset.openPayroll)){control.disabled=true;control.title=denied;}
 for(const control of all('[data-edit-branch]'))if(!grants.schedules&&!(location.hash==='#settings/organization'&&latest.state.canManageRolePermissions)){control.disabled=true;control.title=denied;}
}
let actionGrantObserver;

export function mountManagerUX(options) {
  latest = options;
  actionGrantObserver?.disconnect();
  reflectActionGrants();
  actionGrantObserver=new MutationObserver(reflectActionGrants);actionGrantObserver.observe(document.body,{childList:true,subtree:true});
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
  reflectActionGrants();
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
  const leaving=target.matches('a[href^="#"],a[href^="/support"],a[href^="/privacy"], [data-attendance-tab], [data-organization-tab], [data-profile-tab]')||
    (target.type!=='submit'&&(target.textContent.trim()==='×'||target.getAttribute('aria-label')===words('Close','إغلاق')||(target.getAttribute('aria-label')===words('Back','رجوع')&&target.closest('dialog'))||/close|cancel/i.test(target.id+' '+Object.keys(target.dataset).join(' '))));
  if(leaving&&dirtyForms().length){event.preventDefault();event.stopImmediatePropagation();confirmDiscard(()=>target.isConnected&&target.click());}
},true);
document.addEventListener('cancel',event=>{const form=q('form[data-ux-dirty=true]',event.target);if(form){event.preventDefault();event.stopImmediatePropagation();const target=event.target;confirmDiscard(()=>{if(target.dispatchEvent(new Event('cancel',{cancelable:true})))target.close();});}},true);
window.addEventListener('beforeunload',event=>{if(dirtyForms().length){event.preventDefault();event.returnValue='';}});

document.addEventListener('reset',event=>{const form=event.target;delete form.dataset.uxDirty;form.querySelectorAll('.ux-unsaved,.ux-field-error,.ux-action-error').forEach(node=>node.remove());form.querySelectorAll('[aria-invalid]').forEach(node=>node.removeAttribute('aria-invalid'));},true);
