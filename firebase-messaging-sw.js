importScripts("https://www.gstatic.com/firebasejs/12.5.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.5.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyAvv8waOM_OITgKRcpe0xZD6AOv1oDyvTc",
  authDomain: "alahly-ticket-alert.firebaseapp.com",
  projectId: "alahly-ticket-alert",
  storageBucket: "alahly-ticket-alert.firebasestorage.app",
  messagingSenderId: "268954365381",
  appId: "1:268954365381:web:7d8b3a7bfda8d9e422efac"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || "تنبيه تذاكر الأهلي";
  const options = {
    body: payload.notification?.body || "تم اكتشاف تحديث في تذاكر الأهلي.",
    icon: "/icon-192.png",
    data: { url: "https://www.tazkarti.com/#/home" }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow("https://www.tazkarti.com/#/home"));
});
