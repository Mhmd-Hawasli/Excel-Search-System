# PROGRESS

## قراءة نتائج معادلات Excel وتشخيص مفتاح الربط — 2026-09-02

- فُحصت نسخة المصنف التي توافق صورة المستخدم دون تعديلها: `المؤهلات!A2` تستخدم `_xlfn.XLOOKUP(C2,الموظفون!A:A,الموظفون!B:B)` ونتيجتها المحفوظة `1`؛ العمود B في الأساسية عنوانه «م»، بينما الرقم الوطني موجود في C2 في الورقة الإضافية. المشكلة في عمود الإرجاع وليست قراءة نص المعادلة؛ يمكن استخدام `=C2` لهذا الملف.
- أضيف `lib/excel/cell-value.ts` لقراءة نتيجة المعادلة صراحة في العناوين والمعاينة والربط والاستيراد، مع حفظ نتائج الصفر والمنطقي ورموز أخطاء Excel. غياب النتيجة المحفوظة يظهر الورقة والخلية وخطوة إعادة الحساب والحفظ، دون تشغيل معادلات أو الوصول إلى روابط خارجية.
- أصبحت رسالة رفض المفتاح تعرض القيمة التي قرأها النظام وتوضح إن كانت نتيجة معادلة، مع استمرار شرط صلاحية الرقم الوطني. أضيفت اختبارات للنتائج الرقمية والنصية والصفر والفراغ والمعادلات المشتركة، وعُدلت تجربة الاستيراد الحية لتشمل مراجع داخلية ذات نتائج محفوظة.
- نجحت 163 وحدة اختبار والتحقق من الأنواع وتجربة الاستيراد والتحديث الحية بخلايا مفاتيحها نتائج معادلات داخلية. نُظفت بيانات الاختبار وبقي الأرشيف دون تغيير.

## استيراد عدة أوراق مترابطة بالرقم الوطني — 2026-09-02

- أضيف خيار «عدة أوراق مترابطة بالرقم الوطني» في معالجي الرفع والتحديث عبر مكوّن اختيار مشترك. الأولى أساسية، ومفتاحها قابل للاختيار، ويمكن تحديد أي عدد من الأوراق الإضافية التي تبدأ بالرقم الوطني. تعرض المعاينة عدد الصفوف المرتبطة والناقصة لكل ورقة.
- أضيفت خدمة معاينة `/api/workbooks/linked` ودالة دمج مشتركة مع عامل الاستيراد. الربط يطبع الأرقام العربية والفارسية والفراغات والأصفار، ويرفض المفاتيح المكررة أو الإضافية غير الصالحة أو غير الموجودة في الأساسية. يحفظ كل صف أساسي مرة واحدة وأعمدته الإضافية، ويميّز العناوين المتكررة باسم الورقة دون الكتابة فوق قيم أخرى. تبقى أرقام الصفوف من الأساسية، والحقول الناقصة فارغة.
- إعدادات الربط اختيارية في JSON المهام، ومتوافقة مع الرفع القديم والقوالب والنسخ الاحتياطي، ولا تتطلب migration. ثبت ربط الحقل الوطني على مفتاح الأساسية حتى عند تطبيق القوالب. وُسّع فحص المسمى الوظيفي ليتعرف على أعمدة الأوراق ذات اللواحق.
- نجحت 154 وحدة اختبار، واختبارات التضارب الـ31، والتحقق من الأنواع. نجح `npm run test:linked-import` على الخادم: معاينة واستيراد ثلاث أوراق، بحث رقمي، تفاصيل الأعمدة، تضارب المسميات، تحديث مطابق، ورفض تحديث بمفتاح يتيم مع بقاء السجلات السابقة سليمة. حُذفت مجموعة الاختبار وملفاتها ومهامها وسجلها، وبقي عدد سجلات الأرشيف دون تغيير.
- نجح البناء الإنتاجي بما فيه نقطة API الجديدة، ثم أعيد تشغيل خادم التطوير على `http://localhost:3000`.

## صفحة التفاصيل: إظهار الفارغ والبحث بأسماء الأعمدة — 2026-09-02

- تعرض `components/record-details.tsx` جميع الحقول افتراضياً، ويبدأ الزر بـ«إخفاء الحقول الفارغة». أضيف حقل بحث صغير بأسماء الأعمدة يدعم التطبيع العربي ويعمل عبر التبويبات مع مرشح الفراغ، ويختار تبويباً مطابقاً إذا اختفت نتائج التبويب الحالي.
- نجح `npm run typecheck`. تحقق المتصفح من ظهور 66 حقلاً في تبويب «أخرى» بينها 21 فارغاً، وانخفاضها إلى 45 عند الإخفاء، ثم إعادتها. اختُبر البحث عن «وطني» وانتقال التبويب عند إخفاء نتيجته الفارغة، ورسالة عدم وجود نتائج ومسح البحث.

## توحيد الرقم الوطني رقمياً وعرضه بـ11 خانة — 2026-09-02

- أصبح `sf_national_id` من نوع BIGINT. يحوّل الاستيراد الأرقام العربية والفارسية ويحذف الفراغات ويحتفظ بأصل Excel في JSON. تعتمد الجودة طول القيمة العددية قبل أصفار العرض: 9–11 صالح، و8 أو أقل أو 12 أو أكثر أو وجود محارف مشكلة تكامل. لا تُربط السجلات بمعرّفات غير صالحة؛ القيم خارج سعة BIGINT تبقى في الأصل دون تقريب.
- وحّدت `lib/format/national-id.ts` التحويل والفحص والعرض، وأضيف فاحص جودة مشترك للاستيراد والاستعادة. البحث وصفحة التضارب وتفاصيل السجل ونسخ الحقل تعرض `123456789` كـ`00123456789`، دون اقتطاع الأرقام الأطول. صفحة الجودة تبقي القيمة الأصلية لتفسير الخطأ. النسخ الاحتياطية تصدّر BigInt كنص JSON وتستعيد النسخ القديمة بعد إعادة تطبيع الحقول والجودة.
- طُبّقت migration `20260902140000_national_id_bigint` على 15,411 سجل في 6 ملفات بعد حفظ نسخة PostgreSQL في `tmp/backups/before-national-id-bigint-2026-09-02T08-42-45-230Z.dump`. تطابقت بصمات بيانات Excel الأصلية وتقارير الجودة الأخرى قبل الترحيل وبعده. أعيد احتساب الجودة الوطنية: 12 غير صالح، 2 تكرار، 67 مفقود.
- نجحت 136 وحدة اختبار، واختبارات قواعد التضارب الـ31، واختبار الترحيل المعزول `npm run test:national-id-migration`، والبناء الإنتاجي مع التحقق من الأنواع. تحقق كامل للبيانات أثبت تطابق الترحيل مع تحويل الاستيراد والاستعادة، دون تنفيذ استعادة فعلية على الأرشيف.
- تحقق حي مسجّل الدخول من البحث والتضارب وتفاصيل السجل وتصدير النسخة عبر HTTP: المثال الموجود في صورة المستخدم `4220039369` يعرض `04220039369`. بقي تصحيح الشام كاش سليماً (صفر حالات أطول من 16 بعد التنظيف). أعيد تشغيل خادم التطوير على `http://localhost:3000`.

## تصحيح فحص فراغات الشام كاش — 2026-09-02

- صحح `lib/conflicts/query.ts` احتساب الفراغات ضمن طول الشام كاش واعتبارها محارف خاطئة. الآن تحوّل الأرقام العربية والفارسية وتحذف جميع الفراغات قبل فحوص الطول والمحارف ومفاتيح التكرار والارتباط. تعرض رسائل الخطأ الطول بعد التنظيف، مع إبقاء قيمة المصدر ظاهرة.
- التنظيف يشمل المسافة وNBSP وUnicode والتبويب والأسطر الجديدة؛ لا يسقط الحروف والرموز. يحتفظ فحص الطول بالأصفار البادئة ويستخدم نص الأرقام الدقيق لتجنب تقريب معرّفات 16 خانة عبر JavaScript Number.
- حدّثت ملاحظات الواجهة والتوثيق، ووسع `scripts/verify-conflicts.ts` لتغطية القيم الصحيحة والمنقوصة والطويلة المكتوبة بفراغات، والفراغ الكامل، ومقارنة الصيغ المختلفة داخل الملف وبين الملفات، وتمييز رقمين من 16 خانة مختلفين في آخر رقم.
- نجح `npm run test:conflicts` لكل القواعد الـ31 و`npm run typecheck`. التعديل يطبق مباشرة على الملفات المستوردة سابقاً دون إعادة استيراد.
- تحقق حي عبر API على الخادم الجاري: «أكثر من 16 خانة» أصبحت 0 بدل 7,930 الظاهرة في صورة المستخدم؛ بقيت 17 حالة قصيرة وحالة واحدة ذات محارف. لم تظهر القيم الصحيحة بعد حذف الفراغات ضمن نتائج الخطأ.

## Session Summary — 2026-09-02: تضارب البيانات

- قرئت ملفات المشروع الأربعة `.md` وتتبع نموذج البيانات والاستيراد والاستبدال والتطبيع والبحث والمصادقة والواجهة. لا توجد ملفات AGENTS أو إعداد استضافة Sites في المشروع.
- أضيفت صفحة `/conflicts` ورابط التنقل وواجهة عربية بأربع حالات و31 حالة فرعية وفلاتر الحقل والمشكلة وجدول واحد مع ترقيم الصفحات وروابط المصدر والسجل وصف Excel.
- أضيف `lib/conflicts/catalog.ts` لتعريف الحالات والأنواع، و`request.ts` للتحقق من توافق الفلاتر وحدود الصفحات، و`query.ts` للتحليل القرائي المباشر في PostgreSQL. يجمع كل سجل مع مشكلاته ويظهر جميع أطراف التضارب والتكرار والتشابه.
- أكد المستخدم أن مقارنة الاسم الثلاثي تكون **الاسم + اسم الأب + النسبة**. تعريف الشخص في التضارب هو **الاسم الثلاثي + اسم الأم** بعد التطبيع، مع استبعاد الهوية غير المكتملة من تجميع الأشخاص.
- تُقرأ خلايا full_name وsham_cash من JSON الأصلي لحماية فحص الفراغ والمحارف من التركيب والتحويل الرقمي. بقية sf_* النصية تحتفظ بالأصل. تفحص أعمدة التاريخ والمسمى الوظيفي دون إضافة حقول قياسية أو تغييرات مخطط.
- أضيف `scripts/verify-conflicts.ts` وأمر `npm run test:conflicts`: جداول PostgreSQL مؤقتة فقط؛ 31 قاعدة، الحدود، المحارف، الفراغ الأصلي، الأرقام العربية والأصفار، تشابه الأسماء، ارتباطات داخل/بين الملفات، جميع الأطراف، عدة مشكلات لسجل واحد، الصفحات، الأرشيف الفارغ، واستبعاد الاستيراد النشط.
- التحقق النهائي ناجح: 104 اختبارات في 15 ملفاً، واختبار PostgreSQL للقواعد الـ31، وTypeScript strict، و`npm run build`. نسخة الإنتاج تعمل على `http://localhost:3000/conflicts`.
- كشف الفحص الحي بطئاً في إعادة تقييم تعبيرات JSON/التواريخ (38 ثانية على 15,411 سجلاً). أضيفت CTEs مادية للقيم الوسيطة واستُخدمت النصوص الأصلية الموجودة عندما تكون آمنة؛ القياس التالي للاستعلام الشامل للبيانات الخاطئة أصبح نحو 4.5 ثوانٍ، والنتائج نفسها.
- الملفات المضافة: `app/(protected)/conflicts/{page,loading}.tsx`, `app/api/conflicts/route.ts`, `components/conflicts-interface.tsx`, `lib/conflicts/{catalog,request,query}.ts`, `lib/conflicts/request.test.ts`, `scripts/verify-conflicts.ts`. الملفات المحدثة: `components/app-shell.tsx`, `package.json`, وملفات التوثيق الأربعة.
- فحص المتصفح: الحالات الأربع والفلاتر التابعة وترقيم الصفحات والمظهران، دون أخطاء وحدة التحكم. جرى فحص عرضي 1024 و390، وإصلاح تجاوز شريط التنقل عرض الجهاز اللوحي بتحويل التنقل الأفقي إلى نقطة `xl`؛ عرض الصفحة لا يتجاوز الشاشة والجدول يمرر داخلياً.
- فحص إنتاج HTTP: الصفحة وواجهات الحالات الأربع ترجع 200، الوصول غير المصادق إلى API يرجع 401، وتركيبة فلاتر غير متوافقة ترجع 400. نتائج الأرشيف الحالي: خاطئة 9,337 (نحو 4.8 ثانية)، ناقصة 1,773 (1.1 ثانية)، تشابه 324 (1.1 ثانية)، تضارب 1,808 (1.8 ثانية). الأعداد عدد سجلات فريدة لكل حالة وليست مجموع المشكلات؛ قد يقع السجل في أكثر من حالة.
- لم يتغير مخطط قاعدة البيانات ولم تتغير سجلات المستخدم. لا حاجة إلى migration أو إعادة استيراد الملفات لاستخدام الصفحة.

## Session Summary

اكتمل بناء نظام أرشفة والبحث في ملفات الإكسل من الصفر عبر المراحل 0–9. التطبيق Next.js 15 عربي كامل وRTL، يدعم المظهرين، بوابة مسؤول موقعة، PostgreSQL/Prisma مع `pg_trgm` وعشرة فهارس GIN، إدارة المجموعات والفئات والملفات، معالج رفع من خمس خطوات، ExcelJS streaming، تطبيع عربي مطابق للمواصفات، مهام خلفية وتقدم محفوظ، تقارير جودة، قوالب ربط، بحث خام مصنف ومقسم الصفحات، تفاصيل أصلية ضمن تبويبات، ربط الشخص عبر الرقم الوطني، تحديث/استبدال آمن بإصدار، لوحة إحصاءات، سجل نشاط، ونسخ JSON كامل واستعادة محذرة.

التحقق النهائي ناجح: Prisma schema صالح وClient مولد؛ `npm audit` الكامل = صفر ثغرات؛ 36 اختبارًا تمر في 7 ملفات؛ TypeScript strict يمر؛ وفحص المصدر لا يجد `any` أو TODO/FIXME أو debug logging. `npm run build` اكتمل بنجاح لكل الصفحات ونقاط API، واكتمل اختبار إنتاجي شامل للرفع والقوائم والجودة والبحث على PostgreSQL المحلي.

قرارات تحتاج الانتباه: ملفات BIFF القديمة ذات امتداد `.xls` يجب تحويلها إلى `.xlsx` لأن ExcelJS لا يقرأها؛ مهام الرفع تتحمل التنقل لكن لا تستأنف تلقائيًا بعد انهيار عملية Node؛ ويجب تغيير بيانات `admin/admin123` و`SESSION_SECRET` قبل فتح النظام على الشبكة. استُخدمت خدمة PostgreSQL 17 المحلية من دون Docker بعد تزويد بيانات اعتماد المسؤول صراحة، ثم طُبّق المخطط والفهارس والبيانات التجريبية وتحققت مسارات التشغيل الحية.

طريقة التشغيل: انسخ `.env.example` إلى `.env` وعدّل السر وبيانات الدخول، ثم استخدم PostgreSQL المحلي أو شغّل `docker compose up -d`، وبعدها `npm install` و`npm run db:push` و`npm run dev`. لإضافة عينات عربية مترابطة نفّذ `npm run db:seed`. التفاصيل الكاملة وفحص خطة البحث موجودان في `README.md`.

**Last updated:** 2026-09-01T07:31:00+03:00
**Current phase:** Phase 9 — Polish (complete)
**Build status:** passing (36 tests, strict typecheck, live production E2E/PostgreSQL verification, zero audit findings, production build)
**Next action:** The production server is running at `http://localhost:3000`; the dedicated E2E group and workbook remain available for inspection.

## Live runtime verification

- Used the existing PostgreSQL 17.5 Windows service without Docker and created only the isolated `excel_archive` role/database.
- Added the ignored local `.env`, applied the Prisma schema, installed `pg_trgm`, and verified all 10 required GIN trigram indexes.
- Fixed `db:push` to pass `--schema prisma/schema.prisma` to `prisma db execute`, as required by the installed Prisma CLI.
- Seeded and verified 2 groups, 2 files, 4 records, 11 mapped columns, and 2 activity entries.
- Verified the unauthenticated redirect, invalid and valid login responses, HttpOnly/SameSite session cookie, all primary protected pages, numeric and Arabic text search, record/group/file/quality/update detail pages, and backup export.
- Re-ran the final gates after the live fix: 30/30 tests, strict typecheck, and the complete Next.js production build all pass.

## Production end-to-end verification

- Generated `test-artifacts/production-e2e-arabic.xlsx` with two sheets, eight columns, six Arabic employee rows, Arabic-Indic digits, a duplicate national ID, one missing ID, one invalid ID, and one invalid phone.
- Ran the real five-step upload wizard against a production build, including sheet selection, automatic standard-field mapping, category mapping, preview, background import, progress, and completion.
- The first run exposed an ExcelJS streaming archive-order defect (`Cannot read properties of undefined (reading 'sheets')`). The failed import left no partial file or records.
- Added an archive-order-safe streaming worksheet matcher and persisted the inspected sheet index through upload and replacement flows. A regression test now covers workbooks whose worksheet entries precede `workbook.xml`.
- Repeated the complete browser upload successfully: 6/6 records imported from `الموظفون`, with 8 columns and four expected quality findings.
- Verified group/file listings, file details, the quality report, all three record-category tabs, cross-file duplicate-person linking, and activity log entries.
- Verified normalized full-name search (`سهى النجار`, 2 results), Arabic-Indic phone search (`٠٩٤٤٥٥٦٦٧٧`, 1 result), and national-ID search (`00123456789`, 2 results).
- Cross-checked PostgreSQL directly: one E2E group, one file, six records, eight columns, four quality issues, a completed 6/6 job, the safely failed initial job, and the expected activity events.
- Final gates after the fix: 31/31 tests in four files, strict typecheck, successful production build, and no production-server runtime errors during the E2E pass.

## Standard-field mapping layout update

- Reorganized upload step 3 around the ten fixed system fields instead of the variable Excel columns.
- Each fixed field is now shown on the right with an Excel-column selector on the left; unavailable fields remain explicitly unlinked.
- Preserved automatic suggestions and saved templates, while preventing one Excel column from being assigned to multiple system fields.
- Verified the change with 31/31 tests, strict typecheck, and a successful optimized production build.

## Unlinked standard-field validation fix

- Confirmed that `null`/«غير مربوط» is valid for every standard field and added schema regression coverage for it.
- Fixed duplicate automatic suggestions that could remain hidden behind the inverted mapping UI and trigger a false duplicate-field rejection at import time.
- Applied the same deduplication to saved upload templates and replacement-file suggestions while retaining the server-side duplicate safety check.
- Completed a real production-browser import with three standard fields left unlinked: 6/6 rows imported successfully with no warning.
- Verified the completed file and job directly in PostgreSQL, then ran the now-serialized ExcelJS test suite twice: 33/33 tests passed both times, with strict typecheck passing.

## Person and upload date formatting

- Added display-only parsing for ExcelJS date strings, ISO dates, `dd-mm-yyyy`, and Arabic/Persian digits; stored record values remain unchanged.
- Person-detail dates now render as `dd/mm/yyyy`, and the copy action uses the same readable displayed value.
- Upload timestamps now render consistently as `dd/mm/yyyy hh:mm AM/PM` across person details, related records, group files, file details, and the dashboard.
- Verified a real production record containing several ExcelJS date strings: birth and employment dates rendered correctly, while its upload timestamp included date and time.
- Final verification passes with 36/36 tests, strict typecheck, and an optimized production build.

## Phase status

| Phase | Name | Status | Notes |
|---|---|---|---|
| 0 | Planning | done | Specification read twice; self-contained plan created. |
| 1 | Foundation | done | Typecheck and production build pass. |
| 2 | Schema & normalization | done | Prisma valid; mandatory matrix passes with 19 tests. |
| 3 | Groups & categories | done | CRUD, ordering, confirmations, counts, logs and states compile. |
| 4 | Upload | done | Wizard, worker, progress, quality and templates compile. |
| 5 | Search engine | done | Parameterized engine and classification tests pass. |
| 6 | Search UI & record detail | done | UI, detail tabs and cross-file links compile. |
| 7 | Update & replace | done | Safe temporary import and transactional promotion compile. |
| 8 | Dashboard, logs, backup | done | Live dashboard, audit, full backup/restore and file overview pass build. |
| 9 | Polish | done | Arabic runbook/seed/global states, security hardening and final gates pass. |

## File log

| File | Action | Phase | Purpose |
|---|---|---|---|
| `PLAN.md` | created | 0 | Canonical self-contained product and implementation plan. |
| `PROGRESS.md` | created | 0 | Live build state and handoff log. |
| `package.json` | created | 1 | Pinned scripts and dependencies. |
| `tsconfig.json`, `next-env.d.ts`, `next.config.ts` | created | 1 | Strict Next.js configuration. |
| `postcss.config.mjs`, `tailwind.config.ts`, `components.json` | created | 1 | Tailwind and shadcn setup. |
| `.gitignore`, `.env.example`, `docker-compose.yml` | created | 1 | Local environment and PostgreSQL infrastructure. |
| `prisma/schema.prisma` | created | 1 | Prisma PostgreSQL foundation. |
| `lib/cn.ts` | created | 1 | Shared class composition helper. |
| `lib/auth/config.ts`, `lib/auth/session.ts`, `middleware.ts` | created | 1 | Signed single-admin session and route protection. |
| `components/ui/*` | created | 1 | Reusable shadcn-style foundation controls. |
| `components/theme-provider.tsx`, `components/theme-toggle.tsx` | created | 1 | Persistent light/dark themes. |
| `components/app-shell.tsx`, `components/login-form.tsx` | created | 1 | RTL navigation shell and Arabic sign-in form. |
| `app/globals.css`, `app/layout.tsx` | created | 1 | Intentional palette, Cairo, RTL metadata and root providers. |
| `app/(auth)/login/page.tsx`, `app/api/auth/*` | created | 1 | Arabic login/logout flow. |
| `app/(protected)/*` | created | 1 | Protected dashboard slice and loading/error states. |
| `package-lock.json` | regenerated | 1 | Exact dependency graph for the pinned stack. |
| `PLAN.md` | updated | 1 | Phase 1 checklist closed after verification. |
| `PROGRESS.md` | updated | 1 | Phase 1 build result and handoff recorded. |
| `prisma/schema.prisma` | expanded | 2 | Complete snake_case relational model, enums, constraints and indexes. |
| `prisma/migrations/20260831231000_init/migration.sql` | created | 2 | Full PostgreSQL schema, pg_trgm extension and ten GIN indexes. |
| `prisma/migrations/migration_lock.toml` | created | 2 | Locks migrations to PostgreSQL. |
| `lib/normalization/arabic.ts` | created | 2 | Ordered Arabic, query, numeric and national-ID normalization. |
| `lib/normalization/arabic.test.ts` | created | 2 | Mandatory Section 5.4 test matrix and helper edge cases. |
| `vitest.config.ts` | created | 2 | Deterministic Node test configuration. |
| `prisma/schema.prisma` | formatted | 2 | Prisma canonical formatting applied and client generated. |
| `PLAN.md` | updated | 2 | Phase 2 checklist closed after all gates passed. |
| `PROGRESS.md` | updated | 2 | Phase 2 verification result recorded. |
| `lib/db/prisma.ts` | created | 3 | Development-safe Prisma singleton. |
| `lib/actions/groups.ts` | created | 3 | Validated group CRUD, ordering, cascade confirmation and logging. |
| `lib/actions/categories.ts` | created | 3 | Validated category CRUD, ordering, SetNull confirmation and logging. |
| `components/ui/alert-dialog.tsx` | created | 3 | Accessible shadcn-style destructive confirmation primitive. |
| `components/typed-delete-button.tsx` | created | 3 | Typed-name deletion confirmation. |
| `components/page-header.tsx`, `components/flash-message.tsx`, `components/empty-state.tsx` | created | 3 | Shared Arabic page feedback and empty states. |
| `app/(protected)/groups/*` | created | 3 | Group list/detail, editing, counts, ordering and loading/not-found states. |
| `app/(protected)/settings/categories/*` | created | 3 | Category management and loading state. |
| `lib/actions/categories.ts` | fixed | 3 | Preserve validated/nonnulled values across transaction callbacks. |
| `PLAN.md` | updated | 3/4 | Phase 3 closed; duplicate/empty header decisions recorded. |
| `PROGRESS.md` | updated | 3 | Phase 3 verification result recorded. |
| `lib/excel/types.ts`, `lib/excel/standard-fields.ts` | created | 4 | Workbook types, ten fields, Arabic labels, aliases and similarity suggestions. |
| `lib/excel/workbook.ts`, `lib/excel/config.ts` | created | 4 | Safe temp storage, sheet inspection, preview, signatures and validated configuration. |
| `lib/excel/import-worker.ts` | created | 4 | ExcelJS streaming job, normalization, ~1000-row batches, quality issues and cleanup. |
| `app/api/workbooks/*`, `app/api/upload-jobs/*` | created | 4 | Inspection, job progress, import start and mapping-template endpoints. |
| `components/ui/progress.tsx`, `components/ui/textarea.tsx` | created | 4 | Upload feedback and description controls. |
| `components/upload-wizard.tsx` | created | 4 | Five-step Arabic wizard, preview, mappings, categories, polling and template offer. |
| `app/(protected)/upload/*` | created | 4 | Upload route and loading state. |
| `app/(protected)/groups/[id]/files/[fileId]/quality/page.tsx` | created | 4 | Persistent post-import quality report. |
| `app/(protected)/groups/[id]/page.tsx` | updated | 4 | File quality-report action. |
| `lib/excel/workbook.ts`, `lib/excel/import-worker.ts` | fixed | 4 | Avoid stale ExcelJS Buffer typing and isolate missing streaming worksheet-name type. |
| `PLAN.md` | updated | 4 | Phase 4 checklist closed after verification. |
| `PROGRESS.md` | updated | 4 | Phase 4 results and local integration environment note recorded. |
| `lib/search/fields.ts`, `lib/search/plan.ts` | created | 5 | Whitelisted field metadata and numeric/text/custom query planning. |
| `lib/search/plan.test.ts` | created | 5 | Numeric, Arabic, mixed and custom search classification tests. |
| `lib/search/query.ts` | created | 5 | Parameterized raw SQL, token-AND matching, rank, scope, count and pagination. |
| `app/api/search/route.ts` | created | 5 | Validated Arabic search API. |
| `app/api/search/route.ts`, `vitest.config.ts` | fixed | 5 | Map API q to domain query and resolve project aliases in tests. |
| `PLAN.md` | updated | 5 | Phase 5 checklist closed after all gates passed. |
| `PROGRESS.md` | updated | 5 | Phase 5 verification result recorded. |
| `components/ui/tabs.tsx` | created | 6 | Accessible RTL category tabs. |
| `components/search-interface.tsx` | created | 6 | Debounced full/custom/scope search, TanStack grid, normalization-aware highlighting and pagination. |
| `app/(protected)/search/*` | created | 6 | Search route and loading state. |
| `components/record-details.tsx` | created | 6 | Category grids, hide-empty default and per-value copy controls. |
| `app/(protected)/records/[id]/*` | created | 6 | Record header, original values, cross-file person links and route states. |
| `PLAN.md` | updated | 6 | Phase 6 checklist closed after verification. |
| `PROGRESS.md` | updated | 6 | Phase 6 build results recorded. |
| `lib/excel/replacement-worker.ts` | created | 7 | Safe temporary import and transactional same/different structure promotion. |
| `app/api/files/[id]/replace/route.ts` | created | 7 | Server-validated structure/mapping replacement job. |
| `components/file-update-wizard.tsx` | created | 7 | Workbook selection, normalized diff, remapping, confirmation and progress. |
| `app/(protected)/groups/[id]/files/[fileId]/update/page.tsx` | created | 7 | File update route with inherited mapping context. |
| `app/(protected)/groups/[id]/page.tsx` | updated | 7 | Update action on every file. |
| `PLAN.md` | updated | 7/8 | Phase 7 closed; safe replacement and backup job decisions logged. |
| `PROGRESS.md` | updated | 7 | Phase 7 verification result recorded. |
| `lib/backup/schema.ts`, `lib/backup/service.ts` | created | 8 | Versioned full-data JSON validation, export and transactional restore. |
| `app/api/backup/*`, `components/backup-manager.tsx` | created | 8 | Download and explicitly confirmed restore workflows. |
| `app/(protected)/settings/backup/*` | created | 8 | Arabic backup page and loading state. |
| `lib/activity.ts`, `app/(protected)/logs/*` | created | 8 | Arabic activity labels, relative time, reverse audit table and states. |
| `lib/actions/files.ts`, `app/(protected)/groups/[id]/files/[fileId]/page.tsx` | created | 8 | File overview and exact-count typed delete action. |
| `app/(protected)/groups/[id]/page.tsx` | updated | 8 | Open/quality/update actions for every file. |
| `app/(protected)/page.tsx` | updated | 8 | Live totals and recent uploads dashboard. |
| `lib/backup/service.ts` | fixed | 8 | Widen nonterminal status list for type-safe restored job handling. |
| `PLAN.md` | updated | 8 | Phase 8 checklist closed after verification. |
| `PROGRESS.md` | updated | 8 | Phase 8 tests/typecheck/build result recorded. |
| `package.json`, `prisma/search-indexes.sql` | updated/created | 9 | Make db:push install pg_trgm and ten indexes idempotently. |
| `prisma/seed.ts` | created | 9 | Two Arabic groups/files and cross-file person-link sample data. |
| `lib/excel/standard-fields.test.ts` | created | 9 | Auto-suggestion coverage for Arabic header variants. |
| `app/not-found.tsx`, `app/global-error.tsx` | created | 9 | Arabic global recovery and missing-route states. |
| `README.md` | created | 9 | Arabic setup, operation, backup, Excel, security and EXPLAIN runbook. |
| `package.json`, `PLAN.md` | updated | 9 | Pin patched PostCSS/UUID/Prisma-helper dependency overrides after audit. |
| `package.json`, `PLAN.md` | updated | 9 | Raise Vitest to patched 3.2.7 after full development audit. |
| `package-lock.json` | updated | 9 | Lock patched dependency graph; full npm audit reports zero vulnerabilities. |
| `.gitignore` | updated | 9 | Exclude generated TypeScript build metadata. |
| `app/(protected)/groups/[id]/page.tsx` | updated | 9 | Surface file deletion success/error feedback after redirects. |
| `PLAN.md` | updated | 9 | All Phase 9 and project checkboxes closed. |
| `PROGRESS.md` | updated | 9 | Final Session Summary, verification and run instructions recorded. |
| `package.json` | fixed | runtime | Pass the Prisma schema to the idempotent search-index execution step. |
| `.env` | created (ignored) | runtime | Configure the isolated local PostgreSQL database and signed admin session. |
| `PROGRESS.md` | updated | runtime | Record successful live database, authentication, search, route, backup and build verification. |
| `scripts/create-e2e-workbook.mjs`, `test-artifacts/production-e2e-arabic.xlsx` | created | E2E | Reusable synthetic Arabic workbook generator and production upload fixture. |
| `lib/excel/streaming.ts`, `lib/excel/streaming.test.ts` | created | E2E | Archive-order-safe ExcelJS streaming worksheet selection and regression coverage. |
| `lib/excel/types.ts`, `lib/excel/config.ts`, `lib/excel/workbook.ts`, `lib/excel/import-worker.ts` | updated | E2E | Carry the inspected sheet index into streaming import and select the intended worksheet safely. |
| `components/upload-wizard.tsx`, `components/file-update-wizard.tsx`, `app/api/files/[id]/replace/route.ts` | updated | E2E | Propagate sheet identity through initial upload and replacement workflows. |
| `PLAN.md`, `PROGRESS.md` | updated | E2E | Record the production defect, compatibility decision, fix, and full verification evidence. |
| `components/upload-wizard.tsx` | updated | UI | Invert the search-field mapping table so fixed system fields select their corresponding Excel columns. |
| `PROGRESS.md` | updated | UI | Record the mapping-layout change and production validation. |
| `lib/excel/mapping.ts`, `lib/excel/mapping.test.ts` | created | fix | Remove duplicate hidden field suggestions while preserving unlinked columns. |
| `lib/excel/config.test.ts` | created | fix | Lock in support for columns with no standard-field mapping. |
| `components/upload-wizard.tsx`, `components/file-update-wizard.tsx` | updated | fix | Normalize automatic and template mappings before display and submission. |
| `vitest.config.ts` | updated | fix | Serialize test files because ExcelJS streaming uses process-wide temporary-file cleanup. |
| `PROGRESS.md` | updated | fix | Record the false duplicate warning fix and successful production import. |
| `lib/format/date.ts`, `lib/format/date.test.ts` | created | UI | Parse stored Excel dates safely and format record/upload dates consistently. |
| `components/record-details.tsx`, `app/(protected)/records/[id]/page.tsx` | updated | UI | Show person dates as `dd/mm/yyyy` and upload timestamps with a 12-hour clock. |
| `app/(protected)/page.tsx`, `app/(protected)/groups/[id]/page.tsx`, `app/(protected)/groups/[id]/files/[fileId]/page.tsx` | updated | UI | Apply the same upload timestamp format everywhere it is displayed. |
| `PROGRESS.md` | updated | UI | Record date-formatting behavior and live production verification. |

## Blockers

- none

## Notes for the next session

Phase 9 and the complete build are finished. The app has Arabic global/loading/empty/error states, responsive RTL layouts, keyboard-operable results and dialogs, light/dark tokens, realistic seed and E2E data demonstrating national-ID linking, an Arabic runbook, idempotent `db:push` trigram indexes, and patched dependency overrides. The isolated local PostgreSQL database is configured, indexed, seeded, and production-E2E-tested without Docker. Final results: 36/36 tests, strict typecheck, Prisma validation/generation, zero npm audit findings, clean source scan, successful production build, complete real-browser upload/list/detail/quality/activity coverage, verified unlinked-field imports, normalized person/upload date display, and verified Arabic/name/numeric search results. The production server is running at `http://localhost:3000`.
