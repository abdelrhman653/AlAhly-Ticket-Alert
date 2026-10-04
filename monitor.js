// التهيئة والتكوين الثابت للمشروع
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

// مفتاح الـ VAPID الحقيقي الخاص بك
const VAPID_KEY = "BAYxVRbvvtkasJKgnU0Ja62KhC7aqsjv2JBEdrinMHc0NywavCwCfucZfX00mq8UMYDe7jV-gLzMijc9ABAlVYQ";

let currentDeviceToken = null;
let selectedTeamState = "الأهلي"; // الفريق الافتراضي
let selectedMatchState = null;

document.addEventListener("DOMContentLoaded", async () => {
    initNotifications();
    setupUIEvents();
});

// إدارة تهيئة الإشعارات والـ FCM Token تلقائياً دون إزعاج المستخدم بطلبات متكررة
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
            selectedTeams: [selectedTeamState],
            selectedMatches: selectedMatchState ? [selectedMatchState] : [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } else {
        await docRef.update({
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

    matchesList.innerHTML = `
        <div class="match-item" onclick="selectMatch('${selectedTeamState} × المنافس')">
            <b>${selectedTeamState} × المنافس</b><br>
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
            console.log("Subscription synced:", doc.data());
        }
    }, (error) => {
        console.error("Firestore listener error:", error);
    });
}
