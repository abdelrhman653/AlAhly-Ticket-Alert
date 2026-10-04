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

console.log("🔴 PRODUCTION MODE: مراقبة تذاكر الأهلي");

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
البحث عن مباراة الأهلي
*/
const teamFound =
containsAny(text, alAhlyWords);

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
const stateRef =
db.doc("monitorState/alahly");

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

        title: "🔴 تذاكر الأهلي متاحة",

        body: "🎟️ تم اكتشاف توفر محتمل لتذاكر الأهلي. افتح تذكرتي الآن."
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

  mode: "alahly",

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

  mode: "ALAHLY",

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
