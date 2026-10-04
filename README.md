# AlAhly Ticket Alert

مشروع تجريبي لمراقبة صفحة تذاكر تذكرتي وإرسال Web Push عند اكتشاف توفر محتمل.

## تم إعداد Firebase
- Project ID: alahly-ticket-alert
- Web App: AlAhly Ticket Alert
- Firestore: Standard / default database
- Web Push VAPID: مضاف بالفعل إلى ملفات الواجهة

## الملفات
- index.html: واجهة المستخدم وتفعيل الإشعارات.
- firebase-messaging-sw.js: إشعارات الخلفية.
- monitor.js: مراقبة الصفحة وإرسال الإشعارات.
- firestore.rules: قواعد Firestore.
- .github/workflows/monitor.yml: تشغيل المراقبة كل 5 دقائق تقريبًا.
- package.json: الاعتمادات.

## مهم
1. لا تضع Firebase service account JSON داخل الموقع أو GitHub كملف. ضعه فقط في GitHub Secrets باسم FIREBASE_SERVICE_ACCOUNT_JSON.
2. هذا المشروع لا يخزن بيانات دخول Tazkarti ولا يتجاوز CAPTCHA أو وسائل الحماية.
3. اكتشاف التذاكر حاليًا يعتمد على نص الصفحة، وقد نحتاج لتعديل selectors/منطق الكشف بعد اختبار صفحة Tazkarti الفعلية.
4. GitHub Actions المجدولة ليست ضمانًا للتنفيذ في نفس الثانية؛ قد يحدث تأخير.
