/* ============================================================
   Zafar — the uninstaller
   ZAFAR keeps nothing on the phone any more. Offline reading is gone: the
   app needs a connection, and every request goes to the network.

   This file stays deployed for one reason — phones that already installed the
   old worker. The browser checks a registration's script on the next visit to
   the app, so this version reaches them, wipes the caches the old worker kept,
   and removes the registration for good. Nothing here caches anything, and
   nothing here answers a fetch: without a fetch handler the browser talks to
   the network directly.

   It can be deleted once the installed base has had a few weeks to update.
   ============================================================ */

self.addEventListener("install", function (event) {
  // Take over at once: the sooner this runs, the sooner the old copy is gone.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        // Ours, by prefix. Another app's cache on the same origin is not ours.
        return Promise.all(
          names.map(function (name) {
            if (name.indexOf("zafar-") === 0) return caches.delete(name);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
      .then(function () {
        // And no worker at all from here on.
        return self.registration.unregister();
      })
      .catch(function () {
        // If unregistering fails the worker stays inert: no fetch handler, no
        // cache, nothing to serve. It will be retired on the next update.
      })
  );
});
