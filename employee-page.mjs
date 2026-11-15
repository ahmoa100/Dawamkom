export const employeePage = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#17353c">
<title>حساب الموظف | dawamkom</title><link rel="stylesheet" href="/style.css"><script type="module" src="/employee.js"></script></head>
<body class="employee-portal"><header class="employee-topbar">
<a class="brand" href="/"><span class="mark" aria-hidden="true"></span><span>دوامكم</span></a>
<nav id="manager-navigation" aria-label="حساب المدير العام" hidden><a href="#requests">الطلبات</a><a href="#account">حسابي</a></nav>
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
<section class="card" aria-labelledby="employee-attendance-title">
<h2 id="employee-attendance-title">الحضور والانصراف</h2>
<p id="employee-location-note" class="hint" hidden>لم تحدد الشركة موقع عمل بعد. يتاح تسجيل الحضور والانصراف بعد تحديده.</p>
<button type="button" class="button primary" id="employee-punch" hidden></button>
</section>
<section class="card" aria-labelledby="employee-requests-title">
<h2 id="employee-requests-title">طلب إجازة</h2>
<p id="employee-leave-empty" class="hint" hidden>لا توجد أنواع إجازات متاحة حاليًا.</p>
<form id="employee-request" hidden>
<label>نوع الإجازة<select name="type" required></select></label>
<div class="fields">
<label>من تاريخ<input name="date" type="date" required></label>
<label>إلى تاريخ<input name="end" type="date" required></label>
</div>
<label>السبب<textarea name="note" maxlength="1000" required></textarea></label>
<button class="button primary" type="submit">إرسال الطلب</button>
</form>
<p id="employee-request-status" role="status"></p>
</section>
</section>
<section id="manager-inbox" aria-label="الطلبات" hidden></section>
<button class="button secondary" id="employee-refresh" hidden>تحقق من الموافقة</button>
</main></body></html>`;
