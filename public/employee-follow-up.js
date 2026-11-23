import {employeeActionDialog,escapeHtml as esc} from './employee-experience.js';
import {dateText} from './date-format.js';

const route='follow-up/tickets';
export async function showEmployeeFollowUp(api, language) {
  const L=(ar,en)=>language==='ar'?ar:en;
  const dialog=employeeActionDialog(L('مركز المتابعة','Follow-up centre'),L('إغلاق','Close'),'employee-follow-up');
  const content=document.createElement('section');
  dialog.append(content);
  dialog.showModal();
  const labels={new:L('بانتظار الإجراء','Awaiting action'),'in-progress':L('قيد التنفيذ','In progress'),completed:L('مكتملة','Completed')};
  let data,filter='all';
  const load=async()=>{
    content.textContent=L('جارٍ تحميل التذاكر…','Loading tickets…');
    try {
      data=await api(route);
      if(!dialog.open)return;
      if(!data.ok)throw Error(data.error);
      render();
    } catch(error) {
      if(!dialog.open)return;
      content.textContent=error.message;
      const retry=document.createElement('button');
      retry.type='button';retry.className='button secondary';retry.textContent=L('إعادة المحاولة','Retry');retry.onclick=load;
      content.append(retry);
    }
  };
  const render=()=>{
    const tickets=data.tickets.filter(t=>filter==='all'||t.status===filter);
    content.innerHTML=`<div class="employee-follow-up-tools"><label>${L('الحالة','Status')}<select>${Object.entries({all:L('الكل','All'),...labels}).map(([key,label])=>`<option value="${key}"${key===filter?' selected':''}>${label}</option>`).join('')}</select></label>
      <button type="button" class="button primary" data-new ${data.branches.some(b=>b.assignees.length)?'':'disabled'}>${L('فتح تذكرة','Open ticket')}</button></div>
      <div class="employee-follow-up-list">${tickets.length?tickets.map(ticket=>`<article class="card"><div class="employee-card-top"><bdi>${esc(ticket.number)}</bdi><span class="badge ${ticket.overdue?'red':ticket.status==='completed'?'green':'neutral'}">${ticket.overdue?L('متأخرة','Overdue'):labels[ticket.status]}</span></div>
      <strong>${esc(ticket.name)}</strong><small>${esc(data.branches.find(b=>b.id===ticket.branchId)?.name??L('المنشأة','Company'))} · ${esc(dateText(ticket.dueOn)||'—')}</small>
      ${ticket.editable?`<button type="button" class="button secondary compact" data-edit="${esc(ticket.id)}">${L('تعديل','Edit')}</button>`:''}</article>`).join(''):`<p>${L('لا توجد تذاكر في هذه القائمة.','No tickets in this list.')}</p>`}</div>`;
    content.querySelector('select').onchange=event=>{filter=event.target.value;render();};
    content.querySelector('[data-new]').onclick=()=>edit();
    for(const button of content.querySelectorAll('[data-edit]'))button.onclick=()=>edit(data.tickets.find(t=>t.id===button.dataset.edit));
  };
  function edit(ticket) {
    const creating=!ticket;
    const requestId=creating?crypto.randomUUID():null;
    const editor=employeeActionDialog(creating?L('فتح تذكرة','Open ticket'):ticket.name,L('إغلاق','Close'),'employee-follow-up');
    const branches=data.branches.filter(b=>b.assignees.length);
    const branch=data.branches.find(b=>b.id===ticket?.branchId);
    const form=document.createElement('form');
    form.innerHTML=`${creating?`<label>${L('الموضوع','Subject')}<input name="subject" maxlength="180" required></label><label>${L('الفرع','Branch')}<select name="branchId" required>${branches.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></label>`:''}
      <label>${L('إسناد إلى','Assign to')}<select name="assigneeId" ${creating?'required':''}></select></label>
      <label>${L('موعد الإنجاز','Completion deadline')}<input name="dueOn" type="date" value="${esc(ticket?.dueOn??'')}" ${creating?`min="${esc(data.today)}" required`:''}></label>
      ${creating?`<label>${L('تعليق','Comment')}<textarea name="text" maxlength="2000" rows="3"></textarea></label>
        <div class="employee-ticket-attachments"><label>${L('مرفقات اختيارية، حتى 3 ملفات بحجم 2 ميجابايت لكل ملف','Optional attachments, up to 3 files of 2 MB each')}<input name="files" type="file" accept="application/pdf,image/png,image/jpeg" multiple></label>
        <button type="button" class="button secondary" data-camera>${L('الكاميرا','Camera')}</button><input name="camera" type="file" accept="image/*" capture="environment" hidden></div><small data-camera-file aria-live="polite"></small>`:
        `<label>${L('الحالة','Status')}<select name="status">${Object.entries(labels).map(([key,label])=>`<option value="${key}"${key===ticket.status?' selected':''}>${label}</option>`).join('')}</select></label>`}
      <p role="status"></p><div class="actions"><button type="submit" class="button primary">${creating?L('إرسال','Send'):L('حفظ','Save')}</button><button type="button" class="button secondary" data-cancel>${L('إلغاء','Cancel')}</button></div>`;
    const {branchId,assigneeId}=form.elements;
    const initAssignees=()=>{
      const people=creating?branches.find(b=>b.id===branchId.value)?.assignees??[]:branch?.assignees??[];
      assigneeId.replaceChildren(new Option(creating?L('اختر المسؤول','Choose assignee'):L('غير مسند','Unassigned'),''),...people.map(p=>new Option(language==='ar'?p.name:p.nameEn,p.id)));
      if(ticket?.assigneeId){
        if(!people.some(p=>p.id===ticket.assigneeId))assigneeId.add(new Option(L('المسؤول الحالي','Current assignee'),ticket.assigneeId));
        assigneeId.value=ticket.assigneeId;
      }
      if(ticket?.kind==='document')assigneeId.disabled=true;
    };
    if(branchId)branchId.onchange=initAssignees;
    initAssignees();
    if(creating){
      const camera=form.elements.camera;
      form.querySelector('[data-camera]').onclick=()=>camera.click();
      camera.onchange=()=>{form.querySelector('[data-camera-file]').textContent=camera.files[0]?.name??'';};
    }
    form.querySelector('[data-cancel]').onclick=()=>editor.close();
    form.onsubmit=async event=>{
      event.preventDefault();event.stopPropagation();
      const submit=event.submitter,status=form.querySelector('[role=status]');
      const closeButtons=[editor.querySelector('header button'),form.querySelector('[data-cancel]')];
      submit.disabled=true;closeButtons.forEach(button=>button.disabled=true);status.textContent='';
      editor.oncancel=event=>event.preventDefault();
      try{
        const fields=new FormData(form);
        const files=creating?[...form.elements.files.files]:[];
        if(creating&&form.elements.camera.files[0])files.push(await fitCameraImage(form.elements.camera.files[0],L));
        const payload=creating?{operation:'create',requestId,branchId:fields.get('branchId'),name:fields.get('subject'),text:fields.get('text'),attachments:await readFiles(files,L)}:
          {operation:'details',itemId:ticket.id,expectedVersion:ticket.version,status:fields.get('status')};
        const result=await api(route,{...payload,assigneeId:assigneeId.value||null,dueOn:fields.get('dueOn')||null});
        if(!result.ok)throw Error(result.error);
        editor.close();filter='all';await load();
      }catch(error){status.textContent=error.message;}finally{submit.disabled=false;closeButtons.forEach(button=>button.disabled=false);editor.oncancel=null;}
    };
    editor.append(form);
    editor.showModal();
    if(ticket)void showComments(editor,ticket);
  }
  async function showComments(editor,ticket){
    try{
      const result=await api(route+'?itemId='+encodeURIComponent(ticket.id));
      if(!editor.open||!result.ok||!result.comments.length)return;
      const details=document.createElement('details');
      const prefix=location.pathname.replace(/\/employee\/?$/,'');
      details.innerHTML=`<summary>${L('التعليقات والمرفقات','Comments and attachments')}</summary>${result.comments.map(comment=>`<article><p>${esc(comment.text)}</p>${comment.attachment?`<a href="${esc(prefix)}/api/follow-up/attachment?itemId=${encodeURIComponent(ticket.id)}&commentId=${encodeURIComponent(comment.id)}">${esc(comment.attachment.name)}</a>`:''}</article>`).join('')}`;
      editor.append(details);
    }catch{/* Ticket editing remains available if comments cannot load. */}
  }
  await load();
}

async function fitCameraImage(file,L){
  if(file.size<=2*1024*1024&&['image/jpeg','image/png'].includes(file.type))return file;
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;
    await image.decode();
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));
    if(!blob)throw Error();
    return new File([blob],file.name.replace(/\.[^.]*$/,'')+'.jpg',{type:'image/jpeg'});
  }catch{throw Error(L('تعذّر تجهيز صورة الكاميرا. جرّب صورة أخرى.','Could not prepare the camera image. Try another photo.'));}
  finally{URL.revokeObjectURL(url);}
}

async function readFiles(files,L){
  if(files.length>3)throw Error(L('اختر ثلاثة مرفقات كحد أقصى.','Choose up to three attachments.'));
  return Promise.all([...files].map(async file=>{
    if(file.size>2*1024*1024||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw Error(L('اختر PDF أو صورة حتى 2 ميجابايت.','Choose a PDF or image up to 2 MB.'));
    const data=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error(L('تعذّرت قراءة المرفق.','Could not read attachment.')));reader.readAsDataURL(file);
    });
    return {name:file.name,mime:file.type,data};
  }));
}
