export const employeePage = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#17353c">
<title>حساب الموظف | dawamkom</title><link rel="stylesheet" href="/style.css"><script type="module" src="/employee.js"></script></head>
<body class="employee-portal"><header class="employee-topbar">
<a class="brand" href="/"><span class="mark" aria-hidden="true"></span><span>دوامكم</span></a>
<!-- company-workspace-link -->
<button type="button" class="button secondary" id="employee-logout" hidden>تسجيل الخروج</button></header>
<main class="preview-access employee-content">
<div class="employee-heading"><h1 id="employee-title">حساب الموظف</h1><p id="employee-status" role="status"></p></div>
<dl id="employee-invitation" hidden>
<dt>البريد الإلكتروني</dt><dd><bdi id="invitation-email"></bdi></dd>
<dt>الشركة</dt><dd><bdi id="invitation-company"></bdi></dd>
</dl>
<form id="employee-auth" hidden>
<label id="employee-email">البريد الإلكتروني<input name="email" type="email" autocomplete="username" inputmode="email" dir="ltr"></label>
<label>كلمة المرور<input name="password" type="password" maxlength="128" required></label>
<p id="employee-password-rules" hidden>استخدم 10 أحرف على الأقل، مع حرف إنجليزي كبير وحرف صغير ورقم ورمز.</p>
<label id="employee-confirm">تأكيد كلمة المرور<input name="confirmation" type="password" autocomplete="new-password" maxlength="128"></label>
<button class="button primary" id="employee-submit"></button>
<button type="button" class="button secondary" id="employee-change" hidden>طلب تغيير الجوال</button>
</form>
<section id="employee-dashboard" hidden>
<div class="employee-home-toolbar"><button type="button" class="button secondary employee-icon-button" id="employee-messages" aria-label="طلباتي" aria-haspopup="dialog"><span aria-hidden="true">✉</span></button></div>
<h2 class="employee-greeting" id="employee-greeting"></h2>
<section class="card employee-attendance-card" aria-label="الحضور والانصراف">
<p id="employee-shift" class="employee-shift" aria-live="polite"></p>
<time id="employee-timer" class="employee-timer" dir="ltr">00:00</time>
<p id="employee-location-note" class="hint" hidden>لم تحدد الشركة موقع عمل بعد. يتاح تسجيل الحضور والانصراف بعد تحديده.</p>
<button type="button" class="button primary" id="employee-punch"><span class="employee-fingerprint" aria-hidden="true"></span><span id="employee-punch-label">تسجيل البصمة</span></button>
</section>
<section class="employee-quick-actions" aria-labelledby="employee-quick-title">
<header><h2 id="employee-quick-title">عمليات سريعة</h2><button type="button" class="button secondary employee-icon-button" data-quick-request="all" aria-label="طلب جديد" aria-haspopup="dialog">+</button></header>
<div class="employee-quick-grid">
<button type="button" class="button secondary" data-quick-request="Missed punch" aria-haspopup="dialog"><span class="employee-fingerprint" aria-hidden="true"></span>تصحيح البصمة</button>
<button type="button" class="button secondary" data-quick-request="leave" aria-haspopup="dialog"><span aria-hidden="true">☂</span>إجازة</button>
<button type="button" class="button secondary" data-quick-request="Attendance excuse" aria-haspopup="dialog"><span aria-hidden="true">▦</span>الاستئذان</button>
</div>
</section>
<section class="card" id="employee-device-inbox" aria-labelledby="employee-device-title" hidden>
<h2 id="employee-device-title">الطلبات: تغيير الجوال</h2>
<div id="employee-device-list"></div>
<p id="employee-device-status" role="status"></p>
</section>
<dialog class="employee-sheet" id="employee-request-dialog" aria-labelledby="employee-requests-title">
<header><button type="button" data-employee-close class="button secondary employee-icon-button" aria-label="رجوع">›</button><h2 id="employee-requests-title">طلب جديد</h2></header>
<form id="employee-request">
<label id="employee-request-type"><span>نوع الطلب</span><select name="type" required></select></label>
<label id="employee-excuse-type" hidden>النوع<select name="excuseType"></select></label>
<label><span id="employee-request-date-label">التاريخ</span><input name="date" type="date" required></label>
<label id="employee-request-end">انتهاء<input name="end" type="date"></label>
<label id="employee-excuse-reason" hidden>فئة السبب<select name="reason"></select></label>
<label>السبب<textarea name="note" maxlength="1000" placeholder="اكتب الوصف…" required></textarea></label>
<label class="employee-upload" id="employee-attachment" hidden><span>اضغط لإرفاق ملف</span><small>SVG, PNG, JPG, PDF, DOC, DOCX, GIF · 2 MB</small><input type="file" name="attachment" accept=".svg,.png,.jpg,.jpeg,.pdf,.doc,.docx,.gif"></label>
<button class="button primary" type="submit">إرسال</button><p id="employee-request-status" role="status"></p>
</form></dialog>
<dialog class="employee-sheet" id="employee-messages-dialog" aria-labelledby="employee-messages-title">
<header><button type="button" data-employee-close class="button secondary employee-icon-button" aria-label="رجوع">›</button><h2 id="employee-messages-title">طلباتي</h2></header>
<div id="employee-message-list"></div></dialog>
</section>
<button class="button secondary" id="employee-refresh" hidden>تحقق من الموافقة</button>
</main></body></html>`;
