document.addEventListener('DOMContentLoaded', function () {
  var shell = ZafarShell.init();
  if (!shell) return; // not logged in — already redirected

  var esc = function (s) { return Zafar.escapeHTML(s); };

  // ---- Date + time-aware greeting ----
  var now = new Date();
  var dateEl = document.getElementById('page-date');
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  var greetingEl = document.getElementById('hero-greeting');
  if (greetingEl) {
    var hour = now.getHours();
    var part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    var textNode = greetingEl.querySelector('.hero-greeting-text');
    if (!textNode) {
      // First run: the static markup already has the icon + a default
      // "evening" text — just grab a reference for later updates.
      greetingEl.childNodes.forEach(function (node) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          textNode = node;
        }
      });
    }
    if (textNode) textNode.textContent = 'Good ' + part + ', Student';
  }

  // ---- Stats that don't need the backend ----
  var favorites = Zafar.getBookmarks();
  var favEl = document.getElementById('stat-favorites');
  if (favEl) favEl.textContent = String(favorites.length);
  var downloadedEl = document.getElementById('stat-downloaded');
  if (downloadedEl) downloadedEl.textContent = String(Zafar.getDownloadsToday());

  function relativeTime(iso) {
    var diffMs = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    return days + 'd ago';
  }

  function miniRowHTML(item) {
    return (
      '<div class="mini-row">' +
        '<span class="mini-badge">' + esc(item.category || 'Doc') + '</span>' +
        '<span class="mini-row-title">' + esc(item.name) + '</span>' +
        (item.meta ? '<span class="mini-row-meta">' + esc(item.meta) + '</span>' : '') +
      '</div>'
    );
  }

  // ---- Recent downloads (client-side history) ----
  var recentList = document.getElementById('recent-list');
  var recent = Zafar.getRecentDownloads(3);
  if (recentList && recent.length) {
    recentList.innerHTML = recent.map(function (d) {
      return miniRowHTML({ name: d.name, category: d.category, meta: relativeTime(d.at) });
    }).join('');
  }

  // ---- Daily download limit card ----
  var limitFraction = document.getElementById('limit-fraction');
  var limitFill = document.getElementById('limit-fill');
  Zafar.authGet('/auth/quota')
    .then(function (quota) {
      var left = quota.papers_left;
      var total = DAILY_PAPER_LIMIT;
      var pct = total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
      if (limitFraction) limitFraction.textContent = left + ' of ' + total + ' left';
      if (limitFill) {
        limitFill.style.width = pct + '%';
        limitFill.classList.toggle('low', left <= Math.ceil(total * 0.2));
      }
    })
    .catch(function () {
      if (limitFraction) limitFraction.textContent = 'Unavailable';
    });

  // ---- Papers-derived stats: total count, category counts, trending, favorites preview ----
  var categoryGrid = document.getElementById('category-grid');
  var trendingList = document.getElementById('trending-list');
  var favoritesList = document.getElementById('favorites-list');
  var statTotal = document.getElementById('stat-total');

  Zafar.authGet('/drive/papers?section=papers')
    .then(function (papers) {
      if (statTotal) statTotal.textContent = String(papers.length);

      // Category counts
      var counts = {};
      papers.forEach(function (p) {
        var cat = p.category || 'Other Past Papers';
        counts[cat] = (counts[cat] || 0) + 1;
      });
      if (categoryGrid) {
        categoryGrid.querySelectorAll('[data-count]').forEach(function (el) {
          var cat = el.dataset.count;
          el.textContent = (counts[cat] || 0) + (counts[cat] === 1 ? ' paper' : ' papers');
        });
      }

      // Trending this week — no popularity signal from the backend yet, so
      // this shows the first few papers returned as a reasonable stand-in.
      if (trendingList) {
        var top = papers.slice(0, 3);
        if (top.length === 0) {
          trendingList.innerHTML = '<div class="dashed-empty">No papers here yet.</div>';
        } else {
          trendingList.innerHTML = top.map(function (p) {
            return miniRowHTML({
              name: p.name.replace(/\.pdf$/i, ''),
              category: p.category || 'Document',
              meta: Zafar.formatSize(p.size_bytes),
            });
          }).join('');
        }
      }

      // Saved favorites preview
      if (favoritesList) {
        var bookmarks = Zafar.getBookmarks();
        var favPapers = papers.filter(function (p) { return bookmarks.indexOf(p.id) !== -1; }).slice(0, 3);
        if (favPapers.length) {
          favoritesList.innerHTML = favPapers.map(function (p) {
            return miniRowHTML({ name: p.name.replace(/\.pdf$/i, ''), category: p.category || 'Document' });
          }).join('');
        }
      }
    })
    .catch(function () {
      if (statTotal) statTotal.textContent = '\u2013';
      if (categoryGrid) {
        categoryGrid.querySelectorAll('[data-count]').forEach(function (el) { el.textContent = '\u2013'; });
      }
      if (trendingList) trendingList.innerHTML = '<div class="dashed-empty">Couldn\u2019t load trending papers.</div>';
      shell.showToast('Could not load papers');
    });
});
