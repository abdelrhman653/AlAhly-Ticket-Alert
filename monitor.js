here// التهيئة والتكوين الثابت للمشروع (بدون تغيير بروجكت فيرايربيس أو الـ VAPID Key)
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

const messaging = firebase.messaging();
const db = firebase.firestore();
const VAPID_KEY = "BEl62iUYgUivxIkv69yViEui...VapidKeyPlaceholder"; // مفتاحك الأصلي

let currentDeviceToken = null;
let selectedTeamState = null;
let selectedMatchState = null;

document.addEventListener("DOMContentLoaded", async () => {
    initNotifications();
    setupUIEvents();
});

// إدارة تهيئة الإشعارات والـ FCM Token بشكل تلقائي دون إزعاج
async function initNotifications() {
    const notificationArea = document.getElementById("notificationArea");
    
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        notificationArea.innerHTML = `<span class="status-badge blocked">⚠️ متصفحك لا يدعم الإشعارات</span>`;
        return;
    }

    if (Notification.permission === "granted") {
        notificationArea.innerHTML = `
            <div style="color: var(--accent); font-weight:700; margin-bottom:4px;">✅ الإشعارات مفعلة</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">جهازك مسجل لاستقبال تنبيهات توفر التذاكر.</div>
        `;
        await registerServiceWorkerAndGetToken();
    } else if (Notification.permission === "default") {
        notificationArea.innerHTML = `
            <div style="margin-bottom:8px; font-size:0.85rem;">التنبيهات غير مفعلة حالياً</div>
            <button class="btn-action" id="enableNotifBtn">🔔 تفعيل الإشعارات</button>
        `;
        document.getElementById("enableNotifBtn").addEventListener("click", async () => {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                initNotifications();
            } else {
                initNotifications();
            }
        });
    } else {
        notificationArea.innerHTML = `
            <span class="status-badge blocked">⚠️ الإشعارات محظورة</span>
            <p style="font-size:0.8rem; margin-top:6px; color:var(--text-muted);">اسمح بالإشعارات من إعدادات المتصفح حتى تستقبل التنبيهات.</p>
        `;
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
    const docRef = db.collection("pushSubscriptions").doc(currentDeviceToken);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        await docRef.set({
            token: currentDeviceToken,
            selectedTeams: selectedTeamState ? [selectedTeamState] : [],
            selectedMatches: selectedMatchState ? [selectedMatchState] : [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

function setupUIEvents() {
    const teamButtons = document.querySelectorAll(".team-btn");
    teamButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
            teamButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedTeamState = btn.getAttribute("data-team");
            updateSelectedTeamUI();
        });
    });

    const searchInput = document.getElementById("teamSearch");
    searchInput.addEventListener("input", (e) => {
        const val = e.target.value.trim();
        if(val.length > 0) {
            selectedTeamState = val;
            updateSelectedTeamUI();
        }
    });
}

function updateSelectedTeamUI() {
    const monitoringStatus = document.getElementById("monitoringStatus");
    const matchesCard = document.getElementById("matchesCard");
    const matchesList = document.getElementById("matchesList");

    matchesCard.style.display = "block";
    monitoringStatus.innerHTML = `
        <div style="margin-top:6px;">
            <span class="status-badge active">🟢 نشطة</span><br>
            <b>الفريق:</b> ${selectedTeamState}<br>
            <b>آخر فحص:</b> منذ لحظات
        </div>
    `;

    // محاكاة جلب المباريات الخاصة بالفريق المحدد من المنظومة أو Tazkarti
    matchesList.innerHTML = `
        <div class="match-item" onclick="selectMatch('${selectedTeamState} × المنافس التقليدي')">
            <b>${selectedTeamState} × المنافس التقليدي</b><br>
            🏟 استاد القاهرة | 📅 قريباً
        </div>
    `;

    if (currentDeviceToken) {
        db.collection("pushSubscriptions").doc(currentDeviceToken).update({
            selectedTeams: [selectedTeamState],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

window.selectMatch = function(matchName) {
    selectedMatchState = matchName;
    alert("تم اختيار مراقبة مباراة: " + matchName);
    if (currentDeviceToken) {
        db.collection("pushSubscriptions").doc(currentDeviceToken).update({
            selectedMatches: [selectedMatchState],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
};

function listenToUserSubscriptionChanges() {
    if (!currentDeviceToken) return;
    db.collection("pushSubscriptions").doc(currentDeviceToken).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            console.log("Updated user subscription data:", data);
        }
    }, (error) => {
        console.error("Firestore listener error:", error);
    });
}
