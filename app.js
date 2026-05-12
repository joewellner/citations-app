// ===== State =====
let citations = [];
let settings = {
  notifEnabled: false,
  notifTime: '08:00',
  showAuthor: true,
  showBook: false,
  showTheme: false
};
let deferredPrompt = null;
let notifCheckInterval = null;

// ===== Init =====
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadCitations();
  loadUserCitations();
  loadSettings();
  setupNavigation();
  setupSettings();
  setupSearch();
  setupShare();
  setupInstall();
  setupAddCitation();
  renderToday();
  renderLibrary();
  registerServiceWorker();
  startNotificationScheduler();
}

// ===== Load Citations =====
async function loadCitations() {
  try {
    const response = await fetch('citations.json');
    citations = await response.json();
  } catch (e) {
    console.error('Erreur chargement citations:', e);
    citations = [];
  }
}

function loadUserCitations() {
  const saved = localStorage.getItem('userCitations');
  if (saved) {
    try {
      const userCitations = JSON.parse(saved);
      citations = citations.concat(userCitations);
    } catch (e) {}
  }
}

function saveUserCitation(citation) {
  const saved = localStorage.getItem('userCitations');
  let userCitations = [];
  if (saved) {
    try { userCitations = JSON.parse(saved); } catch (e) {}
  }
  userCitations.push(citation);
  localStorage.setItem('userCitations', JSON.stringify(userCitations));
}

// ===== Ajouter une citation =====
function setupAddCitation() {
  const btnAdd = document.getElementById('btn-add');
  const modal = document.getElementById('modal-add');
  const btnClose = document.getElementById('btn-close-modal');
  const form = document.getElementById('form-add');

  btnAdd.addEventListener('click', () => {
    modal.classList.remove('hidden');
  });

  btnClose.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const texte = document.getElementById('input-texte').value.trim();
    const auteur = document.getElementById('input-auteur').value.trim();
    const roman = document.getElementById('input-roman').value.trim() || '';
    const themesRaw = document.getElementById('input-themes').value.trim();

    if (!texte || !auteur) return;

    const themes = themesRaw
      ? themesRaw.split(',').map(t => t.trim().toLowerCase()).filter(t => t)
      : [];

    const newId = Math.max(...citations.map(c => c.id), 0) + 1;
    const citation = {
      id: newId,
      texte: texte,
      auteur: auteur,
      roman: roman,
      themes: themes
    };

    citations.push(citation);
    saveUserCitation(citation);
    renderLibrary();

    form.reset();
    modal.classList.add('hidden');
    showToast('Citation ajoutee !');
  });
}

// ===== Navigation =====
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      showPage(page);
    });
  });
}

function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const page = document.getElementById('page-' + pageName);
  const btn = document.querySelector(`.nav-btn[data-page="${pageName}"]`);

  if (page) page.classList.add('active');
  if (btn) btn.classList.add('active');
}

// ===== Citation du jour =====
function getCitationDuJour() {
  if (citations.length === 0) return null;
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  let hash = seed;
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
  hash = (hash >> 16) ^ hash;
  return citations[Math.abs(hash) % citations.length];
}

function renderToday() {
  const citation = getCitationDuJour();
  if (!citation) return;

  document.getElementById('today-text').textContent = citation.texte;
  document.getElementById('today-author').textContent = '— ' + citation.auteur;
  document.getElementById('today-book').textContent = citation.roman;

  const themesEl = document.getElementById('today-themes');
  themesEl.innerHTML = '';
  citation.themes.forEach(theme => {
    const tag = document.createElement('span');
    tag.className = 'theme-tag';
    tag.textContent = theme;
    themesEl.appendChild(tag);
  });
}

// ===== Bibliothèque =====
function renderLibrary() {
  populateFilters();
  filterAndRender();
}

let filtersInitialized = false;

function populateFilters() {
  const authors = [...new Set(citations.map(c => c.auteur))].sort();
  const themes = [...new Set(citations.flatMap(c => c.themes))].sort();

  const authorSelect = document.getElementById('filter-author');
  const themeSelect = document.getElementById('filter-theme');

  const prevAuthor = authorSelect.value;
  const prevTheme = themeSelect.value;

  authorSelect.innerHTML = '<option value="">Tous</option>';
  themeSelect.innerHTML = '<option value="">Tous</option>';

  authors.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    authorSelect.appendChild(opt);
  });

  themes.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    themeSelect.appendChild(opt);
  });

  authorSelect.value = prevAuthor;
  themeSelect.value = prevTheme;

  if (!filtersInitialized) {
    authorSelect.addEventListener('change', filterAndRender);
    themeSelect.addEventListener('change', filterAndRender);
    filtersInitialized = true;
  }
}

function setupSearch() {
  const input = document.getElementById('search-input');
  let timeout;
  input.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(filterAndRender, 200);
  });
}

function filterAndRender() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const author = document.getElementById('filter-author').value;
  const theme = document.getElementById('filter-theme').value;

  let filtered = citations;

  if (query) {
    filtered = filtered.filter(c =>
      c.texte.toLowerCase().includes(query) ||
      c.auteur.toLowerCase().includes(query) ||
      c.roman.toLowerCase().includes(query) ||
      c.themes.some(t => t.toLowerCase().includes(query))
    );
  }

  if (author) {
    filtered = filtered.filter(c => c.auteur === author);
  }

  if (theme) {
    filtered = filtered.filter(c => c.themes.includes(theme));
  }

  const countEl = document.getElementById('results-count');
  countEl.textContent = `${filtered.length} citation${filtered.length > 1 ? 's' : ''}`;

  const listEl = document.getElementById('citations-list');
  listEl.innerHTML = '';

  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'citation-card';
    card.innerHTML = `
      <p class="card-text">${escapeHtml(c.texte)}</p>
      <div class="card-meta">
        <div>
          <p class="card-author">${escapeHtml(c.auteur)}</p>
          <p class="card-book">${escapeHtml(c.roman)}</p>
        </div>
        <div class="card-themes">
          ${c.themes.map(t => `<span class="theme-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Réglages =====
function loadSettings() {
  const saved = localStorage.getItem('citationSettings');
  if (saved) {
    try {
      settings = { ...settings, ...JSON.parse(saved) };
    } catch (e) {}
  }
}

function saveSettings() {
  localStorage.setItem('citationSettings', JSON.stringify(settings));
}

function setupSettings() {
  const enabledToggle = document.getElementById('notif-enabled');
  const notifOptions = document.getElementById('notif-options');
  const timeInput = document.getElementById('notif-time');
  const showAuthor = document.getElementById('notif-show-author');
  const showBook = document.getElementById('notif-show-book');
  const showTheme = document.getElementById('notif-show-theme');
  const testBtn = document.getElementById('btn-test-notif');

  // Apply saved settings
  enabledToggle.checked = settings.notifEnabled;
  timeInput.value = settings.notifTime;
  showAuthor.checked = settings.showAuthor;
  showBook.checked = settings.showBook;
  showTheme.checked = settings.showTheme;

  if (settings.notifEnabled) {
    notifOptions.classList.remove('hidden');
  }

  // Toggle notifications
  enabledToggle.addEventListener('change', async () => {
    if (enabledToggle.checked) {
      const granted = await requestNotificationPermission();
      if (granted) {
        settings.notifEnabled = true;
        notifOptions.classList.remove('hidden');
        startNotificationScheduler();
        showToast('Notifications activees !');
      } else {
        enabledToggle.checked = false;
        showToast('Permission refusee. Active les notifications dans les reglages de ton navigateur.');
      }
    } else {
      settings.notifEnabled = false;
      notifOptions.classList.add('hidden');
      stopNotificationScheduler();
      showToast('Notifications desactivees');
    }
    saveSettings();
  });

  // Time change
  timeInput.addEventListener('change', () => {
    settings.notifTime = timeInput.value;
    saveSettings();
    restartNotificationScheduler();
    showToast('Heure mise a jour : ' + timeInput.value);
  });

  // Content toggles
  showAuthor.addEventListener('change', () => {
    settings.showAuthor = showAuthor.checked;
    saveSettings();
  });

  showBook.addEventListener('change', () => {
    settings.showBook = showBook.checked;
    saveSettings();
  });

  showTheme.addEventListener('change', () => {
    settings.showTheme = showTheme.checked;
    saveSettings();
  });

  // Test notification
  testBtn.addEventListener('click', () => {
    const citation = getCitationDuJour();
    if (citation) {
      sendNotification(citation);
    }
  });
}

// ===== Notifications =====
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Ton navigateur ne supporte pas les notifications');
    return false;
  }

  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

function sendNotification(citation) {
  if (Notification.permission !== 'granted') return;

  let body = citation.texte;
  if (body.length > 180) {
    body = body.substring(0, 177) + '...';
  }

  const parts = [];
  if (settings.showAuthor) parts.push(citation.auteur);
  if (settings.showBook) parts.push(citation.roman);
  if (settings.showTheme && citation.themes.length > 0) {
    parts.push(citation.themes.join(', '));
  }

  const title = parts.length > 0 ? parts.join(' — ') : 'Citation du jour';

  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title: title,
      body: body
    });
  } else {
    new Notification(title, {
      body: body,
      icon: 'icons/icon-192.svg',
      badge: 'icons/icon-192.svg',
      tag: 'citation-du-jour',
      renotify: true
    });
  }
}

function startNotificationScheduler() {
  stopNotificationScheduler();
  if (!settings.notifEnabled) return;

  // Check every 30 seconds
  notifCheckInterval = setInterval(checkNotificationTime, 30000);
  // Also check immediately
  checkNotificationTime();
}

function stopNotificationScheduler() {
  if (notifCheckInterval) {
    clearInterval(notifCheckInterval);
    notifCheckInterval = null;
  }
}

function restartNotificationScheduler() {
  startNotificationScheduler();
}

function checkNotificationTime() {
  if (!settings.notifEnabled) return;

  const now = new Date();
  const today = now.toDateString();
  const lastShown = localStorage.getItem('lastNotifDate');

  if (lastShown === today) return;

  const [targetH, targetM] = settings.notifTime.split(':').map(Number);
  const currentH = now.getHours();
  const currentM = now.getMinutes();

  if (currentH > targetH || (currentH === targetH && currentM >= targetM)) {
    const citation = getCitationDuJour();
    if (citation) {
      sendNotification(citation);
      localStorage.setItem('lastNotifDate', today);
    }
  }
}

// ===== Share =====
function setupShare() {
  document.getElementById('btn-share').addEventListener('click', () => {
    const citation = getCitationDuJour();
    if (!citation) return;

    const text = `"${citation.texte}"\n— ${citation.auteur}, ${citation.roman}`;

    if (navigator.share) {
      navigator.share({
        title: 'Citation du jour',
        text: text
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Citation copiee !');
      }).catch(() => {
        showToast('Impossible de copier');
      });
    }
  });
}

// ===== PWA Install =====
function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-banner').classList.remove('hidden');
  });

  document.getElementById('btn-install').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Application installee !');
      document.getElementById('install-banner').classList.add('hidden');
    }
    deferredPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    document.getElementById('install-banner').classList.add('hidden');
    deferredPrompt = null;
  });
}

// ===== Service Worker =====
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');

      // Try periodic background sync
      if ('periodicSync' in reg) {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (status.state === 'granted') {
          await reg.periodicSync.register('daily-citation', {
            minInterval: 24 * 60 * 60 * 1000
          });
        }
      }
    } catch (e) {
      console.log('Service Worker non enregistre:', e);
    }
  }
}

// ===== Toast =====
function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
