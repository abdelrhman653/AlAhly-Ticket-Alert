import { chromium } from "playwright";
import admin from "firebase-admin";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
admin.initializeApp({credential: admin.credential.cert(serviceAccount)});
const db = admin.firestore();
const messaging = admin.messaging();

const url = process.env.TAZKARTI_URL || "https://www.tazkarti.com/#/matches";
const TEST_MODE = String(process.env.TEST_MODE || "false").toLowerCase() === "true";

const normalize = s => (s || "").toString()
  .replace(/\s+/g, " ")
  .replace(/[أإآ]/g, "ا")
  .trim()
  .toLowerCase();

const key = s => normalize(s)
  .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
  .replace(/^-|-$/g, "");

const unavailableWords = ["غير متاح","غير متاحة","sold out","نفدت","لا توجد تذاكر","not available"];
const availableWords = ["احجز","حجز","شراء","book ticket","book now","buy","available","متاح","متاحة"];

const containsAny = (text, words) => words.some(w => normalize(text).includes(normalize(w)));

function cleanTeam(s) {
  return (s || "").replace(/\b(book|buy|available|sold out)\b/ig,"")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,"")
    .replace(/\s+/g," ").trim().replace(/^[|•:–—-]+|[|•:–—-]+$/g,"").trim();
}

function parseTeams(text) {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  for (const line of lines) {
    const m = line.match(/(.{2,50}?)\s+(?:vs\.?|v\.?|×|x)\s+(.{2,50}?)(?=\s*(?:\||•|$))/i);
    if (m) {
      const a=cleanTeam(m[1]), b=cleanTeam(m[2]);
      if(a&&b&&a.length<60&&b.length<60) return [a,b];
    }
  }

  const compact = text
    .replace(/\b(?:book\s+ticket|book\s+now|book|buy|available|sold\s*out|احجز|حجز|شراء|متاح|متاحة)\b/ig," ")
    .replace(/\s+/g," ").trim();

  const patterns = [
    /(.{2,50}?)\s+(?:vs\.?|v\.?|×|x)\s+(.{2,50}?)(?=\s*(?:\||•|\d{1,2}[\/-]\d{1,2}|$))/i,
    /(.{2,50}?)\s+[-–—]\s+(.{2,50}?)(?=\s*(?:\||•|\d{1,2}[\/-]\d{1,2}|$))/i
  ];
  for (const re of patterns) {
    const m=compact.match(re);
    if(m){
      const a=cleanTeam(m[1]),b=cleanTeam(m[2]);
      if(a&&b&&a.length<60&&b.length<60) return [a,b];
    }
  }

  const candidates=lines.filter(line=>{
    const n=normalize(line);
    return line.length>=2 && line.length<=60 &&
      !containsAny(n,availableWords) &&
      !containsAny(n,unavailableWords) &&
      !/\b\d{1,2}[\/-]\d{1,2}\b/.test(line) &&
      !/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(line) &&
      !/استاد|ملعب|stadium|venue|arena/i.test(line);
  });
  if(candidates.length>=2) return [cleanTeam(candidates[0]),cleanTeam(candidates[1])];
  return [null,null];
}
function parseDateTime(text) {
  const date=(text.match(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/)||[])[0]||"";
  const time=(text.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/)||[])[0]||"";
  return {date,time};
}

function makeId(home,away,text) {
  return key(`${home}-${away}-${parseDateTime(text).date||text.slice(0,50)}`);
}

async function extractMatches(page) {
  return page.evaluate(({availableWords, unavailableWords}) => {
    const norm=s=>(s||"").replace(/\s+/g," ").trim().toLowerCase();
    const avail=availableWords.map(norm), unavail=unavailableWords.map(norm);
    const isAvail=t=>avail.some(w=>norm(t).includes(w)) && !unavail.some(w=>norm(t).includes(w));
    const nodes=[...document.querySelectorAll("a,button,[role='button']")];
    const candidates=[];
    for(const node of nodes){
      const label=(node.innerText||node.textContent||"").trim();
      if(!label) continue;
      let el=node, best=null;
      for(let i=0;i<5&&el;i++,el=el.parentElement){
        const text=(el.innerText||"").trim();
        if(text.length>=20&&text.length<=900){best=text;if(isAvail(text))break}
      }
      if(best) candidates.push({text:best,booking:isAvail(best)});
    }
    const cards=[...document.querySelectorAll("[class*='match'],[class*='event'],[class*='card']")].map(el=>({text:(el.innerText||"").trim(),booking:isAvail(el.innerText||"")})).filter(x=>x.text.length>=20&&x.text.length<=900);
    return [...candidates,...cards].slice(0,300);
  },{availableWords,unavailableWords});
}

function dedupeMatches(raw) {
  const out=new Map();
  for(const item of raw){
    const text=item.text.replace(/\s+/g," ").trim();
    const [home,away]=parseTeams(text);
    if(!home||!away) continue;
    const {date,time}=parseDateTime(text);
    const unavailable=containsAny(text,unavailableWords);
    const available=Boolean(item.booking)&&!unavailable;
    const venueLine=(text.split(/[\n|•]/).find(x=>/استاد|stadium|arena|ملعب/i.test(x))||"").trim();
    const id=makeId(home,away,text);
    const previous=out.get(id);
    out.set(id,{
      id,homeTeam:home,awayTeam:away,date,time,
      venue:venueLine.replace(/^(الملعب|stadium|venue)\s*[:：-]?\s*/i,"")||"الملعب غير محدد",
      available:previous?previous.available||available:available,
      sourceText:text.slice(0,1500)
    });
  }
  return [...out.values()];
}

async function sendForMatch(match) {
  const subs=await db.collection("pushSubscriptions").get();
  let sent=0;
  for(const sub of subs.docs){
    const d=sub.data(), teams=Array.isArray(d.selectedTeams)?d.selectedTeams:[], matches=Array.isArray(d.selectedMatches)?d.selectedMatches:[];
    const interested=matches.includes(match.id) || teams.includes(key(match.homeTeam)) || teams.includes(key(match.awayTeam));
    if(!interested) continue;

    const stateId=key(`${sub.id}-${match.id}`);
    const stateRef=db.doc(`notificationStates/${stateId}`);
    let shouldNotify=false;
    let claimed=false;
    await db.runTransaction(async tx=>{
      const snap=await tx.get(stateRef);
      const state=snap.exists?snap.data():{};
      const previous=typeof state.available==="boolean" ? Boolean(state.available) : false;
      const claimAt=state.claimedAt?.toMillis ? state.claimedAt.toMillis() : 0;
      const claimFresh=claimAt && (Date.now()-claimAt < 10*60*1000);

      shouldNotify=match.available&&!previous&&!claimFresh;
      if(!match.available){
        tx.set(stateRef,{available:false,claimedAt:null,token:sub.id,matchId:match.id,checkedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      } else if(shouldNotify){
        claimed=true;
        tx.set(stateRef,{available:false,claimedAt:admin.firestore.Timestamp.now(),token:sub.id,matchId:match.id,checkedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      }
    });

    if(!shouldNotify || !claimed) continue;
    try{
      await messaging.send({
        token:sub.id,
        notification:{
          title:TEST_MODE ? "🧪 مصر" : `🎟️ ${match.homeTeam} × ${match.awayTeam}`,
          body:`التذاكر متاحة الآن! ${match.homeTeam} × ${match.awayTeam}`
        },
        data:{matchId:match.id,url:"https://www.tazkarti.com/#/matches"},
        webpush:{fcmOptions:{link:"https://www.tazkarti.com/#/matches"}}
      });
      sent++;
      await stateRef.set({available:true,claimedAt:null,token:sub.id,matchId:match.id,checkedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    }catch(e){
      await stateRef.set({available:false,claimedAt:null,token:sub.id,matchId:match.id,checkedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true}).catch(()=>{});
      console.error("FCM error",sub.id,e.code||e.message);
      if(["messaging/registration-token-not-registered","messaging/invalid-registration-token"].includes(e.code))
        await sub.ref.delete().catch(()=>{});
    }
  }
  return sent;
}

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  console.log(TEST_MODE?"🧪 TEST MODE: مراقبة مباريات مصر":"🚀 NORMAL MODE: اكتشاف مباريات تذكرتي");
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
  await page.waitForTimeout(8000);
  const raw=await page.locator("body").innerText();
  const candidates=await extractMatches(page);
  let matches=dedupeMatches(candidates);

  if(TEST_MODE){
    const egypt=matches.filter(m=>/مصر|egypt/i.test(`${m.homeTeam} ${m.awayTeam}`));
    matches=egypt;
    // Preserve the legacy test state expected by the UI/test workflow.
    const testAvailable=matches.some(m=>m.available);
    await db.doc("monitorState/test").set({
      available:testAvailable,
      teamFound:matches.length>0,
      checkedAt:admin.firestore.FieldValue.serverTimestamp(),
      mode:"test",
      textSample:raw.slice(0,1200)
    },{merge:true});
  }

  console.log(`🔎 Matches discovered: ${matches.length}`);
  for(const match of matches){
    await db.doc(`matches/${match.id}`).set({
      ...match,
      checkedAt:admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:admin.firestore.FieldValue.serverTimestamp()
    },{merge:true});
  }

  let sent=0;
  // Process both available and unavailable states. This is what makes
  // available -> false -> available generate a fresh notification.
  for(const match of matches) sent+=await sendForMatch(match);

  console.log(`📨 Notifications sent: ${sent}`);
  console.log(JSON.stringify({testMode:TEST_MODE,matches:matches.map(m=>({id:m.id,teams:[m.homeTeam,m.awayTeam],available:m.available})),notifications:sent,checkedAt:new Date().toISOString()}));
} finally {
  await browser.close();
}
