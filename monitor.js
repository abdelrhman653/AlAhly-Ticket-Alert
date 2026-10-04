// التهيئة والتكوين للمشروع
const firebaseConfig = {
    apiKey: "AIzaSyD-PlaceholderKeyForSafety",
    authDomain: "alahly-ticket-alert.firebaseapp.com",
    projectId: "alahly-ticket-alert",
    storageBucket: "alahly-ticket-alert.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const isNode = typeof window === 'undefined';
let messaging, db, admin;

if (isNode) {
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    db = admin.firestore();
} else {
    messaging = firebase.messaging();
    db = firebase.firestore();
}

const VAPID_KEY = "BAYxVRbvvtkasJKgnU0Ja62KhC7aqsjv2JBEdrinMHc0NywavCwCfucZfX00mq8UMYDe7jV-gLzMijc9ABAlVYQ";

let currentDeviceToken = null;
let selectedTeamState = "الأهلي"; // تعيين الأهلي كفريق افتراضي نشط فوراً
let selectedMatchState = null;

if (!isNode) {
    document.addEventListener("DOMContentLoaded", () => {
        initNotifications();
        setupUIEvents();
        // تحديث واجهة المراقبة فور فتح الموقع بالفريق الافتراضي
        updateSelectedTeamUI();
    });
}

async function initNotifications() {
    const notificationArea = document.getElementById("notificationArea");
    try {
        if (!("Notification" in window) || !("serviceWorker" in navigator)) {
            notificationArea.innerHTML = `<span class="status-badge blocked">⚠️ متصفحك لا يدعم الإشعارات</span>`;
            return;
        }

        const permission = Notification.permission;
        if (permission === "granted") {
            notificationArea.innerHTML = `
                <div style="color: var(--accent); font-weight:700; margin-bottom:4px;">✅ الإشعارات مفعلة</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">جهازك مسجل لاستقبال تنبيهات توفر التذاكر.</div>
            `;
            registerServiceWorkerAndGetToken();
        } else if (permission === "default") {
            notificationArea.innerHTML = `
                <div style="margin-bottom:8px; font-size:0.85rem;">التنبيهات غير مفعلة حالياً</div>
                <button class="btn-action" id="enableNotifBtn">🔔 تفعيل الإشعارات</button>
            `;
            document.getElementById("enableNotifBtn").addEventListener("click", async () => {
                await Notification.requestPermission();
                initNotifications();
            });
        } else {
            notificationArea.innerHTML = `
                <span class="status-badge blocked">⚠️ الإشعارات محظورة</span>
                <p style="font-size:0.8rem; margin-top:6px; color:var(--text-muted);">اسمح بالإشعارات من إعدادات المتصفح حتى تستقبل التنبيهات.</p>
            `;
        }
    } catch (e) {
        console.error("Error in initNotifications:", e);
        notificationArea.innerHTML = `<span class="status-badge blocked">⚠️ حدث خطأ في التحقق من الإشعارات</span>`;
    }
}

async function registerServiceWorkerAndGetToken() {
    try {
        const registration = await navigator.serviceWorker.register('/AlAhly-Ticket-Alert/firebase-messaging-sw.js');
        currentDeviceToken = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
        if (currentDeviceToken) {
            await syncUserSubscriptionToFirestore();
            listenToUserSubscriptionChanges();
        }
    } catch (error) {
        console.error("Error during token retrieval:", error);
    }
}

async function syncUserSubscriptionToFirestore() {
    if (!currentDeviceToken) return;
    try {
        const docRef = db.collection("pushSubscriptions").doc(currentDeviceToken);
        const doc = await docRef.get();
        if (!doc.exists) {
            await docRef.set({
                token: currentDeviceToken,
                selectedTeams: [selectedTeamState],
                selectedMatches: selectedMatchState ? [selectedMatchState] : [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await docRef.update({
                selectedTeams: [selectedTeamState],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (e) {
        console.error("Error syncing to Firestore:", e);
    }
}

function setupUIEvents() {
    const teamButtons = document.querySelectorAll(".team-btn");
    teamButtons.forEach(btn => {
        // تحديد زر الأهلي افتراضياً في الشكل
        if(btn.getAttribute("data-team") === "الأهلي") {
            btn.classList.add("active");
        }

        btn.addEventListener("click", () => {
            teamButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedTeamState = btn.getAttribute("data-team");
            updateSelectedTeamUI();
        });
    });

    const searchInput = document.getElementById("teamSearch");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const val = e.target.value.trim();
            if(val.length > 0) {
                teamButtons.forEach(b => b.classList.remove("active"));
                selectedTeamState = val;
                updateSelectedTeamUI();
            }
        });
    }
}

function updateSelectedTeamUI() {
    const monitoringStatus = document.getElementById("monitoringStatus");
    const matchesCard = document.getElementById("matchesCard");
    const matchesList = document.getElementById("matchesList");

    if (matchesCard) matchesCard.style.display = "block";
    
    if (monitoringStatus) {
        monitoringStatus.innerHTML = `
            <div style="margin-top:6px;">
                <span class="status-badge active">🟢 نشطة</span><br>
                <b>الفريق المختار:</b> <span style="color: var(--primary); font-weight:700;">${selectedTeamState}</span><br>
                <b>آخر فحص:</b> منذ لحظات<br>
                <b>حالة التذاكر:</b> <span style="color: var(--warning);">🟡 جاري المراقبة</span>
            </div>
        `;
    }

    if (matchesList) {
        matchesList.innerHTML = `
            <div class="match-item" onclick="selectMatch('${selectedTeamState} × المنافس')">
                <b>${selectedTeamState} × المنافس</b><br>
                🏟 استاد القاهرة | 📅 قريباً
            </div>
        `;
    }

    if (currentDeviceToken) {
        db.collection("pushSubscriptions").doc(currentDeviceToken).update({
            selectedTeams: [selectedTeamState],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.error(err));
    }
}

if (!isNode) {
    window.selectMatch = function(matchName) {
        selectedMatchState = matchName;
        alert("تم اختيار مراقبة مباراة: " + matchName);
        if (currentDeviceToken) {
            db.collection("pushSubscriptions").doc(currentDeviceToken).update({
                selectedMatches: [selectedMatchState],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(err => console.error(err));
        }
    };
}

function listenToUserSubscriptionChanges() {
    if (!currentDeviceToken) return;
    db.collection("pushSubscriptions").doc(currentDeviceToken).onSnapshot((doc) => {
        if (doc.exists) {
            console.log("Subscription synced:", doc.data());
        }
    }, (error) => {
        console.error("Firestore listener error:", error);
    });
}

// منطق الفحص الخلفي (GitHub Actions / Node.js)
if (isNode) {
    (async () => {
        console.log("Starting ticket monitoring check...");
        const TEST_MODE = process.env.TEST_MODE === "true";
        try {
            let pageContent = "";
            if (TEST_MODE) {
                pageContent = "Egypt vs South Africa Book Ticket Available";
            } else {
                const fetch = (await import('node-fetch')).default;
                const response = await fetch("https://www.tazkarti.com/#/matches");
                pageContent = await response.text();
            }

            const subscriptionsSnapshot = await db.collection("pushSubscriptions").get();
            for (const doc of subscriptionsSnapshot.docs) {
                const subData = doc.data();
                const token = subData.token;
                const selectedTeams = subData.selectedTeams || ["الأهلي"];

                for (const team of selectedTeams) {
                    const isTeamMentioned = pageContent.includes(team);
                    const isAvailable = pageContent.includes("Book Ticket") || pageContent.includes("Available") || pageContent.includes("متوفرة");
                    const isSoldOut = pageContent.includes("Sold Out") || pageContent.includes("غير متاح");
                    const matchAvailable = isTeamMentioned && isAvailable && !isSoldOut;

                    const statusRef = db.collection("ticketStatus").doc(team);
                    const statusDoc = await statusRef.get();
                    const lastStatus = statusDoc.exists ? statusDoc.data().available : false;

                    if (matchAvailable && !lastStatus) {
                        if (token) {
                            const message = {
                                token: token,
                                notification: {
                                    title: `${team}`,
                                    body: `🎟️ تذاكر ${team} متاحة الآن! اضغط لفتح تذكرتي.`
                                },
                                webpush: {
                                    fcmOptions: {
                                        link: "https://www.tazkarti.com/#/matches"
                                    }
                                }
                            };
                            await admin.messaging().send(message);
                        }
                        await statusRef.set({ available: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                    } else if (!matchAvailable && lastStatus) {
                        await statusRef.set({ available: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                    }
                }
            }
        } catch (error) {
            console.error("Error during monitoring check:", error);
            process.exit(1);
        }
    })();
}
