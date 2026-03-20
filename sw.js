// Ten plik to tylko wymóg formalny przeglądarek, żeby uznały stronę za aplikację PWA.
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Zainstalowano');
});

self.addEventListener('fetch', (e) => {
    // Pusty nasłuchiwacz - strona działa normalnie przez internet
});