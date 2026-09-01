document.addEventListener('DOMContentLoaded', function () {
  var shell = ZafarShell.init();
  if (!shell) return; // not logged in — already redirected
  ZafarContent.init({ section: 'papers', quotaKey: 'papers', itemLabel: 'paper' }, shell);
});
