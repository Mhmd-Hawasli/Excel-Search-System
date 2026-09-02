# PLAN — نظام أرشفة والبحث في ملفات الإكسل

## تحديث 2026-09-02: الاستيراد متعدد الأوراق

- يدعم معالج الرفع والتحديث اختيار ورقة واحدة أو أوراق مترابطة. الأولى أساسية ومفتاحها عمود الرقم الوطني الذي يحدده المستخدم؛ العمود الأول في كل ورقة إضافية هو مفتاحها.
- `linkedSheets` اختيارية في إعدادات الرفع: أسماء الأوراق الإضافية ومؤشر عمود المفتاح الأساسي. المعاينة والعامل يستخدمان `lib/excel/linked-sheets.ts` للتحقق والدمج نفسه؛ تظل الإعدادات القديمة متوافقة ولا يلزم تغيير قاعدة البيانات.
- يُحفظ سجل واحد لكل صف أساسي. الربط بالرقم الوطني الصحيح بعد التطبيع الرقمي. تُرفض المفاتيح المكررة والصفوف الإضافية بلا مفتاح صالح أو بلا مقابل. غياب الصف الإضافي يُبقي الحقول الإضافية فارغة. أسماء الأعمدة المتكررة تميّز باسم الورقة، وعمود الربط الإضافي لا يكرر ضمن الأعمدة المجمعة.
- تبقى خريطة الحقول والفئات والمعاينة والجودة والبحث والتفاصيل والقوالب والاستبدال تعمل على الأعمدة المجمّعة، ويُثبت حقل الوطني على مفتاح الأساسية. يحمل `row_index` رقم صف الأساسية، و`file.sheet_name` اسمها، وتحفظ الأوراق المختارة في بيانات المهمة وسجل الرفع.
- الاستيراد المفرد تدريجي؛ المتعدد يقرأ المصنف في الذاكرة للربط ثم يحفظ بدفعات. تحقق `npm run test:linked-import` يختبر API والعامل والتحديث والتنظيف ضمن مجموعة مؤقتة فريدة.

## 1. Project Overview

تطبيق ويب داخلي يعمل على جهاز واحد أو خادم محلي لأرشفة ملفات الموارد البشرية العربية والبحث فيها. ينظم المستخدم الملفات في مجموعات، ويستورد ورقة واحدة من كل مصنف Excel مع الاحتفاظ بالقيم الأصلية كاملة داخل PostgreSQL. لأن الأعمدة تختلف بين الملفات، تحفظ الصفوف كـ JSONB مع تعريف مستقل للأعمدة وحقول قياسية قابلة للبحث. تُنشأ ظلال مطبّعة للنص العربي والأرقام من دون تعديل الأصل، ثم تُستخدم فهارس `pg_trgm` للبحث الجزئي السريع. تظهر كل نسخة من سجل الشخص كسطر مستقل، بينما يربط الرقم الوطني سجلات الشخص عبر جميع الملفات. الواجهة عربية بالكامل وRTL، محمية ببوابة دخول واحدة، وتدعم الاستيراد المرحلي، تقارير الجودة، الاستبدال، النسخ الاحتياطي، والسجل التشغيلي.

## 2. Full Specification

### 2.1 المنتج والبيئة

- تطبيق full-stack مبني بـ Next.js 15 App Router وTypeScript strict، باستخدام Route Handlers وServer Actions من دون خادم منفصل، ويعمل على Node.js فقط.
- PostgreSQL 16+ هو مخزن البيانات، و`pg_trgm` إلزامي. Prisma هو ORM، وتستخدم SQL خام للفهرسة والبحث المصنف.
- ExcelJS هو قارئ Excel الوحيد ويُستخدم بأسلوب streaming حيث تسمح واجهته. جميع الخلايا تقرأ كنص لحماية الأصفار البادئة والمعرفات الطويلة.
- Tailwind CSS وshadcn/ui لبناء الواجهة، TanStack Table للجداول، وnext-themes للوضعين الفاتح والداكن.
- الخط العربي Cairo ذاتي الاستضافة بواسطة `next/font`. يوفر المشروع `docker-compose.yml` لـ PostgreSQL و`.env.example`، ويستهدف تشغيلًا محليًا بسيطًا: install، ثم `db:push`، ثم `dev`.
- الملفات موزعة على مجموعات يحددها المستخدم. أسماء الملفات فريدة على مستوى النظام، وتكرار الأشخاص بين الملفات متوقع ومقصود.

### 2.2 اللغة والاتجاه والمظهر

- كل نص ظاهر للمستخدم بالعربية الطبيعية: العناوين، الأزرار، الرسائل، التحقق، الأخطاء، الحالات الفارغة والتنبيهات.
- الجذر `lang="ar" dir="rtl"`، مع محاذاة ومسافات وأيقونات وحركات مناسبة لـ RTL.
- مظهر فاتح وداكن مصممان عمدًا، قابلان للتبديل والحفظ بلا وميض خاطئ عند التحميل.
- الأرقام المعروضة لاتينية 0–9. التواريخ ميلادية `YYYY-MM-DD` ومعها وقت نسبي عربي حيث يفيد.

### 2.3 المصادقة

- لا مستخدمين ولا أدوار ولا تسجيل ولا استعادة كلمة مرور ولا جدول مستخدمين.
- اسم مستخدم وكلمة مرور وحيدان من `ADMIN_USERNAME` و`ADMIN_PASSWORD`، بقيم افتراضية `admin` و`admin123` موثقة في `.env.example`.
- صفحة دخول عربية تنشئ cookie جلسة موقّعة، `httpOnly` و`sameSite=lax` و`secure` عند استخدام HTTPS؛ تدعم HTTP على الشبكة المحلية حتى في الإنتاج. يعتمد الدخول على `ADMIN_USERNAME` و`ADMIN_PASSWORD` دون إعداد `SESSION_SECRET`، ويُشتق مفتاح التوقيع تلقائياً من بيانات الدخول.
- middleware يحمي جميع صفحات التطبيق ونقاط API عدا صفحة/إجراء الدخول والملفات العامة اللازمة، ويحتوي الرأس على تسجيل خروج.

### 2.4 التطبيع العربي

لا تعدّل القيم الأصلية مطلقًا؛ كل ما يعرض للمستخدم هو الأصل، والتطبيع يكتب في أعمدة ظل منفصلة.

`normalizeStored(value)` بالترتيب:

1. trim ودمج أي تتابع مسافات في مسافة واحدة.
2. تحويل الأرقام العربية الهندية U+0660–U+0669 والفارسية U+06F0–U+06F9 إلى 0–9.
3. حذف حركات U+064B–U+0652 وU+0670 وU+0653–U+0655 والتطويل U+0640.
4. `أ إ آ ٱ` ← `ا`، و`ؤ` ← `و`، و`ئ` ← `ي`، وحذف `ء` المستقلة.
5. `ة` ← `ه`.
6. `ى` ← `ي`.
7. إزالة المسافة التالية لكلمة `عبد` عبر `/عبد\s+/g`، مثل `عبد الله` ← `عبدالله`.
8. تحويل الأحرف اللاتينية إلى lowercase.

`normalizeQuery(value)` يطبق `normalizeStored`، يقسم على المسافات، ثم يحذف `ال` من بداية كل token فقط إذا بقيت 3 أحرف على الأقل، ويسقط tokens الفارغة. لا تُحذف `ال` عند التخزين.

دلالة المطابقة:

- النص: كل tokens يجب أن تطابق (AND)، وكل token يطابق كجزء نصي `ILIKE '%token%'` في القيمة المطبعة.
- الأرقام: يطابق ظل digits-only كجزء نصي، لذا `555` يطابق `123555123`.

حالات الاختبار الإلزامية:

| Query | Stored value(s) that must match | السبب |
|---|---|---|
| `احمد` | `أحمد`، `إحمد`، `آحمد` | الهمزة |
| `فاطمه` | `فاطمة` | التاء المربوطة |
| `فاطمة` | `فاطمه` | العكس |
| `مصطفي` | `مصطفى` | الألف المقصورة |
| `يحيى` | `يحيي` | العكس |
| `عبدالله` | `عبد الله` | قاعدة عبد |
| `عبد الله` | `عبدالله` | العكس |
| `قاسم` | `القاسم` | حذف ال من الاستعلام ومطابقة جزئية |
| `القاسم` | `قاسم` | حذف ال من الاستعلام |
| `احمد محمد` | `أحمد علي محمد` | AND بين tokens |
| `الله` | `عبدالله` | لا تحذف ال لأن الباقي أقصر من 3 |
| `555` | `123555123` | جزء رقمي |
| `٠١٢٣` | `0123` | تحويل الأرقام |
| `مُحَمَّــد` | `محمد` | الحركات والتطويل |

### 2.5 نموذج البيانات

قاعدة البيانات تستخدم `snake_case`:

- `groups`: `id`, `name` unique, `description`, `sort_order`, `created_at`, `updated_at`. تنظيم الملفات مع ترتيب يدوي.
- `files`: `id`, `group_id` FK cascade، `name` unique عالميًا، `description`, `original_filename`, `sheet_name`, `row_count`, `column_signature`, `version` يبدأ 1، `uploaded_at`, `updated_at`. يمثل ملفًا مستوردًا وإصداره البنيوي.
- `categories`: `id`, `name` unique, `sort_order`, `created_at`. تبويبات عالمية لتقسيم أعمدة التفاصيل.
- `file_columns`: `id`, `file_id` FK cascade، `header_raw`, `header_normalized`, `column_index`, `category_id` FK nullable مع `SET NULL`, `standard_field` enum nullable, `created_at`; unique (`file_id`, `column_index`). يصف أعمدة ملف ديناميكيًا.
- `records`: `id`, `file_id` FK cascade، `row_index`, `data` JSONB للقيم الأصلية، `created_at`. أعمدة نص قياسية: `sf_first_name`, `sf_father_name`, `sf_last_name`, `sf_full_name`, `sf_personal_no`, `sf_mother_name`, `sf_phone`, `sf_contract_code`, `sf_secondary_contract_code`. أعمدة BIGINT: `sf_national_id`, `sf_sham_cash`. أعمدة نص مطبع: `n_first_name`, `n_father_name`, `n_last_name`, `n_full_name`, `n_mother_name`, `n_contract_code`, `n_secondary_contract_code`. ظلال بحث رقمية نصية: `d_national_id` (معبأ إلى 11 دون اقتطاع), `d_personal_no`, `d_phone`؛ و`national_id_num` BIGINT nullable للربط.
- `upload_jobs`: `id`, `file_id` nullable، status enum (`pending`, `parsing`, `inserting`, `done`, `failed`), `total_rows`, `processed_rows`, `error_message`, `payload` JSONB، `started_at`, `finished_at`. حالة import قابلة للاستعلام بعد التنقل.
- `data_quality_issues`: `id`, `file_id` FK cascade، `row_index`, issue enum (`missing_national_id`, `invalid_national_id`, `duplicate_national_id`, `invalid_phone`, `empty_row`), `column_name`, `raw_value`, `created_at`.
- `activity_log`: `id`, action enum يغطي upload/update/replace/delete والـ group/category/backup restore، `target_name`, `details` JSONB, `created_at`.
- `mapping_templates`: إضافة لازمة لإكمال ميزة القوالب: `id`, `group_id` FK cascade، `name`, `header_signature`, `mapping` JSONB، `created_at`, `updated_at`; unique (`group_id`, `name`).

الفهارس: GIN `gin_trgm_ops` على أعمدة `n_*` الستة و`d_*` الأربعة، وB-tree على `records.file_id`, `records.national_id_num`, `file_columns.file_id`, `files.group_id`. تُفعّل extension في migration SQL.

الرقم الوطني: الأصل في `data` JSONB، والقيمة الرقمية في `sf_national_id` BIGINT بعد تحويل الأرقام العربية وحذف الفراغات، ونص العرض المعبأ بأصفار يسارية إلى 11 في `d_national_id` للبحث دون اقتطاع القيم الأطول. `national_id_num` BIGINT للربط فقط عندما يكون طول القيمة العددية 9–11. القيمة من 8 أرقام أو أقل أو 12 فأكثر أو ذات المحارف تولّد مشكلة تكامل؛ لا تدخل في الربط ولا تتوقف عملية الاستيراد. يُفحص الطول بعد إزالة الأصفار اليسارية وقبل تعبئة أصفار العرض. القيم التي تتجاوز BIGINT تبقى في الأصل دون تقريب. الترحيل واستعادة النسخ القديمة يعيدان حساب الحقول والجودة بنفس القاعدة.

### 2.6 تدفق الرفع

المعالج خمس خطوات:

1. اختيار المجموعة ورفع `.xlsx`/`.xls` واختيار ورقة واحدة من أسماء الأوراق؛ header في الصف 1 وكل الخلايا نصوص.
2. هوية الملف: اسم مطلوب وفريد بخطأ عربي واضح، وصف اختياري، وتاريخ تلقائي.
3. ربط أي subset من الأعمدة بالحقول القياسية الأحد عشر مع اقتراح تلقائي بمقارنة header المطبّع وتساهل التشابه، وإمكانية override.
4. ربط كل عمود بفئة عالمية، وغير المربوط يذهب إلى «أخرى».
5. preview لأول 20 صفًا، وعدد الأعمدة والصفوف وملخص mapping، ثم التأكيد.

الحقول القياسية: `first_name` الاسم text، `father_name` اسم الأب text، `last_name` النسبة text، `full_name` الاسم الثلاثي text، `national_id` الرقم الوطني numeric، `sham_cash` الشام كاش numeric، `personal_no` الرقم الذاتي numeric، `mother_name` اسم الأم text، `phone` رقم الهاتف numeric، `contract_code` رمز العقد الأساسي text، `secondary_contract_code` رمز العقد الثانوي text.

إذا لم يُربط `full_name` وربط first/father/last، يركب الاسم من الأجزاء غير الفارغة ويعلم UI أنه مركب. بعد import يمكن حفظ mapping القياسي والفئات keyed by header ضمن template للمجموعة واستعادته بنقرة.

التنفيذ job خلفية: progress محفوظ في DB، يمكن مغادرة الصفحة والعودة؛ stream للورقة، batch قرابة 1000 داخل transaction لكل batch. كل خلية string، والخلية الفارغة `""`. الصف الفارغ كليًا لا يدخل records ويسجل `empty_row`. الفشل يمحو الملف/السجلات الجزئية ولا يترك نصف import.

بعد النجاح يظهر تقرير دائم: العدد المستورد، missing ID، ID ليس 11 رقمًا، duplicate ID داخل الملف، malformed phone.

### 2.7 إعادة الرفع والتحديث

- البنية تقارن عبر قائمة `header_normalized` و`column_signature` بحيث لا تعدّ فروق المسافة والهمزة تغيرًا.
- عند التطابق: confirmation عربي يذكر العدد الحالي والجديد، ثم حذف جميع سجلات الملف وإدخال الجديدة؛ لا يحتفظ بالقديم.
- عند اختلاف البنية: diff واضح للأعمدة المضافة والمحذوفة والمتغيرة، ولا يسمح بتحديث مباشر. يعاد تشغيل wizard بمطابقات header القديمة مسبقًا، ويُنشأ replacement ناجح أولًا، ثم يحذف القديم، ويرث الجديد الاسم والمجموعة والوصف مع version+1، ويسجل النشاط.

### 2.8 البحث

- صفحة البحث فيها «البحث الكامل» على الحقول القياسية الأحد عشر (OR بين الحقول، مع دلالة AND داخل tokens للحقل)، و«البحث المخصص» لحقل واحد، وscope لكل الملفات أو مجموعة.
- يطبق `normalizeQuery`. الاستعلام الرقمي يركز الحقول الرقمية، والذي يحوي حروفًا يركز النصية، والبحث الكامل يدعم الاثنين وفق طبيعة query.
- pagination على الخادم مع total. الترتيب: تطابق normalized exact أولًا، ثم prefix، ثم substring.
- الإدخال debounced مع loading وحالة فارغة عربية تقترح تقليل الكلمات.
- كل record صف مستقل حتى للشخص نفسه. أعمدة النتائج: المجموعة — الملف، الاسم الثلاثي، الرقم الوطني، اسم الأم، الشام كاش، الرقم الذاتي. المفقود `—`، والرقم الوطني padded 11.
- يبرز substring المطابق ويعرض badge باسم الحقل المطابق، والنقر يفتح التفاصيل.

### 2.9 صفحة تفاصيل السجل

- رأس فيه الاسم الكامل، الرقم الوطني، والمصدر: المجموعة والملف والوصف وتاريخ الرفع.
- tabs حسب ترتيب categories ثم «أخرى»، ولا تظهر tab بلا أعمدة لهذا الملف.
- كل tab شبكة responsive من label = header Excel وvalue = النص الأصلي، مع إخفاء الفارغ افتراضيًا ونسخ كل قيمة.
- قسم بارز «ملفات أخرى لهذا الشخص» يجلب كل records الأخرى ذات `national_id_num` نفسه، ويعرض count والمجموعة والملف والتاريخ وروابط. إن لم يوجد ID صالح تظهر ملاحظة واضحة.

### 2.10 الصفحات الأخرى

- `/`: أعداد المجموعات والملفات والسجلات، أحدث الرفوع، وصندوق بحث كبير.
- `/groups`: الاسم والوصف وعدد الملفات والسجلات، إنشاء/إعادة تسمية/وصف/ترتيب/حذف. حذف المجموعة يتطلب كتابة الاسم ويذكر counts ثم يحذف cascade.
- `/groups/[id]`: ملفات المجموعة مع الاسم والوصف والتاريخ وعدد الصفوف والأعمدة، وروابط open/update/quality/delete مع confirmation صريح.
- `/upload`: المعالج. `/search`: البحث. `/records/[id]`: التفاصيل.
- `/settings/categories`: CRUD وترتيب الفئات. الحذف لا يحذف الأعمدة بل ينقلها إلى «أخرى»، ويعرض عدد الأعمدة والملفات المتأثرة.
- `/settings/backup`: تنزيل JSON كامل لكل groups/files/columns/categories/records وما يلزم للاستعادة، وrestore JSON مع تحذير واضح.
- `/logs`: activity log عكسيًا: الحدث والهدف والوقت.

### 2.11 الجودة العامة

- TypeScript strict ولا `any` في application code.
- كل قائمة لها empty state وloading skeleton. كل فعل هدّام يحدد الاسم والكمية. الأخطاء عربية ولا تعرض stack traces.
- البحث مصمم لـ500,000+ record و20+ ملف، وتتحقق خطة PostgreSQL من trigram indexes.
- تصميم أداة داخلية مدروس: ألوان هادئة، hierarchy حقيقي، spacing كريم وجداول كثيفة مقروءة؛ responsive حتى tablet، keyboard accessible.
- تعليقات الكود بالإنجليزية والنصوص الظاهرة بالعربية.

### 2.12 مراحل البناء والتتبع

يعمل البناء مرحلة بمرحلة ولا تبدأ التالية قبل إكمال checkboxes وتشغيل typecheck/build وإصلاحه. `PROGRESS.md` يحدّث بعد كل ملف، و`PLAN.md` يحدّث عند أي قرار أو schema أو phase drift. في النهاية يضاف Session Summary كامل أعلى PROGRESS.

### 2.13 إضافة 2026-09-02 — صفحة تضارب البيانات

- قسم مستقل `/conflicts` ورابط في التنقل، وأربع حالات رئيسية: بيانات خاطئة، بيانات ناقصة، تشابه الأسماء، تضارب البيانات. فلاتر مترابطة للحقل والحالة الفرعية، و31 قاعدة تفصيلية في `lib/conflicts/catalog.ts`.
- جدول موحد يقسم النتائج على الخادم ويرتبها بالاسم الثلاثي المطبّع ثم الأم والمصدر والصف. كل سجل يظهر مرة واحدة مع جميع مشكلاته المطابقة، واسم الملف الأصلي وصف Excel وروابط التفاصيل.
- الخطأ الوطني: 1–8 أرقام، 12 رقماً فأكثر، أو محارف غير رقمية؛ يقبل 9–11 رقماً بعد تحويل الأرقام العربية والفارسية وحذف الفراغات والأصفار اليسارية. تخزينه رقمي وعرضه 11 خانة بأصفار يسارية، مع إبقاء القيم الأطول كاملة لتوضيح الخطأ. الشام كاش: تحوّل الأرقام إلى اللاتينية وتحذف جميع الفراغات (بما فيها التبويب والأسطر وUnicode) قبل فحص 16 خانة والمحارف وقبل مقارنة المعرّفات. الحروف والرموز تبقى أخطاء، والأصفار البادئة محفوظة عند حساب طول الشام كاش. الفراغ الكامل مستقل في البيانات الناقصة.
- الاسم الثلاثي المربوط يقارن بعد التطبيع بتركيب **الاسم + اسم الأب + النسبة**، وفق تصحيح المستخدم الصريح. لا يحتاج تغيير خوارزمية الاستيراد.
- كل عمود يحتوي اسمه على «تاريخ» يفحص عندما تكون الخلية غير فارغة: تعذر التحويل، قبل 1940، بعد اليوم. الصيغ مطابقة لتنسيق التواريخ الموجود (يوم/شهر/سنة، ISO، ونص ExcelJS الإنجليزي)، مع التحقق من اليوم الفعلي والسنة الكبيسة.
- الناقص: الوطني، الشام كاش، الذاتي، الأم لجميع السجلات؛ والاسم الثلاثي والاسم والأب والنسبة عندما تكون مربوطة فقط. فراغ الاسم الثلاثي الأصلي يبقى ناقصاً حتى إذا ركّبه الاستيراد للعرض. القيم المشوهة غير الفارغة لا تصنّف مفقودة.
- تشابه الأسماء = الاسم الثلاثي المطبّع نفسه مع أكثر من اسم أم غير فارغ، عبر جميع الملفات، مع إظهار جميع الأطراف.
- التضارب: تكرار الوطني/الشام/الذاتي/العقد الرئيسي داخل الملف؛ الوطني/الشام/الذاتي لأكثر من شخص؛ والشخص نفسه لأكثر من وطني/شام/عقد رئيسي/ذاتي/مسمى وظيفي. الشخص = الاسم الثلاثي + الأم، وكلاهما غير فارغ. المسمى يستخرج من أعمدة Excel باسم «المسمى الوظيفي» وأسماء بديلة معروفة.
- مفاتيح المعرّفات تستخدم الأرقام العربية بعد تحويلها وتوحيد الأصفار البادئة، دون إسقاط المحارف لإنشاء تطابق كاذب؛ العقد والمسمى يستخدمان التطبيع النصي. القيم الفارغة لا تدخل التجميع.
- الاستعلامات مباشرة وقرائية في PostgreSQL؛ لا تغييرات مخطط ولا ترحيل بيانات ولا اعتماد على تقارير الجودة القديمة. الاستيرادات النشطة مستبعدة. المواد الوسيطة تُحسب مرة واحدة لتجنب تكرار فك JSON وتحويل التواريخ.
- التحقق: اختبارات فلاتر، واختبار PostgreSQL مستقل `npm run test:conflicts` يستخدم جداول مؤقتة فقط لكل القواعد والأطراف والحدود والصفحات، مع فحص الواجهة والبناء.

## 3. Tech Stack & Versions

Exact pinned versions selected for installation (the lockfile remains authoritative after install):

- Node.js 24.12.0 (host runtime), npm 11.19.0
- Next.js 15.5.24, React 19.1.9, React DOM 19.1.9
- TypeScript 5.9.2, `@types/node` 24.3.0, `@types/react` 19.1.12, `@types/react-dom` 19.1.9
- Tailwind CSS 3.4.17, PostCSS 8.5.26, Autoprefixer 10.4.21, tailwindcss-animate 1.0.7
- Prisma / `@prisma/client` 6.19.0, PostgreSQL 16
- ExcelJS 4.4.0
- TanStack React Table 8.21.3
- next-themes 0.4.6, lucide-react 0.542.0, sonner 2.0.7
- Zod 3.25.76, jose 6.1.0
- Radix UI Alert Dialog 1.1.15, Dialog 1.1.15, Label 2.1.7, Progress 1.1.7, Select 2.2.6, Slot 1.2.3, Tabs 1.1.13
- class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.3.1
- Vitest 3.2.7
- Security overrides: UUID 11.1.1, Effect 3.22.1, deepmerge-ts 8.0.2, PostCSS 8.5.26

## 4. Architecture

```text
app/
  (auth)/login/                 Arabic sign-in
  (protected)/                  authenticated app shell
    groups/, upload/, search/, records/, settings/, logs/
  api/                          auth, workbook inspection/import jobs, search, backup/restore
components/
  ui/                           shadcn-style primitives
  app-shell/, forms/, tables/, upload/, search/, records/
lib/
  auth/                         signed cookie and credentials
  db/                           Prisma client and raw SQL search
  excel/                        inspect, parse, mapping and background job
  normalization/               Arabic/digit normalization and tests
  actions/                      Server Actions, validation, logs
  utils/                        dates, JSON, UI helpers
prisma/
  schema.prisma                 canonical model
  migrations/                  extensions and hand-written trigram indexes
  seed.ts                       Arabic sample data
public/                         static assets only
middleware.ts                   route/API protection
```

Data flow: browser uploads workbook → inspection endpoint extracts sheets/headers/preview → wizard records mapping → job row created and source saved to a local temp path → in-process worker streams/parses chosen sheet → normalization generates shadows → batches insert records/issues → job/file finalize atomically at logical level → raw SQL search hits trigram shadows → UI always reads original `sf_*`/`data` values → `national_id_num` links person records.

## 5. Database Schema

The complete column/type/index/constraint contract is specified in §2.5. Prisma uses `String @db.Uuid` IDs generated by `uuid()`, `DateTime @db.Timestamptz(3)`, `Json @db.JsonB`, `BigInt`, enum mappings to snake_case, explicit `@@map`, and mapped column names. Cascade applies to group→files/templates and file→columns/records/issues; category deletion uses `SetNull`; upload job `file_id` uses `SetNull`. Unique and B-tree constraints are represented in Prisma; extension and ten trigram GIN indexes live in SQL migration.

## 6. Normalization Rules

The normative algorithm, matching semantics, and all fourteen mandatory bidirectional/substring cases are in §2.4. Tests directly exercise normalization and a `matchesNormalizedText` helper that mirrors SQL token-AND semantics. Numeric values use `digitsOnly`; national ID display/search uses `normalizeNationalId` with `padStart(11, "0")` only when 1–11 digits exist.

## 7. Build Phases

### Phase 0 — Planning

- [x] Read the source specification twice.
- [x] Create self-contained `PLAN.md`.
- [x] Create live `PROGRESS.md`.

### Phase 1 — Foundation

- [x] Scaffold Next.js App Router + strict TypeScript.
- [x] Configure Tailwind, shadcn-style primitives, RTL root, Cairo, and light/dark themes.
- [x] Build app shell/navigation and Arabic login/logout gate.
- [x] Configure Prisma/PostgreSQL, Docker Compose, and environment template.
- [x] Typecheck/build and close the phase.

### Phase 2 — Schema & normalization

- [x] Implement full Prisma schema and initial SQL with `pg_trgm` + ten trigram indexes.
- [x] Implement stored/query/digit/national-ID normalization.
- [x] Pass every mandatory normalization test unchanged.
- [x] Typecheck/build and close the phase.

### Phase 3 — Groups & categories

- [x] Implement group CRUD, counts, reordering, and typed-name cascade confirmation.
- [x] Implement category CRUD, counts, reordering, and SetNull warning/confirmation.
- [x] Add loading/empty/error states and activity logs.
- [x] Typecheck/build and close the phase.

### Phase 4 — Upload

- [x] Build five-step wizard with sheet selection, identity, mappings, categories, preview.
- [x] Implement ExcelJS inspection/streaming parse, auto-suggestion and composed full name.
- [x] Implement persisted background job/progress, ~1000-row batches and full cleanup on failure.
- [x] Implement data quality issues/report and reusable mapping templates.
- [x] Typecheck/build and close the phase.

### Phase 5 — Search engine

- [x] Implement safe raw SQL for full/custom, numeric/text, group scope, rank, pagination/count.
- [x] Verify query construction and document EXPLAIN procedure for a populated PostgreSQL instance.
- [x] Typecheck/build and close the phase.

### Phase 6 — Search UI & record detail

- [x] Implement debounced Arabic search UI and TanStack results table.
- [x] Add highlighting, matched-field badges, pagination and states.
- [x] Implement detail category tabs, hide-empty, copy, and national-ID cross-file links.
- [x] Typecheck/build and close the phase.

### Phase 7 — Update & replace

- [x] Inspect replacement structure and show normalized diff.
- [x] Implement same-structure destructive refresh confirmation.
- [x] Implement changed-structure versioned replacement with inherited identity and old-file cleanup after success.
- [x] Typecheck/build and close the phase.

### Phase 8 — Dashboard, logs, backup

- [x] Dashboard counts, uploads, and search CTA.
- [x] Reverse-chronological activity log.
- [x] Full JSON backup download and warned transactional restore.
- [x] Typecheck/build and close the phase.

### Phase 9 — Polish

- [x] Complete Arabic copy, skeleton/empty/error states, error boundaries and keyboard behavior.
- [x] Verify responsive tablet layout and both themes.
- [x] Add realistic seed and Arabic README runbook.
- [x] Run tests, typecheck, production build, and final review.
- [x] Write Session Summary at top of `PROGRESS.md`.

## 8. Decisions Log

- 2026-08-31 — Use UUID strings rather than auto-increment IDs so backup/restore can preserve stable references without sequence repair.
- 2026-08-31 — Add `mapping_templates`, which is required behavior but absent from the supplied table list; the JSON mapping preserves dynamic header keys.
- 2026-08-31 — Keep the requested local Next.js/PostgreSQL/auth architecture. Cloud Sites hosting and D1 are incompatible with the explicit PostgreSQL, raw TCP, Excel streaming, and local-network deployment requirements.
- 2026-08-31 — Originally used signed HMAC sessions with `jose` and `SESSION_SECRET`; superseded on 2026-09-02 by the user's request to require only username/password for LAN access. The signing key now derives from those credentials, cookies support HTTP LAN access in production, and dev/start explicitly bind to all interfaces.
- 2026-08-31 — Represent background work with a persisted DB job plus an in-process worker and local temp workbook. This supports navigating away/back without introducing a separate service.
- 2026-08-31 — Seed categories, groups, files and records through Prisma with Arabic examples; never seed production automatically.
- 2026-08-31 — Reject a selected sheet with duplicate non-empty header labels. JSONB keys and reusable header-keyed templates cannot represent two exact identical headers without data loss; the Arabic error asks the administrator to make headers unique in Excel.
- 2026-09-01 — Import replacement workbooks into a temporary database file and promote/move them in one transaction only after success. This keeps the old file intact if parsing or batch insertion fails, while the final state still permanently replaces the old rows as specified.
- 2026-09-01 — Backups include all durable business/audit tables. Upload jobs are included as history, but any restored nonterminal job is converted to failed because its local temporary workbook is intentionally not part of the backup.
- 2026-09-01 — Persist the inspected worksheet index alongside its name and initialize ExcelJS streaming workbook metadata defensively. Some valid `.xlsx` archives place worksheet entries before `workbook.xml`; index fallback preserves exact sheet selection without loading the workbook into memory.

## 9. Open Decisions / Assumptions

- True legacy BIFF `.xls` cannot be decoded by ExcelJS. The picker accepts the specified extension, then returns a clear Arabic conversion message if ExcelJS cannot parse it; `.xlsx` is fully supported. This honors the mandated parser and avoids silently adding SheetJS.
- Background jobs survive page navigation, but an abrupt Node process restart marks stale running jobs failed on next startup rather than resuming a partially read workbook. Partial file rows are deleted.
- Phone validity is defined as 7–15 digits after digit normalization; malformed values are retained and reported.
- Empty-row issues use the physical Excel row index and may exist only after a file record is created; skipped rows contribute to detected totals but not imported row count.
- Similarity suggestions use normalized exact/substring aliases plus trigram-like Dice similarity in application code, avoiding a DB round trip before import.
- Reordering uses explicit up/down controls and dense integer `sort_order`, which is accessible and sufficient for an internal tool.
- Backup restore is a replace-all transaction after schema/version validation. Auth environment values and upload temp files are never included.
- Production search plan verification requires a running PostgreSQL dataset; automated tests validate SQL shape, while README documents `EXPLAIN (ANALYZE, BUFFERS)` on representative data.
- Empty Excel header cells receive a stable visible label `عمود N` during inspection so every cell remains addressable; this generated label is shown in preview and stored as `header_raw`.

## 10. Known Limitations

- No multi-user accounts, roles, password recovery, retained file history, or external object storage, by specification.
- Legacy binary `.xls` files require conversion to `.xlsx` because ExcelJS does not support BIFF.
- In-process jobs do not automatically resume after a server process crash; cleanup preserves the no-half-import guarantee.
- Full backups are intended for a local administrator. Very large restores require the server's configured request-size and available memory to be sufficient.
- No cloud deployment is included because the application explicitly targets the user's PC/local server and requires PostgreSQL over TCP.
