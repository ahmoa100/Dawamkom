# Dawamkom | دوامكم

Dawamkom manages employee attendance, schedules, leave requests, and partner companies.

## Run locally

With Node.js 24 installed, run `node server.mjs`, then open [the app](http://127.0.0.1:4173) or [Super Admin → Partners](http://127.0.0.1:4173/super-admin#partners).

## Latest changes

- The partners table shows active companies in light green. The access switch suspends or restores company access, while the delete action asks for confirmation.
- The workplace map sends the site origin to OpenStreetMap when loading map tiles.

## AWS test deployment

The existing Lightsail container service is `dawamak-test` in `us-east-1`. Build from the Dockerfile, push a new image to that service, and use the existing deployment's environment and public endpoint settings with the new image. Check `/health` after the deployment becomes active.

Set Google sign-in values through the deployment environment using `DAWAMAK_GOOGLE_CLIENT_ID`, `DAWAMAK_GOOGLE_CLIENT_SECRET`, and `DAWAMAK_PUBLIC_ORIGIN`. Local company and demo data are stored in JSON files excluded from Git.

### Persistent storage on AWS

Set `DAWAMAK_STORAGE_BUCKET` to a private S3 bucket. `DAWAMAK_STORAGE_REGION` defaults to `us-east-1` and `DAWAMAK_STORAGE_KEY` defaults to `dawamkom/state.json`. Keep the same bucket and key across releases. Give the app's AWS credentials `s3:GetObject` and `s3:PutObject` on that key. Enable S3 Block Public Access and bucket versioning to protect account records and allow recovery.

For the initial migration, verify the current account snapshot and configure it as described below. Set `DAWAMAK_STORAGE_BOOTSTRAP=1` for the first startup if the object does not yet exist. S3 returns `NoSuchKey` only when the caller can list the bucket, so grant `s3:ListBucket` for this bootstrap or seed the object using deployment tooling. After initialization, remove the bootstrap flag, temporary list permission, and snapshot environment variable. The app loads the existing object on subsequent starts. It refuses to start if storage cannot be read and only acknowledges changes after saving them.

Before replacing a container that holds user data, preserve its company records and workspaces in private persistent storage and verify the replacement can read them before switching traffic.

For the AWS test deployment, `DAWAMAK_SAMPLE_COMPANY` can bootstrap a fixed demonstration workspace on a fresh container. Supply a stable company `id`, its `name`, `email`, `phone` and `contactName`, and a `snapshot` containing `workspace` and the company `account`. `workspace.slug` must match the company ID. The workspace includes employee records, and each active employee must include an `account`. The account objects contain the application's scrypt `salt` and `passwordHash`. Session and device tokens are not restored. Existing records take precedence over the snapshot. Keep the configuration private and outside Git.

## قاعدة رصيد الإجازة السنوية المعتمدة

حالة التنفيذ: القاعدة التالية متفق عليها، ولم تُطبّق حساباتها الجديدة في البرنامج بعد.

- تاريخ بداية الاستحقاق هو تاريخ انضمام الموظف الأصلي للشركة، وليس تاريخ تسجيله في النظام.
- الاستحقاق السنوي لكل موظف هو 0 أو 21 أو 30 يومًا. الاستحقاق صفر لا يولّد رصيدًا.
- يتراكم رصيد السنة التعاقدية الحالية تدريجيًا. المعدل الشهري هو الاستحقاق السنوي ÷ 12. الشحن المطلوب يومي، وأساس تحويل المعدل الشهري إلى يومي لم يُحسم بعد.
- عند بداية السنة التعاقدية التالية، يصبح المتبقي من السنة السابقة رصيدًا افتتاحيًا.
- تُخصم الإجازات من الافتتاحي أولًا، ثم من رصيد السنة الحالية.
- ينتهي المتبقي من كل سنة عند بداية السنة التعاقدية الثالثة محسوبة من بداية تلك السنة: رصيد سنة تبدأ 1/1/2000 ينتهي 1/1/2002، ورصيد السنة التالية ينتهي 1/1/2003.
- لتسجيل موظف قديم، تُستخدم بداية خدمته واستحقاقه السنوي وإجمالي رصيده المتبقي في تاريخ التسجيل لتوزيع الرصيد بين الافتتاحي والحالي وفق الخصم من الأقدم أولًا. يلزم حفظ تاريخ هذا الرصيد حتى لا يُحتسب الشحن مرتين.
- مثال: استحقاق 21 يومًا، خدمة سنة وأربعة أشهر، إجمالي متبقٍ 10 أيام: الافتتاحي 3 أيام والحالي 7 أيام.
- مثال: استحقاق 30 يومًا، خدمة سنة وثمانية أشهر، إجمالي متبقٍ 30 يومًا: الافتتاحي 10 أيام والحالي 20 يومًا، والمستخدم من الافتتاحي 20 يومًا ومن الحالي صفر.
