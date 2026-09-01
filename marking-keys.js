document.addEventListener('DOMContentLoaded', function () {
  var shell = ZafarShell.init();
  if (!shell) return;
  // Marking keys draw from the same daily paper quota on the backend
  // (SECTION_QUOTA_CATEGORY maps 'marking-keys' to "paper").
  ZafarContent.init({ section: 'marking-keys', quotaKey: 'papers', itemLabel: 'marking key' }, shell);
});
