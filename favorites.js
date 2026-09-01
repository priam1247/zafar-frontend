document.addEventListener('DOMContentLoaded', function () {
  var shell = ZafarShell.init();
  if (!shell) return; // not logged in — already redirected

  var emptyStateHTML =
    '<div class="empty-favorites">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
      '<p>No favorites yet. Tap the bookmark icon on any paper to save it here for quick access.</p>' +
      '<a class="browse-btn" href="dashboard.html">Browse Past Papers</a>' +
    '</div>';

  ZafarContent.init({
    section: 'papers',
    quotaKey: 'papers',
    itemLabel: 'favorite',
    favoritesOnly: true,
    emptyStateHTML: emptyStateHTML,
  }, shell);
});
