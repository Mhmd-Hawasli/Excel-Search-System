# تعليمات صارمة — ملزمة لكل وكلاء AI في هذا المشروع (Strict Testing Rules)

> هذه التعليمات دائمة وتسري على كل الجلسات. مخالفتها ممنوعة منعًا باتًا.
> These rules are permanent and binding on every AI agent session. Violating them is strictly forbidden.

## 0) بيئة الدوكر: التجارب هي المرتبطة بالمشروع — والإنتاج محظور لمسه نهائيًا

> اقرأ هذا القسم أولًا قبل أي أمر `docker`. مخالفته تعادل مخالفة حماية الحسابات.

### 0.1) دوكر التجارب (DEV) — الوحيدة المسموحة، وهي المرتبطة بالمشروع

- الملف الوحيد المعتمد: `docker-compose.dev.yml` (project name `v2-exp`).
- الحاويات: `excel-archive-exp-postgres` / `excel-archive-exp-backend` / `excel-archive-exp-frontend`.
- البورتات (host → container):
  - الواجهة: `3300 → 3000` → http://localhost:3300
  - الباك: `5005 → 5000` → http://localhost:5005
  - قاعدة البيانات: `5434 → 5432` (DB `excel_archive_2` على volume منفصل `excel_archive_exp_data`).
- كل أوامر الدوكر يجب أن تستهدفها حصرًا، ودائمًا بالصيغة الكاملة:
  - `docker compose -f docker-compose.dev.yml -p v2-exp up -d --build`
  - `docker compose -f docker-compose.dev.yml -p v2-exp ps`
  - `docker compose -f docker-compose.dev.yml -p v2-exp logs backend|frontend|postgres`
- ممنوع منعًا باتًا تشغيل `docker compose up` أو `docker compose ps` أو `docker compose logs`
  أو أي أمر `docker compose ...` **بدون** `-f docker-compose.dev.yml -p v2-exp`،
  لأن الأمر العاري يستهدف بيئة الإنتاج تلقائيًا.
- كل قيم الكود الافتراضية (fallbacks) يجب أن تشير إلى بورتات التجارب
  (`3300` / `5005` / `5434`) — أي قيمة `3000` / `5000` / `5432` في الكود الحي
  تعتبر بقايا ميتة يجب إصلاحها فورًا، باستثناء `docker-compose.yml` نفسه (إنتاج مجمّد).

### 0.2) دوكر الإنتاج (PROD) — ممنوع الاقتراب منها أو حذفها إطلاقًا

- الملف: `docker-compose.yml` (project `v2`) — مجمّد، لا يُعدَّل ولا يُعاد بناؤه.
- الحاويات: `excel-archive-2-postgres` / `excel-archive-2-backend` / `excel-archive-2-frontend`
  (بورتات `3000` / `5000` / `5432`).
- المحظورات (تشمل ولا تقتصر على):
  - `up` / `down` / `build` / `restart` / `stop` / `start` / `rm` / `pull`
    على أي حاوية `excel-archive-2-*` أو على ملف `docker-compose.yml`.
  - `docker exec` أو `docker logs` أو `docker inspect` على حاويات الإنتاج
    إلا لقراءة تحققية عابرة عند الضرورة القصوى — وبدون أي كتابة.
  - أي `pg_dump` أو `pg_restore` أو `psql` كتابةً ضد قاعدة الإنتاج (`5432`).
  - حذف أو تعديل volume `v2_excel_archive_2_data` أو network `v2_default`
    أو images `v2-backend` / `v2-frontend`.
- هذه البيئة تعمل حاليًا وتخدم المستخدم — اتركها بحالها تمامًا (Up ولا تُلمس).
- مجلد `test-artifacts/v1-reference/` أرشيف تاريخي — تجاهله ولا تعتبر بورتاته مرجعًا.

## 1) حسابات محظورة — يُمنع الاقتراب منها نهائيًا

الحسابان `mhmd` و `admin` **خارج نطاق الاختبار تمامًا**:

- ممنوع تسجيل الدخول بهما (واجهة أو API أو أي سكربت).
- ممنوع تغيير كلمات المرور الخاصة بهما أو إعادة تعيينها.
- ممنوع تعديل أو حذف أي من بياناتهما: الاسم المعروض، الحالة، الصلاحيات، أو أي سجل مرتبط بهما.
- ممنوع استخدام اسميهما في أي بيانات تجريبية أو سيناريو اختبار.
- ممنوع تخزين أو تدوين أو طلب كلمات المرور الخاصة بهما — لا حق وصول لوكيل الـ AI عليهما إطلاقًا.
- معلومات هذين الحسابين في قاعدة البيانات تبقى **كما هي تمامًا** دون أي مساس.

## 2) حساب الاختبار الوحيد المسموح — `test`

- حساب `test` هو الحساب **الوحيد** المخصص لتجارب الـ AI، وله كامل الحرية فيه:
  إنشاء وتعديل وحذف بيانات تجريبية، وتجربة كل الصلاحيات والسيناريوهات.
- بيانات الدخول الافتراضية: `test` / `test123`
  (تُفرض تلقائيًا عند كل إقلاع عبر `DbSeeder`، وقابلة للتجاوز عبر `TEST_USERNAME` / `TEST_PASSWORD`).
- يملك حساب `test` كامل صلاحيات المالك (`Permissions.OwnerGlobals`).
- كل تجارب الدخول تتم حصرًا ضد دوكر التجارب: http://localhost:3300 (واجهة) و http://localhost:5005 (API).

## 3) قاعدة البيانات

- لا يُنفَّذ أي `UPDATE` أو `DELETE` أو `RESET` على صفوف `mhmd` و `admin`
  في جدولي `users` و `user_permissions` لأي سبب كان.
- الاستعلامات المسموحة عليهما: قراءة تحققية فقط (`SELECT`) عند الضرورة للتأكد من سلامتهما.
- قاعدة التجارب (`localhost:5434`) نسخة من الإنتاج بتاريخ 2026-09-22
  (6 users / 3 groups / 9 files / 27240 records) — اعمل عليها بحرية
  باستثناء صفّي `mhmd` و `admin`.
- ممنوع توجيه أي كتابة إلى قاعدة الإنتاج (`localhost:5432`) لأي سبب كان.

## 4) قبل أي نشر إنتاجي

- احذف حساب `test` وفقرة الـ seed الخاصة به في `DbSeeder.cs` والقيم الافتراضية
  `TEST_USERNAME` / `TEST_PASSWORD` في `docker-compose.dev.yml` و `docker-compose.yml`.

## 5) إعادة البناء بالدوكر بعد كل تعديل — إلزامي ودائم (على بيئة التجارب فقط)

> هذه القاعدة دائمة وتسري على كل الجلسات والمحادثات، وليست مقتصرة على محادثة واحدة.
> This rule is permanent and applies to every session/conversation, not just the current one.

- بعد كل أمر تعديل أو إضافة على المشروع (أي تغيير في الكود أو الملفات)، يجب عليك **إلزاميًا**:
  1. إعادة البناء باستخدام دوكر التجارب حصرًا: `docker compose -f docker-compose.dev.yml -p v2-exp up -d --build`
  2. إعادة تشغيل المشروع والتأكد أنه يعمل (مثلًا عبر `docker compose -f docker-compose.dev.yml -p v2-exp ps` ومراجعة `docker compose -f docker-compose.dev.yml -p v2-exp logs` عند الحاجة).
  3. التحقق الحي: الواجهة http://localhost:3300 والباك http://localhost:5005/health/ready.
- ممنوع اعتبار المهمة منجزة دون تنفيذ خطوة إعادة البناء وإعادة التشغيل هذه.
- ممنوع استخدام أمر `docker compose` العاري (بدون `-f docker-compose.dev.yml -p v2-exp`) —
  فهو يمسّ بيئة الإنتاج المحظورة (§0.2).
- في حال فشل البناء أو التشغيل، أصلح الخلل ثم أعد المحاولة حتى يعمل المشروع.
