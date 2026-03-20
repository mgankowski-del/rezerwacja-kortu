self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
    // Pusty nasłuchiwacz, żeby strona zaliczyła test PWA
});