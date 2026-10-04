hereimportScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyD-PlaceholderKeyForSafety",
    authDomain: "alahly-ticket-alert.firebaseapp.com",
    projectId: "alahly-ticket-alert",
    storageBucket: "alahly-ticket-alert.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/AlAhly-Ticket-Alert/icon-192.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});
