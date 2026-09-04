// Shared logic for every "list of documents" page: dashboard.html (papers),
// books.html, notes.html, marking-keys.html. Each of those has its own tiny
// script that just calls ZafarContent.init({...}) with its section name and
// (if downloads should count against a daily limit) which quota field to use.
var ZafarContent = (function () {
  // Bookmarks + escapeHTML/formatSize now live on the shared Zafar object
  // (config.js) so the sidebar's Favorites pill and the Favorites page can
  // use them too — kept as local aliases here so the rest of this file
  // doesn't need to change.
  var getBookmarks = function () { return Zafar.getBookmarks(); };
  var setBookmarks = function (ids) { Zafar.setBookmarks(ids); };
  var escapeHTML = function (str) { return Zafar.escapeHTML(str); };
  var formatSize = function (bytes) { return Zafar.formatSize(bytes); };

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  // config: {
  //   section: 'papers' | 'books' | 'notes' | 'marking-keys',
  //   quotaKey: 'papers' | 'books' | null   (null = downloads aren't quota-limited)
  //   itemLabel: 'paper' | 'book' | 'note' | 'marking key'  (for empty-state copy)
  // }
  function init(config, shell) {
    var showToast = shell ? shell.showToast : function () {};
    var quotaKey = config.quotaKey || null;
    var quotaCategory = quotaKey === 'books' ? 'book' : 'paper';

    var realCards = document.getElementById('real-cards');
    var skeleton = document.getElementById('skeleton-cards');
    var offlineState = document.getElementById('offline-state');
    var errorState = document.getElementById('error-state');
    var noResults = document.getElementById('no-results');
    var resultsCount = document.querySelector('.results-count');
    var searchInput = document.querySelector('.search-input');
    var chipsRow = document.getElementById('chips-row');
    var limitBadge = document.getElementById('limitBadge');
    var limitText = document.getElementById('limitText');
    var retryBtn = document.getElementById('retry-btn');

    var params = new URLSearchParams(window.location.search);
    var state = {
      category: params.get('category') || null,
      q: '',
    };

    // ---- Quota badge (only on pages that track a daily limit) ----
    var left = null;
    function updateLimitBadge() {
      if (!limitBadge || !limitText || left === null) return;
      limitText.textContent = left + (left === 1 ? ' left today' : ' left today');
      limitBadge.classList.toggle('ok', left > 0);
      limitBadge.classList.toggle('depleted', left <= 0);
    }
    if (quotaKey && limitBadge) {
      Zafar.authGet('/auth/quota')
        .then(function (quota) {
          left = quotaKey === 'books' ? quota.books_left : quota.papers_left;
          updateLimitBadge();
        })
        .catch(function () {
          if (limitText) limitText.textContent = 'Unavailable';
        });
    } else if (limitBadge) {
      limitBadge.style.display = 'none';
    }

    // ---- Bookmarks ----
    if (realCards) {
      realCards.addEventListener('click', function (e) {
        var btn = e.target.closest('.bookmark-btn');
        if (!btn) return;
        var id = btn.dataset.id;
        var bookmarks = getBookmarks();
        var isBookmarked = btn.classList.toggle('bookmarked');
        if (isBookmarked) {
          if (id && bookmarks.indexOf(id) === -1) bookmarks.push(id);
        } else {
          bookmarks = bookmarks.filter(function (b) { return b !== id; });
        }
        setBookmarks(bookmarks);
        btn.classList.add('bounce');
        setTimeout(function () { btn.classList.remove('bounce'); }, 300);
        showToast(isBookmarked ? 'Saved to Favorites' : 'Removed from Favorites');
        // On the Favorites page itself, unbookmarking should drop the card
        // from view — reload the (now-filtered) list after the bounce.
        if (config.favoritesOnly && !isBookmarked) {
          setTimeout(load, 280);
        }
      });
    }

    // ---- Downloads ----
    // The backend never sends a download URL in the /drive/papers list (a
    // permanent link there would let the quota be bypassed from the network
    // tab). Every download click has to call POST /drive/download/{file_id}
    // first — that's what enforces/logs the quota (papers, books, notes, and
    // marking keys all draw from a quota category server-side) and returns a
    // short-lived signed URL. Only once that call succeeds do we trigger the
    // actual file navigation, via a throwaway anchor carrying the real URL.
    if (realCards) {
      realCards.addEventListener('click', function (e) {
        var btn = e.target.closest('.download-btn');
        if (!btn) return;

        e.preventDefault();
        if (btn.dataset.pending === 'true') return;
        if (!navigator.onLine) {
          showToast('No internet connection');
          return;
        }
        if (quotaKey && left !== null && left <= 0) {
          showToast('Daily download limit reached');
          return;
        }

        btn.dataset.pending = 'true';
        Zafar.authPostJSON(
          '/drive/download/' + encodeURIComponent(btn.dataset.id) +
            '?section=' + encodeURIComponent(config.section),
          {}
        )
          .then(function (data) {
            btn.dataset.pending = 'false';
            if (quotaKey) {
              left = quotaKey === 'books' ? data.quota.books_left : data.quota.papers_left;
              updateLimitBadge();
            }
            showToast('Download started');
            var cardEl = btn.closest('.card');
            Zafar.recordDownload({
              id: btn.dataset.id,
              name: cardEl ? cardEl.querySelector('.title').textContent : btn.dataset.filename,
              category: cardEl ? cardEl.querySelector('.level').textContent : '',
            });
            // Fetch the file ourselves and hand the browser a same-origin
            // blob: URL, instead of navigating the tab to the Worker's URL.
            // The `download` attribute only works for same-origin/blob URLs —
            // on a cross-origin URL (which the Worker's URL is) browsers
            // ignore it and just navigate the tab there instead, which is
            // the blank-tab flash this replaces.
            fetch(data.url)
              .then(function (resp) {
                if (!resp.ok) throw new Error('Download failed (' + resp.status + ')');
                return resp.blob();
              })
              .then(function (blob) {
                var blobUrl = URL.createObjectURL(blob);
                var link = document.createElement('a');
                link.href = blobUrl;
                link.download = btn.dataset.filename || '';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
                // Tell the backend the bytes actually arrived, so this
                // download counts permanently toward today's quota — a
                // reservation that never gets confirmed (network drop,
                // tab closed mid-fetch, etc.) ages out on its own instead
                // of burning the user's allowance for nothing.
                Zafar.authPostJSON('/drive/confirm/' + data.download_id, {}).catch(function () {});
              })
              .catch(function () {
                showToast('Could not download file — try again');
              });
          })
          .catch(function (err) {
            btn.dataset.pending = 'false';
            if (err && err.status === 429) {
              showToast('Daily download limit reached');
            } else {
              showToast((err && err.message) || 'Could not start download');
            }
          });
      });
    }

    // ---- Rendering ----
    function paperCardHTML(paper) {
      var badge = escapeHTML(paper.category || 'Document');
      var title = escapeHTML(paper.name.replace(/\.pdf$/i, ''));
      var size = formatSize(paper.size_bytes);
      var isBookmarked = getBookmarks().indexOf(paper.id) !== -1;
      var filename = /\.pdf$/i.test(paper.name) ? paper.name : paper.name + '.pdf';
      return (
        '<div class="card" data-id="' + escapeHTML(paper.id) + '">' +
          '<div class="card-top">' +
            '<span class="level">' + badge + '</span>' +
            '<button class="bookmark-btn' + (isBookmarked ? ' bookmarked' : '') + '" data-id="' + escapeHTML(paper.id) + '" aria-label="Save">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="title">' + title + '</div>' +
          '<div class="card-bottom">' +
            '<div class="file-info">' +
              '<div class="file-icon">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/></svg>' +
              '</div>' +
              '<div><div class="file-size">' + size + '</div>PDF Document</div>' +
            '</div>' +
            '<a class="download-btn" data-id="' + escapeHTML(paper.id) + '" data-filename="' + escapeHTML(filename) + '" href="#">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-6.939 6.939a1.207 1.207 0 0 1-1.708 0l-6.94-6.94a.707.707 0 0 1 .5-1.206H8a1 1 0 0 0 1-1V9a1 1 0 0 1 1-1z"/><path d="M9 4h6"/></svg>' +
              'Download' +
            '</a>' +
          '</div>' +
        '</div>'
      );
    }

    function renderChips() {
      if (!chipsRow) return;
      var chips = [];
      if (state.category) {
        chips.push('<div class="chip active" data-chip-type="category">' + escapeHTML(state.category) + ' <button class="chip-remove" aria-label="Remove category filter">\u2715</button></div>');
      }
      if (state.q) {
        chips.push('<div class="chip active" data-chip-type="q">"' + escapeHTML(state.q) + '" <button class="chip-remove" aria-label="Remove search filter">\u2715</button></div>');
      }
      if (chips.length) {
        chips.push('<div class="chip clear" id="clear-all-chip">Clear all</div>');
      }
      chipsRow.innerHTML = chips.join('');
      chipsRow.style.display = chips.length ? 'flex' : 'none';
    }

    function updateURL() {
      var url = new URL(window.location.href);
      if (state.category) url.searchParams.set('category', state.category);
      else url.searchParams.delete('category');
      window.history.replaceState({}, '', url);
    }

    function load() {
      if (!navigator.onLine) {
        if (skeleton) skeleton.style.display = 'none';
        if (offlineState) offlineState.classList.add('show');
        return;
      }
      if (offlineState) offlineState.classList.remove('show');
      if (errorState) errorState.classList.remove('show');
      if (noResults) noResults.classList.remove('show');
      if (skeleton) skeleton.style.display = 'flex';
      if (realCards) realCards.style.display = 'none';

      var query = new URLSearchParams();
      query.set('section', config.section);
      if (state.category) query.set('category', state.category);
      if (state.q) query.set('q', state.q);

      Zafar.authGet('/drive/papers?' + query.toString())
        .then(function (papers) {
          if (skeleton) skeleton.style.display = 'none';
          if (config.favoritesOnly) {
            var bookmarks = getBookmarks();
            papers = papers.filter(function (p) { return bookmarks.indexOf(p.id) !== -1; });
          }
          if (resultsCount) {
            resultsCount.textContent = config.favoritesOnly
              ? papers.length + ' saved'
              : papers.length + ' result' + (papers.length === 1 ? '' : 's');
          }
          if (!realCards) return;
          if (papers.length === 0) {
            realCards.innerHTML = '';
            realCards.style.display = 'none';
            if (noResults) {
              if (config.emptyStateHTML) {
                noResults.innerHTML = config.emptyStateHTML;
              } else {
                noResults.textContent = (state.category || state.q)
                  ? 'No ' + config.itemLabel + 's match this filter.'
                  : 'No ' + config.itemLabel + 's here yet.';
              }
              noResults.classList.add('show');
            }
            return;
          }
          realCards.innerHTML = papers.map(paperCardHTML).join('');
          realCards.style.display = 'flex';
        })
        .catch(function (err) {
          if (skeleton) skeleton.style.display = 'none';
          if (resultsCount) resultsCount.textContent = '';
          if (errorState) errorState.classList.add('show');
          showToast((err && err.message) || 'Could not load ' + config.itemLabel + 's');
        });

      renderChips();
      updateURL();
    }

    if (retryBtn) retryBtn.addEventListener('click', load);

    // ---- Search (debounced, real backend query) ----
    if (searchInput) {
      searchInput.addEventListener('input', debounce(function () {
        state.q = (searchInput.value || '').trim();
        load();
      }, 350));
    }

    // ---- Chips ----
    if (chipsRow) {
      chipsRow.addEventListener('click', function (e) {
        if (e.target.classList.contains('chip-remove')) {
          var chip = e.target.closest('.chip');
          var type = chip && chip.dataset.chipType;
          if (type === 'category') state.category = null;
          if (type === 'q') {
            state.q = '';
            if (searchInput) searchInput.value = '';
          }
          load();
          return;
        }
        if (e.target.id === 'clear-all-chip') {
          state.category = null;
          state.q = '';
          if (searchInput) searchInput.value = '';
          load();
        }
      });
    }

    // ---- Connectivity ----
    window.addEventListener('offline', function () {
      if (realCards) realCards.style.display = 'none';
      if (skeleton) skeleton.style.display = 'none';
      if (offlineState) offlineState.classList.add('show');
      showToast('No internet connection');
    });
    window.addEventListener('online', function () {
      showToast('Back online');
      load();
    });

    load();
  }

  return { init: init };
})();
