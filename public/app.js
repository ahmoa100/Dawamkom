import {approvalRequestTypes,canReviewBrowserRequest} from './browser-approval.js';
import {documentReminderDays, documentExpiryStatus} from './notification-preferences.js';
import {documentAlertPresenter} from './document-alert-popup.js';
import {dateText,dateFormatter} from './date-format.js';
import './date-controls.js';
import {updateStaffFinancialFields} from './staff-financial.js';
import {openEmployeeImport} from './employee-import.js';
import {rolePermissionGroups,permissionsFor,eligibleRequestApprover,approvalRoleStep,eligibleApprovalRoles} from './role-permissions.js';
import {followUpItems,pendingFollowUpCount,eligibleFollowUpAssignees} from './follow-up.js';
import {documentDisplayName,uploadDocuments} from './document-reader.js';
import {officialHolidays,holidaySettings,holidayOccurrences,officialHolidaysOn,holidayDefaultDays} from './official-holidays.js';
import { mountManagerUX, mountRequestFilters, mountAttendanceFilters, resetPageFilters, fieldError, actionError, icon } from './ux.js';
import { approvedAttendanceLeaves, approvedLeaveTypesOn, attendanceState, compareAttendanceRows, normalizeSearch, homeReviewGroups } from './ux-model.js';
import { notificationDisplay, newNotificationIds } from './notification-display.js';
import { isAdministrator, roleBranches, roleIsAdministrator, eligibleDirectManager, needsDirectManager } from './branch-roles.js';
import { payrollMarkup, mountPayroll } from './payroll.js';
import { employeeRequestTypes, effectiveRequestPreferences, requestContractTypes, displayLeaveType } from './request-settings.js';
import { isMobileDevice } from './device-interface.js';
import { displayProfileAvatar } from './profile-avatar.js';
import { normalizeIban, validSaudiIban, ibanBank } from './saudi-iban.js';
import { employeeGreetings } from './employee-greetings.js';
import { mountSetupGuide, restartSetupGuide, setupGuideSaved } from './setup-guide.js';
import { leaveBalancePreview, annualLeaveBalance as calculateAnnualLeaveBalance, annualLeaveRequired, futureAnnualLeave } from './leave-balance.js';
import ar from './ar.js';
import { downloadReport } from './report-files.js';
import { allowsAnywhere, allowsCompanyLocation, assignedToPunchLocation, assignedStaffForPeriod, defaultPeriodIds, effectivePeriodIds, isFlexiblePeriod, isScheduleRestDay, periodBounds, periodOnDay, periodActiveOn, nextPeriodColor, periodColors, periodDisplayColor, periodAvailableFor, scheduledOvertimeMinutes } from './work-schedule.js';
import { configureCorrectionTime, correctionPeriods, periodPunches } from './punch-correction.js';
import { staffRoles as roleOptions } from './staff-options.js';
import { annualLeaveDays, contractTerms, contractTypes, genders, jobTitles, nationalityCodes, probationDays, westernDigits } from './staff-options.js';

let language = 'ar';
const L = (arabic, english) => language === 'ar' ? arabic : english;
try { if (localStorage.getItem('dawamak-language') === 'en') language = 'en'; } catch { /* Storage can be disabled. */ }
const t = (label) => language === 'ar' && Object.hasOwn(ar, label) ? ar[label] : label;

const pages = {
  home: ['Overview', '⌂'], requests: ['Requests', '≡'], staff: ['Staff', '♙'],
  attendance: ['Attendance', '◷'], leaves: ['Leave balances', '▤'], reports: ['Reports', '▥'],
  payroll: ['Payroll', '▣'],
  tasks: ['Tasks', '☑'], documents: ['Documents', '▧'], followup: ['Follow-up centre','◎'], settings: ['Settings', '⚙'],
  mobile: ['Staff view', '◉'],
};
const superAdmin = location.pathname === '/super-admin';
if (superAdmin) document.documentElement.classList.add('super-admin-layout');
const companyPrefix = location.pathname.startsWith('/company/') ? location.pathname.replace(/\/$/, '') : '';
const superAdminPages = { home: ['Overview', '⌂'], partners: ['Partners', '▦'], settings: ['Settings', '⚙'] };
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const time = (value) => value ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en', {
  timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: state.timeFormat === '24' ? 'h23' : 'h12',
}).format(new Date(value)) : '—';
const badge = (label) => '<span class="badge ' + (({
  Active: 'green', Approved: 'green', 'Punched in': 'green', Pending: 'amber', 'Pending activation': 'amber', 'Activation email sent; awaiting activation':'amber',
  'Invitation draft': 'amber', Declined: 'red', Suspended: 'red',
})[label] ?? '') + '">' + esc(t(label)) + '</span>';
const card = (title, content) => '<section class="card"><h2>' + title + '</h2>' + content + '</section>';
const table = (headers, rows, empty, className = '', groups = []) => rows.length ? '<div class="table-wrap" tabindex="0" role="region" aria-label="' + t('Scrollable table') + '"><table class="' + className + '"><thead>' +
  (groups.length ? '<tr>' + groups.map(([label, count]) => '<th scope="colgroup" colspan="' + count + '">' + t(label) + '</th>').join('') + '</tr>' : '') + '<tr>' +
  headers.map(header => typeof header === 'string' ? '<th scope="col">' + header + '</th>' :
    '<th scope="col" aria-sort="' + header.sort + '">' + header.label + '</th>').join('') +
  '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((value) => '<td>' + value + '</td>').join('') + '</tr>').join('') +
  '</tbody></table></div>' : '<p class="empty">' + empty + '</p>';
const title = (heading, subtitle) => '<div class="intro"><h1>' + heading + '</h1><p>' + subtitle + '</p></div>';
const button = (label) => '<button class="button primary">' + label + '</button>';
const activationExpired=expiresAt=>Number.isFinite(expiresAt)&&expiresAt<=Date.now();
const activationShortcuts=(kind,person)=>'<span class="activation-shortcuts"><button type="button" class="button secondary compact" data-'+kind+'-link="'+esc(person.id)+'" data-activation-expiry="'+esc(person.activationLinkExpiresAt??'')+'">'+t(activationExpired(person.activationLinkExpiresAt)?'Link expired':'Copy')+'</button><button type="button" class="button secondary compact" data-'+kind+'-send="'+esc(person.id)+'">'+t('Send')+'</button></span>';
let state;
let toastTimer;
let attendanceDate;
let attendanceSearch = '';
let attendanceJobTitle = '';
let attendanceListBranch = '';
let attendanceSelectedEmployees = null;
let attendanceSort = '';
let requestStatus = 'Pending';
let attendanceTab = 'daily';
let scheduleWeek = 0;
let scheduleSearch = '';
let scheduleBranch = '';
let addingPeriod = false;
let editingPeriod;

function say(message, error = false) {
  const toast = $('#message');
  toast.textContent = t(message);
  toast.classList.toggle('error', error);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
}
const activationLinks=new Map();
let activationExpiryTimer;
const recentInvitations = new Map();
async function save(action, body, { refreshView = true } = {}) {
  const response = await fetch(companyPrefix + '/api/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!result) {
    const error = new Error('The server did not confirm the change. Refresh and check before retrying.');
    error.unconfirmedSave = true;
    throw error;
  }
  if (!response.ok) throw new Error(result.error || 'The server did not confirm the change. Refresh and check before retrying.');
  const invitation=result.invitation;
  if(invitation?.url){
    const person=invitation.staffId?result.staff?.find(item=>item.id===invitation.staffId):result.partners?.find(item=>invitation.url.includes('/company/'+item.id+'/activate'));
    if(person)activationLinks.set((invitation.staffId?'staff:':'partner:')+person.id,{url:invitation.url,expiresAt:person.activationLinkExpiresAt});
  }
  if(result.invitation?.staffId)recentInvitations.set(result.invitation.staffId,result.invitation.delivery??"link-ready");
  state = result;
  if (refreshView) render();
  return result;
}
function requestRows(items, decisions = false) {
  return items.map((item) => [
    esc(state.staff.find((person) => person.id === item.staffId)?.name),
    '<strong>' + esc(t(item.type)) + '</strong><small>' + esc(item.note) + '</small>',
    esc(!item.end || item.date === item.end ? dateText(item.date) : dateText(item.date) + ' – ' + dateText(item.end)),
    badge(item.status)+(item.autoApproved?'<small>'+ (language==='ar'?'اعتماد تلقائي بواسطة النظام':'Automatically approved by system')+'</small>':''),
    ...(decisions ? [item.status === 'Pending' && !item.approvalSteps ? '<div class="actions">' +
      ['Approved', 'Declined'].map((status) => '<button class="button secondary compact" data-decision="' + status + '" data-id="' +
        esc(item.id) + '">' + (status === 'Approved' ? t('Approve') : t('Decline')) + '</button>').join('') + '</div>' : '—'] : []),
  ]);
}
function requestTable(items, decisions = false) {
  return table([t('Staff member'), t('Request'), t('Date'), t('Status'), ...(decisions ? [t('Action')] : [])], requestRows(items, decisions), t('No requests to show.'));
}
const currentHomeReviewGroups=()=>homeReviewGroups(state,{owner:Boolean(state.isCompanyOwner),viewer:state.staff.find(p=>p.id===accountIdentity?.id),requestContext:requestManagerSession});
function homeReviewCards(){
 if(!state.isCompanyOwner&&!accountIdentity)return '<p class="hint">'+t('Loading…')+'</p>';
 const groups=currentHomeReviewGroups().filter(g=>g.items.length);
 return groups.length?'<div class="ux-attention-list">'+groups.map(g=>'<button type="button" class="home-review-card '+(g.priority<2?'urgent':'')+'" data-home-review="'+g.id+'"><strong>'+new Intl.NumberFormat(language).format(g.items.length)+'</strong><span>'+esc(language==='ar'?g.ar:g.en)+'</span><small>'+(language==='ar'?'عرض الحالات ‹':'View cases ›')+'</small></button>').join('')+'</div>':'<p class="empty">'+(language==='ar'?'لا توجد حالات تحتاج انتباهك حاليًا.':'Nothing needs your attention right now.')+'</p>';
}
function refreshHomeReviewCards(){const host=$('#home-review-cards');if(host)host.innerHTML=homeReviewCards();}
function mountPunchReview(dialog, items, L) {
 const filters=document.createElement('div'), results=document.createElement('div');
 filters.className='punch-review-filters';
 results.className='punch-review-results';
 filters.innerHTML='<label>'+L('الموظف','Employee')+'<input type="search" data-search placeholder="'+L('ابحث بالاسم','Search by name')+'"></label>'+
  '<label>'+L('من','From')+'<input type="date" data-from></label><label>'+L('إلى','To')+'<input type="date" data-to></label>';
 const count=document.createElement('p');
 count.className='hint punch-review-count';
 count.setAttribute('role','status');
 dialog.classList.add('punch-review-dialog');
 dialog.append(filters,count,results);
 const paint=()=>{
  const search=filters.querySelector('[data-search]').value.trim().toLocaleLowerCase();
  const from=filters.querySelector('[data-from]').value,to=filters.querySelector('[data-to]').value;
  const people=new Map();
  let total=0;
  for(const item of items){
   if((from&&item.date<from)||(to&&item.date>to)||![item.name,item.nameEn].some(name=>name?.toLocaleLowerCase().includes(search)))continue;
   if(!people.has(item.staffId)) people.set(item.staffId,[]);
   people.get(item.staffId).push(item);
   total++;
  }
  count.textContent=L(`${total} حالة · ${people.size} موظف`,`${total} cases · ${people.size} employees`);
  results.replaceChildren();
  for(const records of people.values()){
   const group=document.createElement('section'), heading=document.createElement('h3'), days=document.createElement('div');
   const person=records[0];
   const name=(language==='en'&&person.nameEn)||person.name;
   heading.textContent=name;
   days.className='punch-review-days';
   for(const item of records.sort((a,b)=>b.date.localeCompare(a.date))){
    const open=document.createElement('button');
    open.type='button';
    open.className='button secondary compact';
    open.textContent=dateText(item.date);
    open.setAttribute('aria-label',name+' · '+open.textContent);
    open.onclick=()=>{
     dialog.close();
     attendanceDate=item.date;
     attendanceSearch=staffName(state.staff.find(p=>p.id===item.staffId)??item);
     attendanceJobTitle=attendanceListBranch='';
     attendanceSelectedEmployees=null;
     if(location.hash===item.href)render();
     else location.hash=item.href;
    };
    days.append(open);
   }
   group.append(heading,days);
   results.append(group);
  }
  if(!total){
   const empty=document.createElement('p');
   empty.className='empty';
   empty.textContent=L('لا توجد حالات مطابقة.','No matching cases.');
   results.append(empty);
  }
 };
 filters.addEventListener('input',paint);
 filters.addEventListener('change',paint);
 paint();
}
function openHomeReview(id){
 const group=currentHomeReviewGroups().find(g=>g.id===id);if(!group)return;
 const L=(a,b)=>language==='ar'?a:b,dialog=document.createElement('dialog');dialog.className='catalog-dialog home-review-dialog';dialog.setAttribute('aria-label',L(group.ar,group.en));
 const heading=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');title.textContent=L(group.ar,group.en)+' ('+group.items.length+')';close.type='button';close.className='button secondary compact';close.textContent='×';close.setAttribute('aria-label',t('Close'));close.onclick=()=>dialog.close();heading.append(title,close);dialog.append(heading);
 if(id==='schedule'||id==='punches'){const note=document.createElement('p');note.className='hint';note.textContent=id==='schedule'?L('موظفون دون جدول خلال الأيام السبعة القادمة، باستثناء الراحة والإجازات.','No schedule in the next seven days, excluding rest days and leave.'):L('أيام ذات بصمة ناقصة بعد انتهاء نافذة التسجيل، خلال آخر 30 يومًا.','Days with a missing punch after its recording window, during the last 30 days.');dialog.append(note);}
 if(id==='punches'){
  mountPunchReview(dialog,group.items,L);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);
  dialog.showModal();
  return;
 }
 const list=document.createElement('ul');list.className='home-review-items';
 const canAssign = id === 'manager' && (state.isCompanyOwner ||
   permissionsFor(state,state.staff.find(person=>person.id===accountIdentity?.id)?.role).staffEdit);
 for(const item of group.items){const row=document.createElement('li'),copy=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small'),action=document.createElement('button');name.textContent=(language==='en'?item.nameEn:item.name)||item.name||'—';
 if(canAssign){
   const check=document.createElement('input');
   check.type='checkbox';check.name='staffIds';check.value=item.staffId;
   check.setAttribute('aria-label',L('تحديد ','Select ')+name.textContent);
   row.append(check);
 }
 detail.textContent=[item.fields?.length?followUpFields(item):'',item.type?t(item.type):'',item.date?dateText(item.date):'',item.expiresOn?L('تاريخ الانتهاء: ','Expiry: ')+dateText(item.expiresOn):'',item.dueOn?L('موعد الإنجاز: ','Due: ')+dateText(item.dueOn):'',item.first?dateText(item.first)+' — '+dateText(item.last):''].filter(Boolean).join(' · ');copy.append(name,detail);action.type='button';action.className='button secondary compact';action.textContent=L('فتح','Open');action.onclick=()=>{dialog.close();if(['documents','overdue'].includes(id)){openFollowUp(item.id);return;}if(id==='punches'){attendanceDate=item.date;attendanceSearch=staffName(state.staff.find(p=>p.id===item.staffId)??item);attendanceJobTitle='';attendanceListBranch='';attendanceSelectedEmployees=null;}if(id==='requests')requestStatus='Pending';if(location.hash===item.href)render();else location.hash=item.href;};row.append(copy,action);list.append(row);}
 if(!group.items.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=L('لا توجد حالات هنا.','No cases here.');dialog.append(empty);}
 if(canAssign&&group.items.length)mountDirectManagerAssignment(dialog,list,L);else dialog.append(list);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}
function mountDirectManagerAssignment(dialog,list,L){
 const form=document.createElement('form');
 form.className='home-review-manager-form';
 form.innerHTML='<div class="home-review-manager-controls"><label><input type="checkbox" name="all"> '+
   L('تحديد الكل','Select all')+'</label><label>'+L('المدير المباشر','Direct manager')+
   '<select name="managerId" required></select></label><button class="button primary" type="submit">'+
   L('إسناد للمحددين','Assign to selected')+'</button></div><p class="hint" role="status"></p>';
 form.append(list);
 dialog.append(form);
 const {all,managerId}=form.elements;
 const checks=Array.from(list.querySelectorAll('input[name="staffIds"]'));
 const staff=new Map(state.staff.map(person=>[person.id,person]));
 const candidates=state.directManagerChoices??state.staff;
 const submit=form.querySelector('button[type="submit"]'),status=form.querySelector('[role="status"]');
 const selected=()=>checks.filter(check=>check.checked).map(check=>check.value);
 const refresh=()=>{
   const ids=selected(),previous=managerId.value;
   const managers=ids.length?candidates.filter(manager=>ids.every(id=>
     eligibleDirectManager(state,manager,staff.get(id)?.branchId,id))):[];
   all.checked=ids.length===checks.length;
   all.indeterminate=ids.length>0&&!all.checked;
   managerId.replaceChildren(new Option(L('اختر المدير المباشر','Choose a direct manager'),''),
     ...managers.map(person=>new Option(staffName(person),person.id)));
   if(managers.some(person=>person.id===previous))managerId.value=previous;
   managerId.disabled=!managers.length;
   submit.disabled=!managerId.value;
   status.textContent=ids.length&&!managers.length
     ? L('لا يوجد مدير يغطي فروع جميع المحددين. اختر موظفين من نطاق مدير واحد.',
       'No manager covers all selected branches. Select employees within one manager’s scope.')
     : '';
 };
 form.addEventListener('change',event=>{
   if(event.target===all)for(const check of checks)check.checked=all.checked;
   refresh();
 });
 form.addEventListener('submit',async event=>{
   event.preventDefault();
   const staffIds=selected(),manager=managerId.value;
   if(!staffIds.length||!manager||submit.disabled)return;
   for(const control of [all,managerId,submit,...checks])control.disabled=true;
   try{
     await save('staff/assign-direct-manager',{staffIds,managerId:manager});
     dialog.close();
     say(L('تم إسناد المدير المباشر','Direct manager assigned'));
   }catch(error){
     for(const check of [all,...checks])check.disabled=false;
     refresh();
     status.textContent=t(error.message);
   }
 });
 refresh();
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-home-review]');if(button)openHomeReview(button.dataset.homeReview);});
function home() {
  const active = state.staff.filter((person) => person.status === 'Active');
  const pending = state.requests.filter((item) => item.status === 'Pending');
  const present = new Set(state.punches.filter((entry) => entry.date === state.today && entry.kind === 'in').map((entry) => entry.staffId));
  const metrics = [
    [t('Active staff'), active.length, 'staff'], [t('Punched in today'), present.size, 'attendance'],
    [t('Pending requests'), pending.length, 'requests'], [t('Invitation drafts'), state.staff.length - active.length, 'staff'],
  ];
  return '<section class="hero"><div><p class="eyebrow">' + t('COMPANY WORKSPACE') + '</p><h1>' + t('Attendance overview') + '</h1><p>' + t('See who has arrived and what needs your attention.') + '</p></div><span>' +
    esc(state.today) + '</span></section><div class="metrics">' + metrics.map(([label, count, route]) =>
      '<a class="metric" href="#' + route + '"><span>' + t(label) + '</span><strong>' + count + '</strong></a>').join('') +
    '</div>' + card(language==='ar'?'تحتاج انتباهك':'Needs your attention', '<div id="home-review-cards">'+homeReviewCards()+'</div>') + card(t('Awaiting approval'), requestTable(pending, true));
}
function requests() {
  return '<div class="payroll-heading"><h1>' + t('Requests') + '</h1><button type="button" class="button primary" data-new-desktop-request>' + t('New request') + '</button></div><section id="manager-device-requests">' + requestInbox(requestManagerSession) + '</section>';
}
async function openDesktopRequest() {
  const L=(ar,en)=>language==='ar'?ar:en;
  const api=async(path,body)=>{
    const response=await fetch(companyPrefix+'/api/employee/'+path,body?{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    }:{cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw Error(result.error);
    return result;
  };
  const {self,branches}=await api('request-applicants');
  const dialog=document.createElement('dialog');
  dialog.className='catalog-dialog';
  const select=(name,label)=>'<label>'+label+'<select name="'+name+'"></select></label>';
  const input=(name,label,type)=>'<label>'+label+'<input name="'+name+'" type="'+type+'"></label>';
  dialog.innerHTML='<form><header class="payroll-heading"><h2>'+t('New request')+'</h2><button type="button" class="button secondary compact" aria-label="'+t('Close')+'">×</button></header>'+
    select('branch',t('Branch'))+select('person',t('Employee'))+select('type',t('Request type'))+
    '<div class="fields">'+input('date',t('Start date'),'date')+input('end',t('End date'),'date')+'</div>'+
    select('periodId',L('الفترة','Shift'))+select('secondPeriodId',L('الفترة الثانية','Second shift'))+select('leaveRequestId',L('الإجازة المعتمدة','Approved leave'))+
    input('loanAmount',L('المبلغ','Amount'),'number')+input('repaymentInstallments',L('عدد الدفعات','Installments'),'number')+
    select('excuseType',L('نوع الاستئذان','Permission type'))+select('reason',t('Reason'))+select('correctionReason',L('سبب التصحيح','Correction reason'))+
    '<div data-correction-times></div><label>'+L('ملاحظة','Note')+'<textarea name="note" maxlength="1000"></textarea></label>'+
    input('attachment',L('مرفق اختياري (حتى 2 ميجابايت)','Optional attachment (up to 2 MB)'),'file')+
    '<p role="status"></p><button type="submit" class="button primary">'+t('Submit request')+'</button></form>';
  const form=dialog.querySelector('form'), fields=form.elements, status=dialog.querySelector('[role=status]');
  const submit=form.querySelector('[type=submit]'), times=form.querySelector('[data-correction-times]');
  const fill=(field,options,placeholder)=>fields[field].replaceChildren(new Option(placeholder,''),...options.map(([value,label])=>new Option(label,value)));
  const show=(field,visible,required=false)=>{
    const control=fields[field]; control.closest('label').hidden=!visible;
    control.disabled=!visible; control.required=visible&&required;
  };
  fields.date.value=state.today; fields.date.required=true;
  fields.attachment.accept='.svg,.png,.jpg,.jpeg,.pdf,.doc,.docx,.gif';
  fields.loanAmount.step='0.01'; fields.loanAmount.min='0.01';fields.repaymentInstallments.min='1';
  const options=branches.filter(branch=>branch.staff.length);
  const branchOptions=options.map((branch,i)=>[String(i),branch.name]);
  if(self)branchOptions.unshift(['self',L('أنا','Me')]);
  fill('branch',branchOptions,t('Choose branch'));
  fields.branch.value=self?'self':options.length===1?'0':'';
  show('branch',branchOptions.length>1||!branchOptions.length,true);
  let applicant, context, periods=[], revision=0, timingRevision=0, loadingTimes=false, timingFailed=false, submitting=false;
  const updateSubmit=()=>{submit.disabled=!context||!fields.type.value||loadingTimes||timingFailed||submitting;};
  const loadTimes=async()=>{
    const rev=++timingRevision;
    periods=[];times.replaceChildren();loadingTimes=false;timingFailed=false;
    if(fields.type.value!=='Missed punch'||!fields.date.value){updateSubmit();return;}
    loadingTimes=true;updateSubmit();
    try{
      const result=await api('punches?'+new URLSearchParams({date:fields.date.value,staffId:applicant}));
      if(rev!==timingRevision||!dialog.open)return;
      periods=result.periods??[];
      if(result.correctionLimitReached){timingFailed=true;status.textContent=L('بلغ الموظف الحد الشهري للتصحيحات المعتمدة.','The employee reached the monthly correction limit.');return;}
      times.innerHTML=(periods.length>1?periods:[{}]).map((period,i)=>'<fieldset>'+(period.name?'<legend>'+esc(period.name)+'</legend>':'')+
        '<div class="fields">'+input('proposedIn'+i,t('Check in'),'text')+input('proposedOut'+i,t('Check out'),'text')+'</div></fieldset>').join('');
      for(const control of times.querySelectorAll('input')) configureCorrectionTime(control);
    }catch(error){if(rev===timingRevision){timingFailed=true;status.textContent=t(error.message);}}
    finally{if(rev===timingRevision){loadingTimes=false;updateSubmit();}}
  };
  const updateFields=()=>{
    const type=fields.type.value;
    const leave=context?.leaveTypes.includes(type), shift=type==='Shift change', loan=type==='Loan request', excuse=type==='Attendance excuse';
    show('end',leave||shift, true);show('periodId',shift,true);show('secondPeriodId',shift);
    show('loanAmount',loan,true);show('repaymentInstallments',loan,true);
    show('excuseType',excuse,true);show('reason',excuse,true);
    show('correctionReason',type==='Missed punch',true);show('leaveRequestId',type==='Leave cancellation',true);
    if(!fields.end.value)fields.end.value=fields.date.value;
    status.textContent='';void loadTimes();
  };
  const loadContext=async()=>{
    const rev=++revision;
    applicant=fields.branch.value==='self'?self?.id:fields.person.value;
    context=undefined;fill('type',[],L('اختر نوع الطلب','Choose request type'));updateFields();
    if(!applicant)return;
    try{
      const data=await api('request-applicants?staffId='+encodeURIComponent(applicant));
      if(rev!==revision||!dialog.open)return;
      context=data;
      fill('type',[...data.leaveTypes,...data.attendanceTypes].map(type=>[type,t(type)]),L('اختر نوع الطلب','Choose request type'));
      const available=data.availablePeriods.map(period=>[period.id,period.name]);
      fill('periodId',available,L('اختر الفترة','Choose shift'));fill('secondPeriodId',available,'—');
      fill('leaveRequestId',data.cancellableLeaves.map(leave=>[leave.id,t(leave.type)+' · '+dateText(leave.date)]),L('اختر الإجازة','Choose leave'));
      updateFields();
    }catch(error){if(rev===revision)status.textContent=t(error.message);}
  };
  const selectBranch=()=>{
    const branch=fields.branch.value!==''?options[fields.branch.value]:undefined;
    fill('person',(branch?.staff??[]).map(person=>[person.id,staffName(person)]),L('اختر الموظف','Choose employee'));
    show('person',Boolean(branch),true);void loadContext();
  };
  fill('correctionReason',['Forgot to punch','Mobile app issue','Internet issue','Off-site visit','Other'].map(value=>[value,t(value)]),t('Reason'));
  fill('excuseType',['Late arrival','Early departure','During work'].map(value=>[value,t(value)]),L('اختر النوع','Choose type'));
  fill('reason',['Personal','Medical','Other'].map(value=>[value,t(value)]),t('Reason'));
  fields.branch.onchange=selectBranch;fields.person.onchange=loadContext;fields.type.onchange=updateFields;
  fields.date.onchange=()=>{status.textContent='';void loadTimes();};
  form.onsubmit=async event=>{
    event.preventDefault();
    if(submit.disabled)return;
    const body=Object.fromEntries([...new FormData(form)].filter(([key,value])=>!['branch','person','attachment'].includes(key)&&value!==''));
    body.onBehalfOf=applicant;
    if(periods.length>1){
      body.periodCorrections=periods.map((period,i)=>({periodId:period.id,shiftStart:period.start,shiftEnd:period.end,
        proposedIn:fields['proposedIn'+i].value||undefined,proposedOut:fields['proposedOut'+i].value||undefined})).filter(edit=>edit.proposedIn||edit.proposedOut);
    }else if(body.type==='Missed punch'){
      body.proposedIn=fields.proposedIn0?.value||undefined;body.proposedOut=fields.proposedOut0?.value||undefined;
    }
    for(const key of ['loanAmount','repaymentInstallments'])if(key in body)body[key]=Number(body[key]);
    submitting=true;updateSubmit();
    try{
      const file=fields.attachment.files[0];
      if(file){
        if(file.size>2*1024*1024)throw Error(L('حجم المرفق يتجاوز 2 ميجابايت.','Attachment exceeds 2 MB.'));
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
        body.attachment={name:file.name,data:data.split(',')[1]};
      }
      await api('requests',body);
      dialog.close();say('Request submitted.');
      const panel=$('#manager-device-requests');if(panel)await refreshRequestInbox(panel);
    }catch(error){status.textContent=t(error.message);}
    finally{submitting=false;updateSubmit();}
  };
  form.querySelector('[type=button]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);dialog.showModal();selectBranch();
}
function requestInbox(session) {
  const browser = [...(session?.deviceHistory ?? []),
    ...(session?.deviceRequests ?? []).map(item => ({ ...item, status: 'Pending' }))].map(item => ({
      ...item, id: item.requestId, type: 'Browser change', browser: true,
    }));
  const items = [...state.requests, ...browser].reverse().sort((a, b) => (b.submittedOn ?? '').localeCompare(a.submittedOn ?? ''));
  const statuses = [['Pending', 'Awaiting approval'], ['Approved', 'Approved'], ['Declined', 'Declined'], ['Expired', 'Expired'], ['Cancelled', 'Cancelled'], ['All', 'All requests']];
  const filters = '<div class="request-filters" aria-label="' + t('Status') + '">' + statuses.map(([status, label]) =>
    '<button type="button" data-request-filter="' + status + '" aria-pressed="' + (requestStatus === status) + '">' + t(label) + ' <span class="ux-tab-count">' + items.filter(item=>status==='All'?item.status!=='Pending':item.status===status).length + '</span></button>').join('') + '</div>';
  const rows = items.filter(item => requestStatus === 'All' ? item.status !== 'Pending' : item.status === requestStatus).map(item => {
    const directory = requestDirectory ?? state;
    const employee = directory.staff.find(member => member.id === item.staffId);
    const manager = directory.staff.find(member => member.id === (item.approverId ?? employee?.managerId));
    const tags = [item.type]; if (item.periodName) tags.push(item.periodName); if(item.loanAmount) tags.push(item.loanAmount+' SAR · '+item.repaymentInstallments+' دفعات');
    if (directory.leaveTypes.includes(item.type)) tags.unshift('Leave');
    if (item.date) tags.push(!item.end || item.date === item.end ? dateText(item.date) : `${dateText(item.date)} – ${dateText(item.end)}`);
    if (item.excuseType) tags.push(item.excuseType);
    if (item.reason) tags.push(item.reason);
    if (item.correctionReason) tags.push(item.correctionReason);
    if (item.proposedIn) tags.push(t('Check in') + ' ' + item.proposedIn);
    if (item.proposedOut) tags.push(t('Check out') + ' ' + item.proposedOut);
    const attachment = item.attachmentName ? '<a class="request-attachment" href="' + companyPrefix + '/api/request-attachment/' +
      encodeURIComponent(item.id) + '">' + esc(item.attachmentName) + '</a>' : '';
    const forwarded = item.status === 'Pending' && (item.approvalHistory ?? []).some(step =>
      step.status === 'Approved' && (step.approverId === (item.browser ? session?.deviceReviewerId : session?.reviewerId) ||
        (session?.companyReviewer && step.accountOwnerAction)));
    const canDecide = !forwarded && item.status === 'Pending' && (item.browser
      ? canReviewBrowserRequest(item,session?.deviceReviewerId,session?.companyReviewer)
      : !item.approvalSteps || (item.approverIds??[item.approverId]).includes(session?.reviewerId) || session?.companyReviewer);
    const nextApprover = item.approverRole ? t(item.approverRole) : manager ? staffName(manager) : '';
    const actions = forwarded ? '<div class="request-forwarded"><strong>' + L('وافقت على الطلب ✓','You approved this request ✓') +
      '</strong><small>' + esc(nextApprover ? L('بانتظار ','Waiting for ') + nextApprover : L('بانتظار المسؤول التالي','Waiting for the next approver')) +
      '</small></div>' : !canDecide ? '' : '<div class="request-row-actions">' + ['approve', 'reject'].map(decision => {
      const label = t(decision === 'approve' ? 'Approve' : 'Decline');
      return '<button type="button" class="button secondary compact" aria-label="' + esc(label) + '" title="' + esc(label) + '" ' + (item.browser ? 'data-device-decision="' + decision +
        '" data-device-staff="' + esc(item.staffId) + '" data-device-request="' + esc(item.id) : 'data-decision="' +
        (decision === 'approve' ? 'Approved' : 'Declined') + '" data-id="' + esc(item.id)) + '">' +
        (decision === 'approve' ? '✓ ' : '× ') + label + '</button>';
    }).join('') + '</div>';
    return ['<bdi>' + esc(item.id.slice(0, 8)) + '</bdi>', '<div class="request-chips">' + tags.map(tag =>
      '<span>' + esc(t(tag)) + '</span>').join('') + '</div><small>' + esc(employee ? staffName(employee) : (item.name ?? '')) +
      (item.note ? ' · ' + esc(item.note) : '') + '</small>' +
      (item.rejectionNote ? '<small>' + t('Rejection notes') + ' · ' + esc(item.rejectionNote) + '</small>' : '') + attachment,
      (item.approverRole ? '<strong>'+esc(t(item.approverRole))+'</strong>' : manager ? '<strong>' + esc(staffName(manager)) + '</strong><small>' + esc(t(manager.jobTitle ?? '')) + '</small>' : '—') + (item.approvalSteps?.length ? '<small>' + t('Approval step') + ' ' + ((item.approvalIndex??0)+1) + ' / ' + item.approvalSteps.length + '</small>' : ''),
      badge(item.status)+(item.autoApproved?'<small>'+ (language==='ar'?'اعتماد تلقائي بواسطة النظام':'Automatically approved by system')+'</small>':'' ) + actions,
      '<bdi>' + esc(dateText(item.submittedOn) || '—') + '</bdi><span hidden data-request-date="' + esc(item.submittedOn ?? '') + '" data-request-staff="' + esc(item.staffId ?? '') + '"></span>'];
  });
  return filters + (requestStatus === 'Pending' && rows.some(row => row[3].includes('data-decision="Approved"')) ?
    '<div class="actions"><button type="button" class="button secondary compact" data-queue-visible-approvals>' +
    t('Approve all visible requests') + '</button></div>' : '') +
    (requestStatus==='All'?'<p class="hint">'+t('Processed requests only. Pending requests stay in Awaiting approval until all steps finish.')+'</p>':'') + table(['Request number', 'Request', 'Approver', 'Status', 'Request day'].map(t), rows,
    t('No requests to show.'), 'requests-overview');
}
let requestManagerSession;
const approvalQueue = new Set();
let sendingApprovalId = null;
let nextApprovalAt = 0;
const serverApprovalTimes = new Map();
let approvalQueueCommand = Promise.resolve();
let approvalQueueBusy = 0;
const pendingApprovalClicks = new Set();
let approvalBatchTimer;
let approvalQueueChecked = false;
let lastApprovalFailure = 0;
let approvalQueueRunning = false;
let approvalQueuePaused = false;
const approvalDelay = 4000;
function updateApprovalRowFeedback() {
  for (const approve of document.querySelectorAll('button[data-decision="Approved"][data-id]')) {
    const id = approve.dataset.id;
    const queued = approvalQueue.has(id);
    const actions = approve.parentElement;
    const feedbackHost = actions;
    let feedback = feedbackHost.querySelector('.approval-row-feedback');
    let undo = feedbackHost.querySelector('.approval-row-undo');
    if (!queued && !feedback) continue;
    for (const control of actions.querySelectorAll('button[data-decision]')) {
      if (queued && !control.disabled) {
        control.disabled = true;
        control.dataset.approvalQueueLocked = '';
      } else if (!queued && Object.hasOwn(control.dataset, 'approvalQueueLocked')) {
        control.disabled = false;
        delete control.dataset.approvalQueueLocked;
      }
    }
    actions.classList.toggle('approval-row-queued', queued);
    if (!queued) {
      feedback?.remove();
      undo?.remove();
      continue;
    }
    if (!feedback) {
      feedback = document.createElement('span');
      feedback.className = 'approval-row-feedback';
      feedback.setAttribute('role', 'status');
      feedbackHost.append(feedback);
    }
    if (id === sendingApprovalId) {
      undo?.remove();
    } else if (!undo) {
      undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'button secondary compact approval-row-undo';
      undo.textContent = t('Undo queued approval');
      undo.onclick = () => {
        if (companyPrefix) {
          if (pendingApprovalClicks.delete(id)) {
            approvalQueue.delete(id);
            updateApprovalRowFeedback();
            approve.focus();
            return;
          }
          changeServerApprovalQueue({operation:'undo',id});
          return;
        }
        const first = approvalQueue.values().next().value === id;
        if (sendingApprovalId === id || !approvalQueue.delete(id)) return;
        if (first && nextApprovalAt && approvalQueue.size) nextApprovalAt = Date.now() + approvalDelay;
        updateApprovalRowFeedback();
        approve.focus();
        if (!approvalQueue.size && approvalQueuePaused) {
          approvalQueuePaused = false;
          showApprovalQueue('');
        }
      };
      feedbackHost.append(undo);
    }
    const due = companyPrefix ? serverApprovalTimes.get(id) :
      id === approvalQueue.values().next().value ? nextApprovalAt : 0;
    const remaining = Math.max(0, (due ?? 0) - Date.now());
    undo?.toggleAttribute('disabled',Boolean(due && !remaining));
    const countdown = remaining > 0 && id !== sendingApprovalId;
    const sending = id === sendingApprovalId || Boolean(due && !remaining);
    const label = countdown || sending ? L('جاري الإرسال','Sending…') : L('في الطابور','Queued');
    feedback.classList.toggle('is-sending', sending);
    if (countdown) feedback.title = t('Next approval in {seconds}s').replace('{seconds}', Math.ceil(remaining / 1000));
    else feedback.removeAttribute('title');
    const seconds = Math.ceil(remaining / 1000);
    const display = countdown ? label + ' ' + new Intl.NumberFormat(language).format(seconds) + L(' ث','s') : label;
    if (feedback.textContent !== display) feedback.textContent = display;
    if (countdown && !feedback.classList.contains('is-counting')) {
      feedback.style.setProperty('--approval-elapsed', (remaining - approvalDelay) + 'ms');
      feedback.style.setProperty('--approval-duration', approvalDelay + 'ms');
    }
    feedback.classList.toggle('is-counting', countdown);
  }
}
function showApprovalQueue(message) {
  let status = $('#approval-queue-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'approval-queue-status';
    status.className = 'toast approval-queue-status';
    status.setAttribute('role', 'status');
    document.body.append(status);
  }
  status.textContent = message;
  status.hidden = !message;
  if (approvalQueuePaused && approvalQueue.size) {
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.className = 'button secondary compact';
    resume.textContent = t('Continue remaining approvals');
    resume.onclick = () => { approvalQueuePaused = false; void processApprovalQueue(); };
    status.append(' ', resume);
  }
}
async function processApprovalQueue() {
  if (approvalQueueRunning || approvalQueuePaused) return;
  approvalQueueRunning = true;
  let saved = false;
  try {
    while (approvalQueue.size) {
      nextApprovalAt = Date.now() + approvalDelay;
      showApprovalQueue('');
      while (approvalQueue.size && Date.now() < nextApprovalAt) {
        updateApprovalRowFeedback();
        await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(1000, nextApprovalAt - Date.now()))));
      }
      nextApprovalAt = 0;
      if (!approvalQueue.size) break;
      const id = approvalQueue.values().next().value;
      sendingApprovalId = id;
      updateApprovalRowFeedback();
      try {
        await save('decision', { id, status: 'Approved' }, { refreshView: false });
        saved = true;
      } catch (error) {
        approvalQueue.delete(id);
        sendingApprovalId = null;
        updateApprovalRowFeedback();
        approvalQueuePaused = approvalQueue.size > 0;
        showApprovalQueue(t(error.message) + ' ' + t('Check the request status before sending it again.'));
        return;
      }
      approvalQueue.delete(id);
      sendingApprovalId = null;
      const panel = $('#manager-device-requests');
      if (panel) updateRequestInbox(panel);
      updateApprovalRowFeedback();
    }
    showApprovalQueue('');
    if (saved) {
      say('Queued approvals sent.');
      void refreshManagementAlerts();
    }
  } finally {
    approvalQueueRunning = false;
  }
}
function visibleApprovalIds(panel) {
  return [...(panel?.querySelectorAll('button[data-decision="Approved"][data-id]') ?? [])]
    .filter(control => !control.disabled && control.getClientRects().length && !approvalQueue.has(control.dataset.id))
    .map(control => control.dataset.id);
}
function queueApprovals(ids) {
  if (companyPrefix) {
    const additions = [...new Set(ids)].filter(id=>id&&!approvalQueue.has(id));
    if (!additions.length) return;
    const idle = !approvalQueue.size && !approvalQueueBusy;
    for (const id of additions) {
      approvalQueue.add(id);
      pendingApprovalClicks.add(id);
    }
    if (idle) {
      serverApprovalTimes.set(additions[0], Date.now() + approvalDelay);
      flushApprovalClicks();
    } else approvalBatchTimer ??= setTimeout(flushApprovalClicks, 400);
    updateApprovalRowFeedback();
    return;
  }
  for (const id of ids) if (id) approvalQueue.add(id);
  updateApprovalRowFeedback();
  void processApprovalQueue();
}
function flushApprovalClicks() {
  clearTimeout(approvalBatchTimer);
  approvalBatchTimer = undefined;
  const ids = [...pendingApprovalClicks];
  pendingApprovalClicks.clear();
  for (let start = 0; start < ids.length; start += 150) {
    changeServerApprovalQueue({operation:'enqueue',ids:ids.slice(start,start+150)});
  }
}
window.addEventListener('pagehide', flushApprovalClicks);
async function fetchApprovalQueue(body) {
  const response = await fetch(companyPrefix+'/api/approval-queue', body ? {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), keepalive:true, signal:AbortSignal.timeout(15000),
  } : {cache:'no-store',signal:AbortSignal.timeout(6000)});
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const result = isJson ? await response.json() : null;
  if (!response.ok || !result) {
    throw Error(result?.error || (language === 'ar'
      ? 'تعذّر تأكيد تحديث طابور الاعتماد. تحقق من الطلبات قبل المحاولة مجددًا.'
      : 'Could not confirm the approval queue update. Check the requests before trying again.'));
  }
  return result;
}
function applyApprovalQueueSnapshot(snapshot) {
  const removed = [...approvalQueue].some(id=>!pendingApprovalClicks.has(id)&&!snapshot.jobs.some(job=>job.id===id));
  approvalQueue.clear();
  serverApprovalTimes.clear();
  for (const {id,runAt} of snapshot.jobs) {
    approvalQueue.add(id);
    if (runAt !== null) serverApprovalTimes.set(id,Date.now()+runAt-snapshot.now);
  }
  for (const id of pendingApprovalClicks) approvalQueue.add(id);
  updateApprovalRowFeedback();
  if (snapshot.failure && snapshot.failure.at > lastApprovalFailure) {
    if (approvalQueueChecked) say(snapshot.failure.error,true);
    lastApprovalFailure = snapshot.failure.at;
  }
  approvalQueueChecked = true;
  const panel = $('#manager-device-requests');
  if (removed && panel) void refreshRequestInbox(panel, true);
}
function changeServerApprovalQueue(body) {
  approvalQueueBusy++;
  // Keep only one queue mutation in flight.
  approvalQueueCommand = approvalQueueCommand.then(async()=>{
    const {value,error} = await fetchApprovalQueue(body).then(value=>({value}),error=>({error}));
    approvalQueueBusy--;
    if (error) say(error.message,true);
    if (approvalQueueBusy) return;
    if (value) applyApprovalQueueSnapshot(value);
    else {
      for (const id of body.ids ?? []) approvalQueue.delete(id);
      updateApprovalRowFeedback();
      void refreshServerApprovalQueue();
    }
  });
}
let readingApprovalQueue = false;
let lastApprovalQueuePoll = 0;
async function refreshServerApprovalQueue() {
  if (!companyPrefix || readingApprovalQueue || approvalQueueBusy || !state?.canManageCompany && !state?.isCompanyOwner) return;
  const now = Date.now();
  const next = serverApprovalTimes.values().next().value;
  if (now - lastApprovalQueuePoll < (next && next <= now ? 1000 : approvalQueue.size ? 2500 : 15000)) return;
  lastApprovalQueuePoll = now;
  readingApprovalQueue = true;
  try {
    const command = approvalQueueCommand;
    const snapshot = await fetchApprovalQueue();
    if (!approvalQueueBusy && command === approvalQueueCommand) applyApprovalQueueSnapshot(snapshot);
  } catch { /* The next poll recovers the persisted queue. */ }
  finally { readingApprovalQueue = false; }
}
setInterval(()=>{
  if (companyPrefix && approvalQueue.size) updateApprovalRowFeedback();
  if (!document.hidden && (approvalQueue.size || $('#manager-device-requests'))) void refreshServerApprovalQueue();
},1000);
let requestDirectory;
let rejectionTarget;
function openRequestRejection(target) {
  rejectionTarget = { ...target.dataset };
  $('#request-rejection-form').reset();
  $('#request-rejection-error').textContent = '';
  $('#request-rejection-title').textContent = t('Rejection notes');
  $('#request-rejection-label').firstChild.textContent = t('Rejection notes');
  $('#confirm-request-rejection').textContent = t('Decline');
  $('#request-rejection-dialog').showModal();
  $('#request-rejection-form textarea').focus();
}
let managementAlerts = [];
let managementDocumentAlerts = [];
let managementDocumentIdentity;
const seenManagementAlerts = new Set();
let managementPopupTimer;
function managementReadStore() {
  const key = 'dawamkom-management-read:' + companyPrefix + ':' + (accountIdentity?.id ?? 'owner');
  let ids = [];
  try { ids = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  const read = new Set(Array.isArray(ids) ? ids : []);
  return {read, save(){ try {localStorage.setItem(key, JSON.stringify([...read].slice(-250)));} catch {} }};
}
function unreadManagementDocuments() {
  const {read} = managementReadStore();
  return managementDocumentAlerts.filter(alert => !read.has('document-' + alert.id + '-' + alert.expiresOn));
}
function managementAlertMarkup(alerts, manual) {
  const {read} = managementReadStore();
  const unread = alerts.filter(alert => !read.has(alert.id));
  const label = language === 'ar' ? 'تعليم كمقروء' : 'Mark as read';
  const toolbar = manual && unread.length ? '<button type="button" class="button secondary compact" data-management-read-all>' +
    (language === 'ar' ? 'تعليم الكل كمقروء' : 'Mark all as read') + '</button>' : '';
  return toolbar + (unread.length ? unread.map(alert =>
    '<div class="management-alert-row"><a class="management-alert" data-management-alert="' + esc(alert.id) + '" href="#' +
    esc(alert.page) + '"><strong>' + esc(alert.label) + '</strong><small>' + esc(alert.detail) + '</small></a>' +
    (manual && !read.has(alert.id) ? '<button type="button" class="button secondary compact" data-management-read="' +
      esc(alert.id) + '">' + label + '</button>' : '') +
    (alert.receive ? '<button type="button" class="button primary compact" data-follow-up-receive="'+esc(alert.receive.itemId)+'" data-version="'+alert.receive.expectedVersion+'">'+(language==='ar'?'استلام':'Receive')+'</button>' : '') +
    '</div>').join('') : '<p class="hint">' + t('No notifications yet.') + '</p>');
}
function closeManagementPopup() {
  clearTimeout(managementPopupTimer);
  $('#management-notification-dialog').hidden = true;
  $('#management-notifications').setAttribute('aria-expanded', 'false');
}
function showManagementPopup(alerts = managementAlerts, manual = false) {
  const {read} = managementReadStore();
  if (!alerts.some(alert => !read.has(alert.id)) || document.querySelector('dialog[open]')) return;
  const panel = $('#management-notification-dialog');
  if(!manual&&!panel.hidden&&panel.dataset.manual==='true'){drawManagementAlerts();return;}
  panel.hidden = false;
  $('#management-notifications').setAttribute('aria-expanded', 'true');
  $('#management-notification-list').innerHTML = managementAlertMarkup(alerts,manual);
  clearTimeout(managementPopupTimer);
  panel.dataset.manual = String(manual);
  if (!manual) managementPopupTimer = setTimeout(closeManagementPopup, notificationDisplay(state.notificationSettings?.display).seconds * 1000);
}
let refreshingManagementAlerts = false;
function drawManagementAlerts() {
  const count = $('#management-notification-count');
  const {read} = managementReadStore();
  const unread = managementAlerts.filter(alert => !read.has(alert.id)).length;
  count.hidden = !unread;
  count.textContent = new Intl.NumberFormat(language).format(unread);
  if (!unread && !$('#management-notification-dialog').hidden) closeManagementPopup();
  $('#management-notifications').setAttribute('aria-label', t('Notifications') + (unread ? ' (' + unread + ')' : ''));
  $('#management-notification-title').textContent = t('Notifications');
  $('#close-management-notifications').setAttribute('aria-label', t('Close'));
  $('#management-notification-list').innerHTML = managementAlertMarkup(managementAlerts,true);
}
const documentNotices=documentAlertPresenter(()=>language);
async function refreshManagementAlerts() {
  if (!state || superAdmin || document.hidden || refreshingManagementAlerts) return;
  refreshingManagementAlerts = true;
  try {
    const response = await fetch(companyPrefix + '/api/requests', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const snapshot = await response.json();
    requestManagerSession=snapshot;refreshHomeReviewCards();
    managementDocumentAlerts = snapshot.documentAlerts ?? [];
    managementDocumentIdentity = companyPrefix+'|'+(snapshot.deviceReviewerId??'owner');
    documentNotices.update(unreadManagementDocuments(),managementDocumentIdentity);
    const staff = new Map(snapshot.staff.map(person => [person.id, person]));
    managementAlerts = snapshot.requests.filter(request => request.status === 'Pending' &&
      (!request.approvalSteps || (request.approverIds??[request.approverId]).includes(snapshot.reviewerId) || snapshot.companyReviewer)).map(request => ({
        id: 'request-' + request.id + '-' + (request.approverId ?? ''), page: 'requests', label: t(request.type), detail: staff.get(request.staffId) ? staffName(staff.get(request.staffId)) : '',
      })).concat((snapshot.deviceRequests ?? []).map(request => ({
        id: 'browser-' + request.staffId + '-' + request.requestId, page: 'requests', label: t('Browser change'), detail: request.name,
      })), (snapshot.documentAlerts ?? []).map(document => ({
        id: 'document-' + document.id + '-' + document.expiresOn, page: 'followup', label: document.kind?(language==='ar'?(document.kind==='residence'?'تنبيه انتهاء إقامة':'تنبيه انتهاء رخصة عمل'):(document.kind==='residence'?'Residence permit expiry':'Work permit expiry')):t(document.days<0?'Expired documents':'Document expiring soon'), detail: document.name+' · '+dateText(document.expiresOn),
      })), (snapshot.residencyAlerts??[]).filter(alert=>!(snapshot.documentAlerts??[]).some(d=>d.id==='residence:'+alert.staffId)).map(alert=>({
        id:'residency-'+alert.staffId+'-'+alert.expiresOn+'-'+(alert.daysRemaining<0?'expired':'upcoming'),
        page:'staff/'+encodeURIComponent(alert.staffId)+'/overview',
        label:t(alert.daysRemaining<0?'Residence permit expired':'Residence permit expiring soon'),
        detail:staffName(alert)+' · '+t('Residence expiry date')+': '+dateText(alert.expiresOn),
      })),(snapshot.followUpAlerts??[]).map(item=>({id:'follow-up-'+item.id+'-'+item.version+'-'+item.overdue,page:'followup',label:followUpLabel(item.overdue?'متابعة متأخرة':'متابعة مسندة إليك',item.overdue?'Overdue follow-up':'Follow-up assigned to you'),detail:item.name+(item.dueOn?' · '+dateText(item.dueOn):''),receive:item.receivable?{itemId:item.id,expectedVersion:item.version}:null})));
    drawManagementAlerts();
    const fresh = newNotificationIds(managementAlerts, seenManagementAlerts);
    const {read} = managementReadStore();
    const transient=fresh.filter(alert=>!alert.id.startsWith('document-')&&!read.has(alert.id));
    if (transient.length && notificationDisplay(state.notificationSettings?.display).mode === 'popup') showManagementPopup(transient);
  } catch { /* Retry when the bell is opened or at the next refresh. */ }
  finally { refreshingManagementAlerts = false; }
}
function updateRequestInbox(panel) {
  const markup = requestInbox(requestManagerSession);
  if (panel.requestMarkup === markup) return;
  const focused = panel.contains(document.activeElement) && document.activeElement;
  const focusData = focused && Object.entries(focused.dataset);
  panel.innerHTML = panel.requestMarkup = markup;
  updateApprovalRowFeedback();
  mountRequestFilters({ state, language, companyPrefix, t, staffName, bindSideDrawer });
  if (focusData?.length) [...panel.querySelectorAll('button')].find(button =>
    focusData.every(([key, value]) => button.dataset[key] === value))?.focus();
}
async function refreshRequestInbox(panel, refreshQueued = false) {
  if (panel.getAttribute('aria-busy') === 'true') return;
  panel.setAttribute('aria-busy', 'true');
  const current = state;
  try {
    const response = await fetch(companyPrefix + '/api/requests', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const snapshot = await response.json();
    if (!panel.isConnected || state !== current || !refreshQueued && panel.querySelector('.request-row-actions button:disabled')) return;
    state.requests = snapshot.requests;
    requestDirectory = snapshot;
    requestManagerSession = snapshot;
    updateRequestInbox(panel);
  } catch { /* The next refresh retries transient failures. */ }
  finally {
    panel.setAttribute('aria-busy', 'false');
  }
}
let addingStaff = false;
let editingStaff;
const openStaffBranches = new Set();
let profileStaffId;
let profileTab = 'overview';
let profileAttendanceDate;
let staffActivationObserver;
let accountIdentity;
function accountPage() {
  if (!accountIdentity) return '<p>' + t('Loading…') + '</p>';
  return title(t('Personal profile'), esc(accountDisplayName())) + card(t('Personal profile'),
    '<dl class="staff-profile-fields"><div><dt>' + t('Name') + '</dt><dd>' + esc(accountDisplayName()) +
    '</dd></div><div><dt>' + t('Email') + '</dt><dd><bdi>' + esc(accountIdentity.email) + '</bdi></dd></div></dl>') +
    card(t('Change password'), '<form id="account-password-form"><label>' + t('New password') +
      '<input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><p class="hint">' +
      t('Use 10–128 characters with uppercase, lowercase, a number and a symbol.') + '</p><label>' + t('Confirm password') +
      '<input type="password" name="confirmation" autocomplete="new-password" minlength="10" maxlength="128" required></label>' +
      button(t('Change password')) + '<p id="account-password-feedback" role="status"></p></form>');
}
async function loadAccountIdentity() {
  if (superAdmin || !companyPrefix) return;
  try {
    const response = await fetch(companyPrefix + '/api/account');
    if (!response.ok) return;
    accountIdentity = await response.json();
    const avatar=$('.account-avatar');avatar.dataset.profileAvatar='';avatar.setAttribute('role','button');avatar.setAttribute('tabindex','0');avatar.removeAttribute('aria-hidden');
    avatar.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();avatar.click();}};
    displayProfileAvatar(accountIdentity.photo);
    $('#account-name').textContent = accountDisplayName();
    $('#account-email').textContent = accountIdentity.email;
    const scope=$('.ux-scope'),person=state.staff.find(item=>item.id===accountIdentity.id);if(scope&&!accountIdentity.owner&&person)scope.textContent=t(person.role)+' · '+(roleBranches(person).map(id=>state.locations.find(site=>site.id===id)?.name).filter(Boolean).join('، ')||t('No branches assigned'));
    $('#account-menu').hidden = false;
    $('#account-language-slot').append($('#language'));
    refreshHomeReviewCards();
    render();
  } catch { /* Keep account controls hidden until the signed-in identity is available. */ }
}
function staffServiceDuration(joinDate, today) {
  if (!joinDate || !today || joinDate > today) return '';
  const start = new Date(joinDate + 'T00:00:00Z');
  const end = new Date(today + 'T00:00:00Z');
  if (!Number.isFinite(+start) || !Number.isFinite(+end)) return '';
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() -
    Number(end.getUTCDate() < Math.min(start.getUTCDate(), lastDay));
  if (!months) return L('أقل من شهر', 'Less than a month');
  const parts = [[Math.floor(months / 12), 'year'], [months % 12, 'month']].filter(([count]) => count)
    .map(([count, unit]) => new Intl.NumberFormat(language, {style:'unit', unit, unitDisplay:'long'}).format(count));
  return new Intl.ListFormat(language, {type:'conjunction'}).format(parts);
}
function staffProfile() {
  const match = location.hash.match(/^#staff\/([^/]+)\/(overview|attendance|leaves|personal)$/);
  profileStaffId = match?.[1];
  profileTab = match?.[2] ?? 'overview';
  const person = state.staff.find(item => item.id === profileStaffId && item.status !== 'Removed');
  if (!person) return '<a class="settings-back" href="#staff">' + t('Staff') + '</a><p>' + t('Employee not found.') + '</p>';
  const tabs = [['overview', 'Organization overview'], ['attendance', 'Attendance'], ['leaves', 'Leaves'], ['personal', 'Personal profile']];
  let content;
  if (profileTab === 'attendance') {
    const day = profileAttendanceDate ?? state.today;
    const records = state.punches.filter(entry => entry.staffId === person.id && entry.date === day)
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    content = '<label>' + t('Date') + '<input type="date" id="profile-attendance-date" value="' + esc(day) +
      '" max="' + esc(state.today) + '"></label>' + attendanceTable(day, person.id) +
      table(['Type', 'Time'].map(t), records.map(entry => [t(entry.kind === 'in' ? 'Check in' : 'Check out'), time(entry.time)]),
        t('No records yet.'));
  } else if (profileTab === 'personal') {
    content = '<dl class="staff-profile-fields">' + [['Arabic name',person.nameAr||person.name],['English name',person.nameEn],[person.nationality&&person.nationality!=='SA'?'Residence number':'Identity number',person.identityNumber],['Email',person.email],['Phone',person.phone],['Date of birth (Gregorian)',person.birthDate],['Job title',t(person.jobTitle??'Unassigned')],['Joining date (Gregorian)',person.joinDate]].map(([label,value])=>'<div><dt>'+t(label)+'</dt><dd>'+esc(dateText(value)||'—')+'</dd></div>').join('') + '</dl><details class="ux-login-section"><summary>'+t('Login information')+' · '+t('Change password')+'</summary>' + (person.status === 'Active'
      ? '<form id="staff-password-form"><label>' + t('New password') +
        '<input type="password" name="password" minlength="10" maxlength="128" autocomplete="new-password" required aria-describedby="staff-password-help"></label>' +
        '<p class="hint" id="staff-password-help">' + t('Use 10–128 characters with uppercase, lowercase, a number and a symbol.') + '</p>' +
        '<label>' + t('Confirm password') + '<input type="password" name="confirmation" minlength="10" maxlength="128" autocomplete="new-password" required></label>' +
        button(t('Change password')) + '<button type="button" class="button secondary" data-staff-recovery="'+esc(person.id)+'">'+t('Send password recovery link')+'</button><p id="staff-password-feedback" role="status"></p></form>'
      : '<p class="hint">' + t('The employee must activate their account first.') + '</p>') + '</details>';
  } else if (profileTab === 'leaves') {
    content = staffLeaveDetails(person);
  } else {
    const branch = state.locations.find(item => item.id === person.branchId);
    const manager = [...state.staff,...(state.directManagerChoices??[])].find(item => item.id === person.managerId);
    const fields = [['Arabic name', person.nameAr || person.name], ['English name', person.nameEn], [person.nationality&&person.nationality!=='SA'?'Residence number':'Identity number',person.identityNumber], ['Email', person.email],
      ['Phone', person.phone], ['Job title', t(person.jobTitle ?? 'Unassigned')], ['Branch', branch?.name],
      ['Direct manager', manager && staffName(manager)], ['Joining date (Gregorian)', person.joinDate],
      ['Length of service', staffServiceDuration(person.joinDate, state.today)],
      ['Date of birth (Gregorian)', person.birthDate],
      ['Date of birth (Hijri)', person.birthDate ? hijriBirthDate(Date.parse(person.birthDate)) : ''],
      ['Status', t(person.status)]];
    content = '<dl class="staff-profile-fields">' + fields.map(([label, value]) =>
      '<div><dt>' + t(label) + '</dt><dd>' + esc(dateText(value) || '—') + '</dd></div>').join('') + '</dl>';
    const viewer = state.staff.find(item => item.id === accountIdentity?.id);
    if (state.isCompanyOwner || !companyPrefix || (viewer && permissionsFor(state,viewer.role).staffEdit)) {
      content = '<div class="actions"><button type="button" class="button secondary" data-edit-staff="' +
        esc(person.id) + '" data-edit-contract aria-haspopup="dialog">' +
        (language === 'ar' ? 'تعديل العقد' : 'Edit contract') + '</button></div>' + content;
    }
  }
  if(profileTab==='overview'||profileTab==='personal') {
    const residence=Boolean(person.nationality&&person.nationality!=='SA');
    const identity=residence?[['Residence expiry date',person.residencyExpiryDate]]:[];
    if(identity.length)content+='<dl class="staff-profile-fields">'+identity.map(([label,value])=>'<div><dt>'+t(label)+'</dt><dd>'+esc(dateText(value)||'—')+'</dd></div>').join('')+'</dl>';
  }
  return '<a class="settings-back" href="#staff">' + t('Staff') + '</a><h1>' + esc(staffName(person)) +
    '</h1><nav class="schedule-tabs staff-profile-tabs" aria-label="' + t('Personal profile') + '">' +
    tabs.map(([key, label]) => '<a href="#staff/' + esc(person.id) + '/' + key + '"' +
      (profileTab === key ? ' aria-current="page"' : '') + '>' + t(label) + '</a>').join('') +
    '</nav><section class="card staff-profile-content">' + content + '</section>' +
    (profileTab === 'overview' && editingStaff?.id === person.id ? staffEditor() : '');
}
function closeStaffDialog() {
  const id = editingStaff?.id;
  addingStaff = false;
  editingStaff = undefined;
  render();
  (id ? $('[data-edit-staff="' + CSS.escape(id) + '"]') : $('#add-staff'))?.focus();
}
const staffName = person => (language === 'ar' ? person.nameAr : person.nameEn) || person.name || person.nameAr || person.nameEn || '';
const accountDisplayName = () => {
  const person = state?.staff.find(item => item.id === accountIdentity?.id);
  return person ? staffName(person) : accountIdentity?.name ?? '';
};
const commonGivenNames = {
  Male: new Set('محمد احمد محمود مصطفى عبدالله عبدالعزيز عبدالرحمن عبدالكريم عمر علي خالد ابراهيم يوسف يحيى حسن حسين سعد سعود فيصل فهد سلمان تركي سامي طارق ناصر ماجد mohammed muhammad ahmed ahmad omar ali khalid ibrahim yousef yahya hassan hussein abdulkarim'.split(' ')),
  Female: new Set('فاطمه عائشه مريم ساره سارا نوره نورا هند ريم دانه وفاء هدى زينب خديجه لطيفه هيفاء اسماء منيره fatima aisha maryam sara sarah noura nora reem wafa'.split(' ')),
};
function suggestStaffGender(name) {
  const firstName = name.trim().split(/\s+/)[0].toLowerCase().normalize('NFKC')
    .replace(/\p{M}|ـ/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  return genders.find(gender => commonGivenNames[gender].has(firstName)) ?? '';
}
const birthCalendar = new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura-nu-latn', {
  timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
});
const millisecondsPerDay = 86400000;
function hijriBirthDate(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  const parts = birthCalendar.formatToParts(timestamp);
  return ['year', 'month', 'day'].map((field, index) =>
    parts.find(part => part.type === field).value.padStart(index === 0 ? 4 : 2, '0')).join('-');
}
function gregorianBirthDate(value, today) {
  let target = westernDigits(value.trim()).replaceAll('/', '-');
  if(/^\d{2}-\d{2}-\d{4}$/.test(target)){const [day,month,year]=target.split('-');target=year+'-'+month+'-'+day;}
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|30)$/.test(target)) return '';
  let start = Math.floor(Date.parse('0622-07-19') / millisecondsPerDay);
  let end = Math.floor(Date.parse(today) / millisecondsPerDay);
  while (start <= end) {
    const day = Math.floor((start + end) / 2);
    const timestamp = day * millisecondsPerDay;
    const candidate = hijriBirthDate(timestamp);
    if (candidate === target) return new Date(timestamp).toISOString().slice(0, 10);
    if (candidate < target) start = day + 1;
    else end = day - 1;
  }
  return '';
}
function staffEditor(branches = new Map(state.locations.map(branch => [branch.id, branch.name]))) {
  const input = (label, name, attrs) => '<label>' + t(label) + '<input name="' + name + '" ' + attrs + '></label>';
  const select = (label, name, options, optional = false) => '<label>' + t(label) + '<select name="' + name + '"' +
    (optional ? '' : ' required') + '><option value="">' + t(optional ? 'Choose later' : 'Choose an option') + '</option>' +
    options.map(([value, label, disabled]) => '<option value="' + esc(value) + '"'+(disabled?' disabled':'')+'>' + esc(label) + '</option>').join('') + '</select></label>';
  const choices = values => values.map(value => [value, t(value)]);
  const termChoices=choices(contractTerms);
  if(editingStaff?.contractTerm && !contractTerms.includes(editingStaff.contractTerm))
    termChoices.unshift([editingStaff.contractTerm,t(editingStaff.contractTerm)+' — '+t('Previously saved'),true]);
  const countryNames = new Intl.DisplayNames(language, { type: 'region' });
  const countries = nationalityCodes.map(code => [code, countryNames.of(code)])
    .sort((a, b) => a[1].localeCompare(b[1], language));
  const managers = (state.directManagerChoices??state.staff).filter(person => eligibleDirectManager(state,person,editingStaff?.branchId,editingStaff?.id))
    .map(person => [person.id, staffName(person)]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', dateStyle: 'short' }).format(new Date());
  const form = '<form id="staff-form"><p class="hint">'+t('Complete the required fields. Branch and direct manager may be assigned later.')+'</p><section aria-labelledby="staff-personal-heading">' +
    '<h3 id="staff-personal-heading">' + t('Personal information') + '</h3><div class="fields">' +
    input('Arabic name', 'nameAr', 'required maxlength="120" dir="rtl"') +
    input('English name', 'nameEn', 'required maxlength="120" dir="ltr"') +
    input('Email', 'email', 'type="email" required maxlength="254"') +
    input('Phone', 'phone', 'type="tel" required maxlength="32" dir="ltr"') +
    input('Date of birth (Gregorian)', 'birthDate', 'type="date" required max="' + esc(state.today) + '"') +
    input('Date of birth (Hijri)', 'birthDateHijri', 'type="text" dir="ltr" maxlength="10" placeholder="dd/mm/yyyy" autocomplete="off"') +
    select('Nationality', 'nationality', countries) +
    '<label><span id="staff-identity-label">'+t('Identity number')+'</span><input name="identityNumber" required maxlength="20" inputmode="numeric" dir="ltr"></label>' +
    '<label id="staff-residency-expiry" hidden><span>'+t('Residence expiry date')+'</span><input name="residencyExpiryDate" type="date" disabled></label>' +
    select('Gender', 'gender', choices(genders)) + '</div></section>' +
    '<section aria-labelledby="staff-employment-heading"><h3 id="staff-employment-heading">' +
    t('Employment information') + '</h3><div class="staff-employment-layout"><div class="fields">' +
    select('Job title', 'jobTitle', choices(state.jobTitles ?? jobTitles)) +
    (state.isCompanyOwner||(state.canManageRolePermissions&&!state.rolePermissions?.[editingStaff?.role]?.managePermissions)?select(language==='ar'?'دور الصلاحية':'Permission role','permissionRole',choices((state.staffRoles??roleOptions).filter(role=>state.isCompanyOwner||!state.rolePermissions?.[role]?.managePermissions||role===editingStaff?.role))):'') +
    (branches.size ? select('Branch', 'branchId', [...branches], true) : '') +
    select('Direct manager', 'managerId', managers, true) +
    input('Joining date (Gregorian)', 'joinDate', 'type="date" lang="en" required value="' + esc(today) + '"') +
    '<div class="staff-leave-entry">' +
    select('Annual leave entitlement (days)', 'annualLeave', annualLeaveDays.map(value => [value, value])) +
    input('Current accrued balance', 'currentLeaveBalance', 'type="number" min="-99999" max="99999" step="0.01"') + '</div>' +
    '<div class="staff-contract-fields">'+select('Contract term', 'contractTerm', termChoices) +
    select('Contract type', 'contractType', choices(contractTypes)) +
    '<div id="contract-custom" hidden>' + input('Contract length in months', 'contractMonths', 'type="number" min="1" max="600" disabled') + '</div></div>' +
    select('Probation period (days)', 'probation', probationDays.map(value => [value, value])) +
    (editingStaff?.probationDays != null && !probationDays.includes(editingStaff.probationDays)
      ? '<small class="hint">' + t('Previously saved probation period') + ' · ' + esc(editingStaff.probationDays) + '</small>' : '') +
    '</div><aside class="ux-request-summary staff-balance-preview" role="status"></aside></div>' +
    '<fieldset class="staff-default-periods"><legend>' + t('Default work periods') + '</legend>' +
    '<label class="period-flexible-option">' + t('Exempt from attendance policy') + '<input type="checkbox" name="attendanceExempt"' +
    (editingStaff?.attendanceExempt ? ' checked' : '') + '></label>' +
    '<div id="staff-period-choices">' + (state.workPeriods?.length ? periodChoices(editingStaff ? defaultPeriodIds(editingStaff) : [], 'defaultPeriodId', undefined, editingStaff?.branchId || (state.locations.length===1 ? state.locations[0].id : undefined)) :
      '<p class="hint">' + t('Define a period in Work schedule settings to assign it here.') + '</p>') + '</div></fieldset></section>' +
    '<section><div data-staff-financial><details class="staff-salary-disclosure"' + (!editingStaff && state.canViewStaffSalary !== false ? ' open' : '') + '><summary><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/></svg> '+
    t('Salary information') + ' <bdi class="staff-salary-mask">••••••</bdi></summary><div class="fields">' +
    input('Monthly base salary (SAR)', 'salary', 'type="number" min="0.01" max="999999999.99" step="0.01" required') +
    input('Monthly allowances (SAR)', 'allowances', 'type="number" min="0" max="999999999.99" step="0.01" value="0" required') +
    input('Total salary (SAR)', 'totalSalary', 'type="number" step="0.01" readonly aria-live="polite"') +
    '</div><div class="fields staff-bank-fields">' +
    input('IBAN', 'iban', 'type="text" dir="ltr" maxlength="40" autocomplete="off" placeholder="SA" aria-describedby="staff-iban-note"') +
    '<label>' + t('Bank name') + '<input data-staff-bank readonly aria-live="polite" tabindex="-1"></label>' +
    '</div><small id="staff-iban-note" class="hint">' + t('The bank is identified automatically from the Saudi IBAN.') + '</small><div class="fields">' +
    select('GOSI scheme', 'gosiScheme', [['old',t('Old scheme')],['new',t('New scheme')],['none',t('Not subject')]], true) +
    input('GOSI contribution wage (SAR)', 'gosiBase', 'type="number" min="0" max="45000" step="0.01"') +
    select('Subject to SANED', 'gosiSaned', [['yes',t('Yes')],['no',t('No')]]) +
    '</div></details></div></section><div class="ux-form-footer">' + button(t('Save employee')) + '<button type="button" id="cancel-staff-draft" class="button secondary">'+t('Cancel')+'</button></div></form>';
  return '<dialog id="staff-dialog" aria-labelledby="staff-title"><header><h2 id="staff-title">' +
    t(editingStaff ? 'Edit employee' : 'Add new employee') + '</h2><button type="button" class="button secondary" id="close-staff" aria-label="' +
    t('Close') + '">×</button></header>' + form + '</dialog>';
}
function staff() {
  const branches = new Map(state.locations.map(branch => [branch.id, branch.name]));
  const directory = state.staff.filter(person => person.status !== 'Removed')
    .sort((a, b) => Number(b.status === 'Active') - Number(a.status === 'Active'));
  const staffTable = people => table(['Name', 'Email', 'Phone', 'Job title', ...(branches.size ? ['Branch'] : []), 'Status', 'Actions'].map(t), people.map(person =>
      ['<a class="staff-profile-name" href="#staff/' + esc(person.id) + '/overview">' +
        esc(staffName(person)) + '</a>', '<bdi>' + esc(person.email) + '</bdi>', '<bdi>' + esc(person.phone || '—') + '</bdi>',
        esc(t(person.jobTitle === null ? 'Unassigned' : person.jobTitle || person.role || 'Unassigned')),
        ...(branches.size ? [esc(branches.get(person.branchId) ?? '—')] : []), badge(person.status==='Pending activation'&&person.activationEmailSent?'Activation email sent; awaiting activation':person.status),
        '<div class="activation-actions"><details class="staff-row-menu"><summary class="button secondary compact" aria-label="' + t('Actions') + '">⋯</summary><div><button type="button" class="button secondary compact staff-edit" data-edit-staff="' + esc(person.id) +
          '" aria-haspopup="dialog" aria-label="' + t('Edit employee') + '" title="' + t('Edit employee') + '">' + L('تعديل','Edit') + '</button>' +
          '<button type="button" class="button secondary compact" data-remove-staff="' + esc(person.id) + '">' +
          t('Delete employee') + '</button></div></details>' + (person.canCopyActivation ? activationShortcuts('staff',person) : '') + '</div>']), t('No staff members yet.'));
  let staffDirectory = staffTable(directory);
  if (state.isCompanyOwner && branches.size) {
    const groups = [...branches].map(([id, name]) => ({ id, name, people: directory.filter(person => person.branchId === id) }));
    const unassigned = directory.filter(person => !branches.has(person.branchId));
    if (unassigned.length) groups.push({ id: 'unassigned', name: t('Unassigned'), people: unassigned });
    staffDirectory = groups.map(group => '<details class="staff-branch-group" data-staff-branch="' + esc(group.id) + '"' +
      (openStaffBranches.has(group.id) ? ' open' : '') + '><summary><strong>' + esc(group.name) +
      '</strong><span>' + new Intl.NumberFormat(language).format(group.people.length) + '</span></summary>' +
      '<p class="empty staff-branch-no-matches">' + (language === 'ar' ? 'لا يوجد موظفون يطابقون المرشحات في هذا الفرع.' : 'No employees in this branch match the filters.') + '</p>' +
      staffTable(group.people) + '</details>').join('');
  }
  return title(t('Staff'), t('Manage your staff list and prepare invitations.')) +
      '<div class="period-toolbar staff-add-toolbar"><button type="button" id="add-staff" class="button primary" aria-expanded="' +
      addingStaff + '" aria-haspopup="dialog">' + t('Add employee') + '</button><button type="button" id="import-staff" class="button secondary">'+(language==='ar'?'استيراد موظفين':'Import employees')+'</button></div>' +
    (addingStaff || editingStaff ? staffEditor(branches) : '') +
    '<section class="card staff-directory"><h2>' + t('Staff directory') + '</h2>' +
    staffDirectory + '</section>';
}
const attendancePunchIndex = new WeakMap();

function punchesByEmployee(entries) {
  let indexed = attendancePunchIndex.get(entries);
  if (indexed) return indexed;
  indexed = new Map();
  for (const entry of entries) {
    if (!indexed.has(entry.staffId)) indexed.set(entry.staffId, []);
    indexed.get(entry.staffId).push(entry);
  }
  for (const punches of indexed.values()) punches.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  attendancePunchIndex.set(entries, indexed);
  return indexed;
}

function attendanceTable(day, staffId) {
  const query = attendanceSearch.trim().toLowerCase();
  const branchNames = new Map(state.locations.map(branch => [branch.id, branch.name]));
  const periods = new Map((state.workPeriods ?? []).map(period => [period.id, period]));
  const punches = punchesByEmployee(state.punches);
  const formatDuration = minutes => {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return [hours || !remainder ? hours + ' ' + (language === 'ar' ? t('Hours unit') : 'h') : '',
      remainder ? remainder + ' ' + (language === 'ar' ? t('Minutes unit') : 'min') : ''].filter(Boolean).join(' ');
  };
  const rows = state.staff.filter(person => (!staffId || person.id === staffId) && (person.status !== 'Removed' ||
    punches.get(person.id)?.some(entry => entry.date === day)) &&
    (staffId || ((!attendanceJobTitle || person.jobTitle === attendanceJobTitle) &&
      (!attendanceListBranch || person.branchId === attendanceListBranch) &&
      (!attendanceSelectedEmployees || attendanceSelectedEmployees.has(person.id)))) &&
    (staffId || !query || [person.name, person.nameAr, person.nameEn].some(name => name?.toLowerCase().includes(query)))).map(person => {
    const scheduled = effectivePeriodIds(state, person, day)
      .map(id => periodOnDay(periods.get(id),day)).filter(Boolean).sort((a, b) => (a.start || '24:00').localeCompare(b.start || '24:00') ||
        (a.end || '24:00').localeCompare(b.end || '24:00') || a.id.localeCompare(b.id));
    const entries = punches.get(person.id) ?? [];
    const overnight = scheduled.some(period => period.end < period.start);
    const daily = entries.filter(entry => entry.date === day);
    const first = daily.find(entry => entry.kind === 'in');
    const dayStart = Date.parse(day + 'T00:00:00+03:00');
    const dayEnd = dayStart + 86400000;
    let open, lastOut, worked = 0, completed = false;
    for (const entry of entries) {
      if (entry.kind === 'in') open = entry;
      if (entry.kind !== 'out' || !open) continue;
      const began = Date.parse(open.time), finished = Date.parse(entry.time);
      const elapsed = finished - began;
      if (open.flexible) {
        const assigned = scheduled.filter(isFlexiblePeriod).map(period => periodBounds(period, day)).find(range => range.start === open.shiftStart);
        const validDay = open.shiftStart == null || assigned || (open.date === day && open.shiftEnd == null);
        const portion = validDay ? Math.max(0, Math.min(finished, open.shiftEnd ?? Infinity, assigned?.end ?? dayEnd) - Math.max(began, assigned?.start ?? dayStart)) : 0;
        if (portion > 0) {
          worked += portion;
          completed = true;
          lastOut = entry;
        }
      } else if (open.date === day && (entry.date === day || (overnight && elapsed <= 86400000))) {
        worked += elapsed;
        completed = true;
        lastOut = entry;
      }
      open = undefined;
    }
    const minutes = Math.floor(worked / 60000);
    const status = attendanceState(state, person, day);
    const statusLabel = status === 'Approved leave' ? approvedLeaveTypesOn(state, person.id, day).map(t).join(' / ') : t(status);
    const required = scheduled.reduce((total, period) => total + (period.duration ?? Math.max(0, (periodBounds(period,day).end-periodBounds(period,day).start)/60000)), 0);
    const shortfall = scheduled.length && required > 0 && lastOut ? Math.max(0, required - minutes) : null;
    const branchName = !staffId && !attendanceListBranch && branchNames.size > 1 && branchNames.get(person.branchId);
    return { status, scheduled, cells: [
      '<button type="button" class="attendance-person" data-attendance-person="' + esc(person.id) + '" data-day="' + esc(day) + '">' + esc(staffName(person)) + '</button>' + (branchName ? '<small class="attendance-person-branch">' + esc(branchName) + '</small>' : '') + (person.jobTitle ? '<small>' + esc(t(person.jobTitle)) + '</small>' : ''),
      '<span data-attendance-status="' + esc(status) + '" class="badge ' + (['Present','Working'].includes(status) ? 'green' : ['Absent','Incomplete record'].includes(status) ? 'red' : 'amber') + '">' + esc(statusLabel) + '</span>',
      scheduled.length ? scheduled.map(period => '<div class="attendance-shift"' + periodColor(period) + '><strong>' + esc(period.name) + '</strong><small><bdi>' +
        esc(periodHours(period)) + '</bdi>' + (isFlexiblePeriod(period) ? '' : ' · ' + esc(formatDuration(period.duration))) + '</small></div>').join('') : t('Not scheduled'),
      time(first?.time), time(lastOut?.time ?? daily.findLast(entry => entry.kind === 'out')?.time),
      completed ? esc(formatDuration(minutes)) : '—',
      shortfall === null ? '—' : esc(formatDuration(shortfall)),
      esc(t(daily.findLast(entry => entry.device)?.device ?? person.approvedDevice ?? '—')),
    ] };
  });
  const sortHeader = (key, label) => staffId ? t(label) : {
    sort: attendanceSort === key ? (key === 'schedule' ? 'ascending' : 'other') : 'none',
    label: '<button type="button" class="attendance-sort" data-attendance-sort="' + key + '" aria-pressed="' +
      (attendanceSort === key) + '">' + t(label) + '<span aria-hidden="true">' + (attendanceSort === key ? '↓' : '↕') + '</span></button>',
  };
  if (!staffId && attendanceSort) rows.sort((a, b) => compareAttendanceRows(a, b, attendanceSort));
  return table([t('Staff member'), sortHeader('status', 'Status'), sortHeader('schedule', 'Scheduled shift'),
    ...['First punch-in', 'Latest punch-out', 'Worked duration', 'Shortfall', 'Attendance device'].map(t)],
    rows.map(row => row.cells), t(query ? 'No matching employees.' : 'No staff members yet.'), 'daily-attendance-table');
}
function openAttendanceDetails(trigger) {
  const person = state.staff.find(item => item.id === trigger.dataset.attendancePerson);
  if (!person) return;
  const day = trigger.dataset.day, cells = [...trigger.closest('tr').cells];
  const label = (arabic, english) => language === 'ar' ? arabic : english;
  const entries = state.punches.filter(entry => entry.staffId === person.id && (entry.date === day ||
    (entry.kind === 'out' && entry.shiftStart != null && new Date(entry.shiftStart + 10800000).toISOString().slice(0,10) === day)))
    .sort((a,b) => Date.parse(a.time)-Date.parse(b.time));
  const metrics = [[t('Status'), cells[1].innerHTML], [t('Scheduled shift'),cells[2].innerHTML],
    [t('First punch-in'),cells[3].innerHTML],[t('Latest punch-out'),cells[4].innerHTML],
    [t('Worked duration'),cells[5].innerHTML],[t('Shortfall'),cells[6].innerHTML]];
  const overtimePeriods = correctionPeriods(state, person, day).filter(range => range.period.overtime);
  if (overtimePeriods.length) {
    const minutes = overtimePeriods.reduce((total, range) => total + scheduledOvertimeMinutes(range, periodPunches(state, person, range)), 0);
    metrics.push([t('Calculated overtime'), esc(formatDuration(minutes))]);
  }
  const requests = state.requests.filter(request => request.staffId === person.id && request.date &&
    request.date <= day && day <= (request.end || request.date))
    .sort((a,b) => (b.submittedOn ?? '').localeCompare(a.submittedOn ?? ''));
  const requestCards = requests.map(request => {
    const details = [request.excuseType, request.reason, request.correctionReason, request.note,
      request.proposedIn && t('Check in') + ' ' + request.proposedIn,
      request.proposedOut && t('Check out') + ' ' + request.proposedOut].filter(Boolean);
    const history = (request.approvalHistory ?? []).map(step => {
      const reviewer = state.staff.find(member => member.id === step.approverId);
      const name = reviewer ? staffName(reviewer) : step.approverId === 'system' ? label('النظام','System') : '';
      return '<li>' + esc([name, t(step.status), dateText(step.at?.slice(0,10))].filter(Boolean).join(' · ')) + '</li>';
    }).join('');
    return '<li class="attendance-detail-metric"><div><strong>' + esc(t(request.type)) + '</strong> ' +
      badge(request.status) + (details.length ? '<p>' + details.map(detail => esc(t(detail))).join(' · ') + '</p>' : '') +
      (history ? '<details><summary>' + esc(label('مسار الموافقة','Approval history')) + '</summary><ul>' + history + '</ul></details>' : '') +
      '</div><small><bdi>' + esc(dateText(request.submittedOn) || '—') + '</bdi></small></li>';
  }).join('');
  const dialog = document.createElement('dialog');
  dialog.className = 'catalog-dialog attendance-details-dialog';
  dialog.id = 'attendance-details-dialog';
  dialog.setAttribute('aria-labelledby','attendance-details-title');
  dialog.innerHTML = '<header><h2 id="attendance-details-title">'+esc(t('Attendance')+' · '+staffName(person))+'</h2><button type="button" class="button secondary compact" data-attendance-close aria-label="'+esc(t('Close'))+'">×</button></header>'+
    '<div class="attendance-details-layout"><aside><h3>'+esc(staffName(person))+'</h3><p>'+esc(t(person.jobTitle || ''))+'</p><p>'+esc(day)+'</p>'+metrics.map(([key,value])=>'<div class="attendance-detail-metric"><span>'+esc(key)+'</span><strong>'+value+'</strong></div>').join('')+'</aside><section><div class="attendance-detail-tabs" role="tablist">'+
    [['record',label('السجل','Record')],['punches',label('البصمات','Punches')+' ('+entries.length+')'],['requests',t('Requests')+' ('+requests.length+')']].map(([id,title])=>'<button type="button" role="tab" id="attendance-tab-'+id+'" aria-controls="attendance-panel-'+id+'" aria-selected="'+(id==='record')+'" data-attendance-tab="'+id+'">'+esc(title)+'</button>').join('')+'</div>'+
    '<div id="attendance-panel-record" role="tabpanel" aria-labelledby="attendance-tab-record">'+metrics.map(([key,value])=>'<div class="attendance-detail-metric"><span>'+esc(key)+'</span><strong>'+value+'</strong></div>').join('')+'</div>'+
    '<div id="attendance-panel-punches" role="tabpanel" aria-labelledby="attendance-tab-punches" hidden>'+ (entries.length ? '<ol class="attendance-punch-timeline">'+entries.map(entry=>{
      const details = entry.deviceDetails || {};
      return '<li class="'+(entry.kind==='in'?'punch-in':'punch-out')+'"><div><strong>'+esc(time(entry.time))+'</strong> '+badge(entry.kind==='in'?'Punched in':'Punched out')+'</div><dl>'+[
        [label('نوع الهاتف / الجهاز','Device'),details.model || entry.device || '—'],
        [label('نظام التشغيل','Operating system'),details.os || '—'],
        [label('معرّف الجهاز','Device identifier'),details.installationId || '—'],
        [label('طريقة التسجيل','Recording method'),entry.source || (entry.site ? label('موقع حضور معتمد','Approved workplace') : '—')],
        [label('الموقع','Location'),entry.site || '—']
      ].map(([key,value])=>'<div><dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl></li>';
    }).join('')+'</ol>' : '<p class="empty">'+esc(label('لا يوجد','No records'))+'</p>')+'</div>'+
    '<div id="attendance-panel-requests" role="tabpanel" aria-labelledby="attendance-tab-requests" hidden>'+
    (requestCards ? '<ol class="attendance-punch-timeline">'+requestCards+'</ol>' : '<p class="empty">'+esc(t('No requests to show.'))+'</p>')+
    '</div></section></div>';
  document.body.append(dialog);
  dialog.querySelector('[data-attendance-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();});
  dialog.querySelectorAll('[data-attendance-tab]').forEach(button=>button.onclick=()=>{
    dialog.querySelectorAll('[data-attendance-tab]').forEach(tab=>tab.setAttribute('aria-selected',String(tab===button)));
    for(const panel of dialog.querySelectorAll('[role="tabpanel"]')) panel.hidden=panel.id!==button.getAttribute('aria-controls');
  });
  dialog.showModal();
}
document.addEventListener('click',event=>{
  const row=event.target.closest('.daily-attendance-table tbody tr');
  if (!row) return;
  const trigger=row.querySelector('[data-attendance-person]');
  if(trigger) openAttendanceDetails(trigger);
});
function branchFilter(id, selected, minimum = 2) {
  if (state.locations.length < minimum) return '';
  return '<select id="' + id + '" aria-label="' + t('Branch') + '">' +
    '<option value="">' + (language === 'ar' ? 'كل الفروع' : 'All branches') + '</option>' +
    state.locations.map(branch => '<option value="' + esc(branch.id) + '"' +
      (branch.id === selected ? ' selected' : '') + '>' + esc(branch.name) + '</option>').join('') + '</select>';
}

function attendance() {
  const heading = '<h1>' + t('Attendance') + '</h1>' +
    '<div class="schedule-tabs" role="group" aria-label="' + esc(t('Attendance')) + '">' +
    [['daily', 'Attendance'], ['schedule', 'Work schedules']].map(([id, label]) =>
      '<button type="button" data-attendance-tab="' + id + '" aria-pressed="' + (attendanceTab === id) + '">' +
      t(label) + '</button>').join('') + '</div>';
  if (attendanceTab === 'schedule') return heading + weeklySchedule();
  const day = attendanceDate || state.today;
  if (!state.locations.some(branch => branch.id === attendanceListBranch)) attendanceListBranch = '';
  const dayLabel = dateFormatter(language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en', {
    dateStyle: 'full', timeZone: 'UTC',
  }).format(new Date(day + 'T00:00:00Z'));
  return heading +
    card(esc(dayLabel), '<div class="attendance-toolbar"><div class="attendance-toolbar-filters"><input id="attendance-search" type="search" aria-label="' +
      t('Search by employee name') + '" placeholder="' + t('Search by employee name') + '" value="' + esc(attendanceSearch) + '">' +
      '<button type="button" class="button secondary" id="attendance-select" aria-haspopup="dialog">' + L('تحديد', 'Select') + '</button>' +
      (companyPrefix ? '<button type="button" class="button secondary compact" data-rejected-punches>' +
        L('محاولات البصمة غير المعتمدة', 'Rejected punch attempts') + '</button>' : '') + '</div>' +
      '<div class="attendance-date-controls" role="group" aria-label="' + t('Date') + '">' +
      '<button type="button" data-attendance-step="-1" aria-label="' + t('Previous day') + '">' + (language === 'ar' ? '→' : '←') + '</button>' +
      '<span class="attendance-calendar"><input id="attendance-date" type="date" aria-label="' +
      t('Date') + '" value="' + esc(day) + '"></span>' +
      '<button type="button" data-attendance-step="1" aria-label="' + t('Next day') + '">' + (language === 'ar' ? '←' : '→') + '</button></div></div>' +
      '<div id="attendance-results">' + attendanceTable(day) + '</div>');
}
function openAttendanceSelection() {
  const day = attendanceDate || state.today;
  const recorded = new Set(state.punches.filter(entry => entry.date === day).map(entry => entry.staffId));
  const people = state.staff.filter(person => person.status !== 'Removed' || recorded.has(person.id))
    .sort((a, b) => staffName(a).localeCompare(staffName(b), language));
  const titles = [...new Set(people.map(person => person.jobTitle).filter(Boolean))].sort((a, b) => t(a).localeCompare(t(b), language));
  const dialog = document.createElement('dialog');
  dialog.className = 'catalog-dialog attendance-selection';
  dialog.setAttribute('aria-labelledby', 'attendance-selection-title');
  dialog.innerHTML = '<header><h2 id="attendance-selection-title">' + L('تحديد الموظفين', 'Select employees') +
    '</h2><button type="button" class="button secondary compact" data-close aria-label="' + t('Close') + '">×</button></header>' +
    '<form><label>' + t('Branch') + branchFilter('attendance-selection-branch', attendanceListBranch) + '</label>' +
    '<label>' + t('Job title') + '<select name="title"><option value="">' + L('كل المسميات الوظيفية', 'All job titles') + '</option>' +
    titles.map(title => '<option value="' + esc(title) + '">' + esc(t(title)) + '</option>').join('') + '</select></label>' +
    '<label class="attendance-method-member attendance-select-all"><span>' + L('اختيار الكل', 'Select all') +
    '</span><input type="checkbox" name="all"></label><div class="attendance-method-members"></div>' +
    '<footer class="side-drawer-actions"><button type="submit" class="button primary">' + L('تطبيق', 'Apply') +
    '</button><button type="button" class="button secondary" data-close>' + t('Cancel') + '</button></footer></form>';
  const form = dialog.querySelector('form');
  const branch = dialog.querySelector('#attendance-selection-branch');
  const title = form.elements.namedItem('title');
  const all = form.elements.namedItem('all');
  const list = dialog.querySelector('.attendance-method-members');
  const selected = new Set(attendanceSelectedEmployees ?? people.map(person => person.id));
  title.value = titles.includes(attendanceJobTitle) ? attendanceJobTitle : '';
  const eligible = () => people.filter(person => (!branch.value || person.branchId === branch.value) &&
    (!title.value || person.jobTitle === title.value));
  const updateAll = () => {
    const visible = eligible();
    const count = visible.filter(person => selected.has(person.id)).length;
    all.disabled = !visible.length;
    all.checked = visible.length > 0 && count === visible.length;
    all.indeterminate = count > 0 && count < visible.length;
  };
  const updateList = () => {
    list.innerHTML = eligible().map(person => '<div><label class="attendance-method-member"><span><strong>' +
      esc(staffName(person)) + '</strong><small>' + esc(t(person.jobTitle || '')) + '</small></span>' +
      '<input type="checkbox" name="employee" value="' + esc(person.id) + '"' + (selected.has(person.id) ? ' checked' : '') +
      '></label></div>').join('') || '<p class="hint">' + t('No employees match your search.') + '</p>';
    updateAll();
  };
  form.onchange = event => {
    const control = event.target;
    if (control === branch || control === title) updateList();
    else if (control === all) {
      for (const person of eligible()) all.checked ? selected.add(person.id) : selected.delete(person.id);
      updateList();
    } else if (control.name === 'employee') {
      if (control.checked) selected.add(control.value);
      else selected.delete(control.value);
      updateAll();
    }
  };
  const close = bindSideDrawer(dialog, () => {
    dialog.remove();
    $('#attendance-select')?.focus();
  });
  for (const control of dialog.querySelectorAll('[data-close]')) control.onclick = close;
  form.onsubmit = async event => {
    event.preventDefault();
    const visible = eligible();
    const chosen = visible.filter(person => selected.has(person.id));
    attendanceListBranch = branch.value;
    attendanceJobTitle = title.value;
    attendanceSelectedEmployees = chosen.length === visible.length ? null : new Set(chosen.map(person => person.id));
    await close();
    render();
    $('#attendance-select')?.focus();
  };
  updateList();
  document.body.append(dialog);
  dialog.showModal();
}

async function openRejectedPunches() {
  const day = attendanceDate || state.today;
  const branch = attendanceListBranch;
  const dialog = document.createElement('dialog');
  dialog.innerHTML = '<form method="dialog"><button class="button secondary compact" aria-label="' +
    esc(L('إغلاق', 'Close')) + '">×</button></form><h2>' +
    L('محاولات البصمة غير المعتمدة', 'Rejected punch attempts') + '</h2><div role="status">' +
    esc(L('جارٍ التحميل…', 'Loading…')) + '</div>';
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  document.body.append(dialog);
  dialog.showModal();
  const content = dialog.querySelector('[role="status"]');
  try {
    const response = await fetch(companyPrefix + '/api/attendance/rejected-attempts?date=' + encodeURIComponent(day), {cache:'no-store'});
    if (!response.ok) throw new Error('Could not load punch attempts.');
    const {attempts} = await response.json();
    const names = new Map(state.staff.map(person => [person.id, staffName(person)]));
    const rows = attempts.filter(attempt => !branch || attempt.branchId === branch).reverse();
    content.innerHTML = '<p>' + esc(day) + '</p>' + (rows.length ? '<ul>' + rows.map(attempt => '<li>' +
      esc(names.get(attempt.staffId) || L('موظف', 'Employee')) + ' · ' +
      esc(L(attempt.kind === 'in' ? 'دخول' : 'خروج', attempt.kind === 'in' ? 'Clock in' : 'Clock out')) + ' · ' +
      esc(new Intl.DateTimeFormat(language, {timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date(attempt.time))) +
      (attempt.site ? ' · ' + esc(attempt.site) : '') +
      ' · ' + esc(t(attempt.reason)) + '</li>').join('') + '</ul>' : '<p>' +
      L('لا توجد محاولات غير معتمدة لهذا اليوم.', 'No rejected attempts for this date.') + '</p>');
  } catch {
    content.textContent = L('تعذّر تحميل المحاولات. حاول مرة أخرى.', 'Could not load attempts. Try again.');
  }
}
function leaves() {
  return title(t('Leave balances'), '') + annualLeaveBalances();
}

const settingsSections = {
  'settings/organization': ['Organization structure', 'Manage the logo and contact details.', 'ⓘ', organizationStructure],
  'settings/punch-methods': ['Punch methods', 'Manage where staff can punch in and out.', '◎', punchMethods],
  'settings/work-schedule': ['Work schedule settings', 'Set working days and hours.', '▦', workSchedule],
  'settings/leave-types': ['Leaves', 'Manage the leave types employees can request.', '▤', leaveTypes],
  'settings/staff-roles': ['Staff roles and permissions', 'View the number of staff assigned to each role.', '♙', staffRoles],
  'settings/approval-chain': ['Approval chain', 'Create request types and manage approval workflows.', '☷', approvalChain],
  'settings/notifications': ['Notification and message preferences', 'Manage manager and employee notifications, including exceptions.', '<span class="employee-bell"></span>', notificationPreferences],
  'settings/requests': ['Request and leave settings', 'Manage employee requests, leave types and balances.', '☷', requestAndLeaveSettings],
};
const approvalTypeLabels = { 'Device change':'Browser change request',
  'Shift change': 'Shift change', 'Loan request': 'Loan request',
  'Leave cancellation': 'Leave cancellation', 'Annual leave': 'Annual leave', 'Sick leave': 'Sick leave', 'Unpaid leave': 'Unpaid leave',
  'Missed punch': 'Punch correction', 'Attendance excuse': 'Permission request',
};
let requestSettingsTab = 'requests';
const pendingRequestPreferences = new Map();
function requestPreferenceSwitch(type, enabled) {
  const pending = pendingRequestPreferences.has(type);
  return '<button type="button" role="switch" class="leave-switch" aria-label="'+esc(t(type))+
    '" aria-checked="'+(pendingRequestPreferences.get(type) ?? enabled)+'" data-request-preference="'+esc(type)+'"'+
    (pending ? ' aria-busy="true" disabled' : '')+'><span></span></button>';
}
async function toggleRequestPreference(type, enabled) {
  if (pendingRequestPreferences.has(type)) return;
  const updateSwitches = (checked, pending) => {
    for (const control of document.querySelectorAll('[data-request-preference="'+CSS.escape(type)+'"]')) {
      control.setAttribute('aria-checked',String(checked));
      control.disabled = pending;
      if (pending) control.setAttribute('aria-busy','true');
      else control.removeAttribute('aria-busy');
    }
  };
  pendingRequestPreferences.set(type,enabled);
  updateSwitches(enabled,true);
  try {
    const response = await fetch(companyPrefix+'/api/request-preferences',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,enabled,compact:true}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const checked = result.preference?.enabled ?? effectiveRequestPreferences(result)[type];
    state.requestPreferences = {...state.requestPreferences,[type]:checked};
    if (checked !== enabled) say(language === 'ar' ? 'هذا الطلب معطّل في إعدادات المنشأة.' : 'This request is disabled in company settings.',true);
  } catch (error) {
    say(error.message,true);
  } finally {
    pendingRequestPreferences.delete(type);
    updateSwitches(effectiveRequestPreferences(state)[type],false);
  }
}
function requestAndLeaveSettings() {
  const tabs = '<div class="schedule-tabs" role="group" aria-label="' + esc(t('Request and leave settings')) + '">' +
    [['requests', 'Employee requests'], ['leaves', 'Leaves']].map(([key, label]) =>
      '<button type="button" data-request-settings-tab="' + key + '" aria-pressed="' + (requestSettingsTab === key) + '">' +
      esc(t(label)) + '</button>').join('') + '</div>';
  return tabs + (requestSettingsTab === 'leaves' ? leaveTypes() : employeeRequestSettings());
}
document.addEventListener('click', event => {
  const tab = event.target.closest('[data-request-settings-tab]');
  if (!tab) return;
  requestSettingsTab = tab.dataset.requestSettingsTab;
  render();
  $('[data-request-settings-tab="' + requestSettingsTab + '"]')?.focus();
});
function employeeRequestSettings() {
 const prefs=effectiveRequestPreferences(state);
 const rows=Object.entries(prefs).map(([type,enabled])=>[
   '<strong>'+esc(t(type))+'</strong>',
   requestPreferenceSwitch(type,enabled),
   '<button type="button" class="button secondary compact" data-request-contracts="'+esc(type)+'" aria-label="'+esc(t('Edit')+' '+t(type))+'">✎</button>',
 ]);
 return '<section class="card request-settings-card"><h2>'+t('Requests')+'</h2>'+table([t('Request type'),t('Status'),t('Actions')],rows,'','request-settings-table')+'</section>';
}
document.addEventListener('click',event=>{
 const edit=event.target.closest('[data-request-contracts]');
 if(edit){
   const type=edit.dataset.requestContracts,allowed=requestContractTypes(state,type);
   const dialog=document.createElement('dialog');
   dialog.className='catalog-dialog request-contract-dialog';
   dialog.setAttribute('aria-labelledby','request-contract-title');
   const limitField=type==='Missed punch'?'<label>'+esc(t('Maximum approved punch corrections per month'))+
     '<input type="number" name="correctionMonthlyLimit" step="1" min="0" max="'+Number.MAX_SAFE_INTEGER+'" value="'+
     esc(state.correctionMonthlyLimit??'')+'"></label><p class="hint">'+esc(t('Leave blank for no limit. Zero blocks all punch corrections.'))+'</p>':'';
   dialog.innerHTML='<header><h2 id="request-contract-title">'+esc(t(type))+'</h2><button type="button" class="button secondary compact" data-dismiss aria-label="'+esc(t('Close'))+'">×</button></header><form><fieldset><legend>'+t('Contract type')+'</legend>'+['Annual','Tamheer'].map(value=>'<label class="role-member"><input type="checkbox" name="contractTypes" value="'+value+'"'+(allowed===null||allowed.includes(value)?' checked':'')+'>'+esc(t(value))+'</label>').join('')+'</fieldset>'+limitField+button(t('Save'))+'</form>';
   document.body.append(dialog);dialog.querySelector('[data-dismiss]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
   dialog.querySelector('form').onsubmit=e=>{
     e.preventDefault();e.stopPropagation();
     const values=new FormData(e.currentTarget),limit=values.get('correctionMonthlyLimit');
     const body={type,contractTypes:values.getAll('contractTypes'),compact:true};
     if(limit!==null)body.correctionMonthlyLimit=limit===''?null:Number(limit);
     run(e.submitter,async()=>{
       const submit=e.submitter;
       if(submit)submit.textContent=L('جارٍ الحفظ…','Saving…');
       try {
         const response=await fetch(companyPrefix+'/api/request-preferences',{
           method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
         });
         const result=await response.json();
         if(!response.ok)throw Error(result.error);
         state.requestContracts={...state.requestContracts,[type]:result.preference.contractTypes};
         if(limit!==null)state.correctionMonthlyLimit=result.preference.correctionMonthlyLimit;
         dialog.close();
       } finally {
         if(submit)submit.textContent=t('Save');
       }
     });
   };
   dialog.showModal();return;
 }
 const preferenceButton=event.target.closest('[data-request-preference]');
 if(preferenceButton)void toggleRequestPreference(preferenceButton.dataset.requestPreference,preferenceButton.getAttribute('aria-checked')!=='true');
});
const directApprovalStep = 'direct-manager';
let approvalDraft;
function approvalChain() {
  return '<section class="card">' + table(
    [t('Request type'), t('Approval action')],
    approvalRequestTypes(state).map(type => { const label=approvalTypeLabels[type]??type; return [esc(t(label)),
      '<button type="button" class="button secondary compact" data-edit-approval="' + esc(type) +
      '" aria-label="' + esc(t('Edit') + ' — ' + t(label)) + '"'+(state.isCompanyOwner||state.canEditApprovalChains?'':' disabled')+'>✎</button>']; }),
    '',
  ) + '</section><dialog class="catalog-dialog" id="approval-dialog" aria-labelledby="approval-title"></dialog>';
}
function drawApprovalDialog() {
  if(!state.isCompanyOwner&&!state.canEditApprovalChains)return;
  const dialog = $('#approval-dialog');
  const { type, steps } = approvalDraft;
  const options = [[directApprovalStep, t('Direct manager')], ...eligibleApprovalRoles(state).map(role => [approvalRoleStep(role), t(role)])];
  const option = (id, label, step) => '<option value="' + esc(id) + '"' + (step === id ? ' selected' : '') +
    (step !== id && steps.includes(id) ? ' disabled' : '') + '>' + esc(label) + '</option>';
  const stepButton = (verb, label, icon, index, disabled) => '<button type="button" class="button secondary compact" data-approval-step="' +
    verb + '" data-index="' + index + '" aria-label="' + t(label) + '"' + (disabled ? ' disabled' : '') + '>' + icon + '</button>';
  dialog.innerHTML = '<header><h2 id="approval-title">' + esc(t(approvalTypeLabels[type]??type)) +
    '</h2><button type="button" class="button secondary compact" data-close-approval aria-label="' + t('Close') + '">×</button></header>' +
    '<form id="approval-chain-form"><fieldset><legend>' + t('Approver') + '</legend><div class="approval-steps">' +
    steps.map((step, index) => (index ? '<span class="approval-direction" aria-hidden="true">' + (language === 'ar' ? '←' : '→') + '</span>' : '') +
      '<div class="approval-step" data-approval-card="' + index + '" tabindex="0" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight">' +
      stepButton('remove', 'Remove step', '×', index, steps.length === 1) + '<label><span>' + t('Step') + ' ' + (index + 1) +
      '</span><select required name="approver" data-index="' + index + '">' +
      '<option value="">' + t('Choose an approver') + '</option>' +
      (step && !options.some(([id]) => id === step) ? option(step, t('Unavailable approver'), step) : '') +
      options.map(([id, label]) => option(id, label, step)).join('') + '</select></label></div>').join('') +
    '<button type="button" class="button secondary compact" data-approval-step="add" aria-label="' + t('Add approver') +
    '"' + (steps.length >= options.length ? ' disabled' : '') + '>+</button></div></fieldset>' +
    '<p class="hint">' + t('Approvers review each request in the order shown.') + ' ' + (language==='ar'?'تُستكمل كل مرحلة بموافقة أحد أصحاب الدور المخوّلين في فرع الموظف.':'Each role stage is completed by one authorized holder serving the employee’s branch.') + '</p>' + button(t('Save')) + '</form>';
  if (!dialog.open) dialog.showModal();
  bindApprovalDrag(dialog);
}
function moveApprovalStep(from, to) {
  const { steps } = approvalDraft;
  if (from === to || to < 0 || to >= steps.length) return;
  steps.splice(to, 0, ...steps.splice(from, 1));
  drawApprovalDialog();
  $('#approval-dialog [data-approval-card="' + to + '"]')?.focus();
}
function bindApprovalDrag(dialog) {
  const list = dialog.querySelector('.approval-steps');
  let drag;
  list.onpointerdown = event => {
    const card = event.target.closest('[data-approval-card]');
    if (drag || !event.isPrimary || event.button !== 0 || !card ||
        event.target.closest('select, button') || approvalDraft.steps.length < 2) return;
    drag = { card, pointer: event.pointerId, x: event.clientX, y: event.clientY };
    list.setPointerCapture(event.pointerId);
  };
  list.onpointermove = event => {
    if (drag?.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moving && Math.hypot(dx, dy) < 6) return;
    drag.moving = true;
    drag.card.classList.add('approval-dragging');
    drag.card.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-approval-card]');
    drag.target?.classList.remove('approval-drop-target');
    drag.target = list.contains(target) ? target : null;
    drag.target?.classList.add('approval-drop-target');
  };
  const finish = (event, drop) => {
    if (drag?.pointer !== event.pointerId) return;
    const { card, target } = drag;
    drag = undefined;
    card.classList.remove('approval-dragging');
    card.style.transform = '';
    target?.classList.remove('approval-drop-target');
    if (drop && target) moveApprovalStep(Number(card.dataset.approvalCard), Number(target.dataset.approvalCard));
  };
  list.onpointerup = event => finish(event, true);
  list.onpointercancel = list.onlostpointercapture = event => finish(event, false);
  list.onkeydown = event => {
    if (!event.target.matches('[data-approval-card]') || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const from = Number(event.target.dataset.approvalCard);
    const later = event.key === (language === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    moveApprovalStep(from, from + (later ? 1 : -1));
  };
}
let notificationPreferencesTab='notifications';
function notificationPreferences() {
  const tabs='<div class="schedule-tabs">'+[['notifications','Notifications'],['messages','Messages']].map(([key,label])=>'<button type="button" data-notification-tab="'+key+'" aria-pressed="'+(notificationPreferencesTab===key)+'">'+t(label)+'</button>').join('')+'</div>';
  const messages=notificationPreferencesTab==='messages';
  const rows=messages?[
    ['attendance-report', 'Attendance summary report', 'Email weekly or monthly attendance summaries.'],
    ['follow-up-mail', 'Follow-up centre messages', 'Email the assignee when a task is assigned.'],
  ]:[
    ['attendance', 'Attendance alerts', 'Configure attendance reminder notifications.'],
    ['documents', 'Document wallet alerts', 'Configure document expiry notifications.'],
    ['encouragement', 'Encouragement phrases', 'Show daily encouragement after attendance punches.'],
  ];
  const enabled={
    'attendance-report':Boolean(state.attendanceReportSettings?.enabled),
    'follow-up-mail':state.followUpMailSettings?.enabled!==false,
    encouragement:state.encouragementSettings?.enabled!==false,
    ...state.notificationPreferences,
  };
  return tabs+ '<ul class="card notification-preferences">' + rows.map(([key, label, hint]) => '<li><div><strong>' + t(label) + '</strong><span class="hint">' + t(hint) +
    '</span></div><div class="notification-actions"><button type="button" class="button secondary compact" data-edit-notification="' + key +
    '" title="' + t('Edit') + '" aria-label="' + t('Edit') + ' — ' + t(label) + '">✎</button>' +
    '<button type="button" role="switch" class="leave-switch" data-notification-preference="' + key +
    '" aria-label="' + t(label) + '" aria-checked="' + Boolean(enabled[key]) + '"><span></span></button></div></li>').join('') +
    '</ul>'+(messages?'':'<section class="card notification-display-preferences"><h2>' + t('Notification display') + '</h2>' +
    '<form id="notification-display-form"><label>' + t('Display mode') + '<select name="mode"><option value="popup"' +
    (notificationDisplay(state.notificationSettings?.display).mode === 'popup' ? ' selected' : '') + '>' + t('Temporary popup') + '</option><option value="badge"' +
    (notificationDisplay(state.notificationSettings?.display).mode === 'badge' ? ' selected' : '') + '>' + t('Bell counter only') + '</option></select></label>' +
    '<label>' + t('Popup duration (seconds)') + '<input name="seconds" type="number" min="2" max="60" step="1" required value="' +
    notificationDisplay(state.notificationSettings?.display).seconds + '"></label>' + button(t('Save')) + '</form></section>')+'<dialog class="catalog-dialog" id="notification-settings-dialog" aria-labelledby="notification-settings-title"></dialog>';
}
document.addEventListener('click',event=>{const tab=event.target.closest('[data-notification-tab]');if(tab){notificationPreferencesTab=tab.dataset.notificationTab;render();}});
function attendanceSummarySettings(){
 const prefs=state.attendanceReportSettings??{frequency:'monthly'};
 return '<form id="attendance-report-settings-form"><label>'+t('Sending frequency')+'<select name="frequency"><option value="monthly"'+(prefs.frequency==='monthly'?' selected':'')+'>'+t('Monthly only')+'</option><option value="both"'+(prefs.frequency==='both'?' selected':'')+'>'+t('Weekly and monthly')+'</option></select></label><p class="hint">'+t('Weekly: Thursday at 10 PM. Monthly: the last day of the month at 10 PM. Saudi time.')+'</p>'+button(t('Save'))+'</form>';
}
const attendanceNotificationRules = [
  ['beforeStart', 'Before shift starts', 'Remind employees who have not clocked in before their shift starts.', true],
  ['beforeDeduction', 'After shift starts', 'Remind employees who have not clocked in after their shift starts.', false],
  ['beforeEnd', 'Before shift ends', 'Remind employees who have not clocked out before their shift ends.', true],
  ['afterEnd', 'After shift ends', 'Remind employees who have not clocked out after their shift ends.', true],
];
function phraseEditorRow(phrase = {}) {
  return '<details class="phrase-editor-row"><summary class="ux-phrase-preview">' + esc(phrase.ar || phrase.en || t('New phrase')) + '</summary><fieldset><label>العربية<input data-phrase-ar maxlength="240" required value="' + esc(phrase.ar) + '"></label>' +
    '<label>English<input dir="ltr" data-phrase-en maxlength="240" required value="' + esc(phrase.en) + '"></label>' +
    '<label><input type="checkbox" data-phrase-morning' + (phrase.morning ? ' checked' : '') + '>' + t('Morning only') + '</label>' +
    '<label><input type="checkbox" data-phrase-opening' + (phrase.opening ? ' checked' : '') + '>' + t('Clock-in only') + '</label>' +
    '<button type="button" class="button secondary compact" data-remove-phrase aria-label="' + t('Delete phrase') + '">×</button></fieldset></details>';
}
function openNotificationSettings(key) {
  if (key==='attendance-report'||key==='follow-up-mail') {
    const dialog=$('#notification-settings-dialog');
    const title=key==='attendance-report'?'Attendance summary report':'Follow-up centre messages';
    dialog.innerHTML='<header><h2 id="notification-settings-title">'+t(title)+'</h2><button type="button" class="button secondary compact" data-close aria-label="'+t('Close')+'">×</button></header>'+
      (key==='attendance-report'?attendanceSummarySettings():'<form id="follow-up-mail-settings-form"><label><input name="reassignments" type="checkbox"'+
        (state.followUpMailSettings?.reassignments!==false?' checked':'')+'>'+t('Also email the new assignee when a task is reassigned')+'</label>'+button(t('Save'))+'</form>');
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    dialog.showModal();
    return;
  }
  if (key === 'encouragement') {
    const dialog = $('#notification-settings-dialog');
    dialog.innerHTML = '<header><h2 id="notification-settings-title">' + t('Encouragement phrases') +
      '</h2><button type="button" class="button secondary compact" data-close-phrases aria-label="' + t('Close') + '">×</button></header>' +
      '<p class="hint">' + t(state.isCompanyOwner ? 'Company-wide phrases and availability.' : 'Changes apply to employees in your branch.') + '</p>' +
      '<div class="ux-list-toolbar"><input type="search" id="phrase-search" aria-label="'+t('Search phrases')+'" placeholder="'+t('Search phrases')+'"><output id="phrase-count"></output><button type="button" class="button secondary compact" data-reset-phrases>'+t('Reset to defaults')+'</button></div>' +
      '<form id="encouragement-settings-form"><div class="phrase-editor-list">' +
      (state.encouragementSettings?.phrases ?? employeeGreetings).map(phraseEditorRow).join('') +
      '</div><div class="actions"><button type="button" class="button secondary" data-add-phrase>' + t('Add phrase') + '</button>' + button(t('Save')) + '</div></form>';
    dialog.querySelector('[data-close-phrases]').onclick = () => dialog.close();
    dialog.querySelector('[data-add-phrase]').onclick = () => {
      const list = dialog.querySelector('.phrase-editor-list');
      if (list.children.length >= 200) return;
      list.insertAdjacentHTML('beforeend', phraseEditorRow());
      list.lastElementChild.open=true; list.lastElementChild.querySelector('input').focus(); updatePhraseCount();
    };
    const updatePhraseCount=()=>{const rows=[...dialog.querySelectorAll('.phrase-editor-row')];$('#phrase-count').textContent=rows.filter(row=>!row.hidden).length+' / '+rows.length;};
    $('#phrase-search').oninput=event=>{const query=normalizeSearch(event.target.value);for(const row of dialog.querySelectorAll('.phrase-editor-row'))row.hidden=![...row.querySelectorAll('input')].some(input=>normalizeSearch(input.value).includes(query));updatePhraseCount();};
    dialog.querySelector('[data-reset-phrases]').onclick=()=>{if(!confirm(t('Replace these phrases with the default collection?')))return;dialog.querySelector('.phrase-editor-list').innerHTML=employeeGreetings.map(phraseEditorRow).join('');$('#phrase-search').value='';updatePhraseCount();dialog.querySelector('form').dataset.uxDirty='true';};
    dialog.onclick = event => { if (event.target.closest('[data-remove-phrase]')) {event.target.closest('.phrase-editor-row').remove();updatePhraseCount();dialog.querySelector('form').dataset.uxDirty='true';} };
    dialog.addEventListener('input',event=>{const row=event.target.closest('.phrase-editor-row');if(row)row.querySelector('summary').textContent=row.querySelector('[data-phrase-ar]').value||row.querySelector('[data-phrase-en]').value||t('New phrase');});
    updatePhraseCount();
    dialog.showModal();
    return;
  }
  const dialog = $('#notification-settings-dialog');
  const attendance = key === 'attendance';
  const settings = state.notificationSettings ?? {};
  const selected = settings.documentRecipients;
  const people = (state.directManagerChoices??state.staff).filter(person => person.status === 'Active'&&isAdministrator(person,state));
  const firstDays = documentReminderDays(settings);
  const secondDays = settings.documentSecondReminderDays === undefined && firstDays > 5 ? 5 : settings.documentSecondReminderDays ?? '';
  const reminderRow = (daysName, modeName, value, mode, heading, required = false) =>
    '<div class="document-reminder-row"><label>'+heading+'<input type="number" name="'+daysName+'" min="0" max="365" step="1"'+
    (required?' required':'')+' value="'+esc(value)+'"></label><label>'+(language==='ar'?'أسلوب التنبيه':'Alert style')+
    '<select name="'+modeName+'"><option value="normal"'+(mode==='normal'?' selected':'')+'>'+
    (language==='ar'?'عادي — مركز المتابعة والجرس':'Normal — follow-up centre and bell')+'</option><option value="prominent"'+
    (mode==='prominent'?' selected':'')+'>'+(language==='ar'?'بارز — نافذة عند الفتح':'Prominent — pop-up on opening')+'</option></select></label></div>';
  const details = attendance ? '<p class="hint">' + t('Choose when employees are reminded to clock in and out.') + '</p>' +
    attendanceNotificationRules.map(([id, label, hint, enabled]) => {
      const rule = settings.attendance?.[id] ?? { enabled, minutes: 5 };
      return '<fieldset class="notification-rule"><label class="role-member"><input type="checkbox" name="' + id +
        '" data-notification-rule="' + id + '"' + (rule.enabled ? ' checked' : '') + '><strong>' + t(label) +
        '</strong></label><p class="hint">' + t(hint) + '</p><label class="notification-minutes">' + t('Minutes') +
        '<input type="number" name="' + id + '-minutes" min="0" max="1440" step="1" required value="' + esc(rule.minutes) +
        '"' + (rule.enabled ? '' : ' disabled') + '></label></fieldset>';
    }).join('') :
    '<label class="role-member"><input type="checkbox" name="allManagers"' + (selected == null ? ' checked' : '') +
    '>' + t('All managers') + '</label><fieldset class="notification-rule" id="document-notification-recipients"' +
    (selected == null ? ' disabled' : '') + '><legend>' + (language==='ar'?'اختر الإداريين':'Choose administrators') + '</legend>' +
    (state.isCompanyOwner?'<label class="role-member"><input type="checkbox" name="recipients" value="account-owner"'+(selected==null||selected.includes('account-owner')?' checked':'')+'>'+(language==='ar'?'مسؤول الحساب':'Account owner')+'</label>':'')+people.map(person => '<label class="role-member"><input type="checkbox" name="recipients" value="' +
      esc(person.id) + '"' + (selected==null||selected.includes(person.id) ? ' checked' : '') + '>' + esc(staffName(person)) + '</label>').join('') +
    '</fieldset>' + reminderRow('documentReminderDays','documentAlertMode',firstDays,settings.documentAlertMode??'normal',
      language==='ar'?'التذكير الأول قبل الانتهاء (أيام)':'First reminder before expiry (days)',true) +
    reminderRow('documentSecondReminderDays','documentSecondAlertMode',secondDays,settings.documentSecondAlertMode??'prominent',
      language==='ar'?'التذكير الثاني قبل الانتهاء (أيام)':'Second reminder before expiry (days)') +
    '<small>'+(language==='ar'?'يشمل المستندات والإقامات ورخص العمل. صفر يعني يوم الانتهاء، وترك التذكير الثاني فارغًا يوقفه.':'Applies to documents, residence and work permits. Zero means the expiry day. Leave the second reminder blank to turn it off.')+'</small>';
  dialog.innerHTML = '<header><h2 id="notification-settings-title">' + t(attendance ? 'Attendance alerts' : 'Document wallet alerts') +
    '</h2><button class="button secondary compact" type="button" aria-label="' + t('Close') +
    '">×</button></header><form id="notification-settings-form" data-key="' + key + '">' + details + button(t('Save')) + '</form>';
  dialog.querySelector('header button').onclick = () => dialog.close();
  const form = dialog.querySelector('form');
  form.onchange = event => {
    const checkbox = event.target;
    if (checkbox.dataset.notificationRule) form.elements[checkbox.dataset.notificationRule + '-minutes'].disabled = !checkbox.checked;
    if (checkbox.name === 'allManagers') {
      const recipients = $('#document-notification-recipients');
      recipients.disabled = checkbox.checked;if(checkbox.checked)recipients.querySelectorAll('input').forEach(input=>input.checked=true);
    }
  };
  dialog.showModal();
}
let selectedJobTitle;
function staffRoles() {
  const staff = state.staff.filter(person => person.status !== 'Removed');
  const format = new Intl.NumberFormat(language);
  const roles = state.staffRoles ?? roleOptions;
  const removeButton = (kind, value, label) => '<button type="button" class="button secondary compact" data-remove-' +
    kind + '="' + esc(value) + '">' + t(label) + '</button>';
  const membersByRole = new Map(roles.map(role => [role, staff.filter(person => person.role === role)]));
  const rows = roles.map(role => {
    const count = membersByRole.get(role).length;
    return '<tr data-staff-role="' + esc(role) + '"><td><strong>' +
      esc(t(role)) + '</strong></td><td>' + format.format(count) + '</td><td><button type="button" class="button secondary compact" data-role-permissions="'+esc(role)+'">'+(language==='ar'?'الصلاحيات':'Permissions')+'</button></td><td>' + removeButton('role', role, 'Delete role') + '</td></tr>';
  }).join('');
  const selection=selectedJobTitle;
  const memberGroup=(label,members,checked)=>'<fieldset><legend>'+t(label)+'</legend>'+members.map(person=>'<label class="role-member"><input type="checkbox" name="member" value="'+esc(person.id)+'"'+(checked?' checked':'')+'>'+esc(staffName(person))+'</label>').join('')+'</fieldset>';
  const dialog=selection?'<dialog id="role-dialog" aria-labelledby="role-title"><header><h2 id="role-title">'+esc(t(selection))+'</h2><button type="button" class="button secondary" id="close-role" aria-label="'+t('Close')+'">×</button></header><form id="role-form"><p class="hint">'+t('Each person has one job title. Selecting someone assigns them this title.')+'</p>'+memberGroup('Assigned employees',staff.filter(p=>p.jobTitle===selection),true)+memberGroup('Available to assign',staff.filter(p=>p.jobTitle!==selection),false)+'<div class="actions">'+button(t('Save assignments'))+'<button type="button" class="button secondary" data-cancel-role>'+t('Cancel')+'</button></div></form></dialog>':'';
  const jobTitleRows = (state.jobTitles ?? jobTitles).map(jobTitle => [
    '<button type="button" class="period-name" data-job-title="' + esc(jobTitle) + '" aria-haspopup="dialog">' + esc(t(jobTitle)) + '</button>',
    format.format(staff.filter(person => person.jobTitle === jobTitle).length),
    removeButton('job-title', jobTitle, 'Delete job title'),
  ]);
  const createDialog = (kind, heading, label) =>
    '<div class="catalog-toolbar"><button type="button" class="button primary compact" data-create-catalog="' + kind +
    '" aria-haspopup="dialog">+ ' + t(heading) + '</button></div>' +
    '<dialog id="create-' + kind + '" class="catalog-dialog" aria-labelledby="create-' + kind + '-heading">' +
    '<header><h2 id="create-' + kind + '-heading">' + t(heading) + '</h2><button type="button" class="button secondary compact" data-close-catalog aria-label="' +
    t('Close') + '">×</button></header><form id="' + kind + '-form"><label>' + t(label) +
    '<input name="name" maxlength="120" required autofocus></label>' + (kind==='create-role'?'<label class="role-permission-row"><span>'+(language==='ar'?'إداري':'Administrator')+'</span><input type="checkbox" name="administrator"></label><label class="role-permission-row"><span>'+(language==='ar'?'إضافة مسمى وظيفي بالاسم نفسه':'Also create a job title with this name')+'</span><input type="checkbox" name="createJobTitle" checked></label>':'') + button(t(heading)) + '</form></dialog>';
  return '<section class="card">' + createDialog('create-role', 'Create role', 'Role name') +
    '<div class="table-wrap"><table class="staff-roles-table"><thead><tr><th scope="col">' + t('Role name') +
    '</th><th scope="col">' + t('Assigned employees') + '</th><th scope="col">'+(language==='ar'?'الصلاحيات':'Permissions')+'</th><th scope="col">' + t('Actions') +
    '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + dialog + '</section>' +
    card(t('Job titles'), createDialog('job-title', 'Create job title', 'Job title') + table([t('Job title'), t('Assigned employees'), t('Actions')],
      jobTitleRows, t('No job titles.'), 'staff-roles-table'));
}
function closeRoleDialog() {
  const jobTitle = selectedJobTitle;
  selectedJobTitle = undefined;
  render();
  if (jobTitle) $('[data-job-title="' + CSS.escape(jobTitle) + '"]')?.focus();
}
function settings() {
  const sections = Object.entries(settingsSections).filter(([path]) => path !== 'settings/leave-types' && (!superAdmin || path === 'settings/organization'));
  return '<h1>' + t('Settings') + '</h1>' + (state.isCompanyOwner && !superAdmin ? '<p><button type="button" class="button secondary" id="restart-setup-guide">' + t('Resume / restart setup tour') + '</button></p>' : '') + '<div class="settings-grid">' +
    sections.map(([path, [name, description, icon]]) =>
      '<a class="settings-tile' + (path === 'settings/requests' ? ' settings-tile-requests' : '') + '" href="#' + path + '"><span class="settings-icon" aria-hidden="true">' + icon + '</span>' +
      '<span><strong>' + t(superAdmin && path === 'settings/organization' ? 'Organization information' : name) +
      '</strong><span class="hint">' + t(description) + '</span></span></a>').join('') + '</div>';
}

let organizationTab = 'overview';
function organizationStructure() {
  const tabs = '<div class="schedule-tabs" role="group" aria-label="' + esc(t('Organization structure')) + '">' +
    [['overview', 'Organization overview'], ['structure', 'Structure'], ['chart', 'Organization chart'], ['settings', 'Settings']].map(([tab, label]) =>
      '<button type="button" data-organization-tab="' + tab + '" aria-pressed="' + (organizationTab === tab) + '">' +
      esc(t(label)) + '</button>').join('') + '</div>';
  if (organizationTab === 'chart') return tabs + card(t('Organization chart'), '<p class="hint">' + t('Coming later') + '</p>');
  if (organizationTab === 'settings') return tabs + card(t('Time format'), '<form id="time-format-form"><label>' + t('Time format') +
    '<select name="format"><option value="12">' + t('12-hour') + '</option><option value="24"' +
    (state.timeFormat === '24' ? ' selected' : '') + '>' + t('24-hour') + '</option></select></label>' + button(t('Save settings')) + '</form>');
  if (organizationTab === 'structure') return tabs + companyBranches({manageAdministrators:true});
  const staff = state.staff.filter(person => person.status !== 'Removed');
  const departments = new Set(staff.map(person => person.department?.trim()).filter(Boolean));
  const unassigned = staff.filter(person => needsDirectManager(state, person)).length;
  const number = new Intl.NumberFormat(language);
  const metrics = [['Staff', staff.length], ['Branches', state.locations.length], ['Departments', departments.size]];
  const logo = state.organization?.logo;
  return tabs + '<section class="card organization-overview"><div class="organization-overview-name">' +
    (logo ? '<img src="' + esc(logo) + '" alt="">' : '') + '<h2>' + esc(state.company) + '</h2>'+(state.isCompanyOwner?'<button type="button" class="button secondary compact" data-edit-company aria-label="'+(language==='ar'?'تعديل اسم الشركة':'Edit company name')+'">✎</button>':'')+'</div>' +
    '<dl class="organization-overview-metrics">' + metrics.map(([label, count]) =>
      '<div><dt>' + esc(t(label)) + '</dt><dd>' + number.format(count) + '</dd></div>').join('') + '</dl></section>' +
    (unassigned ? card(number.format(unassigned) + ' ' + t('Employees without a direct manager'),
      '<a href="#staff" class="button secondary">' + t('Manage employees') + '</a>') : '') +
    '<details class="card organization-profile"><summary>' + t('Organization information') + '</summary>' +
    organizationSettings() + '</details>';
}
const validOrganizationLogo = file => file.size > 0 && file.size <= 5 * 1024 * 1024 &&
  ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
function matchLogoPreviewBackground(image) {
  const frame = image.parentElement;
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  const sums = [0, 0, 0];
  let samples = 0, lightSamples = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x > 0 && x < size - 1 && y > 0 && y < size - 1) continue;
      samples += 1;
      const index = (y * size + x) * 4;
      const red = data[index], green = data[index + 1], blue = data[index + 2];
      const darkest = Math.min(red, green, blue);
      if (data[index + 3] < 250 || darkest < 238 || Math.max(red, green, blue) - darkest > 12) continue;
      lightSamples += 1;
      sums[0] += red;
      sums[1] += green;
      sums[2] += blue;
    }
  }
  frame.style.backgroundColor = lightSamples / samples >= 0.85
    ? 'rgb(' + sums.map(sum => Math.round(sum / lightSamples)).join(', ') + ')' : '';
}
const saudiRegions = [
  ['الرياض', 'الرياض،الخرج،الدرعية،المجمعة،الدوادمي،وادي الدواسر'],
  ['مكة المكرمة', 'مكة المكرمة،جدة،الطائف،رابغ،القنفذة،الليث'],
  ['المدينة المنورة', 'المدينة المنورة،ينبع،العلا،بدر،خيبر'],
  ['القصيم', 'بريدة،عنيزة،الرس،البكيرية،المذنب'],
  ['المنطقة الشرقية', 'الدمام،الخبر،الظهران،الجبيل،الأحساء،الهفوف،القطيف،حفر الباطن،الخفجي'],
  ['عسير', 'أبها،خميس مشيط،بيشة،محايل عسير،النماص،ظهران الجنوب'],
  ['تبوك', 'تبوك،ضباء،الوجه،أملج،تيماء،حقل،البدع'],
  ['حائل', 'حائل،بقعاء،الغزالة،الشنان'],
  ['الحدود الشمالية', 'عرعر،رفحاء،طريف،العويقيلة'],
  ['جازان', 'جازان،صبيا،أبو عريش،صامطة،فرسان،بيش'],
  ['نجران', 'نجران،شرورة،حبونا،بدر الجنوب'],
  ['الباحة', 'الباحة،بلجرشي،المندق،المخواة،قلوة'],
  ['الجوف', 'سكاكا،دومة الجندل،القريات،طبرجل'],
];
function organizationLocationOptions(field, profile) {
  const isSaudi = ['SA', 'Saudi Arabia', 'السعودية', 'المملكة العربية السعودية'].includes(profile.country);
  const countries = new Intl.DisplayNames(language, { type: 'region' });
  const options = {
    country: [['SA', countries.of('SA')]],
    region: isSaudi ? saudiRegions.map(([region]) => [region, region]) : [],
    city: (isSaudi ? saudiRegions.find(([region]) => region === profile.region)?.[1] ?? '' : '')
      .split('،').filter(Boolean).map(city => [city, city]),
  }[field];
  const current = field === 'country' && isSaudi ? 'SA' : profile[field];
  if (current && !options.some(([value]) => value === current)) options.push([current, current]);
  return '<option value="">' + t('Select') + '</option>' + options.map(([value, label]) =>
    '<option value="' + esc(value) + '"' + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
}
function organizationSettings() {
  const profile = state.organization ?? {};
  const locationField = (label, name) => '<label>' + t(label) + '<select name="' + name +
    '" data-organization-location>' + organizationLocationOptions(name, profile) + '</select></label>';
  const field = (label, name, type = 'text') => '<label>' + t(label) + '<input type="' + type +
    '" name="' + name + '" value="' + esc(name === 'name' && !superAdmin ? state.company : profile[name]) +
    '" maxlength="' + (name === 'name' ? 120 : 300) + '"' + (name === 'name' ? ' required' : '') + '></label>';
  return '<form id="organization-form">' +
    '<section class="card organization-logo-editor"><h2>' + t('Organization branding') + '</h2>' +
      '<div class="organization-logo-layout"><div class="organization-logo-preview"><img class="organization-logo"' +
      (profile.logo ? ' src="' + esc(profile.logo) + '"' : ' hidden') + ' alt="' + t('Organization logo') + '"></div>' +
      '<div><small>' + t('Maximum logo size: 5 MB.') + '</small><div class="organization-logo-actions">' +
      '<label class="button secondary logo-upload">' + t('Upload logo') +
      '<input type="file" name="logo" accept="image/png,image/jpeg,image/webp"></label>' +
      '<button type="button" class="logo-remove" data-remove-organization-logo' + (profile.logo ? '' : ' hidden') + '>' +
      t('Remove image') + '</button><button type="submit" class="button primary">' + t('Save') +
      '</button><input type="hidden" name="removeLogo" value=""></div>' +
      '<small>' + t('PNG, JPG, JPEG or WebP. Recommended size: 120 × 36 px.') + '</small></div></div></section>' +
    card(t('General information'), '<div class="fields">' + field('Company name', 'name') + locationField('Country', 'country') +
      locationField('Region', 'region') + locationField('City', 'city') + '</div>') +
    card(t('Contact information'), '<div class="fields">' + field('Email', 'email', 'email') +
      field('Contact person', 'contactName') + field('Mobile number', 'phone', 'tel') + field('Address', 'address') +
      '</div>') + button(t('Save settings')) + '</form>';
}
function workSchedule() {
  return workPeriods() + workingHours();
}
let selectedScheduleCell;
const wallTime = value => periodTimeLabel(periodTimeParts(value));
const periodHours = period => period.start && period.end ? wallTime(period.start) + ' – ' + wallTime(period.end) : t('Flexible period');
const displayPeriodColor = period => periodDisplayColor(period, Math.max(0, state.workPeriods.findIndex(item => item.id === period.id)));
const periodColor = period => ' style="--period-color:' + displayPeriodColor(period) + '"';
function periodChoices(selected, field, focusId, branchId, day) {
  return '<div class="schedule-options">' + state.workPeriods.map(period => periodOnDay(period, day)).filter(period=>!branchId || periodAvailableFor(period,{branchId})).map(period =>
    '<label><input type="checkbox" name="' + field + '" value="' + esc(period.id) + '"' +
    (selected.includes(period.id) ? ' checked' : '') + (period.id === focusId ? ' autofocus' : '') +(day&&!periodActiveOn(period,day)?' disabled':'')+
    '><span class="period-dot" aria-hidden="true"' + periodColor(period) + '></span><span><strong>' + esc(period.name) +
    '</strong><small><bdi>' + esc(periodHours(period)) + '</bdi></small></span></label>').join('') + '</div>';
}
function scheduleAssignmentDialog() {
  const { staffId, date, periodId } = selectedScheduleCell;
  const person = state.staff.find(item => item.id === staffId);
  const selected = effectivePeriodIds(state, person, date);
  const restDay = isScheduleRestDay(state, person, date);
  const overridden = (state.workAssignments ?? []).some(item => item.staffId === staffId && item.date === date);
  return '<dialog class="catalog-dialog" id="schedule-assignment-dialog" aria-labelledby="schedule-assignment-title">' +
    '<header><h2 id="schedule-assignment-title">' + t('Assign periods') + '</h2>' +
    '<button type="button" id="close-schedule-assignment" class="button secondary compact" aria-label="' + t('Close') + '">×</button></header>' +
    '<p>' + esc(staffName(person)) + ' · <bdi>' + esc(date) + '</bdi></p>' +
    '<form id="schedule-assignment-form"><fieldset class="schedule-assignment-fields"' + (restDay ? ' disabled' : '') +
    '>' + periodChoices(selected, 'periodId', periodId, person.branchId,date) + '</fieldset>' +
    '<div class="schedule-options"><label><input name="restDay" type="checkbox"' + (restDay ? ' checked' : '') +
    '><span><strong>' + t('Rest day') + '</strong><small>' +
    t('Applies to the selected employee and date.') + '</small></span></label></div>' +
    '<fieldset class="schedule-assignment-fields"' + (restDay ? ' disabled' : '') + '><label>' +
    t('Number of working days') + '<input name="repeat" type="number" min="1" max="366" step="1" required value="1"></label></fieldset>' +
    '<p class="hint">' + t('Repeat from the selected date and skip rest days.') + '</p>' +
    '<p class="hint error" id="schedule-assignment-error" role="alert"></p><div class="actions">' + button(t('Save assignments')) +
    (overridden ? '<button type="submit" value="default" class="button secondary" formnovalidate>' + t('Restore default periods') + '</button>' : '') +
    '</div></form></dialog>';
}
function focusScheduleCell({ staffId, date }) {
  $('[data-schedule-staff="' + CSS.escape(staffId) + '"][data-schedule-date="' + date + '"].schedule-add')?.focus({ preventScroll: true });
}
function closeScheduleAssignment() {
  const cell = selectedScheduleCell;
  const scroll = $('.weekly-schedule .table-wrap');
  const position = scroll && { top: scroll.scrollTop, left: scroll.scrollLeft };
  selectedScheduleCell = undefined;
  render();
  if (position) $('.weekly-schedule .table-wrap')?.scrollTo(position);
  focusScheduleCell(cell);
  return cell;
}
const normalizeScheduleSearch = value => String(value).normalize('NFKC').toLocaleLowerCase()
  .replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/\s+/g, '');
function filterScheduleRows() {
  const query = normalizeScheduleSearch(scheduleSearch);
  let matches = 0;
  for (const name of document.querySelectorAll('[data-schedule-search-name]')) {
    const visible = normalizeScheduleSearch(name.dataset.scheduleSearchName).includes(query);
    name.closest('tr').hidden = !visible;
    if (visible) matches++;
  }
  const empty = $('#schedule-search-empty');
  if (empty) empty.hidden = !query || matches > 0;
}
function weeklySchedule() {
  if (state.locations.length < 2 || !state.locations.some(branch => branch.id === scheduleBranch)) scheduleBranch = '';
  const start = new Date(state.today + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - start.getUTCDay() + scheduleWeek * 7);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    return day;
  });
  const locale = language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en';
  const dateLabel = dateFormatter(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dayLabel = dateFormatter(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const periods = state.workPeriods ?? [];
  const leaveTypes = new Set(state.leaveTypes ?? []);
  const leaveByEmployee = new Map();
  for (const request of state.requests ?? []) {
    if (request.status !== 'Approved' || !leaveTypes.has(request.type)) continue;
    if (!leaveByEmployee.has(request.staffId)) leaveByEmployee.set(request.staffId, []);
    leaveByEmployee.get(request.staffId).push(request);
  }
  for (const person of state.staff) {
    const imported=(person.historicalLeave??[]).filter(item=>item.source==='jisr');
    if(imported.length)leaveByEmployee.set(person.id,[...(leaveByEmployee.get(person.id)??[]),...imported]);
  }
  const timeOff = (label, names) => '<div class="schedule-period"><small>' + esc(t(label)) +
    '</small><strong>' + names.map(name => esc(t(name))).join(' / ') + '</strong></div>';
  const rows = state.staff.filter(person => (!scheduleBranch || person.branchId === scheduleBranch) &&
    ['Active', 'Pending activation'].includes(person.status)).map(person => [
    '<strong data-schedule-search-name="' + esc([person.name, person.nameAr, person.nameEn].filter(Boolean).join(' ')) + '">' + esc(staffName(person)) + '</strong><small>' + esc(t(person.role ?? 'Unassigned')) + '</small>',
    ...days.map(day => {
      const date = day.toISOString().slice(0, 10);
      const holiday=officialHolidaysOn(state,person,date);
      if (holiday.length) return timeOff('Public holiday', holiday.map(item => item.name));
      const approvedLeave = (leaveByEmployee.get(person.id) ?? []).filter(request =>
        request.date <= date && date <= (request.end ?? request.date));
      if (approvedLeave.length) return timeOff('Leave type', [...new Set(approvedLeave.map(request => displayLeaveType(request.type)))]);
      const selected = effectivePeriodIds(state, person, date);
      const scheduled = periods.filter(period => selected.includes(period.id)).map(period => periodOnDay(period,date)).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
      const cell = ' data-schedule-staff="' + esc(person.id) + '" data-schedule-date="' + date + '"';
      return '<div class="schedule-cell">' + scheduled.map(period =>
        '<div class="schedule-period"' + periodColor(period) + '><strong>' + esc(period.name) + '</strong><small><bdi>' +
        esc(periodHours(period)) + '</bdi></small><div class="schedule-period-actions">' +
        '<button type="button" class="button secondary compact" data-edit-assignment="' + esc(period.id) + '"' + cell +
        ' aria-label="' + esc(t('Edit assignment') + ' — ' + period.name) + '" title="' + t('Edit assignment') + '">✎</button>' +
        '<button type="button" class="button secondary compact" data-remove-assignment="' + esc(period.id) + '"' + cell +
        ' aria-label="' + esc(t('Remove assignment') + ' — ' + period.name) + '" title="' + t('Remove assignment') + '">×</button></div></div>').join('') +
        '<button type="button" class="schedule-add' + (scheduled.length ? ' has-periods' : '') + '"' + cell +
        ' aria-haspopup="dialog" aria-label="' + esc(t('Assign periods') + ' — ' + staffName(person) + ' — ' + dayLabel.format(day)) + '">' +
        (isScheduleRestDay(state, person, date) ?
          '<span class="schedule-rest-label">' + t('Rest day') + '</span>' : '+') + '</button></div>';
    }),
  ]);
  const weekLabel = dateLabel.formatRange(days[0], days[6]);
  return '<section class="card weekly-schedule"><div class="schedule-week"><button type="button" class="button secondary" data-week-step="-1" aria-label="' + t('Previous week') + '"><span aria-hidden="true">‹</span></button>' +
    '<h2>' + esc(weekLabel) + '</h2><button type="button" class="button secondary" data-week-step="1" aria-label="' + t('Next week') + '"><span aria-hidden="true">›</span></button>' +
    '<button type="button" class="button secondary" data-week-step="0">' + (language === 'ar' ? 'هذا الأسبوع' : 'This week') + '</button></div>' +
    (periods.length ? '' : '<p class="hint">' + t('Define a period in Work schedule settings to assign it here.') + '</p>') +
    '<div class="schedule-filters">' + branchFilter('schedule-branch', scheduleBranch) +
    '<label class="schedule-search">' + t('Search by employee name') + '<input type="search" id="schedule-search" autocomplete="off" value="' + esc(scheduleSearch) + '" placeholder="' + esc(t('Enter an employee name or part of it.')) + '"></label></div>' +
    table([t('Staff'), ...days.map(day => esc(dayLabel.format(day)))], rows, t('No employees yet.'),
      'schedule-grid today-column-' + (days.findIndex(day => day.toISOString().slice(0, 10) === state.today) + 2)) +
    '<div id="schedule-search-empty" class="schedule-empty" hidden><p role="status">' + t('No employees match your search.') +
    '</p><button type="button" id="schedule-clear-search" class="button secondary">' + (language === 'ar' ? 'مسح البحث' : 'Clear search') + '</button></div>' +
    (selectedScheduleCell ? scheduleAssignmentDialog() : '') + '</section>';
}
function workPeriods() {
  const countFormat = new Intl.NumberFormat(language);
  const rows = (state.workPeriods ?? []).map(period => {
    const { id, name, duration } = period;
    const disabled=!state.isCompanyOwner && Array.isArray(period.branchIds) && period.branchIds.some(id=>!state.locations.some(branch=>branch.id===id)) ? ' disabled' : '';
    const elapsed = [Math.floor(duration / 60), duration % 60];
    const format = new Intl.NumberFormat(language, { minimumIntegerDigits: 2 });
    return ['<span class="period-dot" aria-hidden="true"' + periodColor(period) + '></span>' + esc(name),
      '<bdi class="period-duration">' + elapsed.map(value => format.format(value)).join(':') + '</bdi>' + (isFlexiblePeriod(period) ? '<small>' + t('Flexible period') + ' · ' + periodHours(period) + '</small>' : ''),
      ...(state.locations??[]).map(branch=>'<input class="period-branch-toggle" type="checkbox" data-period-branch="'+esc(id)+'" data-branch="'+esc(branch.id)+'" aria-label="'+esc(name+' — '+branch.name)+'"'+(periodAvailableFor(period,{branchId:branch.id})?' checked':'')+'>'),
      '<button type="button" class="button secondary compact" data-period-staff="' + esc(id) + '" aria-label="' +
        esc(t('Assigned employees') + ' — ' + name) + '">' + countFormat.format(assignedStaffForPeriod(state, id, state.today).length) + '</button>',
      '<div class="actions"><button type="button" class="button secondary compact"'+disabled+' data-edit-period="' + esc(id) + '" aria-label="' +
      esc(t('Edit period') + ' — ' + name) + '">' + t('Edit') + '</button>' +
      '<button type="button" class="button secondary compact"'+disabled+' data-duplicate-period="' + esc(id) + '" title="' +
      esc(t('Duplicate period')) + '" aria-label="' + esc(t('Duplicate period') + ' — ' + name) + '">⧉</button>' +
      '<button type="button" class="button secondary compact"'+disabled+' data-delete-period="' + esc(id) + '" title="' +
      esc(t('Delete period')) + '" aria-label="' + esc(t('Delete period') + ' — ' + name) + '">×</button></div>'];
  });
  return '<section class="card"><div class="period-toolbar"><button type="button" id="add-period" class="button primary" aria-expanded="' +
    addingPeriod + '"><span aria-hidden="true">+ </span>' + t('Define a new period') + '</button></div>' +
    (addingPeriod ? periodDialog() : '') +
    table([t('Period'), t('Duration'), ...(state.locations??[]).map(branch=>branch.name),
      t('Assigned employees'), t('Action')], rows, t('No periods yet.'), 'work-periods-table') + '</section>';
}
function openPeriodStaff(period, trigger) {
  if (!period) return;
  const people = assignedStaffForPeriod(state, period.id, state.today)
    .sort((a,b) => staffName(a).localeCompare(staffName(b), language));
  const dialog = document.createElement('dialog');
  dialog.className = 'catalog-dialog';
  dialog.setAttribute('aria-labelledby', 'period-staff-title');
  dialog.innerHTML = '<header><h2 id="period-staff-title">' + esc(t('Assigned employees') + ' — ' + period.name) +
    '</h2><form method="dialog"><button type="submit" class="button secondary compact" aria-label="' +
    esc(t('Close')) + '">×</button></form></header>' + (people.length ? '<ul>' +
    people.map(person => '<li>' + esc(staffName(person)) + '</li>').join('') + '</ul>' :
    '<p>' + esc(t('No employees are assigned to this period.')) + '</p>');
  dialog.addEventListener('close', () => { dialog.remove(); trigger.focus(); }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
}
function periodDialog() {
  const period = editingPeriod ?? {};
  const color = (editingPeriod ? displayPeriodColor(period) : nextPeriodColor(state.workPeriods)).toLowerCase();
  const choices = periodColors.includes(color) ? periodColors : [...periodColors, color];
  const punchWindow = (key, label, fields) => '<details class="period-window"><summary>' + t(label) +
    '</summary><div class="period-fields">' + fields.map(([field, caption, value]) =>
      '<label><span>' + t(caption) + '</span><input type="number" min="0" max="720" required name="' + key + '-' + field +
      '" value="' + esc(period[key]?.[field] ?? value) + '"></label>').join('') + '</div><p class="hint" data-window="' + key + '"></p></details>';
  return '<dialog id="period-dialog" aria-labelledby="period-title"><form id="period-form">' +
    '<header><h2 id="period-title">' + t(editingPeriod ? 'Edit period' : 'New period') + '</h2><button type="button" id="close-period" class="button secondary" aria-label="' + t('Close') + '">×</button></header>' +
    '<label id="period-name-field">' + t('Period name') + '<input name="name" required maxlength="80" value="' + esc(period.name) + '" autofocus></label>' +
    '<details class="period-color-picker"><summary><span class="period-dot" aria-hidden="true" style="--period-color:' +
    color + '"></span>' + t('Period color') + '</summary><div class="period-color-palette" role="group" aria-label="' +
    t('Period color') + '">' + choices.map((choice, index) =>
    '<input type="radio" name="color" value="' + choice + '" style="--period-color:' + choice +
    '" aria-label="' + t('Color option') + ' ' + (index + 1) + '"' +
    (choice === color ? ' checked' : '') + '>').join('') + '</div></details>' +
    '<label class="period-flexible-option">' + t('Flexible period') + '<input type="checkbox" name="flexibleDay"' + (isFlexiblePeriod(period) ? ' checked' : '') + '></label>' +
    '<fieldset id="timed-period-settings">' +
    '<div class="period-times">' + periodTimePicker('start', 'Start time', period.start ?? '08:00') +
    periodTimePicker('end', 'End time', period.end ?? '17:00') + '</div>' +
    '<p>' + t('Period window') + ' <output id="period-duration"></output></p></fieldset>' +
    '<fieldset class="period-weekdays"><legend>'+t('Active period days')+'</legend><div>'+[['Sunday',0],['Monday',1],['Tuesday',2],['Wednesday',3],['Thursday',4],['Friday',5],['Saturday',6]].map(([name,day])=>'<label><input type="checkbox" name="weekday" value="'+day+'"'+((period.weekdays??[0,1,2,3,4,5,6]).includes(day)?' checked':'')+'><span>'+t(name)+'</span></label>').join('')+'</div></fieldset>' +
    '<fieldset id="flexible-period-settings"' + (isFlexiblePeriod(period) ? '' : ' hidden disabled') + '><legend>' + t('Total flexible period hours') + '</legend><div class="period-times">' +
    '<label>' + t('Hours') + '<select name="durationHours">' + Array.from({length:24}, (_, hour) => '<option value="' + hour + '"' + (hour === Math.floor((period.duration || 480) / 60) ? ' selected' : '') + '>' + hour + '</option>').join('') + '</select></label>' +
    '<label>' + t('Minutes') + '<select name="durationMinutes">' + Array.from({length:60}, (_, minute) => '<option value="' + minute + '"' + (minute === (period.duration || 480) % 60 ? ' selected' : '') + '>' + minute + '</option>').join('') + '</select></label></div></fieldset>' +
    '<fieldset id="fixed-period-rules"' + (isFlexiblePeriod(period) ? ' hidden disabled' : '') + '>' +
    punchWindow('arrival', 'Check-in rules', [['before', 'Before start (min)', 60], ['grace', 'Allowed lateness (min)', 0], ['after', 'After start (min)', 60]]) +
    punchWindow('departure', 'Check-out rules', [['before', 'Before end (min)', 60], ['grace', 'Allowed early departure (min)', 0], ['after', 'After end (min)', 60]]) +
    '</fieldset><label class="period-flexible-option">' + t('Automatic overtime') +
    '<input type="checkbox" name="overtimeEnabled"' + (period.overtime ? ' checked' : '') + '></label>' +
    '<fieldset id="period-overtime-settings"' + (period.overtime ? '' : ' hidden disabled') + '><legend>' + t('After working hours') + '</legend>' +
    '<div class="period-overtime-fields"><label>' + t('Maximum overtime (minutes)') + '<input type="number" name="overtimeMinutes" min="1" max="720" step="1" required value="' +
    esc(period.overtime?.minutes ?? 60) + '"></label>' +
    '<label>' + t('Overtime calculation') + '<select name="overtimeMode" required>' +
    [['required','After completing required working hours'],['scheduled','After the scheduled period ends']].map(([value,label]) =>
      '<option value="' + value + '"' +
      ((period.overtime?.mode ?? 'scheduled') === value ? ' selected' : '') + '>' + t(label) + '</option>').join('') +
    '</select></label></div></fieldset><div class="actions">' + button(t(editingPeriod ? 'OK' : 'Save period')) +
    '</div></form></dialog>';
}
function choosePeriodEffectiveDate() {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'catalog-dialog';
    dialog.setAttribute('aria-labelledby', 'period-effective-title');
    dialog.innerHTML = '<form method="dialog"><h2 id="period-effective-title">' + t('Apply period changes') + '</h2>' +
      '<div class="actions">' + [['retroactive','Apply retroactively'],['today','From today'],['tomorrow','From tomorrow'],['cancel','Cancel']]
        .map(([value,label]) => '<button class="button ' + (value === 'today' ? 'primary' : 'secondary') +
          '" value="' + value + '"' + (value === 'cancel' ? ' autofocus' : '') + '>' + t(label) + '</button>').join('') +
      '</div></form>';
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      const choice = dialog.returnValue;
      dialog.remove();
      resolve(['retroactive','today','tomorrow'].includes(choice) ? choice : null);
    }, { once: true });
    dialog.showModal();
  });
}
const twoTimeDigits = value => String(value).padStart(2, '0');
function periodTimeParts(time) {
  const [hour, minute] = time.split(':').map(Number);
  return { hour: state.timeFormat === '24' ? hour : hour % 12 || 12, minute, half: hour >= 12 ? 1 : 0 };
}
function periodTimeLabel(parts) {
  const clock = twoTimeDigits(parts.hour) + ':' + twoTimeDigits(parts.minute);
  return state.timeFormat === '24' ? clock : clock + ' ' + t(parts.half ? 'PM' : 'AM');
}
function periodTimePicker(name, label, value) {
  const parts = periodTimeParts(value);
  const clock24 = state.timeFormat === '24';
  const choices = (part, values, labels = []) => values.map((number, index) =>
    '<button type="button" data-time-part="' + part + '" data-time-value="' + number + '" aria-pressed="' +
    (parts[part] === number) + '">' + (labels[index] ?? twoTimeDigits(number)) + '</button>').join('');
  return '<div><span id="period-' + name + '-label">' + t(label) + '</span>' +
    '<details class="period-time-picker"><summary aria-labelledby="period-' + name + '-label period-' + name + '-value">' +
    '<span id="period-' + name + '-value" class="period-time-value">' + esc(periodTimeLabel(parts)) + '</span></summary>' +
    '<input type="hidden" name="' + name + '" value="' + esc(value) + '">' +
    '<div class="period-time-menu">' + (clock24 ? '' : '<div class="period-time-halves" role="group" aria-label="' + t('Time of day') + '">' +
    choices('half', [0, 1], [t('AM'), t('PM')]) + '</div>') + '<div class="period-time-columns" dir="ltr">' +
    '<div class="period-time-wheel" role="group" aria-label="' + t('Hours') + '">' +
    choices('hour', Array.from({ length: clock24 ? 24 : 12 }, (_, index) => clock24 ? index : index + 1)) + '</div>' +
    '<div class="period-time-wheel" role="group" aria-label="' + t('Minutes') + '">' +
    choices('minute', Array.from({ length: 60 }, (_, index) => index)) + '</div></div>' +
    '<button type="button" class="button secondary compact" data-close-time-picker>' + t('Done') + '</button></div></details></div>';
}
function updatePeriodPreview(form) {
  const flexible = form.elements.flexibleDay.checked;
  const rules = form.querySelector('#fixed-period-rules'), target = form.querySelector('#flexible-period-settings');
  rules.hidden = rules.disabled = flexible;
  target.hidden = target.disabled = !flexible;
  const overtime = form.querySelector('#period-overtime-settings');
  overtime.hidden = overtime.disabled = !form.elements.overtimeEnabled.checked;
  form.elements.name.required = true;
  const minutes = (name) => {
    const [hours, mins] = form.elements[name].value.split(':').map(Number);
    return hours * 60 + mins;
  };
  const format = (value) => {
    if (!Number.isFinite(value)) return '—';
    const minute = (value + 1440) % 1440;
    return [Math.floor(minute / 60), minute % 60].map(n => String(n).padStart(2, '0')).join(':');
  };
  const start = minutes('start'), end = minutes('end');
  const targetMinutes = Number(form.elements.durationHours.value) * 60 + Number(form.elements.durationMinutes.value);
  form.elements.durationHours.setCustomValidity(flexible && (targetMinutes <= 0 || targetMinutes > (end - start + 1440) % 1440) ? t('Choose flexible hours within the period window.') : '');
  const display = value => Number.isFinite(value) ? wallTime(format(value)) : '—';
  form.querySelector('#period-duration').textContent = format(end - start);
  for (const [key, time, status, direction] of [['arrival', start, 'Late after', 1], ['departure', end, 'Early before', -1]]) {
    const read = (field) => form.elements[key + '-' + field].valueAsNumber;
    form.querySelector('[data-window="' + key + '"]').textContent = t('Punch window') + ' ' +
      display(time - read('before')) + ' – ' + display(time + read('after')) + ' · ' +
      t(status) + ' ' + display(time + direction * read('grace'));
  }
}
function workingHours() {
  const schedule = state.workSchedule;
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return card(t('Working days and hours'), '<form id="schedule-form"><fieldset><legend>' + t('Working days') + '</legend>' +
    '<div class="schedule-days">' + weekdays.map((day, index) => '<label><input type="checkbox" name="day" value="' + index +
      '"' + (schedule.days.includes(index) ? ' checked' : '') + '> ' + t(day) + '</label>').join('') + '</div></fieldset>' +
    '<div class="fields"><label>' + t('Start time') + '<input type="time" name="start" required value="' + esc(schedule.start) + '"></label>' +
    '<label>' + t('End time') + '<input type="time" name="end" required value="' + esc(schedule.end) + '"></label></div>' +
    button(t('Save settings')) + '</form>');
}
let staffLeaveFilter = { staffId: null, type: '' };
function staffLeaveDetails(person) {
  if (staffLeaveFilter.staffId !== person.id) staffLeaveFilter = { staffId: person.id, type: '' };
  const number = new Intl.NumberFormat(language, {maximumFractionDigits: 2});
  const format = value => Number.isFinite(value) ? number.format(value) : '—';
  const balance = annualLeaveBalance(person, state.today, state.requests);
  const available = balance?.available == null ? null :
    balance.available - annualLeaveRequired(state.requests, person.id, state.today, {});
  const requests = state.requests.filter(item => item.staffId === person.id && item.status === 'Approved' &&
    (state.leaveTypes.includes(item.type) || item.type === 'Annual leave' || item.type === futureAnnualLeave));
  const archived = (person.historicalLeave ?? []).filter(item => item.source === 'jisr' || item.status === 'Approved');
  const items = [...requests, ...archived].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const types = [...new Set(items.map(item => displayLeaveType(item.type)))].sort((a, b) => t(a).localeCompare(t(b), language));
  if (!types.includes(staffLeaveFilter.type)) staffLeaveFilter.type = '';
  let totalDays = 0;
  const rows = items.filter(item => !staffLeaveFilter.type || displayLeaveType(item.type) === staffLeaveFilter.type).map(item => {
    const end = item.end ?? item.date;
    const days = item.source === 'jisr' ? item.days : (Date.parse(end) - Date.parse(item.date)) / 86400000 + 1;
    if (Number.isFinite(days) && days > 0) totalDays += days;
    const type = displayLeaveType(item.type);
    const status = item.source === 'jisr' ? ' ' + badge('Approved') : ' ' + badge(item.status);
    return [esc(t(type)) + status, esc(dateText(item.date)), esc(dateText(end)),
      '<bdi>' + esc(format(days > 0 ? days : null)) + '</bdi>', esc(item.note || '—')];
  });
  const totalLabel = L('إجمالي الأيام', 'Total days');
  const total = '<strong>' + esc(totalLabel) + '</strong> · <bdi>' + esc(format(totalDays)) + '</bdi>';
  if (rows.length) rows.push(['<strong>' + esc(totalLabel) + '</strong>', '', '',
    '<strong><bdi>' + esc(format(totalDays)) + '</bdi></strong>', '']);
  const typeLabel = esc(t('Leave type'));
  const typeFilter = '<select id="staff-leave-type-filter" aria-label="' + typeLabel + '">' +
    '<option value="">' + typeLabel + ' · ' + esc(L('الكل', 'All')) + '</option>' +
    types.map(type => '<option value="' + esc(type) + '"' + (type === staffLeaveFilter.type ? ' selected' : '') +
      '>' + esc(t(type)) + '</option>').join('') + '</select>';
  const headings = [typeFilter, L('تاريخ البداية', 'Start date'), L('تاريخ النهاية', 'End date'),
    L('عدد الأيام', 'Number of days'), L('السبب', 'Reason')];
  const fields = [
    [L('الاستحقاق السنوي حسب العقد', 'Annual entitlement under the contract'), balance?.entitlement],
    [L('المكتسب في السنة التعاقدية حتى اليوم', 'Earned this contractual year to date'), balance?.earned],
    [L('الرصيد الافتتاحي للسنة', 'Opening balance for the year'), balance?.opening],
    [L('الرصيد المستحق حتى اليوم', 'Accrued balance to date'), balance?.accrued],
    [L('المتاح للاستخدام', 'Available to use'), available],
  ];
  const summary = '<dl class="staff-leave-summary">' + fields.map(([label, value]) =>
    '<div><dt>' + esc(label) + '</dt><dd><bdi>' + esc(format(value)) + '</bdi></dd></div>').join('') + '</dl>';
  return '<div class="staff-leave-layout">' + card(L('طلبات الإجازات', 'Leave requests'),
    table(headings, rows, t('No requests to show.'), 'staff-leave-requests') +
    (rows.length ? '' : '<p>' + total + '</p>')) +
    card('<span class="staff-leave-summary-heading">' + L('ملخص الرصيد', 'Balance summary') +
      leaveBalanceEditButton(person, balance) + '</span>', summary) + '</div>';
}

function annualLeaveBalance(person, today, requests) {
  return calculateAnnualLeaveBalance(person, today, requests, state.leavePreferences);
}

let leaveBalanceSearch = '';
let leaveBalanceBranch = '';

function canAdjustLeaveBalance() {
  return Boolean(companyPrefix && state.canAdjustLeaveBalances);
}

function leaveBalanceEditButton(person, balance) {
  if (!canAdjustLeaveBalance() || balance?.accrued == null || person.joinDate > state.today) return '';
  return '<button type="button" class="button secondary compact" data-adjust-leave-balance="' + esc(person.id) +
    '" aria-label="' + esc(L('تعديل رصيد إجازة ', 'Adjust leave balance for ') + staffName(person)) + '">✎</button>';
}

function leaveBalanceTable() {
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const query = leaveBalanceSearch.trim().toLowerCase();
  const canAdjust = canAdjustLeaveBalance();
  const rows = state.staff.filter(person => person.status !== 'Removed' &&
    (!leaveBalanceBranch || person.branchId === leaveBalanceBranch) &&
    (!query || [person.name, person.nameAr, person.nameEn].some(name => name?.toLowerCase().includes(query)))).map(person => {
    const balance = annualLeaveBalance(person, state.today, state.requests);
    return ['<strong>' + esc(staffName(person)) + '</strong>',
      ...[balance?.start, balance?.end, balance?.opening, balance?.openingExpires,
        balance?.current, balance?.currentExpires, balance?.accrued]
        .map(value => '<bdi>' + esc(typeof value === 'number' ? number.format(value) : value ?? '—') + '</bdi>'),
      ...(canAdjust ? [leaveBalanceEditButton(person, balance) || '—'] : [])];
  });
  return table(['Staff member', 'Entitlement year start', 'Entitlement year end',
    'Year opening balance', 'Opening balance expiry date', 'Current year balance', 'Current year balance expiry date', 'Balance accrued to today'].map(t)
    .concat(canAdjust ? [L('إجراء', 'Action')] : []),
    rows, query || leaveBalanceBranch ? L('لا يوجد موظفون مطابقون.', 'No matching employees.') : t('No staff members yet.'),
    canAdjust ? 'leave-balance-table has-leave-balance-actions' : 'leave-balance-table');
}

function bindSideDrawer(dialog, onDismiss) {
  dialog.classList.add('side-drawer');
  let closing = false;
  const close = async () => {
    if (closing || !dialog.open) return;
    closing = true;
    dialog.classList.add('side-drawer-closing');
    await Promise.allSettled(dialog.getAnimations().map(animation => animation.finished));
    if (dialog.open) dialog.close();
    onDismiss?.();
  };
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX >= bounds.right ||
        event.clientY < bounds.top || event.clientY >= bounds.bottom) void close();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!dialog.querySelector('.period-time-picker[open]')) void close();
  });
  return close;
}
function openLeaveBalanceAdjustment(staffId) {
  if (!canAdjustLeaveBalance()) return;
  const person = state.staff.find(item => item.id === staffId && item.status !== 'Removed');
  if (!person) return;
  const dialog = document.createElement('dialog');
  const close = bindSideDrawer(dialog);
  dialog.setAttribute('aria-label', L('تعديل رصيد الإجازة','Adjust leave balance'));
  dialog.innerHTML = '<h2>' + esc(L('تعديل رصيد الإجازة', 'Adjust leave balance')) + '</h2><p>' + esc(staffName(person)) +
    '</p><form><label>' + L('العملية', 'Operation') + '<select name="operation"><option value="add">' +
    L('إضافة', 'Add') + '</option><option value="deduct">' + L('خصم', 'Deduct') + '</option></select></label><label>' +
    L('عدد الأيام', 'Number of days') + '<input name="days" type="number" min="0.01" max="99999" step="0.01" required></label><label>' +
    L('ملاحظة للتوثيق', 'Audit note') + '<textarea name="note" maxlength="1000" required></textarea></label><p role="status"></p>' +
    '<button type="submit" class="button primary">' + L('حفظ', 'Save') + '</button> ' +
    '<button type="button" class="button secondary" data-close>' + L('إلغاء', 'Cancel') + '</button></form>' +
    '<details><summary>' + L('التعديلات الأخيرة', 'Recent adjustments') + '</summary><div data-adjustment-history></div></details>';
  const actions = document.createElement('div');
  actions.className = 'side-drawer-actions';
  const leaveForm = dialog.querySelector('form');
  leaveForm.id = 'leave-adjustment-form';
  const saveButton = leaveForm.querySelector('button[type=submit]');
  saveButton.setAttribute('form', leaveForm.id);
  actions.append(saveButton, leaveForm.querySelector('[data-close]'));
  dialog.append(actions);
  dialog.addEventListener('close', () => dialog.remove(), {once:true});
  document.body.append(dialog);
  dialog.showModal();
  const form = dialog.querySelector('form');
  const status = form.querySelector('[role="status"]');
  let requestId = crypto.randomUUID();
  form.addEventListener('input', () => { requestId = crypto.randomUUID(); });
  actions.querySelector('[data-close]').onclick = close;
  form.onsubmit = async event => {
    event.preventDefault();
    const fields = new FormData(form);
    if (!String(fields.get('note')).trim()) {status.textContent = L('اكتب ملاحظة للتوثيق.', 'Enter an audit note.');return;}
    for (const control of form.elements) control.disabled = true;
    try {
      await save('leave-balances/adjust', {staffId, requestId, operation:fields.get('operation'),
        days:Number(fields.get('days')), note:fields.get('note')});
      await close();
      say(L('تم تعديل الرصيد.', 'Balance adjusted.'));
    } catch (error) {
      status.textContent = t(error.message);
      for (const control of form.elements) control.disabled = false;
    }
  };
  const details = dialog.querySelector('details');
  details.addEventListener('toggle', async () => {
    if (!details.open) return;
    const history = details.querySelector('[data-adjustment-history]');
    history.textContent = L('جارٍ التحميل…', 'Loading…');
    try {
      const response = await fetch(companyPrefix + '/api/leave-balances/adjustments?staffId=' + encodeURIComponent(staffId), {cache:'no-store'});
      if (!response.ok) throw new Error('Could not load adjustments.');
      const {adjustments} = await response.json();
      history.innerHTML = adjustments.length ? '<ul>' + adjustments.map(entry => '<li>' +
        esc(dateText(entry.at.slice(0,10))) + ' · <bdi>' + esc((entry.days > 0 ? '+' : '') + entry.days) +
        '</bdi> · ' + esc(entry.actor ?? L('مسؤول الحساب', 'Account owner')) + ' · ' + esc(entry.note) + '</li>').join('') + '</ul>' :
        esc(L('لا توجد تعديلات يدوية.', 'No manual adjustments.'));
    } catch { history.textContent = L('تعذّر تحميل التعديلات.', 'Could not load adjustments.'); }
  });
}

function annualLeaveBalances() {
  if (!state.locations.some(branch => branch.id === leaveBalanceBranch)) leaveBalanceBranch = '';
  const searchLabel = esc(t('Search by employee name'));
  return card(t('Annual leave balances'),
    '<div class="attendance-toolbar leave-balance-toolbar"><input id="leave-balance-search" type="search" aria-label="' +
    searchLabel + '" placeholder="' + searchLabel + '" value="' + esc(leaveBalanceSearch) + '">' +
    branchFilter('leave-balance-branch', leaveBalanceBranch, 1) + '</div>' +
    '<div id="leave-balance-results">' + leaveBalanceTable() + '</div>');
}

function leavePreferenceForm() {
  const preferences = state.leavePreferences ?? { availability: 'full', remaining: 'all', carryoverDays: 0 };
  const choice = (name, value, label, description) => '<label class="leave-policy-option"><span><input type="radio" name="' + name +
    '" value="' + value + '"' + (preferences[name] === value ? ' checked' : '') + ' required> ' + t(label) +
    '</span><small>' + t(description) + '</small></label>';
  return '<form id="leave-preferences-form">' + card(t('Balance availability'),
    choice('availability', 'full', 'Make the full balance available', 'The annual allowance is available in advance. Unearned leave used appears as a negative accrued balance.') +
    choice('availability', 'accrued', 'Accrued balance', 'Leave accrues daily. Employees can only use their earned balance.')) +
    card(t('Remaining balance'),
    choice('remaining', 'reset', 'Reset the balance', 'Remaining balance cannot be carried into the next year.') +
    choice('remaining', 'all', 'Carry over the full balance', 'Carry all remaining current-year balance into the next contractual year.') +
    choice('remaining', 'partial', 'Carry over part of the balance', 'Carry remaining current-year balance up to the specified number of days.') +
    '<label id="leave-carryover-days"' + (preferences.remaining !== 'partial' ? ' hidden' : '') + '>' + t('Number of days') +
    '<input type="number" name="carryoverDays" min="0" max="99999" step="0.01" value="' + esc(preferences.carryoverDays ?? 0) +
    '"' + (preferences.remaining !== 'partial' ? ' disabled' : ' required') + '></label>') + button(t('Save settings')) + '</form>';
}
let leavePreferencesTab = 'types';
function leaveTypes() {
  const tabs = '<div class="schedule-tabs" role="group" aria-label="' + esc(t('Leaves')) + '">' +
    [['types', 'Available leave types'], ['official', 'Official holidays'], ['settings', 'Leave settings']].map(([key, label]) =>
      '<button type="button" data-leave-preferences-tab="' + key + '" aria-pressed="' + (leavePreferencesTab === key) + '">' +
      esc(t(label)) + '</button>').join('') + '</div>';
  if (leavePreferencesTab === 'settings') return tabs + leavePreferenceForm();
  if (leavePreferencesTab === 'official') return tabs + officialHolidayTable();
  const rows = state.leaveTypes.filter(type => type !== 'Annual leave').map(type => {
    const { maxDays, description } = state.leaveSettings?.[type] ?? {};
    return [
      '<strong>' + esc(t(type)) + '</strong>' + (description ? '<small>' + esc(t(description)) + '</small>' : ''),
      esc(maxDays ?? '—'),
      requestPreferenceSwitch(type,effectiveRequestPreferences(state)[type]),
      '<button type="button" class="button secondary compact" data-request-contracts="'+esc(type)+'" aria-label="'+esc(t('Edit')+' '+t(type))+'">✎</button>',
    ];
  });
  const types = table(['Leave type name', 'Number of days', 'Status', 'Actions'].map(t), rows, '', 'leave-types-table');
  const addType = '<form id="leave-type-form"><label>' + t('Leave type name') + '<input name="name" required maxlength="60"></label>' +
    '<label>' + t('Maximum days') + '<input name="maxDays" type="number" min="0" step="1"></label>' +
    button(t('Add leave type')) + '</form>';
  return tabs + '<details class="card leave-types-collapse"><summary>'+t('Available leave types')+'</summary>'+types+addType+'</details>';
}
function officialHolidayTable() {
  const settings=holidaySettings(state);
  const rows=Object.entries(officialHolidays).map(([id,name])=>[
    '<strong>'+esc(t(name))+'</strong><small>'+holidayOccurrences(state,id,Number(state.today.slice(0,4))).map(h=>'<bdi>'+h.start+' — '+h.end+'</bdi>').join('<br>')+'</small>', esc(settings[id].days??holidayDefaultDays[id]),
    '<button type="button" role="switch" class="leave-switch" aria-label="'+esc(t(name))+'" aria-checked="'+settings[id].enabled+'" data-holiday-toggle="'+id+'"><span></span></button>',
    '<button type="button" class="button secondary compact" data-holiday-edit="'+id+'" aria-label="'+esc(t('Edit')+' '+t(name))+'">✎</button>',
  ]);
  return card(t('Official holidays'),table(['Leave type name','Number of days','Status','Actions'].map(t),rows,'','official-holidays-table'));
}
function editOfficialHoliday(id) {
  const current=holidaySettings(state)[id];
  const dialog=document.createElement('dialog');
  dialog.className='catalog-dialog request-contract-dialog';
  dialog.setAttribute('aria-labelledby','official-holiday-title');
  dialog.innerHTML='<header><h2 id="official-holiday-title">'+esc(t(officialHolidays[id]))+'</h2><button type="button" class="button secondary compact" data-dismiss aria-label="'+esc(t('Close'))+'">×</button></header><form><label>'+t('Number of days')+'<input name="days" type="number" min="1" max="365" step="1" required value="'+esc(current.days??'')+'"></label>'+button(t('Save'))+'</form>';
  const year=Number(state.today.slice(0,4)),fields=document.createElement('div');fields.className='holiday-date-fields';
  fields.innerHTML='<label>'+t('Year')+'<select name="year">'+Array.from({length:5},(_,i)=>year-1+i).map(y=>'<option value="'+y+'"'+(y===year?' selected':'')+'>'+y+'</option>').join('')+'</select></label><label>'+t('Holiday start date')+'<input type="date" name="startOverride"></label><label class="role-member"><input type="checkbox" name="automatic">'+t('Use automatic date')+'</label><p class="hint">'+t('Automatic dates use the Umm al-Qura calendar. Manual changes take priority.')+'</p>';
  dialog.querySelector('form').prepend(fields);
  const form=dialog.querySelector('form');
  const updateDate=()=>{const y=Number(form.elements.year.value),manual=current.startOverrides?.[y];form.elements.automatic.checked=!manual;form.elements.startOverride.value=holidayOccurrences(state,id,y)[0]?.start??'';form.elements.startOverride.disabled=!manual;};
  form.elements.year.onchange=updateDate;form.elements.automatic.onchange=()=>{form.elements.startOverride.disabled=form.elements.automatic.checked;};
  form.elements.days.value=current.days??holidayDefaultDays[id];updateDate();
  document.body.append(dialog);
  dialog.querySelector('[data-dismiss]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.querySelector('form').onsubmit=event=>{
    event.preventDefault();event.stopPropagation();
    const form=event.currentTarget;if(!form.reportValidity())return;
    run(event.submitter,async()=>{await save('official-holidays',{id,days:Number(form.elements.days.value),enabled:current.enabled,year:Number(form.elements.year.value),startOverride:form.elements.automatic.checked?null:form.elements.startOverride.value});dialog.close();});
  };
  dialog.showModal();
}
document.addEventListener('click',event=>{
  const edit=event.target.closest('[data-holiday-edit]');
  if(edit){editOfficialHoliday(edit.dataset.holidayEdit);return;}
  const toggle=event.target.closest('[data-holiday-toggle]');
  if(toggle){const id=toggle.dataset.holidayToggle,current={...holidaySettings(state)[id],days:holidaySettings(state)[id].days??holidayDefaultDays[id]};
    if(!current.enabled&&current.days===null){editOfficialHoliday(id);return;}
    run(toggle,()=>save('official-holidays',{id,days:current.days,enabled:!current.enabled}));
  }
});
let editingLocationId, additionalLocationId;
let locationMap;
let punchMethodsTab = 'methods';
let editingBranch;
const hasLocationCoordinates = site => Number.isFinite(site.latitude) && Number.isFinite(site.longitude);

function punchMethods() {
  const methods = ['Based on company location', ...(state.staff.some(person => person.status !== 'Removed' &&
    allowsAnywhere(state, person)) ? ['From anywhere'] : [])];
  const tabs = '<div class="schedule-tabs" role="group" aria-label="' + esc(t('Punch methods')) + '">' +
    [['methods', 'Attendance recording methods'], ['locations', 'Attendance recording locations']].map(([tab, label]) =>
      '<button type="button" data-punch-methods-tab="' + tab + '" aria-pressed="' + (punchMethodsTab === tab) + '">' +
      esc(t(label)) + (tab === 'methods' ? ' <span class="badge">' + new Intl.NumberFormat(language).format(methods.length) + '</span>' : '') +
      '</button>').join('') + '</div>';
  return tabs + (punchMethodsTab === 'methods'
    ? card(t('Attendance recording methods'), methods.map(method => '<span class="badge">' + esc(t(method)) + '</span>').join(' ')) + companyBranches({ showAttendanceStatus: true })
    : punchLocations());
}

function editLocationButton(site, attribute) {
  return '<button type="button" class="button secondary" ' + attribute + '="' + esc(site.id) +
    '" aria-label="' + esc(t('Edit') + ' — ' + site.name) + '" title="' + esc(t('Edit')) + '">✎</button>';
}

function companyBranches({ showAttendanceStatus = false, manageAdministrators = false } = {}) {
  const editing = state.locations.find(site => site.id === editingBranch);
  const administrators=state.branchAdministratorChoices??(state.directManagerChoices??state.staff).filter(p=>p.status==='Active'&&isAdministrator(p,state));
  const canConfigureAdministrators=state.isCompanyOwner||state.canManageRolePermissions;
  const rows = state.locations.map(site => [
    '<strong>' + esc(site.name) + '</strong>',
    ...(manageAdministrators?[administrators.filter(p=>roleBranches(p).includes(site.id)).map(p=>esc(staffName(p))).join('، ')||'—']:[]),
    ...(showAttendanceStatus ? [hasLocationCoordinates(site) ? '<span class="badge green">' + esc(t('Geofence enabled')) +
      '</span>' : '<span class="badge">' + esc(t('Geofence not configured')) + '</span>'] : []),
    '<div class="actions">' + editLocationButton(site, 'data-edit-branch') +
      '<button type="button" class="button secondary" data-remove-location="' + esc(site.id) + '" title="' + esc(t('Delete branch')) +
      '" aria-label="' + esc(t('Delete branch') + ' — ' + site.name) + '">×</button></div>',
  ]);
  const configureAdministrators = manageAdministrators && editing && canConfigureAdministrators;
  const administratorPicker = configureAdministrators ? '<details class="branch-administrator-picker" open><summary>' +
    t('Administrators') + '</summary>' +
    (administrators.length > 8 ? '<label class="branch-administrator-search">' + t('Search by name') +
      '<input type="search" data-branch-administrator-search></label>' : '') +
    '<div class="branch-administrator-options">' + administrators.map(person =>
      '<label data-administrator-option><input type="checkbox" name="administratorIds" value="' + esc(person.id) +
      '"' + (roleBranches(person).includes(editing.id) ? ' checked' : '') + '><span>' +
      esc(staffName(person)) + '</span></label>').join('') + '</div></details>' : '';
  return '<section class="card"><header class="location-toolbar"><h2>' + t('Company branches') + '</h2>' +
    '<button type="button" id="add-branch" class="button primary" aria-expanded="' + (editingBranch === '') + '">' +
    '<span aria-hidden="true">+</span> ' + t('New branch') + '</button></header>' +
    table(['Branch', ...(manageAdministrators?['Administrators']:[]), ...(showAttendanceStatus ? ['Attendance method status'] : []), 'Action'].map(t), rows, t('No company branches yet.')) +
    (editingBranch !== undefined ? '<form id="branch-form"' +
      (configureAdministrators ? ' data-configure-administrators="true"' : '') + '><label>' + t('Branch name') +
      '<input name="name" required maxlength="120" value="' + esc(editing?.name ?? '') + '"></label>' +
      administratorPicker + '<div class="actions">' +
      button(t('Save branch')) + '<button type="button" id="close-branch" class="button secondary">' + t('Cancel') +
      '</button></div></form>' : '') + '</section>';
}

function punchLocations() {
  const branch = state.locations.find(site => site.id === editingLocationId);
  const adding = additionalLocationId === null && Boolean(branch);
  const editing = adding ? null : additionalLocationId ? branch?.additionalLocations?.find(site => site.id === additionalLocationId) : branch;
  const staff = state.staff.filter(person => person.status !== 'Removed');
  const row = (site, parent) => [
    '<strong>' + esc(site.name) + '</strong>' + (parent ? '<br><small>' + esc(parent.name) + '</small>' : ''),
    hasLocationCoordinates(site) ? '<bdi>' + esc(site.latitude + ', ' + site.longitude) + '</bdi>' : '—',
    esc(site.radius ?? '—'),
    parent ? '<button type="button" class="button secondary compact" data-edit-location="' + esc(parent.id) + '" data-additional-location="' + esc(site.id) + '" aria-label="' + esc(t('Edit') + ' — ' + site.name) + '">✎</button>' : editLocationButton(site, 'data-edit-location'),
  ];
  const rows = state.locations.flatMap(site => [row(site), ...(site.additionalLocations ?? []).map(extra => row(extra, site))]);
  const addLocation = state.locations.length
    ? '<form id="select-location-form"><label>' + t('Company branches') + '<select name="branchId" required>' +
      state.locations.map(site => '<option value="' + esc(site.id) + '">' + esc(site.name) + '</option>').join('') +
      '</select></label>' + button(t('Add location')) + '</form>'
    : '<button type="button" class="button primary" id="add-branch-from-locations">' +
      t('Add geographic location') + '</button>';
  const methods = [['company', 'Based on company location'], ['anywhere', 'From anywhere']];
  const cards = '<div class="attendance-method-cards">' + methods.map(([method, label]) => {
    const assigned = staff.filter(person => method === 'anywhere' ? allowsAnywhere(state, person) : allowsCompanyLocation(person)).length;
    return '<section class="card"><header class="location-toolbar"><h2>' + t(label) + '</h2>' +
      '<button type="button" class="button secondary compact" data-edit-attendance-method="' + method +
      '" aria-haspopup="dialog">' + t('Edit') + ' ✎</button></header><small>' + t('Assigned employees') + ' · ' +
      new Intl.NumberFormat(language).format(assigned) + '</small></section>';
  }).join('') + '</div>';
  return cards + attendanceMethodDialog(staff) + '<section class="card"><h2>' + t('Geographic locations') + '</h2>' +
    table([t('Location'), t('Coordinates'), t('Radius (metres)'), t('Action')], rows, t('No company branches yet.'), 'location-table') +
    ((editing || adding) ? '<form id="location-form"><h3>' + t(!adding && hasLocationCoordinates(editing) ? 'Edit geographic location' : 'Add geographic location') + '</h3>' +
      '<p class="hint">' + t('Select the workplace on the map and set the radius in metres.') + '</p>' +
      '<div id="location-map" dir="ltr" role="region" aria-label="' + t('Workplace map') + '"></div>' +
      '<p id="map-status" class="hint" role="status" hidden></p>' +
      '<p><strong>' + esc(branch.name) + '</strong></p>' + (adding || additionalLocationId ? '<label>' + t('Location') + '<input name="name" required maxlength="120" value="' + esc(editing?.name ?? '') + '"></label>' : '') + '<div class="fields">' +
      '<label>' + t('Radius (metres)') + '<input name="radius" type="number" required min="10" max="5000" value="' + esc(editing?.radius ?? 100) + '"></label>' +
      '<label>' + t('Latitude') + '<input name="latitude" type="number" required min="-90" max="90" step="any" value="' + esc(editing?.latitude ?? '') + '"></label>' +
      '<label>' + t('Longitude') + '<input name="longitude" type="number" required min="-180" max="180" step="any" value="' + esc(editing?.longitude ?? '') + '"></label></div>' +
      '<div class="actions"><button type="button" id="use-location" class="button secondary">' + t('Use my current location') +
      '</button>' + button(t(adding ? 'Add location' : 'Save location')) + '<button type="button" id="close-location" class="button secondary">' + t('Cancel') + '</button>' +
      '</div></form>' : addLocation) + '</section>';
}

let attendanceMethod;
let attendanceBranch;
function attendanceMethodDialog(staff) {
  if (!attendanceMethod) return '';
  const company = attendanceMethod === 'company';
  const groups = state.locations.flatMap(branch => company
    ? [branch, ...(branch.additionalLocations ?? [])].filter(hasLocationCoordinates).map(site => ({id:site.id,name:site.name,branch,site}))
    : [{id:branch.id,name:branch.name,branch}]);
  groups.push({id:'',name:t('Unassigned')});
  const selected = groups.find(group => group.id === attendanceBranch);
  const assigned = (group, person) => company
    ? allowsCompanyLocation(person) && (!group.site || assignedToPunchLocation(group.branch, group.site, person))
    : allowsAnywhere(state, person);
  const members = !selected ? [] : selected.site ? staff :
    staff.filter(person => (person.branchId ?? '') === (selected.branch?.id ?? ''));
  return '<dialog id="attendance-method-dialog" class="catalog-dialog" aria-labelledby="attendance-method-title"><header><h2 id="attendance-method-title">' +
    t(company ? 'Based on company location' : 'From anywhere') +
    '</h2><button type="button" id="close-attendance-method" class="button secondary" aria-label="' + t('Close') +
    '">×</button></header><div class="attendance-method-picker"><div class="attendance-method-branches" role="group" aria-label="' +
    t(company ? 'Geographic locations' : 'Company branches') + '">' +
    groups.map(group => '<button type="button" class="button secondary" data-attendance-branch="' + esc(group.id) +
      '" aria-pressed="' + (group === selected) + '"><span>' + esc(group.name) + '</span>' +
      (group.site ? '<small>' + new Intl.NumberFormat(language).format(staff.filter(person => assigned(group, person)).length) + '</small>' : '') + '</button>').join('') +
    '</div>' + (!selected ? '<p class="hint">' + (language === 'ar' ? 'اختر موقعًا لعرض الموظفين وتعيينهم.' : 'Choose a location to assign employees.') + '</p>' :
      '<h3>' + esc(selected.name) + '</h3><div class="attendance-method-members">' + members.map(person => {
        const siteAttributes = selected.site ? ' data-location-branch="' + esc(selected.branch.id) +
          '" data-location-id="' + esc(selected.site.id) + '"' : '';
        return '<div><label class="attendance-method-member"><span><strong>' + esc(staffName(person)) +
          '</strong><small>' + esc(t(person.jobTitle ?? 'Unassigned')) + '</small></span>' +
          '<input type="checkbox" data-attendance-staff="' + esc(person.id) + '"' + siteAttributes +
          (assigned(selected, person) ? ' checked' : '') + '></label></div>';
      }).join('') + (!members.length ? '<p class="hint">' + t('No staff members yet.') + '</p>' : '') + '</div>') + '</div></dialog>';
}

function refreshAttendanceMethodPicker() {
  const template = document.createElement('template');
  template.innerHTML = attendanceMethodDialog(state.staff.filter(person => person.status !== 'Removed'));
  $('#attendance-method-dialog .attendance-method-picker').replaceWith(template.content.querySelector('.attendance-method-picker'));
}

function mountLocationMap(form) {
  const L = window.L;
  const status = $('#map-status');
  function mapError() {
    status.textContent = t('Map unavailable. Enter coordinates or use your current location.');
    status.hidden = false;
  }
  if (!L) { mapError(); return; }
  const configured = state.locations.filter(hasLocationCoordinates);
  const recent = configured.find(site => site.id === editingLocationId) ?? configured.at(-1);
  const centre = recent ? [recent.latitude, recent.longitude] : [24.7136, 46.6753];
  const map = L.map($('#location-map'), { zoomControl: false }).setView(centre, recent ? 16 : 12);
  locationMap = map;
  L.control.zoom({ zoomInTitle: t('Zoom in'), zoomOutTitle: t('Zoom out') }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    referrerPolicy: 'strict-origin-when-cross-origin',
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).on('tileerror', mapError).on('tileload', () => { status.hidden = true; }).addTo(map);
  let pin, circle;
  const fields = form.elements;
  function draw(recenter = false) {
    const point = [fields.latitude.valueAsNumber, fields.longitude.valueAsNumber];
    const radius = fields.radius.valueAsNumber;
    if (!point.every(Number.isFinite) || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180 ||
        !Number.isInteger(radius) || radius < 10 || radius > 5000) {
      if (pin) { pin.remove(); circle.remove(); pin = circle = null; }
      return;
    }
    if (!pin) {
      pin = L.circleMarker(point, { radius: 6, color: '#fff', fillColor: '#bd342b', fillOpacity: 1, interactive: false }).addTo(map);
      circle = L.circle(point, { radius, color: '#195342', fillOpacity: 0.18, interactive: false }).addTo(map);
    }
    pin.setLatLng(point).bringToFront();
    circle.setLatLng(point).setRadius(radius);
    if (recenter || !map.getBounds().contains(point)) map.setView(point, Math.max(map.getZoom(), 16));
  }
  map.on('click', ({ latlng }) => {
    const point = latlng.wrap();
    fields.latitude.value = point.lat.toFixed(7);
    fields.longitude.value = point.lng.toFixed(7);
    draw();
  });
  form.addEventListener('input', () => draw());
  form.addEventListener('location-update', () => draw(true));
  draw();
}

function mobile() {
  const last = state.punches.findLast((entry) => entry.staffId === 'demo');
  const next = last?.kind === 'in' ? 'out' : 'in';
  return title(t('Staff view'), t('Sara Ahmed · Demo employee')) +
    '<section class="hero punch"><div><p class="eyebrow">' + esc(last?.site || t('Approved workplaces')) + '</p><h2>' +
    (last?.kind === 'in' ? t('You’re punched in') : t('Ready to punch in')) + '</h2><p>' +
    (last ? t('Last punch: ') + time(last.time) : t('Your location is checked when you punch.')) +
    '</p></div><button class="button primary" id="punch" data-kind="' + next + '">' + t(next === 'in' ? 'Punch in' : 'Punch out') + '</button></section>' +
    card(t('New request'), '<form id="request-form"><div class="fields"><label>' + t('Request type') + '<select name="type">' +
      [...state.leaveTypes.filter(type => state.leaveSettings[type].active), 'Missed punch', 'Attendance excuse'].map(type => '<option value="' + esc(type) + '">' + esc(t(type)) + '</option>').join('') + '</select></label>' +
      '<label>' + t('Start date') + '<input name="date" type="date" required value="' + esc(state.today) + '"></label><label id="end-date">' + t('End date') + '<input name="end" type="date" required value="' + esc(state.today) + '"></label></div>' +
      '<label>' + t('Reason') + '<textarea name="note" maxlength="1000" required></textarea></label>' + button(t('Submit request')) + '</form>') +
    card(t('My requests'), requestTable(state.requests.filter((item) => item.staffId === 'demo')));
}

const reportSections = {
  'reports/catalog': ['Report catalog', '▥'],
  'reports/issued': ['Issued report history', '▤'],
};
const reportTypes = {
  'reports/absence': ['Absence report', '⊘', 'Absence rates and total workdays'],
  'reports/attendance': ['Attendance and clock-out report', '◷', 'Attendance hours, lateness, and absence'],
  'reports/attendance-follow-up': ['Attendance follow-up report', '☷', 'Attendance and absence days'],
  'reports/attendance-records': ['Attendance and absence records', '▤', 'Punch records'],
};
function reportLinks(sections) {
  return '<div class="settings-grid">' + Object.entries(sections).map(([path, [label, icon, description]]) =>
      '<a class="settings-tile" href="#' + path + '"><span class="settings-icon" aria-hidden="true">' +
      icon + '</span><span><strong>' + t(label) + '</strong>' +
      (description ? '<small class="hint">' + t(description) + '</small>' : '') +
      '</span></a>').join('') + '</div>';
}
function reports() {
  return '<h1>' + t('Reports') + '</h1>' + reportLinks(reportSections);
}
function reportExportToolbar(periodButtonId, start, end) {
  const periodButton = periodButtonId ? '<button type="button" class="button secondary compact" aria-label="' + t('Change reporting period') + '" id="' + periodButtonId +
    '"><span aria-hidden="true">▦</span> ' + '<bdi>' + esc([start,end].map(day=>day?.split('-').reverse().join('/')).join(' – ')) + '</bdi></button>' : '';
  return '<div class="actions report-export-toolbar">' + '<div class="report-toolbar-field"><span>' + t('Reporting period') + '</span>' + periodButton + '</div>' + '<details class="report-export"><summary class="button compact"><span aria-hidden="true">⤓</span> ' +
    t('Export') + '</summary><div class="report-export-options" role="group" aria-label="' + t('File format') + '">' +
    '<button type="button" data-report-format="xlsx"><strong>Excel</strong><bdi>.xlsx</bdi></button>' +
    '<button type="button" data-report-format="pdf"><strong>PDF</strong><bdi>.pdf</bdi></button></div></details></div>';
}
function mountReportPeople(result, onChange) {
  const filters = document.createElement('div');
  filters.className = 'actions report-people-toolbar';
  filters.innerHTML = '<label class="report-toolbar-field"><span>' + t('Branch') + '</span>' + branchFilter('report-branch', '', 1) + '</label>' +
    '<div class="report-toolbar-field"><span>' + L('الموظفون','Employees') + '</span><details class="report-employee-picker"><summary>' + t('Everyone') +
    '</summary><div class="report-employee-options"></div></details></div>'
  result.before(filters);
  const branch = filters.querySelector('select');
  if (!branch) filters.querySelector('label')?.remove();
  const options = filters.querySelector('.report-employee-options');
  const summary = filters.querySelector('summary');
  const people = state.staff.filter(person => person.status !== 'Removed');
  const selectedIds = () => new Set([...options.querySelectorAll('[name="report-staff"]:checked')].map(input => input.value));
  function update() {
    const count = selectedIds().size;
    const everyone = options.querySelector('[name="report-everyone"]');
    const total = options.querySelectorAll('[name="report-staff"]').length;
    everyone.checked = count > 0 && count === total;
    everyone.indeterminate = count > 0 && count < total;
    summary.textContent = everyone.checked ? t('Everyone') : t('{count} employees selected').replace('{count}', new Intl.NumberFormat(language).format(count));
  }
  function populate() {
    const visible = people.filter(person => !branch?.value || person.branchId === branch.value);
    options.innerHTML = '<label class="role-member"><input type="checkbox" name="report-everyone"' +
      (visible.length ? ' checked' : ' disabled') + '>' + t('Everyone') + '</label>' +
      visible.map(person => '<label class="role-member"><input type="checkbox" name="report-staff" checked value="' +
        esc(person.id) + '">' + esc(staffName(person)) + '</label>').join('');
    update();
  }
  if (branch) branch.onchange = () => { populate(); onChange(); };
  options.onchange = event => {
    if (event.target.name === 'report-everyone') {
      for (const employee of options.querySelectorAll('[name="report-staff"]')) employee.checked = event.target.checked;
    }
    update();
    onChange();
  };
  populate();
  return selectedIds;
}
function attendanceFollowUp() {
  const start = state.today.slice(0, 7) + '-01';
  const monthEnd = new Date(start + 'T00:00:00Z');
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const end = monthEnd.toISOString().slice(0, 10);
  return '<div id="attendance-follow-up"></div>' +
    '<dialog id="follow-up-period-dialog" class="catalog-dialog" aria-labelledby="follow-up-period-title">' +
    '<header><h2 id="follow-up-period-title">' + t('Change reporting period') + '</h2></header>' +
    '<form><div class="fields"><label>' + t('Start date') + '<input type="date" name="start" required value="' + start +
    '"></label><label>' + t('End date') + '<input type="date" name="end" required value="' + end + '"></label></div>' +
    '<div class="actions">' + button(t('Apply')) + '<button type="button" class="button secondary" data-cancel-period>' +
    t('Cancel') + '</button></div></form></dialog>';
}
function mountAttendanceFollowUp(panel, records = false) {
  const dialog = $('#follow-up-period-dialog');
  const form = dialog.querySelector('form');
  const { start, end } = form.elements;
  const selectedIds = mountReportPeople(panel, showReport);
  function showReport() {
    const staffIds = selectedIds();
    const filterControls = panel.querySelector('.report-people-toolbar');
    if (filterControls) panel.before(filterControls);
    panel.innerHTML = reportExportToolbar('open-follow-up-period',start.value,end.value) +
      (records ? attendanceRecordsReport(staffIds, start.value, end.value) :
        attendanceReportSummary(staffIds, Date.parse(start.value), Date.parse(end.value), true));
    $('#open-follow-up-period').onclick = () => dialog.showModal();
    mountReportExport(panel, records ? 'attendance-records' : 'attendance-follow-up', start.value, end.value);
  }
  bindReportPeriodCancel(dialog, [start, end], '[data-cancel-period]');
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopPropagation();
    if (!validateReportPeriod(form, start, end)) return;
    dialog.close();
    showReport();
    $('#open-follow-up-period').focus();
  });
  showReport();
}
function validateReportPeriod(form, start, end) {
  const days = (Date.parse(end.value) - Date.parse(start.value)) / 86400000;
  end.setCustomValidity(days < 0 || days >= 366 ? t('Choose an ordered date range of up to 366 days.') : '');
  return form.reportValidity();
}
function bindReportPeriodCancel(dialog, inputs, selector, afterCancel) {
  const form = dialog.querySelector('form');
  const { start, end } = form.elements;
  let applied = inputs.map(input => input.type === 'checkbox' ? input.checked : input.value);
  dialog.addEventListener('close', () => {
    applied = inputs.map(input => input.type === 'checkbox' ? input.checked : input.value);
  });
  function cancel() {
    inputs.forEach((input, index) => {
      if (input.type === 'checkbox') input.checked = applied[index];
      else input.value = applied[index];
    });
    end.setCustomValidity('');
    afterCancel?.();
    dialog.close();
  }
  for (const control of dialog.querySelectorAll(selector)) control.onclick = cancel;
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  for (const input of [start, end]) input.oninput = () => end.setCustomValidity('');
}
function mountReportExport(panel, type, start, end) {
  const toolbar = panel.querySelector('.report-export-toolbar');
  const people = panel.previousElementSibling;
  if (people?.classList.contains('report-people-toolbar')) toolbar.prepend(people);
  panel.querySelector('.ux-report-context')?.remove();
  const context=document.createElement('div');context.className='ux-report-context';
  context.textContent=t('Reporting period')+': '+start+' — '+end+' · '+panel.querySelectorAll('tbody tr').length+' '+t(type==='attendance-records'?'Records':'Staff');toolbar.after(context);

  const menu = panel.querySelector('.report-export');
  const options = [...panel.querySelectorAll('[data-report-format]')];
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !menu.open) return;
    event.preventDefault();
    menu.open = false;
    menu.querySelector('summary').focus();
  });
  menu.addEventListener('focusout', event => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  });
  for (const option of options) {
    option.disabled = !panel.querySelector('tbody tr');
    option.onclick = () => {
      const rows = [...panel.querySelectorAll('thead tr:last-child, tbody tr')].map(row =>
        [...row.cells].filter(cell=>!cell.hidden).map(cell => cell.textContent.trim()));
      const body = { type, start, end, language, format: option.dataset.reportFormat, rows };
      menu.open = false;
      menu.querySelector('summary').focus();
      for (const button of options) button.disabled = true;
      run(option, async () => {
        const result = await save('issued-reports', body);
        const issued = result.issuedReports[0];
        downloadReport({ ...body, title: issued.title });
        location.hash = 'reports/issued';
      }, 'Report added to issued history.').finally(() => {
        for (const button of options) button.disabled = false;
      });
    };
  }
}
document.addEventListener('click', event => {
  const menu = $('.report-export[open]');
  if (menu && !menu.contains(event.target)) menu.open = false;
});
function issuedReports() {
  const issuedAt = dateFormatter(language, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh', calendar: 'gregory' });
  const rows = (state.issuedReports ?? []).map(report => [esc(report.title),
    esc(dateText(report.start) + ' – ' + dateText(report.end)), esc(issuedAt.format(Date.parse(report.createdAt))),
    report.format === 'csv' ? 'CSV' : report.format === 'xlsx' ? 'Excel' : 'PDF',
    '<button type="button" class="button secondary compact" data-download-report="' + esc(report.id) + '">' + t('Download') + '</button>']);
  return table(['Reports', 'Reporting period', 'Issued at', 'File format', 'Actions'].map(t), rows, t('No issued reports yet.'));
}
function mountIssuedReports() {
  for (const button of document.querySelectorAll('[data-download-report]')) {
    button.onclick = () => run(button, async () => {
      const response = await fetch(companyPrefix + '/api/issued-reports?id=' + encodeURIComponent(button.dataset.downloadReport));
      if (!response.ok) throw new Error('Report not found.');
      downloadReport(await response.json());
    });
  }
}
function attendanceReportDialog() {
  const first = state.today.slice(0, 7) + '-01';
  const monthEnd = new Date(first + 'T00:00:00Z');
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const last = monthEnd.toISOString().slice(0, 10);
  return '<dialog id="attendance-report-dialog" class="catalog-dialog" aria-labelledby="attendance-report-title">' +
    '<header><h2 id="attendance-report-title">' + t('Create attendance report') + '</h2>' +
    '<button type="button" class="button secondary compact" data-close-attendance-report aria-label="' + t('Close') + '">×</button></header>' +
    '<form id="attendance-report-form"><fieldset><legend>' + t('Reporting period') + '</legend><div class="fields">' +
    '<label>' + t('Start date') + '<input type="date" name="start" required value="' + esc(first) + '"></label>' +
    '<label>' + t('End date') + '<input type="date" name="end" required value="' + esc(last) + '"></label></div></fieldset>' +
    '<div class="actions"><button class="button primary" type="submit">' + t('Apply') +
    '</button><button type="button" class="button secondary" data-close-attendance-report>' + t('Cancel') +
    '</button></div></form></dialog>';
}

function attendanceRecordsReport(staffIds, start, end) {
  const staff = new Map(state.staff.filter(person => staffIds.has(person.id)).map(person => [person.id, person]));
  const dayLabel = dateFormatter(language, {weekday:'long', day:'2-digit', month:'2-digit', year:'numeric',
    calendar:'gregory', timeZone:'UTC'});
  const rows = [];
  for (const entry of state.punches) {
    const person = staff.get(entry.staffId);
    if (!person || entry.date < start || entry.date > end || !Number.isFinite(Date.parse(entry.time))) continue;
    const imported = /import|jisr/i.test([entry.source, entry.device, entry.importBatch].filter(Boolean).join(' '));
    const method = entry.correctionRequestId ? t('Punch correction record') :
      imported ? t('Imported record') : entry.site ? t('Geofenced punch') :
        entry.source || (entry.deviceDetails || entry.device && entry.device !== 'Unknown device' ? t('Electronic punch') : '—');
    const device = [...new Set([entry.deviceDetails?.model, entry.deviceDetails?.os, imported ? null : entry.device]
      .filter(value => value && value !== 'Unknown device'))];
    rows.push({day:entry.date, timestamp:Date.parse(entry.time), cells:[staffName(person),
      dayLabel.format(new Date(entry.date)), time(entry.time), method, entry.site || '—',
      [t(entry.kind === 'in' ? 'Check in' : 'Check out'), ...device].join(' · ')]});
  }
  attendanceReportSummary(staffIds, Date.parse(start), Date.parse(end), false, (person, day) => {
    rows.push({day, timestamp:0, cells:[staffName(person), dayLabel.format(new Date(day)), '—', '—', '—', t('Absence')]});
  });
  rows.sort((a,b)=>b.day.localeCompare(a.day) || b.timestamp-a.timestamp);
  return table(['Staff member','Punch day and date','Punch time','Recording method','Record location','Additional information'].map(t),
    rows.map(row=>row.cells.map(esc)), t('No attendance records in this period.'), 'attendance-records-table',
    [['Basic details', 1], ['Report columns', 5]]);
}
function attendanceReportSummary(staffIds, first, last, followUp = false, onAbsence) {
  const dayMs = 86400000, minuteMs = 60000;
  const periods = new Map(state.workPeriods.map(period => [period.id, period]));
  const days = [];
  const end = followUp ? last : Math.min(last, Date.parse(state.today));
  for (let time = first; time <= end; time += dayMs) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  const now = Date.now();
  const dateLabel = dateFormatter(language, { dateStyle: 'full', calendar: 'gregory', timeZone: 'UTC' });
  const hours = milliseconds => {
    const minutes = Math.floor(milliseconds / minuteMs);
    return '<bdi>' + Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + '</bdi>';
  };
  const rows = state.staff.filter(person => staffIds.has(person.id)).map(person => {
    const punches = state.punches.filter(entry => entry.staffId === person.id)
      .map(entry => ({ ...entry, timestamp: Date.parse(entry.time) })).sort((a, b) => a.timestamp - b.timestamp);
    const requests = state.requests.filter(item => item.staffId === person.id && item.status === 'Approved');
    const leaves = approvedAttendanceLeaves(state,person);
    const pairs = [];
    let arrival;
    for (const punch of punches) {
      if (punch.kind === 'in') arrival = punch;
      else if (punch.kind === 'out' && arrival) {
        if (punch.timestamp - arrival.timestamp <= dayMs &&
          (arrival.shiftStart == null || punch.shiftStart == null || arrival.shiftStart === punch.shiftStart)) {
          pairs.push([arrival, punch]);
        }
        arrival = undefined;
      }
    }
    let total = 0, late = 0, excusedLate = 0, early = 0, excusedEarly = 0;
    let absent = 0, missing = 0, onLeave = 0, workedDays = 0;
    const dailyStatuses = [];
    for (const day of days) {
      if (followUp && day > state.today) {
        const leave = leaves.some(item => item.date <= day && (item.end ?? item.date) >= day);
        const upcoming = (!person.joinDate || day >= person.joinDate) && effectivePeriodIds(state, person, day).length;
        dailyStatuses.push(leave ? 'On leave' : upcoming ? 'Upcoming' :
          isScheduleRestDay(state, person, day) ? 'Rest day' : 'Not scheduled');
        continue;
      }
      if (person.joinDate && day < person.joinDate) {
        if (followUp) dailyStatuses.push('Not scheduled');
        continue;
      }
      const midnight = Date.parse(day + 'T00:00:00+03:00');
      const scheduled = effectivePeriodIds(state, person, day).map(id => periodOnDay(periods.get(id),day)).filter(Boolean).map(period => {
        const flexible = isFlexiblePeriod(period);
        const { start, end } = periodBounds(period, day);
        return { period, flexible, start, end };
      });
      const leave = leaves.some(item => item.date <= day && (item.end ?? item.date) >= day);
      if (leave) onLeave++;
      const starts = new Set(scheduled.map(shift => shift.start));
      const daily = punches.filter(entry => entry.shiftStart == null ? entry.date === day : starts.has(entry.shiftStart));
      const dayPairs = pairs.filter(([entry]) => entry.shiftStart == null ? entry.date === day : starts.has(entry.shiftStart));
      for (const [entry, exit] of dayPairs) {
        total += Math.max(0, Math.min(exit.timestamp, entry.shiftEnd ?? Infinity) - entry.timestamp);
      }
      if (leave) {
        if (followUp) dailyStatuses.push('On leave');
        continue;
      }
      let missedArrivals = 0, missedPunches = 0, completeShifts = 0, shortFlexible = false;
      for (const { period, flexible, start, end } of scheduled) {
        const records = daily.filter(entry => entry.shiftStart === start || (entry.shiftStart == null &&
          (scheduled.length === 1 || (entry.kind === 'in' ?
            entry.timestamp >= start - (period.arrival?.before ?? 60) * minuteMs && entry.timestamp <= start + (period.arrival?.after ?? 60) * minuteMs :
            entry.timestamp >= end - (period.departure?.before ?? 60) * minuteMs && entry.timestamp <= end + (period.departure?.after ?? 60) * minuteMs))));
        const clockIn = records.find(entry => entry.kind === 'in');
        const clockOut = records.findLast(entry => entry.kind === 'out');
        if (!clockIn && now > (flexible ? end - 1 : start + (period.arrival?.after ?? 60) * minuteMs)) { missedPunches++; missedArrivals++; }
        if ((!clockOut || records.at(-1)?.kind === 'in') && now > (flexible ? end - 1 : end + (period.departure?.after ?? 60) * minuteMs)) missedPunches++;
        const closed = clockIn && clockOut && clockOut.timestamp >= clockIn.timestamp && records.at(-1)?.kind === 'out';
        const workedMilliseconds = dayPairs.filter(([entry]) => records.includes(entry)).reduce((total, [entry, exit]) =>
          total + Math.max(0, Math.min(exit.timestamp, end, entry.shiftEnd ?? Infinity) - Math.max(entry.timestamp, start)), 0);
        const enough = !flexible || !period.duration || workedMilliseconds >= period.duration * minuteMs;
        if (closed && enough) completeShifts++;
        if (flexible && closed && !enough && now > end) shortFlexible = true;
        if (flexible) continue;
        const lateBy = clockIn ? Math.max(0, clockIn.timestamp - start) : 0;
        const earlyBy = clockOut ? Math.max(0, end - clockOut.timestamp) : 0;
        const excuse = type => requests.some(item => item.type === 'Attendance excuse' && item.date === day && item.excuseType === type);
        if (excuse('Late arrival')) excusedLate += lateBy; else late += lateBy;
        if (excuse('Early departure')) excusedEarly += earlyBy; else early += earlyBy;
      }
      const unmatched = daily.length > dayPairs.length * 2;
      if (missedPunches || (day < state.today && unmatched && !scheduled.length)) missing++;
      const worked = dayPairs.some(([entry, exit]) => exit.timestamp > entry.timestamp);
      if (worked && !unmatched && completeShifts === scheduled.length) workedDays++;
      const isAbsent = scheduled.length > 0 && missedArrivals === scheduled.length && !daily.length;
      if (isAbsent) {
        absent++;
        onAbsence?.(person, day);
      }
      if (followUp) {
        const workday = !isScheduleRestDay(state, person, day);
        const started = scheduled.some(shift => now >= shift.start) || daily.length > 0;
        dailyStatuses.push(isAbsent ? 'Absence' : missedPunches ? 'Incomplete record' : shortFlexible ? 'Hours shortfall' :
          scheduled.length ? (completeShifts === scheduled.length && !unmatched ? 'Present' :
            day === state.today && started ? 'In progress' : 'Scheduled') :
          unmatched ? (day === state.today ? 'In progress' : 'Incomplete record') :
            worked ? 'Present' : workday ? 'Not scheduled' : 'Rest day');
      }
    }
    if (followUp) return [esc(person.employeeNumber ?? '—'), esc(staffName(person)),
      ...dailyStatuses.map(status => '<span class="' + (['Absence', 'Incomplete record', 'Hours shortfall'].includes(status) ? 'attendance-follow-up-issue' : '') + '">' + t(status) + '</span>')];
    return [esc(person.employeeNumber ?? '—'), esc(staffName(person)), hours(total),
      hours(late), hours(excusedLate), hours(early), hours(excusedEarly), absent, missing, onLeave, workedDays];
  });
  if (followUp) return table([t('Employee number'), t('Staff member'), ...days.map(day => esc(dateLabel.format(Date.parse(day))))],
    days.length ? rows : [], t('No attendance records in this period.'), 'attendance-follow-up-table',
    [['Basic details', 2], ['Daily attendance', days.length]]);
  return table(['Employee number', 'Staff member', 'Total work hours', 'Unexcused late arrival',
    'Excused late arrival', 'Unexcused early departure', 'Excused early departure',
    'Absent days', 'Days with missing punches', 'Approved leave days', 'Days worked'].map(t),
  days.length ? rows : [], t('No attendance records in this period.'), 'attendance-summary-table',
  [['Basic details', 2], ['Attendance summary columns', 9]]);
}

function mountAttendanceReport(dialog) {
  const form = dialog.querySelector('form');
  const { start, end } = form.elements;
  const result = $('#attendance-report-result');
  const selectedIds = mountReportPeople(result, showReport);
  function showReport() {
    const staffIds = selectedIds();
    const filterControls = result.querySelector('.report-people-toolbar');
    if (filterControls) result.before(filterControls);
    result.innerHTML = reportExportToolbar('open-attendance-report',start.value,end.value) +
      attendanceReportSummary(staffIds, Date.parse(start.value), Date.parse(end.value));
    $('#open-attendance-report').onclick = () => dialog.showModal();
    mountReportExport(result, 'attendance-summary', start.value, end.value);
  }
  bindReportPeriodCancel(dialog, [start, end], '[data-close-attendance-report]');
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopPropagation();
    if (!validateReportPeriod(form, start, end)) return;
    dialog.close();
    showReport();
    $('#open-attendance-report').focus();
  });
  showReport();
}

function absenceReportDialog() {
  return '<dialog id="absence-report-dialog" class="catalog-dialog report-dialog" aria-labelledby="absence-report-title">' +
    '<header><h2 id="absence-report-title">' + t('Absence report') + '</h2>' +
    '<button type="button" class="button secondary compact" data-close-absence-report aria-label="' + t('Close') + '">×</button></header>' +
    '<form id="absence-report-form"><fieldset><legend>' + t('Reporting period') + '</legend><div class="fields">' +
    '<label>' + t('Start date') + '<input type="date" name="start" required max="' + esc(state.today) +
    '" value="' + esc(state.today.slice(0, 7) + '-01') + '"></label>' +
    '<label>' + t('End date') + '<input type="date" name="end" required max="' + esc(state.today) +
    '" value="' + esc(state.today) + '"></label></div></fieldset>' +
    '<div class="actions"><button class="button primary" type="submit">' + t('Apply') +
    '</button><button type="button" class="button secondary" data-close-absence-report>' + t('Cancel') +
    '</button></div></form></dialog>';
}

function mountAbsenceReport(dialog) {
  const form = dialog.querySelector('form');
  const { start, end } = form.elements;
  const result = $('#absence-report-result');
  const selectedIds = mountReportPeople(result, showReport);
  bindReportPeriodCancel(dialog, [start, end], '[data-close-absence-report]');
  form.addEventListener('submit', event => {
    event.preventDefault();
    event.stopPropagation();
    if (!validateReportPeriod(form, start, end)) return;
    dialog.close();
    showReport();
    $('#open-absence-report').focus();
  });
  function showReport() {
    const dayMilliseconds = 86400000;
    const first = Date.parse(start.value);
    const last = Date.parse(end.value);
    const staffIds = selectedIds();
    const people = state.staff.filter(person => staffIds.has(person.id));
    const periods = new Map(state.workPeriods.map(period => [period.id, period]));
    const now = Date.now();
    const number = new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dateLabel = dateFormatter(language, { dateStyle: 'medium', calendar: 'gregory', timeZone: 'UTC' });
    const summaries = people.map(person => {
      const arrivals = state.punches.filter(entry => entry.staffId === person.id && entry.kind === 'in');
      const leaves = approvedAttendanceLeaves(state,person);
      let absent = 0, leave = 0, working = 0, latest;
      for (let time = first; time <= last; time += dayMilliseconds) {
        const day = new Date(time).toISOString().slice(0, 10);
        const scheduled = effectivePeriodIds(state, person, day).map(id => periodOnDay(periods.get(id),day)).filter(Boolean);
        if (!scheduled.length) continue;
        working++;
        if (leaves.some(item => item.date <= day && (item.end ?? item.date) >= day)) {
          leave++;
          continue;
        }
        const midnight = Date.parse(day + 'T00:00:00+03:00');
        const starts = new Set(scheduled.map(period => periodBounds(period, day).start));
        if (arrivals.some(entry => entry.shiftStart == null ? entry.date === day : starts.has(entry.shiftStart))) continue;
        const lastArrival = Math.max(...scheduled.map(period => isFlexiblePeriod(period) ? periodBounds(period, day).end - 1 :
          Date.parse(day + 'T' + period.start + ':00+03:00') + (period.arrival?.after ?? 60) * 60000));
        if (now <= lastArrival) continue;
        absent++;
        latest = time;
      }
      return { person, absent, leave, working, latest };
    });
    const rows = summaries.sort((a, b) => b.absent - a.absent).map(({ person, absent, leave, working, latest }) => {
      const manager = [...state.staff,...(state.directManagerChoices??[])].find(item => item.id === person.managerId);
      return [esc(person.employeeNumber ?? '—'), esc(staffName(person)), esc(person.department ?? '—'),
        esc(manager ? staffName(manager) : '—'), absent, leave,
        working ? '<bdi>' + number.format(absent / working * 100) + '</bdi>' : '—',
        working, latest === undefined ? '—' : esc(dateLabel.format(latest))];
    });
    const filterControls = result.querySelector('.report-people-toolbar');
    if (filterControls) result.before(filterControls);
    result.innerHTML = reportExportToolbar('open-absence-report',start.value,end.value) + table(['Employee number', 'Staff member', 'Department', 'Direct manager', 'Absent days',
      'Approved leave days', 'Absence rate (%)', 'Total working days', 'Last absence date'].map(t), rows,
    t('No staff members yet.'), 'absence-summary-table', [['Basic details', 2], ['Employment information', 2], ['Report columns', 5]]);
    mountReportExport(result, 'attendance-performance', start.value, end.value);
    $('#open-absence-report').onclick = () => dialog.showModal();
  }
  showReport();
}
const documentDaysRemaining = document => (Date.parse(document.expiresOn) - Date.parse(state.today)) / 86400000;
const expiredDocumentCount = () => (state.documents ?? []).filter(document => documentDaysRemaining(document) < 0).length;
const openDocumentBranches = new Set();
function documentBranchField(selected = '', upload = false) {
  const branches = new Map(state.locations.map(branch => [branch.id,branch.name]));
  if (selected && !branches.has(selected)) branches.set(selected,t('Unavailable branch'));
  return '<label>' + t('Branch') + '<select name="branchId"' + (upload ? ' required' : '') + '><option value="">' +
    (upload ? (language === 'ar' ? 'اختر الفرع' : 'Select a branch') : t('Company-wide or unassigned')) +
    '</option>' + [...branches].map(([id,name])=>'<option value="' + esc(id) + '"' +
    (id === selected ? ' selected' : '') + '>' + esc(name) + '</option>').join('') + '</select></label>';
}
let documentWalletStatus = 'all';
function documents() {
  if(!state.isCompanyOwner&&companyPrefix&&!permissionsFor(state,state.staff.find(p=>p.id===accountIdentity?.id)?.role).documents)return '<h1>'+t('Documents')+'</h1><section class="card"><p>'+(language==='ar'?'ليست لديك صلاحية محفظة المستندات. يمكن لمسؤول الحساب منحها من صلاحيات الدور.':'You do not have document wallet permission. The account owner can grant it through role permissions.')+'</p></section>';
  const walletUrl = companyPrefix && new URL(companyPrefix + '/access?view=documents', location.origin).href;
  const arabic = language === 'ar';
  const expiryStatus = document => documentExpiryStatus(document.expiresOn,state.today,documentReminderDays(state.notificationSettings));
  const documentRow = document => {
    const [alert,tone] = {undated:['Expiry date not set',''],expired:['Document expired','red'],
      urgent:['Document expires very soon','red'],soon:['Document expires soon','amber'],valid:['Document valid','green']}[expiryStatus(document)];
    const confirmation = !document.expiresOn && !document.expiryConfirmedAt && Boolean(document.suggestedExpiresOn);
    return ['<a href="' + companyPrefix + '/api/documents?id=' + esc(encodeURIComponent(document.id)) + '">' + esc(document.name) + '</a>',
      confirmation ? '<form class="document-expiry-form" data-document-id="' + esc(document.id) + '"><input name="expiresOn" type="date" required aria-label="' +
      t('Document expiry date') + '" value="' + esc(document.suggestedExpiresOn) + '"><button type="submit" class="button secondary compact">' +
      (arabic?'تأكيد التاريخ':'Confirm date') + '</button>' + (document.suggestedHijri?'<small class="hint">'+(arabic?'المقروء بالهجري: ':'Read Hijri date: ')+esc(document.suggestedHijri)+(arabic?' هـ · أم القرى، راجع قبل التأكيد':' AH · Umm al-Qura, review before confirming')+'</small>':'') + '</form>' :
      '<bdi>' + esc(dateText(document.expiresOn) || '—') + '</bdi>',
      '<span class="badge ' + tone + '">' +
      (!document.expiresOn && document.expiryConfirmedAt ? (arabic ? 'لا يوجد تاريخ انتهاء' : 'No expiry date') : t(alert)) + '</span>',
      '<div class="document-actions"><button type="button" class="button secondary compact" data-rename-document="' + esc(document.id) +
      '" aria-haspopup="dialog" title="' + t('Edit document') + '" aria-label="' + t('Edit document') + '">' + icon('edit') +
      '</button><button type="button" class="button secondary compact" data-delete-document="' +
      esc(document.id) + '" title="' + t('Delete') + '" aria-label="' + t('Delete') + '">' + icon('trash') + '</button></div>'];
  };
  const branches = new Map([['',language === 'ar' ? 'مستندات المنشأة' : 'Company documents'], ...state.locations.map(branch => [branch.id,branch.name])]);
  const groups = new Map([...branches.keys()].map(id=>[id,[]]));
  for (const document of state.documents ?? []) {
    const id = document.branchId || '';
    if (!groups.has(id)) {groups.set(id,[]);branches.set(id,t('Unavailable branch'));}
    groups.get(id).push(document);
  }
  const statusFor = document => {
    const status = expiryStatus(document);
    return status === 'urgent' ? 'soon' : status;
  };
  const documents = state.documents ?? [];
  const statuses = [['all','الكل','All'],['expired','منتهية','Expired'],['soon','قريبة الانتهاء','Expiring soon'],['undated','بدون تاريخ','No expiry date']];
  const statusControls = statuses.map(([value, ar, en]) => {
    const count = value === 'all' ? documents.length : documents.filter(document => statusFor(document) === value).length;
    return '<button type="button" data-wallet-status="' + value + '" aria-pressed="' + (value === documentWalletStatus) + '" class="button ' +
      (value === documentWalletStatus ? 'primary' : 'secondary') + '">' + (arabic ? ar : en) + ' (' + new Intl.NumberFormat(language).format(count) + ')</button>';
  }).join('');
  const branchSections = [...groups].map(([id, files]) => [id, documentWalletStatus === 'all' ? files : files.filter(document => statusFor(document) === documentWalletStatus)])
    .filter(([id, files]) => documentWalletStatus === 'all' ? id || files.length : files.length).map(([id,files]) =>
    '<details class="document-branch-group" data-document-branch="' + esc(id) + '"' + (documentWalletStatus !== 'all' || openDocumentBranches.has(id) ? ' open' : '') +
    '><summary>' + esc(branches.get(id)) + ' <small>' + new Intl.NumberFormat(language).format(files.length) + '</small></summary>' +
    table(['Document name','Document expiry date','Reminder status','Actions'].map(t),files.map(documentRow),
      t('No documents uploaded yet.'),'document-wallet-table') + '</details>').join('');
  return '<h1>' + t('Documents') + '</h1><div class="actions document-wallet-toolbar"><button type="button" class="button primary" id="open-document-upload">' + t('Upload document') +
    '</button>' + (walletUrl ? '<button type="button" class="button secondary" id="copy-document-wallet" data-wallet-url="' + esc(walletUrl) + '">' +
      (arabic ? 'نسخ الرابط' : 'Copy link') + '</button><span id="copy-document-wallet-status" role="status"></span>' : '') +
    '</div><div class="actions document-wallet-statuses">' + statusControls + '</div><section class="card document-wallet">' +
    (branchSections || '<p class="hint">' + t('No documents uploaded yet.') + '</p>') + '</section>' +
    '<dialog class="catalog-dialog" id="document-upload-dialog" aria-labelledby="document-upload-title">' +
    '<header><h2 id="document-upload-title">' + t('Upload document') + '</h2><button type="button" id="close-document-upload" class="button secondary compact" aria-label="' +
    t('Close') + '">×</button></header><form id="document-upload-form">' + documentBranchField('', true) + '<label>' + t('Document file') +
    '<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg" multiple required></label>' +
    (state.documentAiProvider && companyPrefix ? '<label class="document-ai-option"><input type="checkbox" name="useAi"> ' +
      (arabic ? 'اقتراح الاسم والتواريخ باستخدام ' : 'Suggest a name and dates with ') + esc(state.documentAiProvider) + '</label><p class="hint">' +
      (arabic ? 'عند التفعيل، يُرسل النص المستخرج من المستند إلى خدمة التحليل.' : 'When selected, the extracted document text is sent to the analysis service.') + '</p>' : '') +
    '<div class="document-upload-progress" role="status" aria-live="polite"></div><p class="hint">' + t('PDF, PNG or JPEG up to 10 MB.') + '</p>' +
    button(arabic ? 'قراءة ومراجعة' : 'Read and review') + '</form></dialog>';
}

async function reviewDocument(file, local, useAi, status) {
  const L = (ar,en) => language === 'ar' ? ar : en;
  let proposal, failed = false;
  if (useAi && local.text.trim()) {
    status.textContent = L('جارٍ تحليل المستند…','Analyzing document…');
    try {
      const response = await fetch(companyPrefix + '/api/documents/suggest',{
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),
        body:JSON.stringify({useAi:true,text:local.text.slice(0,24000),language}),
      });
      if (!response.ok) throw Error();
      proposal = await response.json();
    } catch {failed = true;}
  }
  const expiry = local.verifiedExpiry ?? proposal?.expiry;
  const expiresOn = expiry?.date ?? (proposal ? '' : local.suggestedExpiresOn);
  const hijri = expiry ? expiry.hijri ?? (expiry.calendar === 'hijri' ? expiry.originalDate : '') :
    proposal ? '' : local.suggestedHijri;
  const issue = local.issue ?? proposal?.issue;
  const dialog = document.createElement('dialog');
  dialog.className = 'catalog-dialog';
  dialog.setAttribute('aria-labelledby','document-review-title');
  dialog.innerHTML = '<header><h2 id="document-review-title">' + L('مراجعة المستند','Review document') +
    '</h2></header><p class="hint"><bdi>' + esc(file.name) + '</bdi></p><form><label>' + t('Document name') +
    '<input name="documentName" maxlength="180" required dir="auto"></label><p>' +
    L('تاريخ الإصدار (ميلادي)','Issue date (Gregorian)') + ' · <bdi>' + esc(issue?.date || '—') + '</bdi></p>' +
    (issue ? '<p class="hint"><bdi>' + esc(issue.evidence ?? issue.context) + '</bdi></p>' : '') +
    '<label>' + L('تاريخ الانتهاء المعتمد (ميلادي)','Approved expiry date (Gregorian)') + '<input type="date" name="expiresOn"></label>' +
    (hijri ? '<p class="hint">' + L('التاريخ الهجري في المستند','Hijri date in the document') + ' · <bdi>' + esc(hijri) + '</bdi></p>' : '') +
    (expiry ? '<p class="hint"><bdi>' + esc(expiry.evidence ?? expiry.context) + '</bdi></p>' : '') +
    (!expiresOn ? '<p class="hint">' + L('لم يُعثر على تاريخ انتهاء واضح. أدخله إذا كان مذكورًا في المستند.','No clear expiry date was found. Enter it if the document gives one.') + '</p>' : '') +
    (failed ? '<p class="hint">' + L('تعذّر تشغيل الذكاء الاصطناعي. راجع نتيجة قارئ المستند.','AI analysis was unavailable. Review the document reader result.') + '</p>' : '') +
    '<div class="actions"><button type="submit" class="button primary">' + L('اعتماد وحفظ المستند','Approve and save document') +
    '</button><button type="button" class="button secondary">' + L('تخطي الملف','Skip file') + '</button></div></form>';
  const form = dialog.querySelector('form');
  const name = form.elements.documentName;
  name.value = (documentDisplayName(proposal?.title) || documentDisplayName(file.name)).slice(0,180).toWellFormed();
  form.elements.expiresOn.value = expiresOn;
  let confirmed = null;
  dialog.querySelector('[type="button"]').onclick = () => dialog.close();
  form.onsubmit = event => {
    event.preventDefault();
    const title = documentDisplayName(name.value);
    if (!title) {name.value = '';name.reportValidity();return;}
    const date = form.elements.expiresOn.value;
    confirmed = {name:title,expiresOn:date,suggestedHijri:date && date === expiresOn ? hijri : ''};
    dialog.close();
  };
  document.body.append(dialog);
  return new Promise(resolve => {
    dialog.addEventListener('close',() => {dialog.remove();resolve(confirmed);},{once:true});
    dialog.showModal();
  });
}
function mountStaffPages(form,dialog){
 const L=(ar,en)=>language==='ar'?ar:en,sections=[...form.children].filter(n=>n.tagName==='SECTION'),footer=form.querySelector('.ux-form-footer'),saveButton=footer.querySelector('button[type="submit"],button:not([type])');
 if(sections.length<3||!saveButton)return;
 form.classList.add('staff-paged-form');
 const periods=form.querySelector('.staff-default-periods');
 if(periods)sections[2].append(periods);
 let page=0;form.noValidate=true;
 const pages=document.createElement('nav');pages.className='staff-form-pages';pages.setAttribute('aria-label',L('خطوات إضافة الموظف','Add employee steps'));
 pages.innerHTML='<button type="button" data-staff-page="0">1 · '+L('البيانات الشخصية والوظيفية','Personal and employment information')+'</button><button type="button" data-staff-page="1">2 · '+L('الراتب وفترات الدوام','Salary and work periods')+'</button>';
 form.prepend(pages);
 const previous=document.createElement('button');previous.type='button';previous.className='button secondary';previous.textContent=L('السابق','Previous');
 const next=document.createElement('button');next.type='button';next.className='button primary';next.textContent=L('التالي','Next');footer.prepend(previous,next);
 const show=(value,focus=true)=>{page=value;sections.forEach((section,i)=>section.hidden=(i<2?0:1)!==page);saveButton.hidden=page===0;next.hidden=page===1;previous.hidden=page===0;pages.querySelectorAll('button').forEach((b,i)=>{b.setAttribute('aria-current',i===page?'step':'false');b.setAttribute('aria-pressed',String(i===page));});dialog.scrollTop=0;if(focus)(page===0?sections[0]:sections[2]).querySelector('input:not([disabled]),select:not([disabled])')?.focus({preventScroll:true});};
 const invalid=onlyFirst=>[...form.elements].find(field=>field.willValidate&&(!onlyFirst||sections.slice(0,2).some(section=>section.contains(field)))&&!field.checkValidity());
 const advance=()=>{const field=invalid(true);if(field){show(0,false);field.reportValidity();field.focus();return;}show(1);};
 next.onclick=advance;previous.onclick=()=>show(0);pages.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>i?advance():show(0));
 form.addEventListener('submit',event=>{
  if(page===0){event.preventDefault();event.stopImmediatePropagation();advance();return;}
  const field=invalid(false);if(field){event.preventDefault();event.stopImmediatePropagation();show(sections.slice(0,2).some(section=>section.contains(field))?0:1,false);const salary=field.closest('.staff-salary-disclosure');if(salary)salary.open=true;field.reportValidity();field.focus();}
 },true);
 show(0,false);
}
function payroll() { return state.canViewPayroll === false ? '<p>'+t('This action is not allowed by your role permissions.')+'</p>' : payrollMarkup({ state, language, esc, t }); }
let followUpFilter='new',followUpKind='all',followUpAssignee='all';
const followUpLabel=(ar,en)=>language==='ar'?ar:en;
const followUpStatus=status=>({new:followUpLabel('جديدة','New'),'in-progress':followUpLabel('قيد التنفيذ','In progress'),completed:followUpLabel('مكتملة','Completed')})[status]||status;
const followUpKindLabel=kind=>({document:followUpLabel('مستندات المنشأة','Company documents'),residence:followUpLabel('إقامات','Residence permits'),'work-permit':followUpLabel('رخص عمل','Work permits'),staff:followUpLabel('بيانات الموظفين','Employee information'),ticket:followUpLabel('تذكرة','Ticket')})[kind]||kind;
const followUpTime=value=>{try{return dateFormatter(language==='ar'?'ar-SA':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date(value));}catch{return value;}};
const followUpPerson=id=>id==='account-administrator'?followUpLabel('مسؤول الحساب','Account administrator'):staffName([...state.staff,...(state.followUpAssigneeChoices??[])].find(p=>p.id===id)??{name:followUpLabel('إداري سابق','Former administrator')});
function followUpFields(item){
 const labels={email:['البريد','Email'],phone:['الجوال','Phone'],identityNumber:['الهوية / الإقامة','Identity / residence'],nationality:['الجنسية','Nationality'],joinDate:['تاريخ الانضمام','Joining date'],jobTitle:['المسمى الوظيفي','Job title'],iban:['الآيبان','IBAN'],residencyExpiryDate:['انتهاء الإقامة','Residence expiry'],gosi:['بيانات التأمينات','GOSI settings'],expiry:['تاريخ انتهاء المستند','Document expiry']};
 return (item.fields??[]).map(k=>labels[k]?followUpLabel(...labels[k]):k).join('، ');
}
const followUpDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',dateStyle:'short'});
let lastFollowUpRenderDate;
function followup(){
 const today=lastFollowUpRenderDate=followUpDate.format(Date.now());
 const L=followUpLabel,items=followUpItems(state,today).filter(item=>item.status==='completed'||!item.assignment?.reminderOn||!item.reminderPending),people=[...new Map([...(state.followUpAssigneeChoices??[]),...state.staff].filter(p=>p.status==='Active'&&permissionsFor(state,p.role).tasks).map(p=>[p.id,p])).values()];
 if(followUpAssignee!=='all'&&!people.some(p=>p.id===followUpAssignee))followUpAssignee='all';
 const matches=(item,key)=>key==='all'||key==='new'&&item.status==='new'||key==='overdue'&&item.overdue&&!item.reminderPending||key==='soon'&&item.status!=='completed'&&!item.reminderPending&&(item.reminderActive||(item.kind==='ticket'?item.days>=0&&item.days<=7:!!item.expiresOn&&item.days>=0))||key==='in-progress'&&item.status==='in-progress'||key==='completed'&&item.status==='completed';
 const visible=items.filter(i=>matches(i,followUpFilter)&&(followUpKind==='all'||(followUpKind==='assigned'?Boolean(i.assignment?.assigneeId):!i.assignment?.assigneeId))&&(followUpAssignee==='all'||i.assignment?.assigneeId===followUpAssignee));
 const bulkItems=visible.filter(i=>i.status!=='completed').map(i=>({itemId:i.id,expectedVersion:i.assignment?.version??0}));
 return title(L('مركز المتابعة','Follow-up centre'),L('تابع الاستحقاقات والنواقص، وأسند المسؤوليات وحدد مواعيد الإنجاز.','Track deadlines and missing information, assign administrators and set completion dates.'))+
 '<div class="schedule-tabs follow-up-tabs" dir="'+(language==='ar'?'rtl':'ltr')+'">'+[['new',L('بانتظار الإجراء','Awaiting action')],['in-progress',L('قيد التنفيذ','In progress')],['soon',L('قريبة الاستحقاق','Due soon')],['overdue',L('متأخرة','Overdue')],['completed',L('مكتملة','Completed')],['all',L('الكل','All')]].map(([key,label])=>'<button type="button" data-follow-up-filter="'+key+'" aria-pressed="'+(followUpFilter===key)+'">'+label+' <bdi>'+items.filter(i=>matches(i,key)).length+'</bdi></button>').join('')+'</div>'+
 card(L('المتابعات','Follow-ups'),(canManageFollowUpUI()?'<div class="follow-up-create-actions"><button type="button" class="button primary" data-create-follow-up>'+L('فتح تذكرة','Open ticket')+'</button></div>':'')+'<label class="follow-up-kind">'+L('التصنيف','Category')+'<select data-follow-up-kind><option value="all">'+L('كل التصنيفات','All categories')+'</option>'+[['assigned',L('مسند','Assigned')],['unassigned',L('غير مسند','Unassigned')]].map(([k,label])=>'<option value="'+k+'"'+(followUpKind===k?' selected':'')+'>'+label+'</option>').join('')+'</select></label><div class="follow-up-assignees" role="group" aria-label="'+L('المهام بحسب المسؤول','Tasks by assignee')+'">'+[['all',L('الكل','All')],...people.map(p=>[p.id,staffName(p)])].map(([id,name])=>'<button type="button" class="button secondary compact" data-follow-up-assignee="'+esc(id)+'" aria-pressed="'+(followUpAssignee===id)+'">'+esc(name)+' <bdi>'+items.filter(i=>matches(i,followUpFilter)&&(id==='all'||i.assignment?.assigneeId===id)).length+'</bdi></button>').join('')+'</div>'+
 (visible.length?'<div class="table-wrap"><table class="follow-up-table"><thead><tr>'+[L('رقم التذكرة','Ticket number'),L('الموضوع','Subject'),L('التصنيف','Category'),L('الفرع','Branch'),L('تاريخ الاستحقاق','Expiry date'),L('موعد الإنجاز','Completion deadline'),L('المدة المتبقية','Remaining'),L('المسؤول','Assignee'),L('الحالة','Status'),L('الإجراء','Action'),L('حذف','Delete')].map((x,i)=>'<th>'+(i===9?'<div class="follow-up-action-heading"><button type="button" class="button secondary compact" data-follow-up-bulk="'+esc(JSON.stringify(bulkItems))+'"'+(!bulkItems.length||!canManageFollowUpUI()?' disabled':'')+'>'+L('إسناد الكل','Assign all')+'</button><span>'+x+'</span></div>':x)+'</th>').join('')+'</tr></thead><tbody>'+visible.map(item=>'<tr data-follow-up-open="'+esc(item.id)+'"><td><bdi>'+esc(item.number)+'</bdi></td><td><button type="button" class="table-action" data-follow-up-open="'+esc(item.id)+'">'+(item.reminderActive?'<span class="follow-up-unassigned" role="img" aria-label="'+L('حان موعد التذكير','Reminder due')+'" title="'+L('حان موعد التذكير','Reminder due')+'">!</span>':!item.reminderPending&&!item.assignment?.assigneeId&&item.status!=='completed'?'<span class="follow-up-unassigned" role="img" aria-label="'+L('بانتظار الإسناد','Pending assignment')+'" title="'+L('بانتظار الإسناد','Pending assignment')+'">!</span>':'')+esc(item.name)+'</button>'+(item.fields?.length?'<small>'+esc(followUpFields(item))+'</small>':'')+'</td><td>'+followUpKindLabel(item.kind)+'</td><td>'+esc(state.locations.find(l=>l.id===item.branchId)?.name||L('المنشأة','Company'))+'</td><td><bdi>'+esc(dateText(item.expiresOn)||'—')+'</bdi></td><td><bdi>'+esc(dateText(item.dueOn)||'—')+'</bdi></td><td>'+esc(item.days==null?'—':item.days<0?L('منتهي منذ ','Expired ')+Math.abs(item.days)+L(' يوم',' days ago'):item.days+L(' يوم',' days'))+'</td><td>'+esc(item.assignment?.assigneeId?followUpPerson(item.assignment.assigneeId):L('غير مسند','Unassigned'))+'</td><td><span class="follow-up-status '+(item.overdue&&!item.reminderPending?'overdue':item.status)+'">'+(item.overdue&&!item.reminderPending?L('متأخرة · ','Overdue · '):'')+followUpStatus(item.status)+'</span></td><td><button type="button" class="button secondary compact" data-follow-up-open="'+esc(item.id)+'">'+L('إسناد','Assign')+'</button>'+(canManageFollowUpUI()&&Boolean(accountIdentity?.id)&&item.status==='new'&&item.assignment?.assigneeId===accountIdentity.id?'<button type="button" class="button primary compact" data-follow-up-receive="'+esc(item.id)+'" data-version="'+(item.assignment?.version??0)+'">'+L('استلام','Receive')+'</button>':'')+'</td><td>'+(item.kind==='ticket'&&(!item.recurring||item.status==='completed')&&canManageFollowUpUI()?'<button type="button" class="button secondary compact" data-delete-follow-up="'+esc(item.id)+'">'+L('حذف','Delete')+'</button>':'—')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="empty">'+L('لا يوجد','No items')+'</p>'));
}
const canManageFollowUpUI=()=>Boolean(state.isCompanyOwner||(accountIdentity&&permissionsFor(state,state.staff.find(p=>p.id===accountIdentity.id)?.role).tasks));
async function readFollowUpFile(file) {
  if(file.size>2*1024*1024||!['application/pdf','image/png','image/jpeg'].includes(file.type))
    throw Error(followUpLabel('اختر PDF أو صورة حتى 2 ميجابايت.','Choose a PDF or image up to 2 MB.'));
  const data=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result.split(',')[1]);
    reader.onerror=()=>reject(Error('Could not read attachment.'));
    reader.readAsDataURL(file);
  });
  return {name:file.name,mime:file.type,data};
}
function openFollowUpTicket(firstTicket,previousDialog) {
  if(!canManageFollowUpUI())return;
  const L=followUpLabel,dialog=document.createElement('dialog');
  const title=firstTicket?L('المهمة التالية','Next task'):L('فتح تذكرة','Open ticket');
  const requestId=crypto.randomUUID();
  dialog.className='catalog-dialog follow-up-dialog';
  dialog.setAttribute('aria-label',title);
  dialog.innerHTML=`<header><h2>${title}</h2></header><form>
    <label>${L('الموضوع','Subject')}<input name="name" maxlength="180" required autofocus></label>
    <label${state.locations.length===1?' hidden':''}>${L('الفرع','Branch')}<select name="branchId" required>
      ${state.locations.length===1?'':`<option value="">${L('اختر الفرع','Choose branch')}</option>`}
      ${state.locations.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}
    </select></label>
    <div class="fields"><label>${L('إسناد إلى','Assign to')}<select name="assigneeId" required></select></label>
    <label>${L('موعد الإنجاز','Completion deadline')}<input name="dueOn" type="date" min="${esc(state.today)}" required></label></div>
    <label class="follow-up-recurring-toggle"${firstTicket?' hidden':''}><input type="checkbox" name="recurring"${firstTicket?' disabled':''}> ${L('مهمة مستمرة','Recurring task')}</label>
    <label class="follow-up-recurring-toggle"${firstTicket?' hidden':''}><input type="checkbox" name="linked"${firstTicket?' disabled':''}> ${L('مهمة مرتبطة بأخرى','Linked task')}</label>
    <fieldset data-recurrence hidden disabled><div class="fields">
      <label>${L('التذكير','Repeat')}<select name="frequency" required>
        <option value="monthly">${L('شهريًا','Monthly')}</option><option value="daily">${L('يوميًا','Daily')}</option><option value="weekly">${L('أسبوعيًا','Weekly')}</option>
      </select></label>
      <label>${L('في تاريخ','Starting on')}<input name="firstOn" type="date" min="${esc(state.today)}" required></label>
    </div></fieldset>
    <label>${L('تعليق','Comment')}<textarea name="text" maxlength="2000" rows="3"></textarea></label>
    <label>${L('المرفقات (اختياري، حتى 3 ملفات بحجم 2 ميجابايت لكل ملف)','Attachments (optional, up to 3 files of 2 MB each)')}
      <input type="file" name="files" accept="application/pdf,image/png,image/jpeg" multiple></label>
    <p role="status" hidden></p><div class="actions"><button class="button primary" type="submit">${L('إرسال','Send')}</button>
    <button class="button secondary" type="button" data-cancel>${firstTicket?L('السابق','Back'):L('إلغاء','Cancel')}</button></div></form>`;
  const form=dialog.querySelector('form'), cancel=dialog.querySelector('[data-cancel]');
  const {branchId,assigneeId,dueOn,recurring,linked,firstOn}=form.elements;
  const submit=form.querySelector('[type=submit]');
  const recurrenceFields=form.querySelector('[data-recurrence]');
  const updateOptions=()=>{
    recurrenceFields.hidden=recurrenceFields.disabled=!recurring.checked;
    submit.textContent=linked.checked?L('التالي','Next'):L('إرسال','Send');
  };
  recurring.onchange=()=>{if(recurring.checked)linked.checked=false;updateOptions();};
  linked.onchange=()=>{if(linked.checked)recurring.checked=false;updateOptions();};
  firstOn.onchange=()=>{if(firstOn.value&&(!dueOn.value||dueOn.value<firstOn.value))dueOn.value=firstOn.value;};
  const people=[...new Map([...state.staff,...(state.followUpAssigneeChoices??[])].map(p=>[p.id,p])).values()];
  const loadAssignees=()=>{
    const choices=branchId.value?eligibleFollowUpAssignees({...state,staff:people},{branchId:branchId.value}):[];
    assigneeId.replaceChildren(new Option(L('اختر المسؤول','Choose assignee'),''),...choices.map(p=>new Option(staffName(p),p.id)));
  };
  branchId.onchange=loadAssignees;
  if(firstTicket)branchId.value=firstTicket.branchId;
  loadAssignees();
  cancel.onclick=()=>dialog.close();
  dialog.onclose=()=>dialog.remove();
  dialog.oncancel=event=>{if(cancel.disabled)event.preventDefault();};
  form.onsubmit=event=>{
    event.preventDefault();event.stopPropagation();
    const status=form.querySelector('[role=status]');
    const fields=new FormData(form),files=[...form.elements.files.files];
    status.hidden=true;
    cancel.disabled=true;
    void run(event.submitter,async()=>{
      if(files.length>3)throw Error(L('اختر ثلاثة مرفقات كحد أقصى.','Choose up to three attachments.'));
      const attachments=await Promise.all(files.map(readFollowUpFile));
      const ticket={requestId,name:fields.get('name'),branchId:fields.get('branchId'),
        assigneeId:fields.get('assigneeId'),dueOn:fields.get('dueOn'),text:fields.get('text'),attachments,
        ...(fields.has('recurring')?{recurrence:{frequency:fields.get('frequency'),firstOn:fields.get('firstOn')}}:{})};
      if(fields.has('linked')){openFollowUpTicket(ticket,dialog);return;}
      const result=await save('follow-up/create',firstTicket?{...firstTicket,nextTicket:ticket}:ticket);
      followUpFilter='new';followUpAssignee=followUpKind='all';
      render();dialog.close();previousDialog?.close();
      say((fields.has('recurring')?L('تمت جدولة المهمة المستمرة ','Recurring task scheduled '):L('تم فتح التذكرة ','Ticket opened '))+result.ticketNumber);
    },null,error=>{status.hidden=false;status.textContent=t(error.message);}).finally(()=>{cancel.disabled=false;});
  };
  document.body.append(dialog);
  dialog.showModal();
}
function followUpAttachmentLinks(id,comment,L) {
  const url=esc(companyPrefix+'/api/follow-up/attachment?itemId='+encodeURIComponent(id)+'&commentId='+encodeURIComponent(comment.id));
  return '<div class="actions"><bdi>'+esc(comment.attachment.name)+'</bdi>'+
    '<a class="button secondary compact" href="'+url+'&amp;view=inline" target="_blank" rel="noopener">'+L('معاينة','Preview')+'</a>'+
    '<a class="button secondary compact" href="'+url+'" download>'+L('تحميل','Download')+'</a></div>';
}
function loadFollowUpChoices(entries,renderDialog,readOnly){
 const L=followUpLabel,dialog=document.createElement('dialog');dialog.className='catalog-dialog';dialog.setAttribute('aria-label',L('إسناد المهام','Assign tasks'));
 dialog.innerHTML='<header><h2>'+L('إسناد المهام','Assign tasks')+'</h2><button type="button" class="button secondary compact" aria-label="'+t('Close')+'">×</button></header><p role="status">'+L('جارٍ تحميل المسؤولين المخولين…','Loading authorized assignees…')+'</p><button type="button" class="button secondary compact" data-retry hidden>'+L('إعادة المحاولة','Retry')+'</button>';
 document.body.append(dialog);dialog.querySelector('header button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal();
 const load=async()=>{const retry=dialog.querySelector('[data-retry]'),status=dialog.querySelector('[role=status]');retry.hidden=true;
 try{const response=await fetch(companyPrefix+'/api/follow-up/choices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:entries}),signal:AbortSignal.timeout(10000)});const result=await response.json();if(!dialog.open)return;if(!response.ok){if(response.status===403&&readOnly){dialog.close();readOnly();return;}throw Error(result.error);}dialog.close();renderDialog(result);}catch(error){if(dialog.open){status.textContent=t(error.message);retry.hidden=false;}}};dialog.querySelector('[data-retry]').onclick=load;void load();
}
function openBulkFollowUp(entries){loadFollowUpChoices(entries,options=>renderBulkFollowUp(entries,options));}
function openFollowUp(id){const item=followUpItems(state,state.today).find(i=>i.id===id);if(!item)return;loadFollowUpChoices([{itemId:id,expectedVersion:item.assignment?.version??0}],options=>renderFollowUpDialog(id,options),()=>renderFollowUpDialog(id,null));}
function renderBulkFollowUp(entries,options){
 if(!canManageFollowUpUI())return;
 const L=followUpLabel,all=followUpItems(state,state.today),items=entries.map(e=>all.find(i=>i.id===e.itemId));
 if(!entries.length||items.some(i=>!i||i.status==='completed')){say(L('تغيّرت المهام، حدّث الصفحة وحاول مجددًا.','Tasks changed. Refresh and try again.'),true);return;}
 const people=options.assignees;
 const dialog=document.createElement('dialog');dialog.className='catalog-dialog';
 dialog.innerHTML='<header><h2>'+L('إسناد الكل','Assign all')+'</h2><button type="button" class="button secondary compact" data-close aria-label="'+t('Close')+'">×</button></header><p>'+L('إسناد المهام المعروضة غير المكتملة: ','Assign displayed incomplete tasks: ')+'<bdi>'+entries.length+'</bdi></p><p class="hint">'+L('سيتم تغيير المسؤول للمهام المعروضة فقط، مع الاحتفاظ بمواعيدها وحالاتها.','Only displayed tasks will be reassigned. Deadlines and statuses are preserved.')+'</p>'+(people.length?'<form><label>'+L('إسناد إلى','Assign to')+'<select name="assigneeId" required><option value="">'+L('اختر الإداري','Choose administrator')+'</option>'+people.map(p=>'<option value="'+esc(p.id)+'">'+esc(staffName(p))+'</option>').join('')+'</select></label><button type="submit" class="button primary">'+L('إسناد الكل','Assign all')+'</button><p role="status"></p></form>':'<p>'+L('لا يوجد إداري لديه صلاحية على جميع المهام المعروضة. اعرض مجموعة أصغر من المهام.','No administrator is authorized for every displayed task. Filter to a smaller group.')+'</p>');
 document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
 const form=dialog.querySelector('form');if(form)form.onsubmit=e=>{e.preventDefault();e.stopPropagation();const button=e.submitter;button.disabled=true;void(async()=>{try{await save('follow-up/assign-bulk',{items:entries,assigneeId:form.elements.assigneeId.value});dialog.close();}catch(error){form.querySelector('[role=status]').textContent=t(error.message);}finally{button.disabled=false;}})();};
 dialog.showModal();
}
function renderFollowUpDialog(id,options){
 const item=followUpItems(state,state.today).find(i=>i.id===id);if(!item)return;
 const L=followUpLabel,r=item.assignment??{},people=options?.assignees??[];
 const dialog=document.createElement('dialog');dialog.className='catalog-dialog follow-up-dialog';dialog.id='follow-up-workflow-dialog';dialog.setAttribute('aria-labelledby','follow-up-dialog-title');
 const closeDrawer=bindSideDrawer(dialog);
 if(!options?.canManage||(item.kind==='document'&&!state.isCompanyOwner&&r.assigneeId!==accountIdentity?.id)){
  dialog.innerHTML='<header><h2 id="follow-up-dialog-title">'+esc(item.name)+'</h2><button type="button" class="button secondary compact" aria-label="'+t('Close')+'">×</button></header><p>'+L('تاريخ الاستحقاق: ','Expiry date: ')+esc(dateText(item.expiresOn)||'—')+'</p><p>'+L('الحالة: ','Status: ')+followUpStatus(item.status)+'</p><p class="hint">'+L('هذا تنبيه للاطلاع. إدارة المهمة متاحة للمسؤول المسندة إليه.','This is a notice. The assigned administrator manages the task.')+'</p>';
  document.body.append(dialog);dialog.querySelector('button').onclick=closeDrawer;dialog.onclose=()=>dialog.remove();dialog.showModal();return;
 }
 dialog.innerHTML='<header><h2 id="follow-up-dialog-title">'+esc(item.name)+'</h2><button type="button" class="button secondary compact" data-dismiss aria-label="'+esc(t('Close'))+'">×</button></header><p>'+followUpKindLabel(item.kind)+' · '+esc(state.locations.find(l=>l.id===item.branchId)?.name||L('المنشأة','Company'))+'</p><p>'+L('تاريخ الاستحقاق: ','Expiry date: ')+'<bdi>'+esc(dateText(item.expiresOn)||'—')+'</bdi></p>'+(item.fields?.length?'<p>'+esc(followUpFields(item))+'</p>':'')+(item.kind==='ticket'?'<p><bdi>'+esc(item.number)+'</bdi></p>':item.kind==='document'&&!state.isCompanyOwner?'<p class="hint">'+L('المستند الأصلي محفوظ لدى مسؤول الحساب.','The original document is held by the account administrator.')+'</p>':'<a href="'+(item.staffId?'#staff/'+encodeURIComponent(item.staffId)+'/personal':'#documents')+'" data-source>'+L('فتح البيانات الأصلية','Open source information')+'</a>')+
 (item.autoCompleted?'<p class="follow-up-resolved">'+L('اكتملت تلقائيًا بعد تحديث البيانات الأصلية.','Completed automatically after the source information was updated.')+'</p>':'<form data-details><div class="fields"><label>'+L('إسناد','Assign')+'<select name="assigneeId"><option value="">'+L('غير مسند','Unassigned')+'</option>'+(r.assigneeId&&!people.some(p=>p.id===r.assigneeId)?'<option value="'+esc(r.assigneeId)+'" disabled selected>'+esc(followUpPerson(r.assigneeId))+' — '+L('غير مخول حاليًا','No longer eligible')+'</option>':'')+people.map(p=>'<option value="'+esc(p.id)+'"'+(r.assigneeId===p.id?' selected':'')+'>'+esc(staffName(p))+'</option>').join('')+'</select></label><label>'+L('موعد الإنجاز','Completion deadline')+'<input type="date" name="dueOn" value="'+esc(item.dueOn||item.expiresOn||'')+'"></label><label>'+L('موعد التذكير','Reminder date')+'<input type="date" name="reminderOn" data-calendar-only="true" value="'+esc(r.reminderOn||'')+'"></label></div><p class="hint">'+L('موعد الإنجاز مستقل عن تاريخ انتهاء المستند.','The completion deadline is separate from the document expiry date.')+'</p>'+button(t('Save'))+'</form>')+
 '<details class="follow-up-extra"><summary>'+L('التعليقات والمرفقات','Comments and attachments')+'</summary>'+(r.comments??[]).map(c=>'<article class="follow-up-comment"><strong>'+esc(followUpPerson(c.by))+'</strong> <time><bdi>'+esc(followUpTime(c.at))+'</bdi></time><p>'+esc(c.text)+'</p>'+(c.attachment?followUpAttachmentLinks(id,c,L):'')+'</article>').join('')+(!item.autoCompleted?'<form data-comment><label>'+L('تعليق','Comment')+'<textarea name="text" maxlength="2000" rows="3"></textarea></label><label>'+L('مرفق اختياري — PDF أو صورة، حتى 2 ميجابايت','Optional attachment — PDF or image, up to 2 MB')+'<input type="file" name="file" accept="application/pdf,image/png,image/jpeg"></label><button type="submit" class="button primary">'+L('إضافة تعليق','Add comment')+'</button></form>':'')+'</details><details class="follow-up-extra"><summary>'+L('سجل التغييرات','Activity history')+'</summary>'+(r.events??[]).slice().reverse().map(e=>'<article class="follow-up-event"><strong>'+esc(followUpPerson(e.by))+'</strong> <time><bdi>'+esc(followUpTime(e.at))+'</bdi></time><p>'+ (e.type==='comment'?L('أضاف تعليقًا أو مرفقًا','Added a comment or attachment'):esc(followUpStatus(e.from.status))+' ← '+esc(followUpStatus(e.to.status))+' · '+L('المسؤول: ','Assignee: ')+esc(e.to.assigneeId?followUpPerson(e.to.assigneeId):L('غير مسند','Unassigned'))+' · '+L('موعد الإنجاز: ','Deadline: ')+esc(dateText(e.to.dueOn)||'—'))+'</p></article>').join('')+'</section>';
 document.body.append(dialog);dialog.querySelector('[data-dismiss]').onclick=closeDrawer;const source=dialog.querySelector('[data-source]');if(source)source.onclick=closeDrawer;dialog.addEventListener('close',()=>dialog.remove());
 const submit=async(body)=>{await save('follow-up/update',{itemId:id,expectedVersion:r.version??0,...body});await closeDrawer();if(body.operation==='comment')openFollowUp(id);};
 const details=dialog.querySelector('[data-details]');if(details)details.onsubmit=e=>{e.preventDefault();e.stopPropagation();const data=new FormData(details);if(r.assigneeId&&!people.some(p=>p.id===r.assigneeId)&&details.elements.assigneeId.value===r.assigneeId){say(L('اختر مسؤولًا مخولًا أو غير مسند قبل الحفظ.','Choose an eligible assignee or Unassigned before saving.'),true);return;}run(e.submitter,()=>submit({operation:'details',assigneeId:data.get('assigneeId')||null,dueOn:data.get('dueOn')||null,reminderOn:data.get('reminderOn')||null,status:item.status}));};
 if(details){
  details.id='follow-up-details-form';
  const actions=document.createElement('div');
  actions.className='side-drawer-actions';
  const saveButton=details.querySelector('button');
  saveButton.type='submit';
  saveButton.setAttribute('form',details.id);
  const cancel=document.createElement('button');
  cancel.type='button';cancel.className='button secondary';cancel.textContent=L('إلغاء','Cancel');cancel.onclick=closeDrawer;
  actions.append(saveButton,cancel);dialog.append(actions);
 }
 if((item.recurring||item.linked)&&item.status!=='completed'&&details&&(r.assigneeId===accountIdentity?.id||(item.linked&&state.isCompanyOwner))){
  const close=document.createElement('button');
  close.type='button';close.className='button secondary';close.textContent=L('إغلاق التذكرة','Close ticket');
  close.onclick=()=>run(close,()=>submit({operation:'details',assigneeId:r.assigneeId,dueOn:item.dueOn,status:'completed'}));
  details.append(close);
 }
 const comment=dialog.querySelector('[data-comment]');if(comment)comment.onsubmit=e=>{e.preventDefault();e.stopPropagation();run(e.submitter,async()=>{
  const data=new FormData(comment),file=data.get('file');
  const attachment=file?.size?await readFollowUpFile(file):null;
  await submit({operation:'comment',text:data.get('text'),...(attachment?{attachment}:{})});
 });};dialog.showModal();
}
document.addEventListener('click',event=>{
 const deleteButton=event.target.closest('[data-delete-follow-up]');
 if(deleteButton){
  const item=followUpItems(state,state.today).find(item=>item.id===deleteButton.dataset.deleteFollowUp&&item.kind==='ticket');
  if(!item||!canManageFollowUpUI())return;
  const L=followUpLabel,dialog=document.createElement('dialog');
  dialog.className='catalog-dialog';
  dialog.setAttribute('aria-label',L('حذف التذكرة','Delete ticket'));
  dialog.innerHTML='<p>'+L('هل تريد حذف التذكرة','Delete ticket')+' <bdi>'+esc(item.number)+'</bdi>؟</p><p role="status"></p><div class="actions"><button type="button" class="button primary" data-confirm>'+L('حذف','Delete')+'</button><button type="button" class="button secondary" data-cancel>'+L('إلغاء','Cancel')+'</button></div>';
  const cancel=dialog.querySelector('[data-cancel]');
  cancel.onclick=()=>dialog.close();
  dialog.onclose=()=>{dialog.remove();if(deleteButton.isConnected)deleteButton.focus();};
  dialog.oncancel=event=>{if(cancel.disabled)event.preventDefault();};
  dialog.querySelector('[data-confirm]').onclick=event=>{
   cancel.disabled=true;
   void run(event.currentTarget,async()=>{
    await save('follow-up/delete',{itemId:item.id,expectedVersion:item.assignment.version});
    dialog.close();
   },L('تم حذف التذكرة.','Ticket deleted.'),error=>{dialog.querySelector('[role=status]').textContent=t(error.message);}).finally(()=>{cancel.disabled=false;});
  };
  document.body.append(dialog);dialog.showModal();return;
 }
 if(event.target.closest('[data-create-follow-up]')){openFollowUpTicket();return;}
 const receive=event.target.closest('[data-follow-up-receive]');if(receive){void run(receive,async()=>{await save('follow-up/receive',{itemId:receive.dataset.followUpReceive,expectedVersion:Number(receive.dataset.version)});await refreshManagementAlerts();});return;}
 const bulk=event.target.closest('[data-follow-up-bulk]');if(bulk){openBulkFollowUp(JSON.parse(bulk.dataset.followUpBulk));return;}
 const assignee=event.target.closest('[data-follow-up-assignee]');if(assignee){followUpAssignee=assignee.dataset.followUpAssignee;followUpKind='all';render();return;}
 const filter=event.target.closest('[data-follow-up-filter]');if(filter){followUpFilter=filter.dataset.followUpFilter;render();return;}
 const trigger=event.target.closest('[data-follow-up-open]');if(trigger)openFollowUp(trigger.dataset.followUpOpen);
});
document.addEventListener('change',event=>{if(event.target.matches('[data-follow-up-kind]')){followUpKind=event.target.value;render();}});
function tasks() { return title(t('Tasks'), '') + card(t('Tasks'), '<p class="empty">' + t('No tasks yet.') + '</p>'); }
const views = { followup, tasks, payroll, account: accountPage, home, requests, staff, 'staff-profile': staffProfile, attendance, leaves, reports, documents, settings, mobile };
function partnersPage() {
  return '<h1>' + t('Partners') + '</h1><section class="card partners-card">' +
    '<div class="catalog-toolbar"><button type="button" class="button primary compact" data-create-catalog="partner">+ ' +
    t('Add company') + '</button></div>' +
    table(['Company name', 'Authorized contact', 'Email', 'Contact number', 'Status', 'Action', 'Actions'].map(t), state.partners.map(partner => [
      '<strong>' + esc(partner.name) + '</strong>', esc(partner.contactName || '—'),
      '<bdi>' + esc(partner.email) + '</bdi>', '<bdi>' + esc(partner.phone) + '</bdi>',
      badge(partner.suspended ? 'Suspended' : partner.active ? 'Active' : partner.activationEmailSent?'Activation email sent; awaiting activation':'Pending activation'),
      '<button type="button" role="switch" class="leave-switch" aria-label="' +
        esc(t('Company access') + ' — ' + partner.name) + '" aria-checked="' + !partner.suspended +
        '" data-partner-status="' + esc(partner.id) + '"><span></span></button>',
      '<div class="activation-actions">' + (partner.id === 'xyz-demo' ? '' :
        '<button type="button" class="button secondary compact" data-edit-partner="' + esc(partner.id) +
        '" aria-haspopup="dialog" aria-label="' + t('Edit company') + '" title="' + t('Edit company') + '">✎</button>') +
      (partner.id==='xyz-demo'?'':'<button type="button" class="button secondary compact" data-view-partner="' +
        esc(partner.id) + '"'+(partner.suspended?' disabled':'')+'>' + t('View') + '</button>') +
      (!partner.active && !partner.suspended ? activationShortcuts('partner',partner) : '') + '</div>',
    ]), t('No companies yet.'), 'partners-table') + '</section>' +
    '<dialog id="create-partner" class="catalog-dialog" aria-labelledby="partner-dialog-title"><header><h2 id="partner-dialog-title">' +
    t('Add company') + '</h2><button type="button" class="button secondary compact" data-close-catalog aria-label="' +
    t('Close') + '">×</button></header><form id="partner-form">' +
    '<label>' + t('Company name') + '<input name="name" maxlength="120" required></label>' +
    '<label>' + t('Authorized contact') + '<input name="contactName" maxlength="120" autocomplete="name" required></label>' +
    '<label>' + t('Email') + '<input name="email" type="email" maxlength="254" required></label>' +
    '<label>' + t('Contact number') + '<input name="phone" type="tel" maxlength="40" required></label>' +
    '<fieldset id="partner-password-fields" hidden disabled><legend>' + t('Set a new company password') + '</legend>' +
    '<p class="hint">' + t('The current password cannot be displayed. Leave blank to keep it unchanged. Changing it signs the company account out.') + '</p>' +
    '<label>' + t('New password') + '<input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password"></label>' +
    '<label>' + t('Confirm password') + '<input name="confirmation" type="password" minlength="10" maxlength="128" autocomplete="new-password"></label>' +
    '<button type="button" class="button secondary compact" id="toggle-partner-password" aria-pressed="false">' + t('Show password') + '</button></fieldset>' +
    '<div class="actions">'+button(t('Add company')) + '<button type="button" class="button secondary" id="partner-delete-button" hidden>'+t('Delete company')+'</button></div></form></dialog>';
}
const route = () => {
  const hash = location.hash.slice(1).split('?')[0];
  if (superAdmin) return Object.hasOwn(superAdminPages, hash) || hash === 'settings/organization' ? hash : 'home';
  if (/^payroll\/\d{4}-(0[1-9]|1[0-2])$/.test(hash)) return 'payroll';
  if (hash === 'account' || hash === 'account/password') return 'account';
  if (/^staff\/[^/]+\/(overview|attendance|leaves|personal)$/.test(hash)) return 'staff-profile';
  return Object.hasOwn(views, hash) || Object.hasOwn(settingsSections, hash) ||
    Object.hasOwn(reportSections, hash) || Object.hasOwn(reportTypes, hash) ? hash : 'home';
};
function applyLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = t('dawamkom');
  $('#brand-name').textContent = t('dawamkom');
  $('#demo-label').textContent = t('Local demo');
  $('#nav').setAttribute('aria-label', t('Main navigation'));
  $('#language').textContent = language === 'ar' ? 'English' : 'العربية';
  $('#language').lang = language === 'ar' ? 'en' : 'ar';
}
function render() {
  clearTimeout(activationExpiryTimer);
  staffActivationObserver?.disconnect();
  locationMap?.remove();
  locationMap = null;
  if (companyPrefix && route() !== 'documents' && (state.canManageCompany || !state.isCompanyOwner) && isMobileDevice()) {
    location.replace(companyPrefix + '/employee');
    return;
  }
  const page = route();
  const logout = $('#logout-form');
  logout.hidden = !(superAdmin || state.admin);
  if (superAdmin) $('.management-topbar-actions').append(logout);
  logout.action = companyPrefix ? companyPrefix + '/logout' : '/admin/logout';
  $('#management-notifications').hidden = superAdmin;
  if (!superAdmin) {
    drawManagementAlerts();
    void refreshManagementAlerts();
  }
  $('#logout-button').textContent = t('Sign out');
  $('#account-profile-link').textContent = t('View personal profile') + ' ♙';
  $('#account-password-link').textContent = t('Change password') + ' ⚿';
  if (!accountIdentity) void loadAccountIdentity();
  else $('#account-name').textContent = accountDisplayName();
  const logo = state.organization?.logo;
  const workspaceIcon = $('.workspace-icon');
  workspaceIcon.style.backgroundColor = '';
  workspaceIcon.classList.toggle('has-logo', Boolean(logo));
  if (logo) {
    const image = document.createElement('img');
    image.className = 'workspace-logo';
    image.alt = '';
    image.addEventListener('load', () => {
      if (image.isConnected) matchLogoPreviewBackground(image);
    }, { once: true });
    workspaceIcon.replaceChildren(image);
    image.src = logo;
  } else {
    workspaceIcon.textContent = '▦';
  }
  if (superAdmin) {
    const organization = page === 'settings/organization';
    $('#crumb').textContent = t(organization ? 'Organization information' : superAdminPages[page][0]);
    const homeLink = '<a class="settings-back" href="#home">' + t('Overview') + '</a>';
    $('#main').innerHTML = organization ? '<a class="settings-back" href="#settings">' + t('Back to Settings') +
      '</a><h1>' + t('Organization information') + '</h1>' + organizationSettings() :
      page === 'settings' ? homeLink + settings() : page === 'partners' ? homeLink + partnersPage() :
      '<h1>' + t('Overview') + '</h1><div class="settings-grid super-admin-tiles">' +
      ['partners', 'settings'].map(key => {
        const [label, icon] = superAdminPages[key];
        return '<a class="settings-tile" href="#' + key + '"><span class="settings-icon" aria-hidden="true">' +
          icon + '</span><strong>' + t(label) + '</strong></a>';
      }).join('') + '</div>';
    $('#main').setAttribute('aria-busy', 'false');
    mountManagerUX({ state, superAdmin, language, save, companyPrefix, staffName, t, scheduleWeek, accountIdentity, bindSideDrawer });
    return;
  }
  const section = settingsSections[page];
  const reportSection = reportSections[page] ?? reportTypes[page];
  const records = page === 'reports/attendance-records';
  const followUp = page === 'reports/attendance-follow-up' || records;
  const navPage = section ? 'settings' : reportSection ? 'reports' : page === 'staff-profile' ? 'staff' : page;
  const companyNames=[state.organization?.name,state.company];
  $('#company').textContent = companyNames.find(n=>typeof n==='string'&&n.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n.trim()))||(language==='ar'?'المنشأة':'Company');
  $('#crumb').textContent = t((section ?? reportSection ?? (page === 'account' ? ['Personal profile'] : pages[page === 'staff-profile' ? 'staff' : page]))[0]);
  const expired = expiredDocumentCount();
  const expiredLabel = new Intl.NumberFormat(language).format(expired);
  const documentAlert = expired ? '<span class="nav-document-alert" role="img" aria-label="' +
    esc(t('Expired documents') + ': ' + expiredLabel) + '">' + expiredLabel + '</span>' : '';
  const pendingFollowUps=pendingFollowUpCount(state,state.today);
  const followUpBadge=pendingFollowUps?'<span class="nav-follow-up-badge" role="img" aria-label="'+esc((language==='ar'?'مهام متابعة غير مكتملة: ':'Pending follow-ups: ')+new Intl.NumberFormat(language).format(pendingFollowUps))+'"><bdi>'+esc(pendingFollowUps>99?'99+':new Intl.NumberFormat(language).format(pendingFollowUps))+'</bdi></span>':'';
  $('#nav').innerHTML = Object.entries(pages).filter(([key]) => key !== 'mobile' && (key !== 'payroll' || state.canViewPayroll !== false)).map(([key, [name, icon]]) =>
    '<a href="#' + key + '"' + (navPage === key ? ' aria-current="page"' : '') + '><span aria-hidden="true">' +
    icon + '</span>' + t(name) + (key === 'documents' ? documentAlert : key==='followup'?followUpBadge:'') + '</a>').join('');
  $('#main').innerHTML = section
    ? '<a class="settings-back" href="#settings">' + t('Back to Settings') + '</a><h1>' +
      t(section[0]) + '</h1>' + section[3]()
    : reportSection ? '<a class="settings-back" href="#' + 'reports' + '">' +
      t('Back to Reports') + '</a><h1>' + t(reportSection[0]) + '</h1>' +
      (page === 'reports/catalog' ? reportLinks(reportTypes) : followUp ? attendanceFollowUp() : page === 'reports/attendance' ?
        '<div id="attendance-report-result"></div>' + attendanceReportDialog() : page === 'reports/absence' ?
        '<div id="absence-report-result"></div>' + absenceReportDialog() : page === 'reports/issued' ? issuedReports() : '') : views[page]();
  if (page === 'payroll' && state.canViewPayroll !== false) mountPayroll({ state, language, esc, t, save, say, companyPrefix, downloadReport, render, bindSideDrawer });
  if(state.companyView) $('#main').insertAdjacentHTML('afterbegin','<aside class="card" style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px"><strong>'+t('Viewing as account administrator')+'</strong><form method="post" action="'+companyPrefix+'/logout"><button type="submit" class="button secondary compact">'+t('Return to super admin')+'</button></form></aside>');
  const attendanceReport = $('#attendance-report-dialog');
  if (attendanceReport) mountAttendanceReport(attendanceReport);
  if (followUp) {
    const panel = $('#attendance-follow-up');
    mountAttendanceFollowUp(panel, records);
  }
  if (page === 'reports/issued') mountIssuedReports();
  const documentDialog = $('#document-upload-dialog');
  if (documentDialog) {
    for (const group of document.querySelectorAll('[data-document-branch]')) {
      group.ontoggle = () => {
        if (group.open) openDocumentBranches.add(group.dataset.documentBranch);
        else openDocumentBranches.delete(group.dataset.documentBranch);
      };
    }
    $('#open-document-upload').onclick = () => {const form=$('#document-upload-form');form.reset();delete form.dataset.replaceId;form.elements.branchId.closest('label').hidden=false;form.elements.file.multiple=true;$('#document-upload-title').textContent=t('Upload document');documentDialog.showModal();};
    const copyWallet = $('#copy-document-wallet');
    if (copyWallet) copyWallet.onclick = async () => {
      const status = $('#copy-document-wallet-status');
      try {
        await navigator.clipboard.writeText(copyWallet.dataset.walletUrl);
        status.textContent = language === 'ar' ? 'تم نسخ الرابط' : 'Link copied';
      } catch {
        status.textContent = language === 'ar' ? 'تعذّر نسخ الرابط' : 'Could not copy the link';
      }
    };
    $('#close-document-upload').onclick = () => {if(!$('#document-upload-form').dataset.busy)documentDialog.close();};
    documentDialog.addEventListener('cancel',e=>{if($('#document-upload-form').dataset.busy)e.preventDefault();});
  }
  const absenceReport = $('#absence-report-dialog');
  if (absenceReport) mountAbsenceReport(absenceReport);
  if (page === 'requests') {
    const panel = $('#manager-device-requests');
    panel.requestMarkup = requestInbox(requestManagerSession);
    refreshRequestInbox(panel);
  }
  if ($('#location-form')) mountLocationMap($('#location-form'));
  const attendanceDialog = $('#attendance-method-dialog');
  if (attendanceDialog) {
    const closeDrawer = bindSideDrawer(attendanceDialog, () => {
      const method = attendanceMethod;
      attendanceMethod = undefined;
      render();
      $('[data-edit-attendance-method="' + method + '"]')?.focus();
    });
    attendanceDialog.querySelector('#close-attendance-method').onclick = closeDrawer;
    attendanceDialog.showModal();
  }
  filterScheduleRows();
  const assignmentDialog = $('#schedule-assignment-dialog');
  if (assignmentDialog) {
    const closeDrawer = bindSideDrawer(assignmentDialog, closeScheduleAssignment);
    assignmentDialog.querySelector('#close-schedule-assignment').onclick = closeDrawer;
    assignmentDialog.showModal();
  }
  const period = $('#period-dialog');
  const roleDialog = $('#role-dialog');
  if (roleDialog) {
    roleDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeRoleDialog();
    });
    roleDialog.querySelector('[data-cancel-role]').onclick = closeRoleDialog;
    const search = roleDialog.querySelector('#branch-role-search');
    if (search) search.oninput = () => {
      const query = search.value.trim().toLocaleLowerCase();
      for (const person of roleDialog.querySelectorAll('.branch-role-person')) person.hidden = !person.textContent.toLocaleLowerCase().includes(query);
    };
    roleDialog.showModal();
  }
  for (const group of document.querySelectorAll('[data-staff-branch]')) {
    group.addEventListener('toggle', () => {
      if (group.open) openStaffBranches.add(group.dataset.staffBranch);
      else openStaffBranches.delete(group.dataset.staffBranch);
    });
  }
  const activationLayouts = [];
  let nextActivationExpiry=Infinity;
  for (const wrap of document.querySelectorAll('.staff-directory .table-wrap, .partners-card .table-wrap')) {
    const buttons = [...wrap.querySelectorAll('[data-staff-link], [data-partner-link]')];
    if (!buttons.length) continue;
    const layout = document.createElement('div');
    layout.className = 'staff-table-layout';
    wrap.before(layout);
    layout.append(wrap);
    const rail = document.createElement('div');
    rail.className = 'staff-activation-rail';
    layout.append(rail);
    const entries = buttons.map(button => {
      const row = button.closest('tr');
      const expiry=Number(button.dataset.activationExpiry||Infinity);
      if(expiry>Date.now())nextActivationExpiry=Math.min(nextActivationExpiry,expiry);
      button.setAttribute('aria-label', t(activationExpired(Number(button.dataset.activationExpiry||Infinity))?'Link expired':'Copy activation link') + ' · ' + (row.querySelector('.staff-profile-name')??row.cells[0]).textContent);
      const group=button.closest('.activation-shortcuts')??button;
      group.querySelector?.('[data-staff-send],[data-partner-send]')?.setAttribute('aria-label',t('Resend activation email')+' · '+(row.querySelector('.staff-profile-name')??row.cells[0]).textContent);
      rail.append(group);
      return { button:group, row };
    });
    activationLayouts.push({ layout, entries });
    wrap.addEventListener('scroll', () => requestAnimationFrame(alignActivationButtons), { passive: true });
    layout.closest('.staff-directory, .partners-card').addEventListener('ux-filtered', () => requestAnimationFrame(alignActivationButtons));
  }
  const alignActivationButtons = () => {
    for (const { layout, entries } of activationLayouts) {
      const top = layout.getBoundingClientRect().top;
      for (const { button, row } of entries) {
        const bounds = row.getBoundingClientRect();
        button.style.top = (bounds.top - top + bounds.height / 2) + 'px';
        const viewport = row.closest('.table-wrap').getBoundingClientRect();
        button.hidden = row.hidden || !bounds.height || (bounds.top+bounds.height/2) < row.closest('table').querySelector('thead').getBoundingClientRect().bottom || (bounds.top+bounds.height/2) > viewport.bottom;
      }
    }
  };
  const refreshActivationExpiry=()=>{
    let next=Infinity;
    for(const button of document.querySelectorAll('[data-activation-expiry]')){
      const expiry=Number(button.dataset.activationExpiry||Infinity);
      if(!activationExpired(expiry)){next=Math.min(next,expiry);continue;}
      button.textContent=t('Link expired');
      button.setAttribute('aria-label',t('Link expired'));
    }
    if(Number.isFinite(next))activationExpiryTimer=setTimeout(refreshActivationExpiry,Math.max(0,next-Date.now()));
  };
  if(Number.isFinite(nextActivationExpiry))activationExpiryTimer=setTimeout(refreshActivationExpiry,Math.max(0,nextActivationExpiry-Date.now()));
  if (activationLayouts.length) {
    staffActivationObserver = new ResizeObserver(alignActivationButtons);
    for (const { layout } of activationLayouts) {
      staffActivationObserver.observe(layout);
      staffActivationObserver.observe(layout.querySelector('table'));
    }
    requestAnimationFrame(alignActivationButtons);
  }
  if($('#import-staff'))$('#import-staff').onclick=()=>openEmployeeImport({state,language,esc,t,companyPrefix,onComplete:async()=>{const response=await fetch(companyPrefix+'/api/state');if(response.ok){state=await response.json();render();}}});
  const staffDialog = $('#staff-dialog');
  if (staffDialog) {
    $('#cancel-staff-draft').onclick=closeStaffDialog;
    mountStaffPages($('#staff-form'),staffDialog);
    if (editingStaff) {
      const form = $('#staff-form');
      const person = editingStaff;
      const values = { ...person, permissionRole:person.role??'', nameAr: person.nameAr || person.name, nameEn: person.nameEn || person.name,
        birthDateHijri: person.birthDate ? dateText(hijriBirthDate(Date.parse(person.birthDate))) : '',
        salary: person.salary?.monthlyBase, allowances: person.salary?.monthlyAllowances,
        gosiSaned: person.gosiSaned === false ? 'no' : 'yes',
        probation: person.probationDays, annualLeave: person.annualLeaveDays };
      for (const field of form.elements) {
        if (!field.name || ['defaultPeriodId','attendanceExempt'].includes(field.name)) continue;
        field.value = values[field.name] ?? '';
        if (!field.value) field.required = false;
      }
      for (const name of ['contractTerm', 'contractType']) {
        form.elements[name].dispatchEvent(new Event('change', { bubbles: true }));
      }
      updateSalaryTotal(form);
      updateStaffIdentityFields(form);
      form.initialValues = new FormData(form);
    } else {
      const defaultRole=(state.staffRoles??roleOptions).find(role=>['Employee','موظف'].includes(role));if($('#staff-form').elements.permissionRole&&defaultRole)$('#staff-form').elements.permissionRole.value=defaultRole;
      const { nameAr, nameEn, gender } = $('#staff-form').elements;
      const suggest = () => {
        gender.value = suggestStaffGender(nameAr.value) || suggestStaffGender(nameEn.value);
      };
      nameAr.addEventListener('change', suggest);
      nameEn.addEventListener('change', suggest);
      gender.addEventListener('change', () => {
        nameAr.removeEventListener('change', suggest);
        nameEn.removeEventListener('change', suggest);
      });
    }
    updateSalaryTotal($('#staff-form'));
    const bankForm = $('#staff-form');
    if(!editingStaff&&state.locations.length===1&&bankForm.elements.branchId)bankForm.elements.branchId.value=state.locations[0].id;
    updateStaffManagers(bankForm,true);
    updateStaffIdentityFields(bankForm);
    if (!bankForm.elements.gosiSaned.value) bankForm.elements.gosiSaned.value='yes';
    const updateGosiRequired=()=>{bankForm.elements.gosiBase.required=!bankForm.elements.gosiBase.disabled&&['old','new'].includes(bankForm.elements.gosiScheme.value);};
    bankForm.elements.gosiScheme.addEventListener('change',updateGosiRequired);
    updateGosiRequired();
    const updateBank = () => {
      const value = normalizeIban(bankForm.elements.iban.value);
      bankForm.querySelector('[data-staff-bank]').value = ibanBank(value, language) ||
        (value.length >= 6 ? t('Bank not identified') : '');
      bankForm.elements.iban.setCustomValidity(value && !validSaudiIban(value) ? t('Enter a valid Saudi IBAN.') : '');
    };
    bankForm.elements.iban.addEventListener('input', updateBank);
    bankForm.elements.iban.addEventListener('blur', () => {
      bankForm.elements.iban.value = normalizeIban(bankForm.elements.iban.value);
      updateBank();
    });
    updateBank();
    const leavePreview=$('.staff-balance-preview');
    const updateLeavePreview=()=>{
      const values=$('#staff-form').elements,current=values.currentLeaveBalance.value,annual=values.annualLeave.value,joined=values.joinDate.value;
      if(annual===''||!joined){leavePreview.textContent=t('Enter joining date and entitlement to preview balances.');return;}
      const result=leaveBalancePreview({id:'preview',joinDate:joined,annualLeaveDays:Number(annual),...(current!==''?{currentLeaveBalance:Number(current),currentLeaveBalanceDate:state.today}:{})},state.today,state.leavePreferences);
      const number=new Intl.NumberFormat(language,{maximumFractionDigits:2});
      if(result.exceedsAccrued){leavePreview.textContent=t('The entered balance exceeds the maximum accrued balance for this joining date and entitlement.')+' '+t('Maximum accrued balance')+': '+number.format(result.maximum);return;}
      const b=result.balance;
      leavePreview.innerHTML=b?'<strong>'+t('Balance preview')+'</strong><dl class="leave-entry-preview">'+[
        ['Year opening balance',number.format(b.opening)],['Opening balance expiry date',b.openingExpires],
        ['Current-year balance',number.format(b.current)],['Current-year balance expiry date',b.currentExpires],
        ['Total accrued balance',number.format(b.accrued)],
      ].map(([label,value])=>'<div><dt>'+esc(t(label))+'</dt><dd><bdi>'+esc(dateText(value)||'—')+'</bdi></dd></div>').join('')+'</dl>':t('Enter joining date and entitlement to preview balances.');
    };
    $('#staff-form').addEventListener('input',updateLeavePreview);$('#staff-form').addEventListener('change',updateLeavePreview);updateLeavePreview();
    staffDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeStaffDialog();
    });
    staffDialog.showModal();
  }
  if (period) {
    const form = $('#period-form');
    updatePeriodPreview(form);
    const pickers = form.querySelectorAll('.period-time-picker');
    for (const picker of pickers) {
      picker.addEventListener('toggle', () => {
        if (!picker.open) return;
        for (const other of pickers) if (other !== picker) other.open = false;
        for (const wheel of picker.querySelectorAll('.period-time-wheel')) {
          const selected = wheel.querySelector('[aria-pressed="true"]');
          wheel.scrollTop += selected.getBoundingClientRect().top - wheel.getBoundingClientRect().top;
        }
      });
    }
    period.addEventListener('click', event => {
      for (const picker of pickers) if (!picker.contains(event.target)) picker.open = false;
      const picker = event.target.closest('.period-time-picker');
      if (!picker) return;
      if (event.target.closest('[data-close-time-picker]')) {
        picker.open = false;
        picker.querySelector('summary').focus();
      }
      const option = event.target.closest('[data-time-part]');
      if (!option) return;
      const field = picker.querySelector('input');
      const parts = periodTimeParts(field.value);
      parts[option.dataset.timePart] = Number(option.dataset.timeValue);
      const hour = state.timeFormat === '24' ? parts.hour : parts.hour % 12 + parts.half * 12;
      field.value = twoTimeDigits(hour) + ':' + twoTimeDigits(parts.minute);
      picker.querySelector('.period-time-value').textContent = periodTimeLabel(parts);
      picker.querySelector('[data-time-part="' + option.dataset.timePart + '"][aria-pressed="true"]').setAttribute('aria-pressed', 'false');
      option.setAttribute('aria-pressed', 'true');
      updatePeriodPreview(form);
    });
    const closeDrawer = bindSideDrawer(period, () => { addingPeriod = false; render(); $('#add-period')?.focus(); });
    period.querySelector('#close-period').onclick = closeDrawer;
    form.querySelectorAll('.period-window').forEach(section => section.addEventListener('toggle', () => {
      if (section.open) for (const other of form.querySelectorAll('.period-window[open]')) if (other !== section) other.open = false;
    }));
    period.addEventListener('cancel', event => {
      event.preventDefault();
      const opened = form.querySelector('.period-time-picker[open]');
      if (opened) {
        opened.open = false;
        opened.querySelector('summary').focus();
        return;
      }
    });
    period.showModal();
  }
  $('#main').setAttribute('aria-busy', 'false');
  mountManagerUX({ state, superAdmin, language, save, companyPrefix, staffName, t, scheduleWeek, accountIdentity, bindSideDrawer });
  mountSetupGuide({ state, superAdmin, language, save });
  updateApprovalRowFeedback();
}
function locate() {
  if (!navigator.geolocation) return Promise.reject(new Error('Location is unavailable in this browser.'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
    ({ code }) => reject(new Error(code === 1 ? 'Allow location access and try again.' : 'Could not get your location. Try again.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  ));
}
async function run(control, action, success, onError = error => say(error.message, true)) {
  control.disabled = true;
  try { await action(); if (success) say(success); }
  catch (error) { actionError(t(error.message)); onError(error); }
  finally { control.disabled = false; }
}

applyLanguage();
$('#language').onclick = () => {
  const form = $('#location-form') || $('#main form');
  const draft = form ? new FormData(form) : null;
  language = language === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem('dawamak-language', language); } catch { /* Storage can be disabled. */ }
  applyLanguage();
  if (!state) return;
  render();
  const replacement = form && document.getElementById(form.id);
  if (draft && replacement) {
    for (const field of replacement.elements) {
      if (field.type === 'checkbox') field.checked = draft.getAll(field.name).includes(field.value);
      else if (draft.has(field.name)) field.value = draft.get(field.name);
    }
    replacement.dispatchEvent(new Event('location-update'));
    replacement.elements.namedItem('type')?.dispatchEvent(new Event('change', { bubbles: true }));
  }
};
window.addEventListener('hashchange', event => {
  if (!state) return;
  const previous = new URL(event.oldURL).hash.slice(1).split('?')[0];
  const next = new URL(event.newURL).hash.slice(1).split('?')[0];
  if (previous !== next) {
    resetPageFilters();
    if (previous === 'attendance') {
      attendanceDate = undefined;
      attendanceSelectedEmployees = null;
      attendanceSearch = attendanceListBranch = attendanceJobTitle = attendanceSort = scheduleSearch = scheduleBranch = '';
      attendanceTab = 'daily';
      scheduleWeek = 0;
      selectedScheduleCell = undefined;
    }
    if (previous === 'requests') requestStatus = 'Pending';
    if (previous === 'leaves') leaveBalanceSearch = leaveBalanceBranch = '';
    if (previous === 'followup' || previous === 'tasks') {
      followUpFilter = 'new';
      followUpKind = followUpAssignee = 'all';
    }
    if (previous.startsWith('staff/')) profileAttendanceDate = undefined;
    if (previous === 'documents') openDocumentBranches.clear();
    if (previous === 'settings/organization') organizationTab = 'overview';
    if (previous === 'settings/requests') requestSettingsTab = 'requests';
    if (previous === 'settings/leave-types' || previous === 'settings/requests') leavePreferencesTab = 'types';
    if (previous === 'settings/notifications') notificationPreferencesTab = 'notifications';
    if (previous === 'settings/punch-methods') { punchMethodsTab = 'methods'; editingBranch = editingLocationId = undefined; }
  }
  render();
});
function refreshVisibleRequests() {
  const panel = $('#manager-device-requests');
  if (panel && !document.hidden && !panel.querySelector('.request-row-actions button:disabled')) refreshRequestInbox(panel);
}
window.setInterval(refreshVisibleRequests, 5000);
window.setInterval(()=>{if(!document.hidden && route()==='followup' && !document.querySelector('dialog[open]') && lastFollowUpRenderDate!==followUpDate.format(Date.now())) render();},30000);
window.setInterval(refreshManagementAlerts, 30000);
$('#management-notifications').onclick = async () => {
  drawManagementAlerts();
  if ($('#management-notification-dialog').hidden) showManagementPopup(managementAlerts, true);
  else closeManagementPopup();
  await refreshManagementAlerts();
};
$('#close-management-notifications').onclick = closeManagementPopup;
const notificationPanel=$('#management-notification-dialog');
const pausePopup=()=>clearTimeout(managementPopupTimer);
const resumePopup=()=>{if(notificationPanel.dataset.manual!=='true'&&!notificationPanel.matches(':hover')&&!notificationPanel.contains(document.activeElement))managementPopupTimer=setTimeout(closeManagementPopup,notificationDisplay(state.notificationSettings?.display).seconds*1000);};
notificationPanel.addEventListener('pointerenter',pausePopup);notificationPanel.addEventListener('focusin',pausePopup);notificationPanel.addEventListener('pointerleave',resumePopup);notificationPanel.addEventListener('focusout',()=>setTimeout(resumePopup,0));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeManagementPopup(); });
document.addEventListener('click', event => { if (!event.target.closest('#management-notification-dialog, #management-notifications')) closeManagementPopup(); });
$('#close-request-rejection').onclick = () => $('#request-rejection-dialog').close();
$('#request-rejection-form').onsubmit = event => {
  event.preventDefault();
  const target = rejectionTarget;
  if (!target) return;
  const rejectionNote = new FormData(event.target).get('rejectionNote');
  run(event.submitter, async () => {
    if (target.deviceStaff) {
      const response = await fetch(companyPrefix + '/api/employee/device-approval', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: target.deviceStaff, requestId: target.deviceRequest, decision: 'reject', rejectionNote }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const panel = $('#manager-device-requests');
      if (panel) await refreshRequestInbox(panel);
    } else {
      await save('decision', { id: target.id, status: 'Declined', rejectionNote });
    }
    $('#request-rejection-dialog').close();
    void refreshManagementAlerts();
  }, 'Decision saved.', error => { $('#request-rejection-error').textContent = t(error.message); });
};
$('#management-notification-list').onclick = event => {
  const control = event.target.closest('[data-management-read-all], [data-management-read], [data-management-alert]');
  if (!control) return;
  const store = managementReadStore();
  if (control.hasAttribute('data-management-read-all')) managementAlerts.forEach(alert=>store.read.add(alert.id));
  else store.read.add(control.dataset.managementRead ?? control.dataset.managementAlert);
  store.save();
  documentNotices.update(unreadManagementDocuments(),managementDocumentIdentity);
  drawManagementAlerts();
  if (!control.hasAttribute('data-management-alert')) return;
  requestStatus = 'Pending';
  closeManagementPopup();
  render();
};
document.addEventListener('visibilitychange', refreshVisibleRequests);
window.addEventListener('focus', async () => {
  const page = route();
  refreshVisibleRequests();
  const collection = superAdmin ? 'partners' : 'staff';
  if (!state || page !== collection || $('#create-partner')?.open || $('#staff-dialog')?.open ||
      !state[collection].some(person => superAdmin ? !person.active : person.canCopyActivation)) return;
  const current = state;
  try {
    const response = await fetch(companyPrefix + (superAdmin ? '/api/partners' : '/api/state'), { cache: 'no-store' });
    if (!response.ok) return;
    const updated = await response.json();
    if (state !== current || route() !== page || $('#create-partner')?.open || $('#staff-dialog')?.open) return;
    if (JSON.stringify(updated[collection]) === JSON.stringify(current[collection])) return;
    state = updated;
    render();
  } catch { /* The displayed list is still available when refresh fails. */ }
});
$('#main').addEventListener('click', (event) => {
  const leaveAdjustment = event.target.closest('[data-adjust-leave-balance]');
  if (leaveAdjustment) { openLeaveBalanceAdjustment(leaveAdjustment.dataset.adjustLeaveBalance); return; }
  if (event.target.closest('[data-rejected-punches]')) { void openRejectedPunches(); return; }
  const staffRow = event.target.closest('.staff-directory tbody tr');
  if (staffRow && !event.target.closest('details, summary, a, button, input, select, textarea, label')) {
    const profileLink = staffRow.querySelector('.staff-profile-name');
    if (profileLink) { location.hash = profileLink.hash; return; }
  }

  if (event.target.closest('#restart-setup-guide')) { void restartSetupGuide(); return; }
  const editNotification = event.target.closest('[data-edit-notification]');
  if (editNotification) {
    openNotificationSettings(editNotification.dataset.editNotification);
    return;
  }
  const preference = event.target.closest('[data-notification-preference]');
  if (preference) {
    const key=preference.dataset.notificationPreference;
    if (key==='attendance-report'||key==='follow-up-mail') {
      run(preference,()=>save(key+'-settings',{enabled:preference.getAttribute('aria-checked')!=='true'}),'Notification preference saved.');
      return;
    }
    run(preference, () => save(preference.dataset.notificationPreference === 'encouragement' ? 'encouragement-settings' : 'notification-preferences', {
      key: preference.dataset.notificationPreference, enabled: preference.getAttribute('aria-checked') !== 'true',
    }), 'Notification preference saved.');
    return;
  }
  const removeLogo = event.target.closest('[data-remove-organization-logo]');
  if (removeLogo) {
    const form = removeLogo.form;
    form.elements.logo.value = '';
    form.elements.removeLogo.value = 'true';
    const preview = form.querySelector('.organization-logo');
    preview.removeAttribute('src');
    preview.parentElement.style.backgroundColor = '';
    preview.hidden = true;
    removeLogo.hidden = true;
    form.elements.logo.focus();
    return;
  }
  const selectAttendance = event.target.closest('#attendance-select');
  if (selectAttendance) {
    openAttendanceSelection();
    return;
  }
  const sortButton = event.target.closest('[data-attendance-sort]');
  if (sortButton) {
    const key = sortButton.dataset.attendanceSort;
    attendanceSort = attendanceSort === key ? '' : key;
    $('#attendance-results').innerHTML = attendanceTable(attendanceDate || state.today);
    mountAttendanceFilters({state, language, companyPrefix, t});
    $('[data-attendance-sort="' + key + '"]')?.focus();
    return;
  }
  const dateStep = event.target.closest('[data-attendance-step]');
  if (dateStep) {
    const step = dateStep.dataset.attendanceStep;
    const day = new Date((attendanceDate || state.today) + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() + Number(step));
    attendanceDate = day.toISOString().slice(0, 10);
    render();
    $('[data-attendance-step="' + step + '"]').focus();
    return;
  }
  const leaveTab = event.target.closest('[data-leave-preferences-tab]');
  if (leaveTab) {
    leavePreferencesTab = leaveTab.dataset.leavePreferencesTab;
    render();
    $('[data-leave-preferences-tab="' + CSS.escape(leavePreferencesTab) + '"]')?.focus();
    return;
  }
  const leaveSwitch = event.target.closest('[data-leave-status]');
  if (leaveSwitch) {
    const name = leaveSwitch.dataset.leaveStatus;
    run(leaveSwitch, async () => {
      await save('leave-types/status', { name, active: leaveSwitch.getAttribute('aria-checked') !== 'true' });
      $('[data-leave-status="' + CSS.escape(name) + '"]')?.focus();
    }, 'Leave type updated.');
    return;
  }
  if (event.target.closest('#toggle-partner-password')) {
    const control = $('#toggle-partner-password');
    const visible = control.getAttribute('aria-pressed') !== 'true';
    for (const field of ['password', 'confirmation']) $('#partner-form').elements[field].type = visible ? 'text' : 'password';
    control.setAttribute('aria-pressed', String(visible));
    control.textContent = t(visible ? 'Hide password' : 'Show password');
    return;
  }
  const create = event.target.closest('[data-create-catalog]');
  if (create) {
    const dialog = $('#create-' + create.dataset.createCatalog);
    if (create.dataset.createCatalog === 'partner') {
      const form = $('#partner-form');
      form.reset();
      form.querySelector('#partner-password-fields').hidden = true;
      form.querySelector('#partner-password-fields').disabled = true;
      delete form.dataset.partnerId;
      $('#partner-delete-button').hidden=true;
      delete $('#partner-delete-button').dataset.removePartner;
      $('#partner-dialog-title').textContent = t('Add company');
      form.querySelector('button.primary').textContent = t('Add company');
    }
    dialog.showModal();
    return;
  }
  const close = event.target.closest('[data-close-catalog]');
  if (close) {
    close.closest('dialog').close();
    return;
  }
  if(event.target.closest('[data-edit-company]')){
    if(!state.isCompanyOwner)return;
    const expectedName=state.company,L=(ar,en)=>language==='ar'?ar:en,dialog=document.createElement('dialog');dialog.className='catalog-dialog';
    dialog.innerHTML='<header><h2>'+L('تعديل اسم الشركة','Edit company name')+'</h2><button type="button" class="button secondary compact" data-close aria-label="'+t('Close')+'">×</button></header><form><label>'+t('Company name')+'<input name="name" maxlength="120" required value="'+esc(expectedName)+'"></label>'+button(t('Save'))+'</form>';
    document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.querySelector('form').onsubmit=e=>{e.preventDefault();e.stopPropagation();run(e.submitter,async()=>{await save('organization/name',{name:new FormData(e.currentTarget).get('name'),expectedName});dialog.close();});};dialog.showModal();return;
  }
  const permissionButton=event.target.closest('[data-role-permissions]');
  if(permissionButton){
    const role=permissionButton.dataset.rolePermissions,values=permissionsFor(state,role),owner=state.isCompanyOwner,canEdit=owner||state.canManageRolePermissions,expectedVersion=state.rolePermissions?.[role]?.version??0;
    const dialog=document.createElement('dialog');dialog.className='catalog-dialog role-permissions-dialog';
    const L=(ar,en)=>language==='ar'?ar:en;
    dialog.innerHTML='<header><h2>'+L('صلاحيات الدور: ','Role permissions: ')+esc(t(role))+'</h2><button type="button" class="button secondary compact" data-close aria-label="'+t('Close')+'">×</button></header><p class="hint">'+L('صلاحيات تنفيذ الإجراءات ضمن الفروع المعينة. لا تغيّر نطاق عرض البيانات الحالي أو مسؤول سلسلة الموافقات. توزيع الصلاحيات متاح لمسؤول الحساب ومن يفوضه. صلاحية محفظة المستندات تشمل جميع مستندات المنشأة.','Action permissions apply within assigned branches. Existing data visibility and approval-chain assignments remain unchanged. The owner can delegate permission management. Document wallet permission covers all company documents.')+'</p><form><details class="role-permission-group" name="role-permission-sections"><summary>'+L('إدارة الدور','Role administration')+'</summary><label class="role-permission-row"><span>'+L('إداري','Administrator')+'</span><input type="checkbox" role="switch" name="administrator"'+(roleIsAdministrator(state,role)?' checked':'')+(!canEdit?' disabled':'')+'></label><p class="hint">'+L('يظهر أصحاب هذا الدور في قائمة الإداريين وإسناد المهام، ضمن فروعهم. صلاحيات الإجراءات تحدد أدناه.','Members appear in administrator and assignment lists within their assigned branches. Action permissions are selected below.')+'</p><label class="role-permission-row"><span>'+L('توزيع الصلاحيات','Distribute permissions')+'</span><input type="checkbox" role="switch" name="managePermissions"'+(state.rolePermissions?.[role]?.managePermissions?' checked':'')+(!owner?' disabled':'')+'></label><p class="hint">'+L('مسؤول الحساب وحده يمنح هذه الصلاحية ويسحبها. يتيح تفعيلها إدارة بقية صلاحيات جميع الأدوار في المنشأة.','Only the account owner can grant or revoke this permission. It allows management of all other role permissions across the company.')+'</p>'+ (owner&&!(state.jobTitles??[]).includes(role)?'<button type="button" class="button secondary compact" data-create-role-title>'+L('إضافة مسمى وظيفي بهذا الاسم','Add a job title with this name')+'</button>':'') + '</details>'+rolePermissionGroups.map(([ar,en,items])=>'<details class="role-permission-group" name="role-permission-sections"><summary>'+esc(L(ar,en))+'</summary><div class="role-permission-items">'+items.map(([key,ar,en])=>'<label class="role-permission-row"><span>'+esc(L(ar,en))+'</span><input type="checkbox" role="switch" name="'+key+'"'+(values[key]?' checked':'')+(!canEdit?' disabled':'')+'></label>').join('')+'</div></details>').join('')+(canEdit?'<button class="button primary" type="submit">'+t('Save')+'</button>':'<p class="hint">'+L('التعديل متاح لمسؤول الحساب أو المفوض بتوزيع الصلاحيات.','The owner or a permission administrator can edit permissions.')+'</p>')+'</form>';
    document.body.append(dialog);const titleAction=dialog.querySelector('[data-create-role-title]');if(titleAction)titleAction.onclick=()=>run(titleAction,async()=>{await save('job-titles',{name:role});titleAction.remove();});dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
    dialog.querySelectorAll('.role-permission-group').forEach(group=>group.addEventListener('toggle',()=>{if(group.open)dialog.querySelectorAll('.role-permission-group').forEach(other=>{if(other!==group)other.open=false;});}));
    dialog.querySelector('form').onsubmit=e=>{e.preventDefault();e.stopPropagation();if(!canEdit)return;const form=e.currentTarget;run(e.submitter,async()=>{await save('role-permissions',{role,expectedVersion,administrator:form.elements.administrator.checked,...(owner?{managePermissions:form.elements.managePermissions.checked}:{}),values:Object.fromEntries(Object.keys(values).map(key=>[key,form.elements[key].checked]))});dialog.close();});};dialog.showModal();return;
  }
  const renameDocument = event.target.closest('[data-rename-document]');
  if (renameDocument) {
    const item = state.documents.find(document => document.id === renameDocument.dataset.renameDocument);
    if (!item) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'catalog-dialog';
    dialog.setAttribute('aria-labelledby','document-rename-title');
    dialog.innerHTML = '<header><h2 id="document-rename-title">' + t('Edit document') +
      '</h2><button type="button" class="button secondary compact" data-close aria-label="' + t('Close') +
      '">×</button></header><form><label>' + t('Document name') +
      '<input name="documentName" required maxlength="180" dir="auto" autofocus></label>' + documentBranchField(item.branchId || '') +
      '<div class="document-expiry-choice"><label>' + t('Document expiry date') + '<input name="expiresOn" type="date"></label>' +
      '<button type="button" class="button secondary compact" data-no-expiry aria-pressed="false">' +
      (language === 'ar' ? 'لا يوجد تاريخ انتهاء' : 'No expiry date') + '</button></div>' +
      '<p role="status"></p><button class="button primary" type="submit">' + t('Save') + '</button></form>';
    const form = dialog.querySelector('form');
    form.elements.documentName.value = item.name;
    form.elements.expiresOn.value = item.expiresOn || '';
    const noExpiryButton = dialog.querySelector('[data-no-expiry]');
    const explicitlyUndated = !item.expiresOn && Boolean(item.expiryConfirmedAt);
    let noExpiry = explicitlyUndated;
    const syncExpiryChoice = () => {
      noExpiryButton.setAttribute('aria-pressed',String(noExpiry));
      form.elements.expiresOn.disabled = noExpiry;
      form.elements.expiresOn.required = !noExpiry && explicitlyUndated;
    };
    noExpiryButton.onclick = () => {
      noExpiry = !noExpiry;
      syncExpiryChoice();
    };
    syncExpiryChoice();
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => {
      dialog.remove();
      $('[data-rename-document="' + CSS.escape(item.id) + '"]')?.focus();
    }, {once:true});
    form.onsubmit = event => {
      event.preventDefault();
      run(event.submitter, async () => {
        const branchId = form.elements.branchId.value;
        const expiresOn = noExpiry ? '' : form.elements.expiresOn.value;
        await save('documents/rename', {id:item.id, name:form.elements.documentName.value, expectedName:item.name,
          ...(expiresOn !== (item.expiresOn || '') || (noExpiry && !explicitlyUndated) ? {expiresOn,expectedExpiresOn:item.expiresOn || ''} : {}),
          ...(branchId === (item.branchId || '') ? {} : {branchId,expectedBranchId:item.branchId || ''})});
        dialog.close();
      }, 'Document saved.', error => { form.querySelector('[role="status"]').textContent = t(error.message); });
    };
    document.body.append(dialog);
    dialog.showModal();
    return;
  }
  const deleteDocument=event.target.closest('[data-delete-document]');
  if(deleteDocument){
    const dialog=document.createElement('dialog');dialog.className='catalog-dialog';
    dialog.innerHTML='<header><h2>'+t('Delete')+'</h2><button type="button" class="button secondary compact" data-cancel aria-label="'+t('Close')+'">×</button></header><p>'+(language==='ar'?'هل تريد حذف هذا المستند؟ سيتوقف التنبيه الخاص به.':'Delete this document? Its expiry alert will stop.')+'</p><div class="actions"><button type="button" class="button primary" data-confirm>'+t('Delete')+'</button><button type="button" class="button secondary" data-cancel>'+t('Cancel')+'</button></div>';
    document.body.append(dialog);dialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>dialog.close());dialog.onclose=()=>dialog.remove();
    dialog.querySelector('[data-confirm]').onclick=e=>run(e.currentTarget,async()=>{await save('documents/remove',{id:deleteDocument.dataset.deleteDocument});dialog.close();});dialog.showModal();return;
  }
  const removeRole = event.target.closest('[data-remove-role]');
  const removeTitle = event.target.closest('[data-remove-job-title]');
  if (removeRole || removeTitle) {
    const value = removeRole?.dataset.removeRole ?? removeTitle.dataset.removeJobTitle;
    const prompt = removeRole ? 'Delete this role and clear its employee assignments?' : 'Delete this job title and clear it from assigned employees?';
    if (window.confirm(t(prompt) + '\n' + t(value))) {
      if (removeRole) run(removeRole, () => save('staff/roles/remove', { role: value }), 'Role deleted.');
      else run(removeTitle, () => save('job-titles/remove', { name: value }), 'Job title deleted.');
    }
    return;
  }
  const jobTitleButton = event.target.closest('tr')?.querySelector('[data-job-title]');
  if (jobTitleButton) {
    selectedJobTitle = jobTitleButton.dataset.jobTitle;
    render();
    return;
  }
  const target = event.target.closest('button') ?? event.target.closest('.location-table tbody tr')?.querySelector('[data-edit-location]');
  if (target?.hasAttribute('data-queue-visible-approvals')) {
    queueApprovals(visibleApprovalIds($('#manager-device-requests')));
    return;
  }
  if(target?.hasAttribute('data-new-desktop-request')) {
    void run(target,openDesktopRequest);
    return;
  }
  if (target?.dataset.editApproval) {
    if(!state.isCompanyOwner&&!state.canEditApprovalChains)return;
    const type = target.dataset.editApproval;
    approvalDraft = { type, steps: [...new Set((state.approvalChains?.[type] ?? [directApprovalStep]).map(step=>{const person=state.staff.find(p=>p.id===step);return person?.role?approvalRoleStep(person.role):step;}))] };
    drawApprovalDialog();
    return;
  }
  if (target?.hasAttribute('data-close-approval')) {
    $('#approval-dialog').close();
    return;
  }
  if (target?.dataset.approvalStep && approvalDraft) {
    const { steps } = approvalDraft;
    const index = Number(target.dataset.index);
    const operation = target.dataset.approvalStep;
    let focus = index;
    if (operation === 'add') focus = steps.push('') - 1;
    else {
      steps.splice(index, 1);
      focus = Math.min(index, steps.length - 1);
    }
    drawApprovalDialog();
    $('#approval-dialog select[data-index="' + focus + '"]')?.focus();
    return;
  }
  if (!target) return;
  if (target.dataset.editAttendanceMethod) {
    attendanceMethod = target.dataset.editAttendanceMethod;
    attendanceBranch = undefined;
    render();
    return;
  }
  if (target.hasAttribute('data-attendance-branch')) {
    attendanceBranch = target.dataset.attendanceBranch;
    refreshAttendanceMethodPicker();
    $('.attendance-method-branches [aria-pressed="true"]')?.focus();
    return;
  }
   if (target.dataset.scheduleStaff) {
    const { scheduleStaff: staffId, scheduleDate: date, editAssignment, removeAssignment } = target.dataset;
    if (removeAssignment) {
      run(target, async () => {
        await save('work-assignments', { staffId, date, removePeriodId: removeAssignment });
        focusScheduleCell({ staffId, date });
      }, 'Schedule updated.');
    } else {
      const scroll = $('.weekly-schedule .table-wrap');
      const position = scroll && { top: scroll.scrollTop, left: scroll.scrollLeft };
      selectedScheduleCell = { staffId, date, periodId: editAssignment };
      render();
      if (position) $('.weekly-schedule .table-wrap')?.scrollTo(position);
    }
    return;
  }
  if (target.dataset.requestFilter) {
    requestStatus = target.dataset.requestFilter;
    const panel = $('#manager-device-requests');
    updateRequestInbox(panel);
    panel.querySelector('[data-request-filter="' + CSS.escape(requestStatus) + '"]')?.focus();
    return;
  }
  if (target.dataset.editPartner) {
    const partner = state.partners.find(item => item.id === target.dataset.editPartner);
    const form = $('#partner-form');
    if (!partner || !form) return;
    form.reset();
    form.querySelector('#partner-password-fields').hidden = !partner.active;
    form.querySelector('#partner-password-fields').disabled = !partner.active;
    for (const field of ['password', 'confirmation']) form.elements[field].type = 'password';
    $('#toggle-partner-password').textContent = t('Show password');
    $('#toggle-partner-password').setAttribute('aria-pressed', 'false');
    form.dataset.partnerId = partner.id;
    $('#partner-delete-button').hidden=false;
    $('#partner-delete-button').dataset.removePartner=partner.id;
    for (const field of ['name', 'contactName', 'phone', 'email']) form.elements[field].value = partner[field] ?? '';
    $('#partner-dialog-title').textContent = t('Edit company');
    form.querySelector('button.primary').textContent = t('Save changes');
    form.closest('dialog').showModal();
    return;
  }
  if (target.dataset.deviceDecision) {
    if (target.dataset.deviceDecision === 'reject') { openRequestRejection(target); return; }
    run(target, async () => {
      const { deviceStaff: staffId, deviceRequest: requestId, deviceDecision: decision } = target.dataset;
      const response = await fetch(companyPrefix + '/api/employee/device-approval', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId, requestId, decision }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const panel = $('#manager-device-requests');
      if (panel) {
        target.disabled = false;
        await refreshRequestInbox(panel);
      }
    }, 'Request decision saved.');
    return;
  }
  if(target.dataset.staffRecovery){
    run(target,async()=>{
      const response=await fetch(companyPrefix+'/api/staff/recovery-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({staffId:target.dataset.staffRecovery})});
      const result=await response.json();if(!response.ok)throw Error(result.error);
    },'Password recovery email sent.');
    return;
  }
  if(target.dataset.partnerSend||target.dataset.staffSend){
    run(target,async()=>{
      const result=target.dataset.partnerSend?await save('partners',{operation:'resend-activation',id:target.dataset.partnerSend}):await save('staff/activation-link',{staffId:target.dataset.staffSend,send:true});
      if(result.invitation?.delivery!=='sent')throw Error('Could not send the activation email. Try again.');
    },'Activation email sent.');
    return;
  }
  if (target.dataset.partnerLink || target.dataset.staffLink) {
    const kind=target.dataset.partnerLink?'partner':'staff';
    const id=target.dataset.partnerLink||target.dataset.staffLink;
    const person=(kind==='partner'?state.partners:state.staff).find(item=>item.id===id);
    if(!person)return;
    const expired=activationExpired(person.activationLinkExpiresAt);
    run(target,async()=>{
      const cached=activationLinks.get(kind+':'+id);
      const invitation=!expired&&cached&&cached.expiresAt===person.activationLinkExpiresAt?cached:
        (kind==='partner'?await save('partners',{operation:'activation-link',id}):await save('staff/activation-link',{staffId:id})).invitation;
      if(!invitation?.url)throw Error('Could not create the activation link.');
      if(!expired)await navigator.clipboard.writeText(invitation.url);
      $('[data-'+kind+'-link="'+CSS.escape(id)+'"]')?.focus();
    },expired?'Activation link renewed.':'Activation link copied.');
    return;
  }
  if(target.dataset.viewPartner) {
    run(target,async()=>{
      const response=await fetch('/api/partners',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'view',id:target.dataset.viewPartner})});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      location.assign(result.url);
    });
    return;
  }
  if (target.dataset.partnerStatus || target.dataset.removePartner) {
    const partner = state.partners.find(item => item.id === (target.dataset.partnerStatus || target.dataset.removePartner));
    if (!partner) return;
    if (target.dataset.removePartner) {
      if (window.confirm(t('Delete this company and all its data?') + '\n' + partner.name)) {
        run(target, () => save('partners', { operation: 'delete', id: partner.id }), 'Company deleted.');
      }
    } else {
      run(target, async () => {
        await save('partners', { operation: 'status', id: partner.id, suspended: !partner.suspended });
        $('[data-partner-status="' + CSS.escape(partner.id) + '"]')?.focus();
      }, 'Company status updated.');
    }
    return;
  }
  if (target.id === 'close-role') closeRoleDialog();
  if (target.dataset.removeStaff || target.dataset.editStaff) target.closest('.staff-row-menu')?.removeAttribute('open');
  if (target.dataset.removeStaff) {
    const person = state.staff.find(item => item.id === target.dataset.removeStaff);
    if (person && window.confirm(t('Delete this employee and revoke access?') + '\n' + staffName(person))) {
      run(target, async () => {
        await save('staff/remove', { staffId: person.id });
        render();
        $('#add-staff')?.focus();
      }, 'Employee deleted.');
    }
  }
  if (target.dataset.editStaff) {
    editingStaff = state.staff.find(person => person.id === target.dataset.editStaff && person.status !== 'Removed');
    if (editingStaff) {
      render();
      if (target.hasAttribute('data-edit-contract')) $('#staff-form')?.elements.contractTerm.focus();
    }
  }
  if (target.id === 'add-staff') {
    editingStaff=undefined;
    addingStaff = !addingStaff;
    render();
    if (addingStaff) $('#staff-form input').focus();
  }
  if (target.id === 'close-staff') closeStaffDialog();
  if (target.dataset.walletStatus) {
    documentWalletStatus = target.dataset.walletStatus;
    render();
    $('[data-wallet-status="' + CSS.escape(documentWalletStatus) + '"]')?.focus();
    return;
  }
  if (target.id === 'schedule-clear-search') {
    scheduleSearch = '';
    const input = $('#schedule-search');
    input.value = '';
    filterScheduleRows();
    input.focus();
    return;
  }
  if (target.dataset.weekStep) {
    scheduleWeek = target.dataset.weekStep === '0' ? 0 : scheduleWeek + Number(target.dataset.weekStep);
    render();
    $('[data-week-step="' + target.dataset.weekStep + '"]')?.focus();
  }
  if (target.dataset.attendanceTab) {
    attendanceTab = target.dataset.attendanceTab;
    render();
    $('[data-attendance-tab][aria-pressed="true"]')?.focus();
  }

  if (target.dataset.punchMethodsTab) {
    if (punchMethodsTab === target.dataset.punchMethodsTab) return;
    punchMethodsTab = target.dataset.punchMethodsTab;
    editingBranch = undefined;
    editingLocationId = undefined;
    render();
    $('[data-punch-methods-tab][aria-pressed="true"]')?.focus();
    return;
  }
  if (target.dataset.organizationTab) {
    organizationTab = target.dataset.organizationTab;
    editingBranch = undefined;
    render();
    $('[data-organization-tab][aria-pressed="true"]')?.focus();
    return;
  }
  if (target.id === 'add-period') {
    editingPeriod = undefined;
    addingPeriod = !addingPeriod;
    render();
    $(addingPeriod ? '#period-form input' : '#add-period')?.focus();
  }
  if (target.dataset.periodStaff) {
    openPeriodStaff(state.workPeriods.find(period => period.id === target.dataset.periodStaff), target);
    return;
  }
  const periodToChange = target.dataset.deletePeriod;
  if (periodToChange && assignedStaffForPeriod(state, periodToChange, state.today).length) {
    say('This period cannot be deleted while employees are assigned to it.', true);
    return;
  }
  if (target.dataset.editPeriod) {
    editingPeriod = state.workPeriods.find(period => period.id === target.dataset.editPeriod);
    addingPeriod = true;
    render();
  }
  if (target.dataset.deletePeriod) {
    const period = state.workPeriods.find(item => item.id === target.dataset.deletePeriod);
    if (!period || !window.confirm(t('Delete this period and remove it from employee schedules?') + '\n' + period.name)) return;
    run(target, async () => {
      await save('work-periods/remove', { id: period.id });
      $('#add-period')?.focus();
    }, 'Period deleted.');
  }
  if (target.dataset.duplicatePeriod) {
    run(target, async () => {
      await save('work-periods/duplicate', { id: target.dataset.duplicatePeriod });
      $('[data-duplicate-period="' + CSS.escape(target.dataset.duplicatePeriod) + '"]')?.focus();
    }, 'Period duplicated.');
    return;
  }
  if (target.dataset.removeLocation) {
    const branch = state.locations.find(site => site.id === target.dataset.removeLocation);
    if (!branch || !window.confirm(t('Delete this branch and clear its attendance location and employee assignments?') + '\n' + branch.name)) return;
    run(target, async () => {
      await save('locations/remove', { id: branch.id });
      editingBranch = undefined;
      render();
      $('#add-branch')?.focus();
    }, 'Location removed.');
  }
  if (target.id === 'punch-from-anywhere') run(target, async () => {
    await save('locations/anywhere', { enabled: !state.punchFromAnywhere });
    $('#punch-from-anywhere')?.focus();
  }, 'Settings saved.');
  if (target.id === 'punch') run(target, async () => save('punch', {
    ...(state.punchFromAnywhere ? {} : await locate()), kind: target.dataset.kind,
  }), 'Punch recorded.');
  if (target.dataset.decision === 'Declined') { openRequestRejection(target); return; }
  if (target.dataset.decision === 'Approved') { queueApprovals([target.dataset.id]); return; }
  if (target.dataset.editBranch || ['add-branch', 'close-branch', 'add-branch-from-locations'].includes(target.id)) {
    if (target.id === 'add-branch-from-locations') punchMethodsTab = 'methods';
    editingBranch = target.id.startsWith('add-branch') ? '' : target.dataset.editBranch;
    render();
    $(editingBranch !== undefined ? '#branch-form input' : '#add-branch')?.focus();
  }
  if (target.dataset.editLocation || target.id === 'close-location') {
    const siteId = target.dataset.editLocation ?? editingLocationId;
    editingLocationId = target.dataset.editLocation;
    additionalLocationId = target.dataset.additionalLocation;
    render();
    $(editingLocationId ? '#location-form input' : '[data-edit-location="' + CSS.escape(siteId) + '"]')?.focus();
  }
  if (target.id === 'use-location') run(target, async () => {
    const { latitude, longitude } = await locate();
    const form = target.form;
    form.elements.latitude.value = latitude;
    form.elements.longitude.value = longitude;
    form.dispatchEvent(new Event('location-update'));
  }, 'Location selected. Save the location to apply it.');
});
$('#main').addEventListener('load', event => {
  if (event.target.matches('.organization-logo')) matchLogoPreviewBackground(event.target);
}, true);
function updateStaffManagers(form,initial=false){
 const field=form.elements.managerId,branchId=form.elements.branchId?.value;
 if(!field)return;
 const selected=initial&&editingStaff?editingStaff.managerId:field.value;
 const people=(state.directManagerChoices??state.staff).filter(person=>eligibleDirectManager(state,person,branchId,editingStaff?.id));
 field.innerHTML='<option value="">'+(branchId?t('Choose later'):(language==='ar'?'اختر الفرع أولًا':'Choose a branch first'))+'</option>'+people.map(person=>'<option value="'+esc(person.id)+'">'+esc(staffName(person))+'</option>').join('');
 if(people.some(person=>person.id===selected))field.value=selected;
 else if(initial&&selected){const option=document.createElement('option');option.value=selected;option.textContent=t('Unavailable approver');field.append(option);field.value=selected;}
 field.disabled=!branchId;
}
function updateStaffIdentityFields(form) {
  const restricted = state.canViewStaffSalary === false;
  const tamheer=updateStaffFinancialFields(form, restricted);
  const summary = form.querySelector('.staff-salary-disclosure summary');
  if (restricted) {
    summary.setAttribute('aria-disabled', 'true');
    summary.onclick = event => event.preventDefault();
  }
  const page=form.querySelector('[data-staff-page="1"]');
  if(page)page.textContent='2 · '+(language==='ar'?(tamheer?'فترات الدوام':'الراتب وفترات الدوام'):(tamheer?'Work periods':'Salary and work periods'));
  const nationality=form.elements.nationality.value;
  const residence=Boolean(nationality&&nationality!=='SA');
  $('#staff-identity-label').textContent=t(residence?'Residence number':'Identity number');
  $('#staff-residency-expiry').hidden=!residence;
  form.elements.residencyExpiryDate.disabled=!residence;
  if(nationality==='SA')form.elements.residencyExpiryDate.value='';
  for(const name of ['gosiScheme','gosiBase','gosiSaned']) {
    const field=form.elements[name];field.closest('label').hidden=residence||tamheer;field.disabled=residence||tamheer||restricted;
    field.required=!field.disabled&&name==='gosiBase'&&['old','new'].includes(form.elements.gosiScheme.value);
  }
}
function updateAdministratorRegistration(form) {
  const role = form.elements.permissionRole?.value;
  const minimal = !editingStaff && isAdministrator({role}, state);
  const joining = form.elements.joinDate;
  if (minimal && joining.value === joining.defaultValue) joining.value = '';
  if (!minimal && !editingStaff && !joining.value) joining.value = joining.defaultValue;
  for (const name of ['birthDate', 'nationality', 'identityNumber', 'gender', 'jobTitle',
    'joinDate', 'contractTerm', 'contractType', 'probation', 'annualLeave', 'salary', 'allowances', 'gosiSaned']) {
    const field = form.elements[name];
    field.required = !minimal && !field.disabled;
  }
  form.querySelector('.hint').textContent = minimal
    ? (language === 'ar' ? 'المطلوب الاسم بالعربي والإنجليزي والجوال والبريد الإلكتروني.' : 'Only the Arabic and English names, phone number and email are required.')
    : t('Complete the required fields. Branch and direct manager may be assigned later.');
}
function updateSalaryTotal(form) {
  const base = form.elements.salary.valueAsNumber, allowances = form.elements.allowances.valueAsNumber;
  form.elements.totalSalary.value = Number.isFinite(base) && Number.isFinite(allowances) ? (base + allowances).toFixed(2) : '';
}
$('#main').addEventListener('input', event => {
  const field = event.target;
  if (field.id === 'schedule-search') { scheduleSearch = field.value; filterScheduleRows(); }
  if (field.form?.id === 'staff-form' && ['salary', 'allowances'].includes(field.name)) updateSalaryTotal(field.form);
  if (field.form?.id === 'staff-form' && ['birthDate', 'birthDateHijri'].includes(field.name)) {
    const { birthDate, birthDateHijri } = field.form.elements;
    if (field === birthDate) {
      birthDateHijri.value = birthDate.value ? dateText(hijriBirthDate(Date.parse(birthDate.value))) : '';
      birthDateHijri.setCustomValidity('');
    } else {
      birthDate.value = gregorianBirthDate(birthDateHijri.value, state.today);
      birthDateHijri.setCustomValidity(birthDateHijri.value && !birthDate.value ? t('Enter a valid Hijri birth date.') : '');
    }
  }
  if (event.target.id === 'attendance-search') {
    attendanceSearch = event.target.value;
    $('#attendance-results').innerHTML = attendanceTable(attendanceDate || state.today);
    mountAttendanceFilters({state,language,companyPrefix,t});
  }
  if (event.target.id === 'leave-balance-search') {
    leaveBalanceSearch = event.target.value;
    $('#leave-balance-results').innerHTML = leaveBalanceTable();
  }
  if (event.target.form?.id === 'period-form') updatePeriodPreview(event.target.form);
});
$('#main').addEventListener('change', (event) => {
  const checkbox = event.target;
  if (checkbox.id === 'staff-leave-type-filter') {
    staffLeaveFilter.type = checkbox.value;
    render();
    $('#staff-leave-type-filter')?.focus();
    return;
  }
  if (checkbox.matches('input[data-attendance-staff]')) {
    const { attendanceStaff:staffId, locationBranch:branchId, locationId } = checkbox.dataset;
    const enabled = checkbox.checked;
    const picker = checkbox.closest('.attendance-method-picker');
    const scrollTop = picker.querySelector('.attendance-method-members').scrollTop;
    run(checkbox, async () => {
      picker.inert = true;
      try {
        await save('attendance-methods', {method:attendanceMethod,staffId,enabled,...(locationId ? {branchId,locationId} : {})}, {refreshView:false});
        if (picker.isConnected) {
          refreshAttendanceMethodPicker();
          $('.attendance-method-members').scrollTop = scrollTop;
          $('[data-attendance-staff="' + CSS.escape(staffId) + '"]')?.focus({preventScroll:true});
        }
      } finally {
        picker.inert = false;
      }
    }, 'Settings saved.', error => {
      checkbox.checked = !enabled;
      say(error.message, true);
    });
    return;
  }
  if (event.target.id === 'schedule-branch') {
    scheduleBranch = event.target.value;
    render();
    $('#schedule-branch')?.focus();
    return;
  }
  if (event.target.matches('[data-period-branch]')) {
    const input=event.target, enabled=input.checked;
    run(input,async()=>{try {await save('work-periods/branch',{id:input.dataset.periodBranch,branchId:input.dataset.branch,enabled});render();}catch(error){input.checked=!enabled;throw error;}},'Settings saved.');
    return;
  }
  if (event.target.matches('#staff-form [name="branchId"]')) {
    const form=event.target.form;
    updateStaffManagers(form);
    const choices=$('#staff-period-choices');
    if (choices) choices.innerHTML=periodChoices(new FormData(form).getAll('defaultPeriodId'),'defaultPeriodId',undefined,event.target.value);
  }
  if(event.target.form?.id==='staff-form' && event.target.name==='nationality')updateStaffIdentityFields(event.target.form);
  if(event.target.form?.id==='staff-form' && event.target.name==='permissionRole')updateAdministratorRegistration(event.target.form);
  if (event.target.form?.id === 'leave-preferences-form' && event.target.name === 'remaining') {
    const partial = event.target.value === 'partial';
    $('#leave-carryover-days').hidden = !partial;
    const input = event.target.form.elements.carryoverDays;
    input.disabled = !partial; input.required = partial;
  }
  if (event.target.matches('#approval-chain-form select')) {
    const index = Number(event.target.dataset.index);
    approvalDraft.steps[index] = event.target.value;
    drawApprovalDialog();
    $('#approval-dialog select[data-index="' + index + '"]')?.focus();
    return;
  }
  if (event.target.matches('#period-form [name="color"]')) {
    event.target.closest('.period-color-picker').querySelector('.period-dot').style.setProperty('--period-color', event.target.value);
    return;
  }
  if (event.target.matches('#schedule-assignment-form [name="restDay"]')) {
    for (const fieldset of event.target.form.querySelectorAll('.schedule-assignment-fields')) {
      fieldset.disabled = event.target.checked;
    }
    return;
  }
  const target = event.target;
  if (target.id === 'leave-balance-branch') {
    leaveBalanceBranch = target.value;
    $('#leave-balance-results').innerHTML = leaveBalanceTable();
  }
  if (target.hasAttribute('data-organization-location')) {
    const { country, region, city } = target.form.elements;
    if (target === country) region.innerHTML = organizationLocationOptions('region', { country: country.value });
    if (target !== city) city.innerHTML = organizationLocationOptions('city', { country: country.value, region: region.value });
  }
  if (target.form?.id === 'organization-form' && target.name === 'logo' && target.files[0]) {
    const form = target.form;
    const file = target.files[0];
    if (!validOrganizationLogo(file)) {
      target.value = '';
      say('Choose a PNG, JPEG or WebP image up to 5 MB.', true);
      return;
    }
    form.elements.removeLogo.value = '';
    form.querySelector('[data-remove-organization-logo]').hidden = false;
    const preview = form.querySelector('.organization-logo');
    preview.parentElement.style.backgroundColor = '';
    const url = URL.createObjectURL(file);
    preview.onload = preview.onerror = () => URL.revokeObjectURL(url);
    preview.src = url;
    preview.hidden = false;
  }
  if (target.form?.id === 'staff-form' && target.name === 'contractTerm') {
    const custom = target.value === 'Custom';
    $('#contract-custom').hidden = !custom;
    target.form.elements.contractMonths.disabled = !custom;
    target.form.elements.contractMonths.required = custom;
  }
  if (target.form?.id === 'staff-form' && target.name === 'contractType') {
    const { probation, annualLeave } = target.form.elements;
    const isTamheer = target.value === 'Tamheer';
    if (isTamheer) probation.value = annualLeave.value = '0';
    probation.disabled = annualLeave.disabled = isTamheer;
    updateStaffIdentityFields(target.form);
    updateAdministratorRegistration(target.form);
  }
  if (target.id === 'profile-attendance-date') { profileAttendanceDate = target.value; render(); $('#profile-attendance-date').focus(); }
  if (target.id === 'attendance-date') { attendanceDate = target.value; render(); $('#attendance-date').focus(); }
  if (target.name === 'type') {
    $('#end-date').hidden = !state.leaveTypes.includes(target.value);
    target.form.elements.end.required = !$('#end-date').hidden;
  }
});
$('#main').addEventListener('submit', async (event) => {
  if (event.target.getAttribute('action')?.endsWith('/logout')) return;
  event.preventDefault();
  const form = event.target;
  const fields = new FormData(form);
  const values = Object.fromEntries(fields);
  if (form.id === 'approval-chain-form') {
    const { type, steps } = approvalDraft;
    run(event.submitter, async () => {
      await save('approval-chains', { type, steps });
      $('[data-edit-approval="' + CSS.escape(type) + '"]')?.focus();
    }, 'Approval chain saved.');
    return;
  }
  if (form.id === 'encouragement-settings-form') {
    const phrases = [...form.querySelectorAll('.phrase-editor-row')].map(row => ({
      ar: row.querySelector('[data-phrase-ar]').value, en: row.querySelector('[data-phrase-en]').value,
      morning: row.querySelector('[data-phrase-morning]').checked, opening: row.querySelector('[data-phrase-opening]').checked,
    }));
    run(event.submitter, () => save('encouragement-settings', { phrases }), 'Notification preference saved.');
    return;
  }
  if(form.id==='attendance-report-settings-form'){
    run(event.submitter,()=>save('attendance-report-settings',{frequency:values.frequency,enabled:Boolean(state.attendanceReportSettings?.enabled)}),'Report preference saved.');
    return;
  }
  if(form.id==='follow-up-mail-settings-form'){
    run(event.submitter,()=>save('follow-up-mail-settings',{reassignments:form.elements.reassignments.checked}),'Notification preference saved.');
    return;
  }
  if (form.id === 'notification-display-form') {
    run(event.submitter, async () => {
      await save('notification-settings', { key: 'display', display: { mode: values.mode, seconds: Number(values.seconds) } });
      closeManagementPopup();
    }, 'Notification preference saved.');
    return;
  }
  if (form.id === 'notification-settings-form') {
    const key = form.dataset.key;
    const body = key === 'attendance' ? { key, rules: Object.fromEntries(attendanceNotificationRules.map(([id]) => {
      const enabled = form.elements[id].checked;
      const minutes = form.elements[id + '-minutes'];
      return [id, { enabled, minutes: minutes.validity.valid && minutes.value !== '' ? Number(minutes.value) : 5 }];
    })) } : { key, recipients: form.elements.allManagers.checked ? null : fields.getAll('recipients'),documentAlertMode:values.documentAlertMode,documentReminderDays:Number(values.documentReminderDays), documentSecondReminderDays:values.documentSecondReminderDays===''?null:Number(values.documentSecondReminderDays), documentSecondAlertMode:values.documentSecondAlertMode };
    run(event.submitter, () => save('notification-settings', body), 'Notification preference saved.');
    return;
  }
  if (form.id === 'document-upload-form') {
    run(event.submitter, async () => {
      const status=form.querySelector('.document-upload-progress');
      if(!state.isCompanyOwner&&companyPrefix&&!permissionsFor(state,state.staff.find(p=>p.id===accountIdentity?.id)?.role).documents)throw Error(language==='ar'?'رفع مستندات الشركة متاح لمسؤول الحساب فقط.':'Company document uploads require the account administrator.');
      form.querySelectorAll('.ux-action-error').forEach(el=>el.remove());
      const files=[...form.elements.file.files];
      const useAi = form.elements.useAi?.checked === true;
      const branchId = form.elements.branchId.value;
      if(form.dataset.replaceId&&files.length!==1)throw Error(language==='ar'?'اختر مستندًا واحدًا للاستبدال.':'Choose one replacement document.');
      form.dataset.busy='true';
      let latest;
      let results;try{results=await uploadDocuments(files,async body=>{
        if(form.dataset.replaceId)body.replaceId=form.dataset.replaceId;
        else body.branchId=branchId;
        const response=await fetch(companyPrefix+'/api/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        let result;try{result=await response.json();}catch{throw Error(language==='ar'?'لم يصل تأكيد الحفظ من الخادم. راجع القائمة قبل إعادة الرفع.':'No save confirmation was received. Check the list before uploading again.');}if(!response.ok)throw Error(response.status===403?(language==='ar'?'لا يملك الحساب صلاحية رفع مستندات الشركة.':'This account cannot upload company documents.'):result.error||('HTTP '+response.status));latest=result;
      },message=>{status.textContent=message;},language,undefined,
      (file,local)=>reviewDocument(file,local,useAi,status));}finally{delete form.dataset.busy;}
      if(latest){state=latest;render();}
      const failed=results.filter(item=>item.error);
      status.textContent=results.map(item=>item.name+' — '+(item.error?(language==='ar'?'تعذر الرفع: ':'Upload failed: ')+item.error:
        item.skipped?(language==='ar'?'تم التخطي':'Skipped'):(language==='ar'?'تم الرفع':'Uploaded'))).join('\n');
      if(failed.length)throw Error(failed.map(item=>item.name+': '+item.error).join('\n'));
      if(latest) say('Document uploaded.');
    });
    return;
  }
  if (form.matches('.document-expiry-form')) {
    const document = state.documents.find(item => item.id === form.dataset.documentId);
    if (!document) return;
    run(event.submitter, () => save('documents/expiry', { id: document.id, expiresOn: values.expiresOn,
      expectedExpiresOn:'', expectedSuggestedExpiresOn:document.suggestedExpiresOn }), 'Expiry date saved.');
    return;
  }
  if (form.id === 'schedule-assignment-form') {
    const cell = selectedScheduleCell;
    const periodIds = fields.getAll('periodId');
    event.submitter.disabled = true;
    const schedule = event.submitter.value === 'default' ? { useDefault: true } :
      form.elements.restDay.checked ? { restDay: true } :
        { periodIds, repeat: form.elements.repeat.valueAsNumber, restDay: false };
    try {
      try {
        await save('work-assignments', { staffId: cell.staffId, date: cell.date, ...schedule }, { refreshView: false });
      } catch (error) {
        if (!(error.unconfirmedSave || error instanceof TypeError) || !schedule.restDay) throw error;
        const check = await fetch(companyPrefix + '/api/state', { cache: 'no-store' }).catch(() => null);
        const current = check?.ok ? await check.json().catch(() => null) : null;
        const entries = current?.workAssignments?.filter(entry => entry.staffId === cell.staffId && entry.date === cell.date);
        if (entries?.length !== 1 || entries[0].periodId !== null || entries[0].restDay === false) throw error;
        state = current;
      }
      if (selectedScheduleCell === cell) {
        closeScheduleAssignment();
        const selector = '[data-schedule-staff="' + CSS.escape(cell.staffId) + '"][data-schedule-date="' + cell.date + '"].schedule-add';
        const cellButton = $(selector);
        if (cellButton) {
          cellButton.classList.add('schedule-saved');
          const status = document.createElement('span');
          status.className = 'schedule-save-status';
          status.textContent = language === 'ar' ? 'تم الحفظ ✓' : 'Saved ✓';
          cellButton.append(status);
          setTimeout(() => { status.remove(); cellButton.classList.remove('schedule-saved'); }, 3000);
        }
      }
      say('Schedule updated.');
    } catch (error) {
      const feedback = $('#schedule-assignment-error');
      if (feedback) feedback.textContent = t(error.message);
    } finally {
      event.submitter.disabled = false;
    }
    return;
  }
  if (form.id === 'time-format-form') run(event.submitter, () => save('time-format', values), 'Settings saved.');
  if (form.id === 'organization-form') {
    run(event.submitter, async () => {
      const file = values.logo;
      delete values.logo;
      if (values.removeLogo) values.logo = '';
      delete values.removeLogo;
      if (file.size) {
        if (!validOrganizationLogo(file)) {
          throw new Error('Choose a PNG, JPEG or WebP image up to 5 MB.');
        }
        values.logo = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Could not read the logo.'));
          reader.readAsDataURL(file);
        });
      }
      await save(superAdmin ? 'platform-organization' : 'organization', values);
    }, 'Organization information saved.');
    return;
  }
  if (form.id === 'partner-form') {
    const id = form.dataset.partnerId;
    run(event.submitter, async () => {
      await save('partners', id ? { ...values, operation: 'update', id } : values);
      (id ? $('[data-edit-partner="' + CSS.escape(id) + '"]') : $('[data-create-catalog="partner"]'))?.focus();
    }, id ? 'Company updated.' : 'Company added.');
    return;
  }
  if (form.id === 'job-title-form' || form.id === 'create-role-form') {
    const role = form.id === 'create-role-form';
    const kind = role ? 'create-role' : 'job-title';
    run(event.submitter, async () => {
      if(role){values.administrator=form.elements.administrator.checked;values.createJobTitle=form.elements.createJobTitle.checked;}
      await save(role ? 'staff/roles/create' : 'job-titles', values);
      if (!role) await setupGuideSaved('job-title');
      $('[data-create-catalog="' + kind + '"]')?.focus();
    }, role ? 'Role created.' : 'Job title added.');
  }
  if(form.id==='role-form')run(event.submitter,async()=>{await save('job-titles/assign',{jobTitle:selectedJobTitle,staffIds:fields.getAll('member')});closeRoleDialog();},'Job title assignments saved.');
  if (form.id === 'period-form') {
    const periodId = editingPeriod?.id;
    const window = (key) => Object.fromEntries(['before', 'grace', 'after'].map(field => [field, Number(values[key + '-' + field])]));
    const settings = form.elements.flexibleDay.checked ? { kind: 'flexible', start: values.start, end: values.end,
      duration: Number(values.durationHours) * 60 + Number(values.durationMinutes) } :
      { start: values.start, end: values.end, arrival: window('arrival'), departure: window('departure') };
    const name = values.name.trim() || (settings.kind === 'flexible' ? t('Flexible period') : '');
    const weekdays=fields.getAll('weekday').map(Number);
    if (!weekdays.length) { say('Choose at least one valid period weekday.', true); return; }
    const overtime = form.elements.overtimeEnabled.checked ? { mode: values.overtimeMode, minutes: Number(values.overtimeMinutes) } : null;
    void run(event.submitter, async () => {
      const applyFrom = periodId ? await choosePeriodEffectiveDate() : undefined;
      if (periodId && applyFrom === null) return;
      await save('work-periods', { id: periodId, applyFrom, overtime, name, color: values.color, weekdays, ...settings });
      addingPeriod = false;
      await setupGuideSaved('period');
      render();
      $('#add-period')?.focus();
      say('Period saved.');
    });
    return;
  }
  if (form.id === 'schedule-form') {
    const days = new FormData(form).getAll('day').map(Number);
    run(event.submitter, () => save('work-schedule', { days, start: values.start, end: values.end }), 'Settings saved.');
  }
  if (form.id === 'leave-preferences-form') run(event.submitter, () => save('leave-preferences', {
    availability: values.availability, remaining: values.remaining, carryoverDays: Number(values.carryoverDays ?? 0),
  }), 'Settings saved.');
  if (form.id === 'leave-type-form') run(event.submitter, () => save('leave-types', values), 'Leave type added.');
  if (form.id === 'branch-form') run(event.submitter, async () => {
    if (editingBranch) values.id = editingBranch;
    const existingBranches = new Set(state.locations.map(site => site.id));
    if(form.dataset.configureAdministrators){const branch=state.locations.find(b=>b.id===editingBranch);await save('organization/branch',{...values,expectedName:branch.name,expectedAdministratorIds:(state.branchAdministratorChoices??(state.directManagerChoices??state.staff).filter(p=>p.status==='Active'&&isAdministrator(p,state))).filter(p=>roleBranches(p).includes(branch.id)).map(p=>p.id),administratorIds:fields.getAll('administratorIds')});}else await save('locations/branch', values);
    const created = state.locations.find(site => !existingBranches.has(site.id));
    if (created) await setupGuideSaved('branch', created.id);
    editingBranch = undefined;
    render();
    $('#add-branch')?.focus();
  }, 'Location saved.');
  if (form.id === 'select-location-form') {
    editingLocationId = values.branchId;
    additionalLocationId = null;
    render();
    $('#location-form input')?.focus();
  }
  if (form.id === 'location-form') {
    for (const name of ['latitude', 'longitude', 'radius']) values[name] = form.elements[name].valueAsNumber;
    if (editingLocationId) values.id = editingLocationId;
    if (additionalLocationId === null) values.addAdditional = true;
    else if (additionalLocationId) values.additionalId = additionalLocationId;
    run(event.submitter, async () => {
      await save('locations', values);
      await setupGuideSaved('location');
      editingLocationId = additionalLocationId = undefined;
      render();
      $('[data-edit-location="' + CSS.escape(values.id) + '"]')?.focus();
    }, 'Location saved.');
  }
  if (form.id === 'account-password-form') run(event.submitter, async () => {
    const response = await fetch(companyPrefix + (accountIdentity.owner ? '/api/account/password' : '/api/employee/password'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    form.reset();
    $('#account-password-feedback').textContent = t('Password changed.');
  }, '', error => { $('#account-password-feedback').textContent = t(error.message); });
  if (form.id === 'staff-password-form') run(event.submitter, async () => {
    await save('staff/password', { staffId: profileStaffId, password: values.password, confirmation: values.confirmation });
    form.reset(); form.dataset.uxDirty=''; form.querySelector('.ux-unsaved')?.remove();
    $('#staff-password-feedback').textContent = t('Password changed. The employee must sign in again.');
  }, '', error => { $('#staff-password-feedback').textContent = t(error.message); });
  if (form.id === 'staff-form') run(event.submitter, async () => {
    if(form.elements.managerId.disabled)values.managerId='';
    const periodIds = fields.getAll('defaultPeriodId');
    delete values.defaultPeriodId;
    delete values.birthDateHijri;
    delete values.attendanceExempt;
    if (editingStaff) {
      const staffId = editingStaff.id;
      const updates = Object.fromEntries(Object.entries(values).filter(([field, value]) =>
        value !== (form.initialValues.get(field) ?? '') && (value !== '' || field === 'managerId' || form.initialValues.has(field))));
      if (JSON.stringify(periodIds) !== JSON.stringify(form.initialValues.getAll('defaultPeriodId'))) updates.periodIds = periodIds;
      if (form.elements.attendanceExempt.checked !== Boolean(editingStaff.attendanceExempt)) updates.attendanceExempt = form.elements.attendanceExempt.checked;
      for (const field of ['contractMonths', 'probation', 'annualLeave']) {
        if (Object.hasOwn(updates, field)) updates[field] = updates[field] === '' ? null : Number(updates[field]);
      }
      if(Object.hasOwn(updates,'permissionRole'))updates.expectedPermissionRole=editingStaff.role??null;
      if (Object.keys(updates).length) await save('staff/update', { staffId, ...updates });
    } else {
      if (values.contractMonths) values.contractMonths = Number(values.contractMonths);
      const minimal = isAdministrator({role: values.permissionRole}, state);
      for (const name of ['probation', 'annualLeave']) {
        if (values.contractType === 'Tamheer') values[name] = 0;
        else if (!minimal || values[name]) values[name] = Number(values[name]);
      }
      if (minimal && !values.salary && values.allowances === '0') delete values.allowances;
      if (minimal) for (const name of Object.keys(values)) {
        if (values[name] === '') delete values[name];
      }
      await save('staff', { ...values, periodIds, attendanceExempt: form.elements.attendanceExempt.checked });
    }
    closeStaffDialog();
  }, editingStaff ? 'Employee updated.' : 'Employee added.', error => {
    const duplicateFields = {
      'That email is already on the staff list.': 'email',
      'That phone number is already on the staff list.': 'phone',
      'That email and phone number are already on the staff list.': 'email',
    };
    const field = duplicateFields[error.message];
    if (!field) {
      say(error.message, true);
      return;
    }
    fieldError(form.elements[field], t(error.message));
  });
  if (form.id === 'request-form') run(event.submitter, () => save('requests', values), 'Request submitted.');
});

async function openManagerHome() {
  if (!companyPrefix || !['', '#home'].includes(location.hash) ||
      !isMobileDevice()) return false;
  try {
    const response = await fetch(companyPrefix + '/api/employee/session');
    if (!response.ok || !(await response.json()).canReviewTeam) return false;
    location.replace(companyPrefix + '/employee');
    return true;
  } catch {
    return false;
  }
}

if (!await openManagerHome()) {
  try {
    const response = await fetch(companyPrefix + (superAdmin ? '/api/partners' : '/api/state'));
    if (!response.ok) throw new Error('Could not load the workspace.');
    state = await response.json();
    render();
  } catch (error) {
    $('#main').replaceChildren();
    const note = document.createElement('p'); note.textContent = t(error.message);
    const retry = document.createElement('button'); retry.className='button primary'; retry.textContent=t('Retry'); retry.onclick=()=>location.reload();
    $('#main').append(note,retry);
    $('#main').setAttribute('aria-busy', 'false');
  }
}

document.addEventListener('click', event => {
  const menu = $('#account-menu');
  if (!menu.contains(event.target) || (event.target.closest('a, button') && !event.target.closest('[data-theme-toggle]'))) menu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') $('#account-menu').open = false;
});


window.setInterval(()=>{if(!state||document.hidden||route()!=='attendance'||document.querySelector('dialog[open]'))return;const panel=$('#attendance-results');if(!panel)return;const old=panel.querySelector('.table-wrap'),scroll=old?.scrollTop??0;panel.innerHTML=attendanceTable(attendanceDate||state.today);mountAttendanceFilters({state,language,companyPrefix,t});const next=panel.querySelector('.table-wrap');if(next)next.scrollTop=scroll;},60000);

document.addEventListener('input',event=>{if(!event.target.matches('[data-branch-administrator-search]'))return;const query=normalizeSearch(event.target.value);for(const option of event.target.closest('.branch-administrator-picker').querySelectorAll('[data-administrator-option]'))option.hidden=!normalizeSearch(option.textContent).includes(query);});
