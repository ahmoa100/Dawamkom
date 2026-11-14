export const employeePage = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>حساب الموظف | dawamkom</title><link rel="stylesheet" href="/style.css"><script type="module" src="/employee.js"></script></head>
<body><main class="preview-access">
<h1 id="employee-title">حساب الموظف</h1><p id="employee-status" role="status"></p>
<dl id="employee-invitation" hidden>
<dt>البريد الإلكتروني</dt><dd><bdi id="invitation-email"></bdi></dd>
<dt>الشركة</dt><dd><bdi id="invitation-company"></bdi></dd>
</dl>
<form id="employee-auth" hidden>
<label id="employee-email">البريد الإلكتروني<input name="email" type="email" autocomplete="username"></label>
<label>كلمة المرور<input name="password" type="password" maxlength="128" required></label>
<p id="employee-password-rules" hidden>استخدم 10 أحرف على الأقل، مع حرف إنجليزي كبير وحرف صغير ورقم ورمز.</p>
<label id="employee-confirm">تأكيد كلمة المرور<input name="confirmation" type="password" autocomplete="new-password" maxlength="128"></label>
<button class="button primary" id="employee-submit"></button>
<button type="button" class="button secondary" id="employee-change" hidden>طلب تغيير الجوال</button>
</form>
<button class="button primary" id="employee-punch" hidden></button>
<button class="button secondary" id="employee-refresh" hidden>تحقق من الموافقة</button>
</main></body></html>`;
