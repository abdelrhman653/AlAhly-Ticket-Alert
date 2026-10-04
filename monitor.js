import { chromium } from "playwright";
import admin from "firebase-admin";

const serviceAccount = JSON.parse(
process.env.FIREBASE_SERVICE_ACCOUNT_JSON
);

admin.initializeApp({
credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

const url =
process.env.TAZKARTI_URL ||
"https://www.tazkarti.com/#/matches";

/*
TEST_MODE=true
= اختبار الإشعارات باستخدام مباراة مصر

TEST_MODE=false أو غير موجود
= الوضع الطبيعي لمراقبة الأهلي
*/
const TEST_MODE =
String(process.env.TEST_MODE || "false").toLowerCase() === "true";

const normalize = s =>
(s || "")
.replace(/\s+/g, " ")
.replace(/أ|إ|آ/g, "ا")
.trim()
.toLowerCase();

/*
الوضع الطبيعي: الأهلي
*/
const alAhlyWords = [
"الاهلي",
"al ahly",
"al-ahly",
"ahly"
];

/*
وضع الاختبار: مصر
*/
const egyptWords = [
"مصر",
"egypt",
"egypt national team",
"منتخب مصر"
];

/*
كلمات تدل على وجود إمكانية للحجز/الشراء
*/
const availableWords = [
"احجز",
"حجز",
"شراء",
"book",
"buy",
"available",
"متاح",
"متاحة",
"tickets"
];

/*
كلمات تدل على عدم وجود تذاكر
*/
const unavailableWords = [
"غير متاح",
"غير متاحة",
"sold out",
"نفدت",
"لا توجد تذاكر"
];

function containsAny(text, words) {
return words.some(word =>
text.includes(normalize(word))
);
}

const browser = await chromium.launch({
headless: true
});

try {

const page = await browser.newPage();

console.log(
TEST_MODE
? "🧪 TEST MODE: مراقبة مباراة مصر"
: "🔴 NORMAL MODE: مراقبة الأهلي"
);

console.log("🌐 فتح تذكرتي:", url);

await page.goto(url, {
waitUntil: "domcontentloaded",
timeout: 60000
});

/*
ننتظر تحميل محتوى الصفحة الديناميكي
*/
await page.waitForTimeout(8000);

/*
قراءة الصفحة
*/
const raw =
await page.locator("body").innerText();

const text =
normalize(raw);

/*
اختيار الفريق حسب وضع التشغيل
*/
const targetWords =
TEST_MODE
? egyptWords
: alAhlyWords;

const teamFound =
containsAny(text, targetWords);

const hasAvailable =
containsAny(text, availableWords);

const hasUnavailable =
containsAny(text, unavailableWords);

const available =
teamFound &&
hasAvailable &&
!hasUnavailable;

/*
اسم حالة المراقبة
*/
const stateName =
TEST_MODE
? "test"
: "alahly";

const stateRef =
db.doc("monitorState/${stateName}");

/*
قراءة الحالة السابقة
*/
const oldSnap =
await stateRef.get();

const old =
oldSnap.exists
? oldSnap.data()
: {};

const hadPreviousState =
oldSnap.exists &&
typeof old.available === "boolean";

const wasAvailable =
hadPreviousState
? Boolean(old.available)
: false;

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

console.log(
"📊 الحالة السابقة:",
hadPreviousState
? wasAvailable
? "🟢 متاح"
: "🟡 غير متاح"
: "⚪ لا توجد حالة سابقة"
);

console.log(
"🔎 المباراة موجودة:",
teamFound ? "✅ نعم" : "❌ لا"
);

console.log(
"🎟️ يوجد توفر:",
available ? "✅ نعم" : "❌ لا"
);

console.log(
"━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

/*
تحديد هل نحتاج إرسال إشعار
*/
const shouldNotify =
available && !wasAvailable;

if (shouldNotify) {

console.log(
  "🚨 اكتشاف توفر جديد!"
);

console.log(
  "🔔 سيتم إرسال الإشعار الآن..."
);


/*
  جلب الأجهزة المسجلة
*/
const snap =
  await db
    .collection("pushSubscriptions")
    .get();


const tokens =
  snap.docs
    .map(doc => doc.id)
    .filter(Boolean);


console.log(
  `📱 عدد الأجهزة المسجلة: ${tokens.length}`
);


let sentCount = 0;
let failedCount = 0;


/*
  إرسال الإشعار لكل جهاز
*/
for (const token of tokens) {

  try {

    await messaging.send({

      token,

      notification: {

        title: TEST_MODE
          ? "🧪 اختبار إشعارات تذكرتي"
          : "🔴 تذاكر الأهلي متاحة",

        body: TEST_MODE
          ? "🇪🇬 تم اكتشاف مباراة مصر مع توفر تذاكر للحجز الآن 🔔"
          : "🎟️ تم اكتشاف توفر محتمل لتذاكر الأهلي. افتح تذكرتي الآن."
      },


      webpush: {

        fcmOptions: {

          link:
            "https://www.tazkarti.com/#/matches"

        }

      }

    });


    sentCount++;


    console.log(
      "✅ تم إرسال الإشعار إلى جهاز."
    );


  } catch (e) {

    failedCount++;


    console.error(
      "❌ فشل إرسال الإشعار:",
      e.code || e.message
    );


    /*
      حذف التوكنات القديمة أو غير الصالحة
    */
    if (
      [
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token"
      ].includes(e.code)
    ) {

      await db
        .collection("pushSubscriptions")
        .doc(token)
        .delete()
        .catch(() => {});


      console.log(
        "🗑️ تم حذف Token غير صالح."
      );
    }
  }
}


console.log(
  `📨 نتيجة الإرسال: ${sentCount} ناجح / ${failedCount} فشل`
);

} else if (available && wasAvailable) {

console.log(
  "ℹ️ التذاكر ما زالت متاحة."
);

console.log(
  "🔕 لن يتم إرسال إشعار مكرر."
);

} else {

console.log(
  "🟡 لا يوجد توفر حاليًا."
);

}

/*
حفظ الحالة بعد تنفيذ منطق التنبيه
*/
await stateRef.set(
{
available,

  teamFound,

  checkedAt:
    admin.firestore.FieldValue.serverTimestamp(),

  mode:
    TEST_MODE
      ? "test"
      : "alahly",

  textSample:
    raw.slice(0, 1200)
},
{
  merge: true
}

);

console.log(
"💾 تم حفظ حالة المراقبة في Firestore."
);

console.log(
JSON.stringify({

  mode:
    TEST_MODE
      ? "TEST"
      : "ALAHLY",

  teamFound,

  available,

  previousAvailable:
    wasAvailable,

  notificationTriggered:
    shouldNotify,

  checkedAt:
    new Date().toISOString()

})

);

} finally {

await browser.close();

}
