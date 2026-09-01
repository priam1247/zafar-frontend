document.addEventListener('DOMContentLoaded', function () {
  var shell = ZafarShell.init();
  if (!shell) return;
  ZafarContent.init({ section: 'books', quotaKey: 'books', itemLabel: 'book' }, shell);
});
