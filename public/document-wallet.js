import {employeeText} from './employee-chinese.js';
import {escapeHtml as esc, cardIcons, iconBox, employeeActionDialog} from './employee-experience.js';
import {dateText} from './date-format.js';

function walletFileButton(action, documentUrl, file, L) {
  const control = document.createElement('button');
  const share = action === 'share';
  control.type = 'button';
  control.className = 'button secondary compact employee-wallet-icon';
  control.title = share ? L('إرسال الملف','Share file') : L('تحميل','Download');
  control.setAttribute('aria-label', control.title);
  control.innerHTML = iconBox(cardIcons[action]);
  control.onclick = async () => {
    const status = document.createElement('p');
    status.setAttribute('role','status');
    const dialog = control.closest('dialog, #shared-document-wallet');
    const isOpen = () => dialog.isConnected && (dialog.tagName !== 'DIALOG' || dialog.open);
    dialog.querySelector('.wallet-file-status')?.remove();
    status.className = 'wallet-file-status';
    status.textContent = L('جارٍ تجهيز الملف…','Preparing file…');
    dialog.querySelector('header').after(status);
    control.disabled = true;
    const failed = L('تعذّر فتح الملف. حاول مرة أخرى.','Could not open the file. Try again.');
    try {
      const response = await fetch(documentUrl, {redirect:'error'});
      if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== file.mime) throw Error();
      const blob = await response.blob();
      const extension = {'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'}[file.mime];
      if (!extension || !blob.size || blob.size > 10 * 1024 * 1024) throw Error();
      const title = file.name.replace(/[\\/\u0000-\u001f\u007f]/g,'_').replace(/\.(pdf|png|jpe?g)$/i,'').trim();
      const encoder = new TextEncoder();
      let name = '';
      for (const character of title) {
        if (encoder.encode(name + character).length > 230) break;
        name += character;
      }
      name = (name || 'document') + '.' + extension;
      if (!isOpen()) return;
      if (window.dawamkomNativeWalletFile) {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',',2)[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        if (!isOpen()) return;
        const result = await window.dawamkomNativeWalletFile({action,name,mime:file.mime,data});
        if (result.error) throw Error();
        status.textContent = result.saved ? L('تم حفظ الملف.','File saved.') : '';
        return;
      }
      const payload = {files:[new File([blob], name, {type:file.mime})]};
      if ((share || window.ReactNativeWebView) && navigator.canShare?.(payload)) {
        const openShare = async () => {
          try { await navigator.share(payload); status.remove(); }
          catch (error) {
            if (error.name === 'AbortError') status.remove();
            else if (error.name === 'NotAllowedError' && !status.querySelector('button')) showShareButton();
            else status.textContent = failed;
          }
        };
        const showShareButton = () => {
          const ready = document.createElement('button');
          ready.type = 'button';
          ready.className = 'button secondary compact';
          ready.textContent = share ? L('اختر تطبيق الإرسال','Choose app to share') : L('حفظ الملف','Save file');
          ready.onclick = () => void openShare();
          status.replaceChildren(ready);
        };
        if (navigator.userActivation?.isActive) await openShare();
        else showShareButton();
        return;
      }
      if (share || window.ReactNativeWebView) {
        status.textContent = window.ReactNativeWebView ? L('يتطلب هذا الخيار إصدارًا أحدث من التطبيق.','This action requires a newer app version.') :
          L('المشاركة غير متاحة في هذا المتصفح. حمّل الملف لإرساله من جهازك.','File sharing is unavailable in this browser. Download the file to share it from your device.');
        return;
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      dialog.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 60000);
      status.remove();
    } catch { status.textContent = failed; }
    finally { control.disabled = false; }
  };
  return control;
}

export async function showWalletPreview(file, url, L) {
  const dialog = employeeActionDialog(file.name, L('إغلاق المعاينة','Close preview'), 'employee-wallet-preview');
  dialog.querySelector('header button').before(walletFileButton('download',url,file,L),walletFileButton('share',url,file,L));
  const status = document.createElement('p');
  status.setAttribute('role','status');
  const unavailable = L('تعذّرت المعاينة. يمكنك استخدام زر التحميل أعلاه.','Preview unavailable. You can use the download button above.');
  dialog.append(status);
  dialog.showModal();
  if (file.mime !== 'application/pdf') {
    const image = document.createElement('img');
    image.alt = file.name;
    image.onerror = () => {image.remove();status.textContent = unavailable;};
    image.src = url + '&view=1';
    dialog.append(image);
    return;
  }
  let task;
  dialog.addEventListener('close', () => {void task?.destroy().catch(() => {});}, {once:true});
  try {
    status.textContent = L('جارٍ تحميل المعاينة…','Loading preview…');
    const lib = await import('/vendor/document-reader/pdf.mjs');
    if (!dialog.open) return;
    lib.GlobalWorkerOptions.workerSrc = '/vendor/document-reader/pdf.worker.mjs';
    task = lib.getDocument({url:url + '&view=1',isEvalSupported:false,useSystemFonts:true});
    const pdf = await task.promise;
    if (!dialog.open) return;
    const canvas = document.createElement('canvas');
    const controls = document.createElement('div');
    controls.className = 'actions';
    controls.innerHTML = '<button type="button" class="button secondary compact">' + L('السابق','Previous') +
      '</button><button type="button" class="button secondary compact">' + L('التالي','Next') + '</button>';
    const [previous,next] = controls.children;
    if (pdf.numPages > 1) dialog.append(controls);
    dialog.append(canvas);
    const render = async number => {
      previous.disabled = next.disabled = true;
      try {
        const page = await pdf.getPage(number);
        if (!dialog.open) return;
        const base = page.getViewport({scale:1});
        const availableWidth = dialog.clientWidth - parseFloat(getComputedStyle(dialog).paddingInlineStart) -
          parseFloat(getComputedStyle(dialog).paddingInlineEnd);
        const viewport = page.getViewport({scale:Math.min(
          Math.max(1, availableWidth) * Math.max(2, window.devicePixelRatio || 1) / base.width,
          2400 / Math.max(base.width,base.height),
        )});
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.aspectRatio = `${base.width} / ${base.height}`;
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        status.textContent = L('صفحة ','Page ') + number + ' / ' + pdf.numPages;
        previous.disabled = number === 1;
        next.disabled = number === pdf.numPages;
        previous.onclick = () => void render(number - 1);
        next.onclick = () => void render(number + 1);
      } catch {
        if (dialog.open) status.textContent = unavailable;
      }
    };
    await render(1);
  } catch {
    if (dialog.open) status.textContent = unavailable;
  }
}

export async function renderDocumentWallet(dialog, endpoint, language) {
  const L = (ar,en) => employeeText(language, ar, en);
  const status = document.createElement('p');
  status.setAttribute('role','status');
  status.textContent = L('جارٍ تحميل المستندات…','Loading documents…');
  dialog.append(status);
  try {
    const response = await fetch(endpoint + '/list');
    const {documents} = await response.json();
    if (!response.ok) throw Error();
    if (!dialog.isConnected || (dialog.tagName === 'DIALOG' && !dialog.open)) return;
    if (!documents.length) {
      status.textContent = L('لا توجد مستندات.','No documents.');
      return;
    }
    const groups = new Map();
    for (const file of documents) {
      const branchId = file.branchId || '';
      if (!groups.has(branchId)) {
        groups.set(branchId, {
          name: file.branchName || (branchId ? L('فرع غير متاح','Unavailable branch') :
            L('مستندات المنشأة · بدون فرع','Company-wide or unassigned')),
          files: document.createElement('ul'),
        });
      }
      const url = endpoint + '?id=' + encodeURIComponent(file.id);
      const row = document.createElement('li');
      const [expiryLabel,tone] = ({
        expired:[L('منتهي','Expired'),'red'], urgent:[L('قارب جدًا على الانتهاء','Expires very soon'),'red'],
        soon:[L('قارب على الانتهاء','Expires soon'),'amber'], valid:[L('ساري','Valid'),'green'],
        undated:[L('لا يوجد تاريخ انتهاء','No expiry date'),''],
      })[file.expiryStatus ?? file.expiry ?? (file.expiresOn ? 'valid' : 'undated')];
      row.innerHTML = '<strong><bdi>' + esc(file.name) + '</bdi></strong><div class="employee-wallet-expiry"><small>' +
        L('تاريخ الانتهاء','Expiry date') + '</small><span class="employee-wallet-expiry-value"><bdi>' + esc(dateText(file.expiresOn) || '—') + '</bdi>' +
        '</span><span class="badge employee-wallet-expiry-badge ' + tone + '">' + esc(expiryLabel) + '</span>' +
        '</div><div class="actions"><button type="button" class="button secondary compact employee-wallet-icon" title="' +
        L('معاينة','Preview') + '" aria-label="' + L('معاينة','Preview') + '">' + iconBox(cardIcons.eye) +
        '</button></div>';
      row.querySelector('button').onclick = () => void showWalletPreview(file,url,L);
      row.querySelector('.actions').append(walletFileButton('share',url,file,L));
      groups.get(branchId).files.append(row);
    }
    const sections = document.createDocumentFragment();
    const number = new Intl.NumberFormat(language);
    for (const {name,files} of groups.values()) {
      const section = document.createElement('details');
      section.className = 'employee-wallet-branch';
      const summary = document.createElement('summary');
      summary.textContent = name + ' (' + number.format(files.children.length) + ')';
      section.append(summary,files);
      sections.append(section);
    }
    status.replaceWith(sections);
  } catch {
    status.textContent = L('تعذّر تحميل المستندات.','Could not load documents.');
  }
}

const sharedWallet = document.querySelector('#shared-document-wallet');
if (sharedWallet) {
  let language = 'ar';
  try { if (localStorage.getItem('dawamkom-employee-language') === 'en') language = 'en'; } catch {}
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  if (language === 'en') document.title = sharedWallet.querySelector('h1').textContent = 'Document wallet';
  void renderDocumentWallet(sharedWallet, sharedWallet.dataset.endpoint, language);
}
