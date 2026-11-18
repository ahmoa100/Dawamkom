let context;
let busy = false;
let overlay;
let resizeObserver;
const steps = {
  1: ['settings', '.settings-tile[href="#settings/organization"]'],
  2: ['settings/organization', '[data-organization-tab="structure"]'],
  3: ['settings/organization', '#add-branch'],
  4: ['settings/organization', '#branch-form'],
  5: ['settings/organization', '.settings-back'],
  6: ['settings', '.settings-tile[href="#settings/punch-methods"]'],
  7: ['settings/punch-methods', '[data-punch-methods-tab="locations"]'],
  8: ['settings/punch-methods', '[data-edit-location]'],
  9: ['settings/punch-methods', '#location-form'],
  10: ['settings/punch-methods', '.settings-back'],
  11: ['settings', '.settings-tile[href="#settings/work-schedule"]'],
  12: ['settings/work-schedule', '[data-schedule-tab="periods"]'],
  13: ['settings/work-schedule', '#add-period'],
  14: ['settings/work-schedule', '#period-form'],
  15: ['settings/work-schedule', '.settings-back'],
  16: ['settings', '.settings-tile[href="#settings/staff-roles"]'],
  17: ['settings/staff-roles', '[data-create-catalog="job-title"]'],
  18: ['settings/staff-roles', '#job-title-form'],
  19: ['settings/staff-roles', '#nav a[href="#staff"]'],
  20: ['settings/staff-roles', '#nav a[href="#staff"]'],
};
function clear() {
  resizeObserver?.disconnect();
  document.querySelectorAll('.setup-highlight').forEach(node => node.classList.remove('setup-highlight'));
  overlay?.remove(); overlay = null;
  document.querySelector('#setup-welcome')?.remove();
}
async function advance(step, branchId) {
  if (busy) return;
  busy = true;
  try { await context.save('setup-guide', { step, ...(branchId ? { branchId } : {}) }); }
  catch (error) { alert(error.message); }
  finally { busy = false; mountSetupGuide(context); }
}
export async function setupGuideSaved(kind, branchId) {
  if (!context?.state.isCompanyOwner) return;
  const step = context.state.setupGuide?.step;
  if (kind === 'branch' && step === 4) await advance(5, branchId);
  if (kind === 'location' && step === 9) await advance(10);
  if (kind === 'period' && step === 14) await advance(15);
  if (kind === 'job-title' && step === 18) await advance(19);
}
export function restartSetupGuide() { return advance(0); }
export function mountSetupGuide(value) {
  context = value;
  clear();
  if (busy) return;
  if (value.superAdmin || !value.state.isCompanyOwner) return;
  const preview = new URL(location.href);
  if (preview.searchParams.get('setup') === '1') {
    preview.searchParams.delete('setup');
    history.replaceState(null, '', preview);
    void restartSetupGuide();
    return;
  }
  const ar = value.language === 'ar';
  const step = value.state.setupGuide?.step ?? 0;
  if (step >= 21) return;
  if (step === 0 || step === 19) {
    const dialog = document.createElement('dialog');
    dialog.id = 'setup-welcome'; dialog.className = 'catalog-dialog setup-welcome' + (step === 19 ? ' setup-congratulations' : '');
    const heading = document.createElement('h2');
    heading.textContent = step === 19 ? (ar ? 'مبروك، حسابك جاهز!' : 'Congratulations, your account is ready!') : (ar ? 'حياك الله' : 'Welcome');
    const text = document.createElement('p');
    text.textContent = step === 19 ? (ar ? 'حسابك جاهز بالإعدادات الأهم حاليًا، وبإمكانك إضافة موظفين من هنا.' : 'Your essential settings are ready. You can now add employees here.') : (ar ? 'إعداد حسابك رح يحتاج منك أقل من 3 دقائق في ثلاث خطوات مهمة.' : 'Set up your account in under 3 minutes with three important steps.');
    const button = document.createElement('button'); button.className = 'button primary';
    button.textContent = step === 19 ? (ar ? 'موافق' : 'OK') : (ar ? 'ساعدني في الإعداد' : 'Help me set up'); button.onclick = () => advance(step === 19 ? 20 : 1);
    const actions = document.createElement('div'); actions.className = 'actions';
    actions.append(button);
    if (step === 0) {
      const cancel = document.createElement('button'); cancel.className = 'button secondary';
      cancel.textContent = ar ? 'إلغاء، سأقوم بالإعداد بنفسي' : 'Cancel, I will set up myself';
      cancel.onclick = () => advance(21); actions.append(cancel);
    }
    dialog.append(heading, text, actions); document.body.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); void advance(21); });
    dialog.showModal();
    if (step === 0) return;
  }
  const [route, selector] = steps[step];
  if (location.hash.split('?')[0] !== '#' + route) { location.hash = route; return; }
  let target = document.querySelector(selector);
  if (step === 18 && !target?.closest('dialog')?.open) {
    queueMicrotask(() => {
      if (!busy && context.state.setupGuide?.step === 18) {
        document.querySelector('[data-create-catalog="job-title"]')?.click();
        mountSetupGuide(context);
      }
    });
    return;
  }
  if (step === 8 && value.state.setupGuide?.branchId)
    target = document.querySelector('[data-edit-location="' + CSS.escape(value.state.setupGuide.branchId) + '"]');
  // Reopen the form/tab after a refresh so the saved step remains usable.
  if (!target) {
    const recovery = step === 3 || step === 4 ? '[data-organization-tab="structure"]' :
      step === 8 || step === 9 ? '[data-punch-methods-tab="locations"]' : [13, 14].includes(step) ? '[data-schedule-tab="periods"]' : null;
    const recover = recovery && document.querySelector(recovery);
    if (recover?.getAttribute('aria-pressed') === 'false') { queueMicrotask(() => recover.click()); return; }
    const formOpener = step === 4 ? document.querySelector('#add-branch') : step === 9 ?
      document.querySelector('[data-edit-location="' + CSS.escape(value.state.setupGuide?.branchId ?? '') + '"]') : step === 14 ? document.querySelector('#add-period') : null;
    if (formOpener) { queueMicrotask(() => formOpener.click()); return; }
    return;
  }
  overlay = document.createElement('div'); overlay.className = 'setup-overlay';
  for (let i = 0; i < 4; i++) { const panel = document.createElement('div'); panel.className = 'setup-shade'; overlay.append(panel); }
  const tip = document.createElement('div'); tip.className = 'setup-tip'; tip.setAttribute('role', 'status');
  tip.textContent = step === 1 ? (ar ? '↓ اضغط هنا لإضافة الفرع الرئيسي والفروع' : '↓ Click here to add your main branch and other branches') : step === 6 ? (ar ? '↓ اضغط هنا لإضافة موقع الفرع على الخريطة' : '↓ Click here to add the branch location on the map') : step === 11 ? (ar ? '↓ اضغط هنا لإضافة فترات الدوام' : '↓ Click here to add work shifts') : step === 17 ? (ar ? '↓ اضغط هنا لإضافة مسميات وظيفية' : '↓ Click here to add job titles') : [19, 20].includes(step) ? (ar ? '↓ أضف موظفيك من هنا' : '↓ Add your employees here') : [4, 9, 14, 18].includes(step) ? (ar ? 'أكمل البيانات واحفظ للمتابعة' : 'Complete the details and save to continue') : (ar ? '↓ اضغط هنا' : '↓ Click here');
  const skip = document.createElement('button'); skip.className = 'button secondary setup-skip';
  skip.textContent = ar ? 'إنهاء الجولة' : 'End tour'; skip.onclick = () => advance(21);
  overlay.append(tip, skip); document.body.append(overlay); target.classList.add('setup-highlight');
  target.scrollIntoView({ block: 'center', behavior: 'instant' });
  const position = () => {
    if (!overlay || !target.isConnected) return;
    const rect = target.getBoundingClientRect(), pad = 7;
    const x = Math.max(0, rect.left - pad), y = Math.max(0, rect.top - pad);
    const right = Math.min(innerWidth, rect.right + pad), bottom = Math.min(innerHeight, rect.bottom + pad);
    const boxes = [[0,0,innerWidth,y],[0,y,x,bottom-y],[right,y,innerWidth-right,bottom-y],[0,bottom,innerWidth,innerHeight-bottom]];
    [...overlay.querySelectorAll('.setup-shade')].forEach((node, index) => {
      const [left, top, width, height] = boxes[index]; Object.assign(node.style, { left: left+'px', top: top+'px', width: width+'px', height: Math.max(0,height)+'px' });
    });
    const gap = 14;
    const tipWidth = tip.getBoundingClientRect().width;
    tip.style.left = Math.max(8, Math.min(innerWidth - tipWidth - 8, x)) + 'px';
    const tipHeight = tip.getBoundingClientRect().height;
    const above = y - tipHeight - gap;
    const below = bottom + gap;
    if (above >= 8) {
      tip.style.top = above + 'px';
      tip.textContent = tip.textContent.replace(/^↑ /, '↓ ');
    } else if (below + tipHeight <= innerHeight - 8) {
      tip.style.top = below + 'px';
      tip.textContent = tip.textContent.replace(/^↓ /, '↑ ');
    } else {
      // Tall forms may fill the viewport; keep the hint beside them where possible.
      const side = x >= tipWidth + gap + 8 ? x - tipWidth - gap : right + gap;
      tip.style.left = Math.max(8, Math.min(innerWidth - tipWidth - 8, side)) + 'px';
      tip.style.top = Math.max(8, Math.min(innerHeight - tipHeight - 8, y)) + 'px';
    }
  };
  position(); resizeObserver = new ResizeObserver(position); resizeObserver.observe(target); resizeObserver.observe(tip);
  overlay.reposition = position;
}
document.addEventListener('click', event => {
  if (!context?.state.isCompanyOwner || busy) return;
  const step = context.state.setupGuide?.step;
  if (!steps[step] || [4,9,14,18].includes(step)) return;
  const selected = event.target.closest(steps[step][1]);
  if (selected) void advance(step + 1);
}, true);
window.addEventListener('resize', () => overlay?.reposition?.());
window.addEventListener('scroll', () => overlay?.reposition?.(), true);

// Capture Escape before nested dialogs consume it, so it exits the whole tour.
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !context?.state.isCompanyOwner || context.superAdmin ||
      (context.state.setupGuide?.step ?? 0) >= 21) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void advance(21);
}, true);
