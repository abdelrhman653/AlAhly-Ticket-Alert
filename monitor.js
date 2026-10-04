import { chromium } from "playwright";
import admin from "firebase-admin";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const messaging = admin.messaging();
const url = process.env.TAZKARTI_URL || "https://www.tazkarti.com/#/home";

const normalize = s => (s || "")
  .replace(/\s+/g, " ")
  .replace(/أ|إ|آ/g, "ا")
  .trim()
  .toLowerCase();

const teamWords = ["الاهلي", "al ahly", "al-ahly", "ahly"];
const availableWords = ["احجز", "حجز", "شراء", "book", "buy", "available", "متاح", "متاحة", "tickets"];
const unavailableWords = ["غير متاح", "غير متاحة", "sold out", "نفدت", "لا توجد تذاكر"];

function containsAny(text, words) {
  return words.some(w => text.includes(normalize(w)));
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);

  const raw = await page.locator("body").innerText();
  const text = normalize(raw);

  const teamFound = containsAny(text, teamWords);
  const hasAvailable = containsAny(text, availableWords);
  const hasUnavailable = containsAny(text, unavailableWords);
  const available = teamFound && hasAvailable && !hasUnavailable;

  const stateRef = db.doc("monitorState/alahly");
  const oldSnap = await stateRef.get();
  const old = oldSnap.exists ? oldSnap.data() : {};
  const wasAvailable = Boolean(old.available);

  await stateRef.set({
    available,
    teamFound,
    checkedAt: admin.firestore.FieldValue.serverTimestamp(),
    textSample: raw.slice(0, 1200)
  }, { merge: true });

  if (available && !wasAvailable) {
    const snap = await db.collection("pushSubscriptions").get();
    const tokens = snap.docs.map(d => d.id).filter(Boolean);

    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: {
            title: "🔴 تذاكر الأهلي متاحة",
            body: "تم اكتشاف توفر محتمل لتذاكر الأهلي. افتح تذكرتي الآن."
          },
          webpush: {
            fcmOptions: { link: "https://www.tazkarti.com/#/home" }
          }
        });
      } catch (e) {
        if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(e.code)) {
          await db.collection("pushSubscriptions").doc(token).delete().catch(() => {});
        }
      }
    }
  }

  console.log(JSON.stringify({ teamFound, available, checkedAt: new Date().toISOString() }));
} finally {
  await browser.close();
}
