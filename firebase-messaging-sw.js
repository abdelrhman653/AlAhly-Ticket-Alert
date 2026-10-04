importScripts("https://www.gstatic.com/firebasejs/12.5.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.5.0/firebase-messaging-compat.js");

const firebaseConfig={
  apiKey:"AIzaSyAvv8kaOM_OITgKRcpe0xZD6AOv1oDyvTc",
  authDomain:"alahly-ticket-alert.firebaseapp.com",
  projectId:"alahly-ticket-alert",
  storageBucket:"alahly-ticket-alert.firebasestorage.app",
  messagingSenderId:"268954365381",
  appId:"1:268954365381:web:7d8b3a7bfda8d9e422efac"
};
firebase.initializeApp(firebaseConfig);
const messaging=firebase.messaging();

messaging.onBackgroundMessage(payload=>{
  const title=payload.notification?.title||"🎟️ Ticket Alert Egypt";
  const options={
    body:payload.notification?.body||"تم اكتشاف توفر جديد للتذاكر.",
    icon:"/AlAhly-Ticket-Alert/icon-192.png",
    badge:"/AlAhly-Ticket-Alert/icon-192.png",
    data:{url:payload.fcmOptions?.link||payload.data?.url||"https://www.tazkarti.com/#/matches"}
  };
  self.registration.showNotification(title,options);
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=event.notification?.data?.url||"https://www.tazkarti.com/#/matches";
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const client of list){if("focus" in client){client.navigate(url);return client.focus()}}
    return clients.openWindow(url);
  }));
});