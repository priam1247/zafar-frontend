document.addEventListener('DOMContentLoaded', function () {
  var shell = ZafarShell.init();
  if (!shell) return;
  // Notes draw from the same daily paper quota on the backend
  // (SECTION_QUOTA_CATEGORY maps 'notes' to "paper"), so quotaKey is
  // 'papers' — same badge/gating behavior as the Past Papers page.
  ZafarContent.init({ section: 'notes', quotaKey: 'papers', itemLabel: 'note' }, shell);
});
