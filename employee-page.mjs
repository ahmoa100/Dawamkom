export const employeePage = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#17353c">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><meta name="apple-mobile-web-app-title" content="دوامكم">
<link rel="manifest" href="./employee.webmanifest">
<title>حساب الموظف | dawamkom</title><link rel="stylesheet" href="/style.css"><script type="module" src="/employee.js"></script></head>
<body class="employee-portal"><header class="employee-topbar">
<a class="brand" href="/"><span class="mark" aria-hidden="true"></span><span>دوامكم</span></a>
<div class="employee-topbar-actions">
<!-- company-workspace-link -->
<button type="button" class="button secondary employee-icon-button" id="employee-messages" aria-label="التنبيهات" aria-haspopup="dialog" hidden><span class="employee-bell" aria-hidden="true"></span></button></div></header>
<div id="employee-toast" role="status" hidden></div>
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
<label class="remember-login" id="employee-remember"><input type="checkbox" name="remember">تذكّرني على هذا الجهاز</label>
<button class="button primary" id="employee-submit"></button>
<button type="button" class="button secondary" id="employee-change" hidden>طلب تغيير الجوال</button>
</form>
<section id="employee-dashboard" hidden>
<div data-employee-view="home">
<h2 class="employee-greeting" id="employee-greeting"></h2>
<section class="card employee-attendance-card" aria-label="الحضور والانصراف">
<p id="employee-shift" class="employee-shift" aria-live="polite"></p>
<time id="employee-timer" class="employee-timer" dir="ltr">00:00</time>
<p id="employee-location-note" class="hint" hidden>لم تحدد الشركة موقع عمل بعد. يتاح تسجيل الحضور والانصراف بعد تحديده.</p>
<button type="button" class="button primary" id="employee-punch"><img src="/punch-fingerprint.png" class="employee-punch-icon" alt="" width="30" height="30"><span id="employee-punch-label">تسجيل البصمة</span></button>
</section>
<div id="employee-home-tabs" class="employee-home-tabs" role="group" aria-label="عرض الرئيسية" hidden>
<button type="button" class="button" data-employee-home="personal" aria-pressed="true">ما يخصني</button>
<button type="button" class="button" data-employee-home="team" aria-pressed="false">ما يخص فريقي</button>
</div>
<div id="employee-personal-home">
<section class="employee-quick-actions" aria-labelledby="employee-quick-title">
<header><h2 id="employee-quick-title">عمليات سريعة</h2><button type="button" class="button secondary employee-icon-button" data-quick-request="all" aria-label="طلب جديد" aria-haspopup="dialog">+</button></header>
<div class="employee-quick-grid">
<button type="button" class="button secondary" data-quick-request="Missed punch" aria-haspopup="dialog">
<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M33 32a16.5 16.5 0 1 1 4-10M20 11v10l6 3"/><path class="employee-quick-accent" d="m26 38 13-13 5 5-13 13-6 1z"/></svg>تصحيح البصمة</button>
<button type="button" class="button secondary" data-quick-request="leave" aria-haspopup="dialog">
<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="7" y="13" width="34" height="26" rx="2"/><path d="M19 13V7h10v6M13 39v4m22-4v4"/><path class="employee-quick-accent" d="M15 18v16m18-16v16"/></svg>إجازة</button>
<button type="button" class="button secondary" data-quick-request="Attendance excuse" aria-haspopup="dialog">
<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M33 35a17 17 0 1 1 3-20M21 14v9l5 3"/><path class="employee-quick-accent" d="M31 28h13m-5-5 5 5-5 5"/></svg>الاستئذان</button>
</div>
</section>
<section class="card employee-home-requests" aria-labelledby="employee-home-requests-title">
<h2 id="employee-home-requests-title">طلباتي</h2>
<p id="employee-home-requests-empty" hidden>لا توجد طلبات حالية.</p>
<ul id="employee-home-requests-list" tabindex="0" aria-labelledby="employee-home-requests-title"></ul>
</section>
</div>
<div id="employee-team-home" hidden>
<section aria-labelledby="employee-team-leave-title"><h2 id="employee-team-leave-title">إجازات الفريق</h2><ul id="employee-team-leave" aria-labelledby="employee-team-leave-title" tabindex="0"></ul></section>
<section aria-labelledby="employee-team-requests-title"><h2 id="employee-team-requests-title">طلبات الفريق</h2><ul id="employee-team-requests" aria-labelledby="employee-team-requests-title" tabindex="0"></ul></section>
<p id="employee-team-status" role="status"></p>
</div>
</div>
<section data-employee-view="attendance" hidden><h2>الحضور</h2><div id="employee-attendance-slot"></div><div id="employee-attendance-history"></div></section>
<section data-employee-view="requests" hidden><h2>الطلبات</h2><div id="employee-requests-history"></div><button type="button" class="button primary" data-quick-request="all">طلب جديد</button>
<section class="card" id="employee-device-inbox" aria-labelledby="employee-device-title" hidden>
<h2 id="employee-device-title">الطلبات: تغيير الجوال</h2>
<div id="employee-device-list"></div>
<p id="employee-device-status" role="status"></p>
</section>
</section>
<section data-employee-view="more" hidden><div class="card employee-profile-summary"><h2 id="employee-more-name"></h2><p id="employee-more-title"></p><p id="employee-more-company"></p><button type="button" class="button secondary" data-employee-page="profile">عرض الملف الشخصي</button></div></section>
<section data-employee-view="profile" hidden>
<header class="employee-back-header"><button type="button" class="button secondary employee-icon-button" data-employee-page="more" aria-label="رجوع"><span dir="ltr" aria-hidden="true">›</span></button><h2 dir="auto">الملف الشخصي</h2></header>
<div class="card employee-profile-options"><button type="button" class="button secondary" id="employee-password-open">تغيير كلمة المرور</button>
<label>اللغة<select id="employee-language"><option value="ar">العربية</option><option value="en">English</option></select></label>
<details><summary>البيانات الوظيفية</summary><dl id="employee-job-details"></dl></details>
<button type="button" class="button secondary" id="employee-logout">تسجيل الخروج</button></div></section>
<nav class="employee-bottom-nav" aria-label="التنقل" id="employee-bottom-nav">
<button type="button" data-employee-page="home" aria-current="page"><span aria-hidden="true">⌂</span><span>الرئيسية</span></button>
<button type="button" data-employee-page="attendance"><span aria-hidden="true">▦</span><span>الحضور</span></button>
<button type="button" data-employee-page="requests"><span aria-hidden="true">▤</span><span>الطلبات</span></button>
<button type="button" data-employee-page="more"><span aria-hidden="true">☰</span><span>المزيد</span></button>
</nav>
<dialog class="employee-sheet" id="employee-password-dialog" aria-labelledby="employee-password-title">
<header><button type="button" data-employee-close class="button secondary employee-icon-button" aria-label="رجوع">›</button><h2 id="employee-password-title">تغيير كلمة المرور</h2></header>
<form id="employee-password-form"><label>كلمة المرور الحالية<input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label>
<label>كلمة المرور الجديدة<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label>
<label>تأكيد كلمة المرور<input name="confirmation" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label>
<button type="submit" class="button primary">حفظ</button><p id="employee-password-status" role="status"></p></form></dialog>
<dialog class="employee-sheet" id="employee-request-dialog" aria-labelledby="employee-requests-title">
<header class="employee-back-header"><button type="button" data-employee-close class="button secondary employee-icon-button" aria-label="رجوع"><span dir="ltr" aria-hidden="true">›</span></button><h2 id="employee-requests-title" dir="auto">طلب جديد</h2></header>
<form id="employee-request">
<label id="employee-request-type"><span>نوع الطلب</span><select name="type" required></select></label>
<label id="employee-excuse-type" hidden>النوع<select name="excuseType"></select></label>
<label><span id="employee-request-date-label">التاريخ</span><input name="date" type="date" required></label>
<fieldset id="employee-correction-times" class="employee-correction-times" hidden><legend>وقت التصحيح المقترح</legend><p id="employee-correction-status" role="status"></p>
<div class="employee-correction-option"><label><input type="checkbox" data-correction-time="proposedIn"><span>وقت الحضور المسجل</span></label><p id="employee-recorded-in"></p><input type="time" name="proposedIn" aria-label="وقت الحضور المقترح" disabled hidden></div>
<div class="employee-correction-option"><label><input type="checkbox" data-correction-time="proposedOut"><span>وقت الانصراف المسجل</span></label><p id="employee-recorded-out"></p><input type="time" name="proposedOut" aria-label="وقت الانصراف المقترح" disabled hidden></div>
</fieldset>
<label id="employee-request-end">انتهاء<input name="end" type="date"></label>
<div id="employee-leave-summary" role="status" hidden><span></span><span></span></div>
<label id="employee-excuse-reason" hidden>فئة السبب<select name="reason"></select></label>
<label id="employee-correction-reason" hidden>السبب<select name="correctionReason"></select></label>
<label id="employee-request-note"><span>السبب</span><textarea name="note" maxlength="1000" placeholder="اكتب الوصف…" required></textarea></label>
<label class="employee-upload" id="employee-attachment" hidden><span>اضغط لإرفاق ملف</span><small>SVG, PNG, JPG, PDF, DOC, DOCX, GIF · 2 MB</small><input type="file" name="attachment" accept=".svg,.png,.jpg,.jpeg,.pdf,.doc,.docx,.gif"></label>
<button class="button primary" type="submit">إرسال</button><p id="employee-request-status" role="status"></p>
</form></dialog>
<dialog class="employee-sheet" id="employee-messages-dialog" aria-labelledby="employee-messages-title">
<header><button type="button" data-employee-close class="button secondary employee-icon-button" aria-label="رجوع">›</button><h2 id="employee-messages-title">التنبيهات</h2></header>
<button type="button" class="button secondary" id="employee-enable-push" hidden>تفعيل إشعارات الاعتماد</button>
<p id="employee-push-status" role="status"></p>
<div id="employee-message-list"></div></dialog>
</section>
<button class="button secondary" id="employee-refresh" hidden>تحقق من الموافقة</button>
</main></body></html>`;
