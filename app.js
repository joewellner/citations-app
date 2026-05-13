// ===== State =====
let citations = [];
let editingId = null;
let deleteTargetId = null;
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
  loadSettings();
  setupNavigation();
  setupSettings();
  setupSearch();
  setupShare();
  setupInstall();
  setupModal();
  setupImport();
  setupConfirmModal();
  renderToday();
  renderLibrary();
  registerServiceWorker();
  startNotificationScheduler();
}

// ===== Load / Save Citations =====
async function loadCitations() {
  // If we have local data (user has made edits/adds/deletes), use that
  const local = localStorage.getItem('allCitations');
  if (local) {
    try {
      citations = JSON.parse(local);
      return;
    } catch (e) {}
  }
  // Otherwise load from JSON file
  try {
    const response = await fetch('citations.json');
    citations = await response.json();
    saveCitations();
  } catch (e) {
    console.error('Erreur chargement citations:', e);
    citations = [];
  }
}

function saveCitations() {
  localStorage.setItem('allCitations', JSON.stringify(citations));
}

function getNextId() {
  return citations.length > 0 ? Math.max(...citations.map(c => c.id)) + 1 : 1;
}

// ===== Navigation =====
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
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

// ===== Modal (Ajouter / Modifier) =====
function setupModal() {
  const btnAdd = document.getElementById('btn-add');
  const modal = document.getElementById('modal-add');
  const btnClose = document.getElementById('btn-close-modal');
  const form = document.getElementById('form-add');

  btnAdd.addEventListener('click', () => openModal());

  btnClose.addEventListener('click', () => closeModal());

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
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

    if (editingId !== null) {
      // Mode modification
      const idx = citations.findIndex(c => c.id === editingId);
      if (idx !== -1) {
        citations[idx].texte = texte;
        citations[idx].auteur = auteur;
        citations[idx].roman = roman;
        citations[idx].themes = themes;
      }
      showToast('Citation modifiee !');
    } else {
      // Mode ajout
      citations.push({
        id: getNextId(),
        texte: texte,
        auteur: auteur,
        roman: roman,
        themes: themes
      });
      showToast('Citation ajoutee !');
    }

    saveCitations();
    renderLibrary();
    closeModal();
  });
}

function openModal(citation) {
  const modal = document.getElementById('modal-add');
  const title = document.getElementById('modal-title');
  const btnSubmit = document.getElementById('btn-submit-text');
  const btnDelete = document.getElementById('btn-delete');

  document.getElementById('form-add').reset();

  if (citation) {
    // Mode modification
    editingId = citation.id;
    title.textContent = 'Modifier la citation';
    btnSubmit.textContent = 'Enregistrer';
    btnDelete.classList.remove('hidden');
    document.getElementById('input-texte').value = citation.texte;
    document.getElementById('input-auteur').value = citation.auteur;
    document.getElementById('input-roman').value = citation.roman || '';
    document.getElementById('input-themes').value = (citation.themes || []).join(', ');
  } else {
    // Mode ajout
    editingId = null;
    title.textContent = 'Nouvelle citation';
    btnSubmit.textContent = 'Ajouter';
    btnDelete.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-add').classList.add('hidden');
  editingId = null;
}

// ===== Confirmation suppression =====
function setupConfirmModal() {
  const modal = document.getElementById('modal-confirm');
  const btnCancel = document.getElementById('btn-confirm-cancel');
  const btnConfirm = document.getElementById('btn-confirm-delete');

  document.getElementById('btn-delete').addEventListener('click', () => {
    if (editingId !== null) {
      deleteTargetId = editingId;
      modal.classList.remove('hidden');
    }
  });

  btnCancel.addEventListener('click', () => {
    modal.classList.add('hidden');
    deleteTargetId = null;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      deleteTargetId = null;
    }
  });

  btnConfirm.addEventListener('click', () => {
    if (deleteTargetId !== null) {
      citations = citations.filter(c => c.id !== deleteTargetId);
      saveCitations();
      renderLibrary();
      showToast('Citation supprimee');
      deleteTargetId = null;
    }
    modal.classList.add('hidden');
    closeModal();
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
  if (author) filtered = filtered.filter(c => c.auteur === author);
  if (theme) filtered = filtered.filter(c => c.themes.includes(theme));

  const countEl = document.getElementById('results-count');
  countEl.textContent = `${filtered.length} citation${filtered.length > 1 ? 's' : ''}`;

  const listEl = document.getElementById('citations-list');
  listEl.innerHTML = '';

  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'citation-card';
    card.innerHTML = `
      <div class="card-actions">
        <button class="card-btn card-btn-edit" aria-label="Modifier" data-id="${c.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="card-btn card-btn-delete" aria-label="Supprimer" data-id="${c.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
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

    // Edit button
    card.querySelector('.card-btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(c);
    });

    // Delete button
    card.querySelector('.card-btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTargetId = c.id;
      document.getElementById('modal-confirm').classList.remove('hidden');
    });

    listEl.appendChild(card);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Import Word =====
function setupImport() {
  const input = document.getElementById('input-import');
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast('Import en cours...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;
      const imported = parseDocumentText(text);

      if (imported.length === 0) {
        showToast('Aucune citation trouvee dans le document');
        return;
      }

      let nextId = getNextId();
      imported.forEach(c => {
        c.id = nextId++;
        citations.push(c);
      });

      saveCitations();
      renderLibrary();
      showToast(imported.length + ' citation' + (imported.length > 1 ? 's' : '') + ' importee' + (imported.length > 1 ? 's' : '') + ' !');
    } catch (err) {
      console.error('Erreur import:', err);
      showToast('Erreur lors de l\'import');
    }

    input.value = '';
  });
}

function parseDocumentText(text) {
  const results = [];
  const lines = text.split('\n');

  let currentAuteur = '';
  let currentRoman = '';
  let currentCitation = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect header: "Author - "Book"" or "Author - «Book»"
    const headerMatch = line.match(/^(.+?)\s*[-–—]\s*[""«"'](.+?)[""»"']$/);
    if (headerMatch) {
      // Save previous citation if any
      if (currentCitation.length > 0 && currentAuteur) {
        const texte = currentCitation.join(' ').trim();
        if (texte.length > 10) {
          results.push({
            texte: cleanCitation(texte),
            auteur: currentAuteur,
            roman: currentRoman,
            themes: detectThemes(texte)
          });
        }
        currentCitation = [];
      }
      currentAuteur = headerMatch[1].trim();
      currentRoman = headerMatch[2].trim();
      continue;
    }

    if (!currentAuteur) continue;

    if (line === '') {
      if (currentCitation.length > 0) {
        const texte = currentCitation.join(' ').trim();
        if (texte.length > 10) {
          results.push({
            texte: cleanCitation(texte),
            auteur: currentAuteur,
            roman: currentRoman,
            themes: detectThemes(texte)
          });
        }
        currentCitation = [];
      }
    } else {
      currentCitation.push(line);
    }
  }

  // Last citation
  if (currentCitation.length > 0 && currentAuteur) {
    const texte = currentCitation.join(' ').trim();
    if (texte.length > 10) {
      results.push({
        texte: cleanCitation(texte),
        auteur: currentAuteur,
        roman: currentRoman,
        themes: detectThemes(texte)
      });
    }
  }

  return results;
}

function cleanCitation(text) {
  return text.replace(/\s*\[\d+\]\s*\.?\s*$/, '').trim();
}

function detectThemes(text) {
  const lower = text.toLowerCase();
  const themeKeywords = {
    'absurde': ['absurde', 'absurdité', 'sisyphe', 'non-sens'],
    'philosophie': ['philosophi', 'penser', 'pensée', 'raison', 'vérité', 'opinion', 'principes'],
    'mort': ['mort', 'mourir', 'suicide', 'tuer', 'cadavre', 'néant'],
    'vie': ['vivre', 'vie', 'exister', 'existence', 'naissance'],
    'liberté': ['liberté', 'libre', 'libération', 'esclave'],
    'bonheur': ['bonheur', 'heureux', 'joie', 'plaisir'],
    'amour': ['amour', 'aimer', 'aimé', 'coeur', 'cœur'],
    'temps': ['temps', 'éternité', 'éternel', 'éphémère', 'avenir', 'passé'],
    'conscience': ['conscience', 'éveil', 'lucid', 'esprit'],
    'art': ['art', 'œuvre', 'création', 'créer', 'littérat', 'écri', 'livre'],
    'solitude': ['solitude', 'seul', 'isoler', 'étranger'],
    'morale': ['morale', 'vertu', 'dignité', 'devoir', 'juste'],
    'sagesse': ['sagesse', 'sage'],
    'souffrance': ['souffr', 'malheur', 'douleur', 'tourment'],
    'espoir': ['espoir', 'espérer', 'illusion'],
    'nature': ['nature', 'naturel', 'mer', 'océan'],
    'humour': ['humour', 'ironi', 'rire'],
    'destin': ['destin', 'sort', 'fardeau'],
  };

  const scores = {};
  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > 0) scores[theme] = score;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const result = sorted.slice(0, 3).map(([t]) => t);
  return result.length > 0 ? result : ['reflexion'];
}

// ===== Réglages =====
function loadSettings() {
  const saved = localStorage.getItem('citationSettings');
  if (saved) {
    try { settings = { ...settings, ...JSON.parse(saved) }; } catch (e) {}
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

  enabledToggle.checked = settings.notifEnabled;
  timeInput.value = settings.notifTime;
  showAuthor.checked = settings.showAuthor;
  showBook.checked = settings.showBook;
  showTheme.checked = settings.showTheme;

  if (settings.notifEnabled) notifOptions.classList.remove('hidden');

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

  timeInput.addEventListener('change', () => {
    settings.notifTime = timeInput.value;
    saveSettings();
    restartNotificationScheduler();
    showToast('Heure mise a jour : ' + timeInput.value);
  });

  showAuthor.addEventListener('change', () => { settings.showAuthor = showAuthor.checked; saveSettings(); });
  showBook.addEventListener('change', () => { settings.showBook = showBook.checked; saveSettings(); });
  showTheme.addEventListener('change', () => { settings.showTheme = showTheme.checked; saveSettings(); });

  testBtn.addEventListener('click', () => {
    const citation = getCitationDuJour();
    if (citation) sendNotification(citation);
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
  if (body.length > 180) body = body.substring(0, 177) + '...';

  const parts = [];
  if (settings.showAuthor) parts.push(citation.auteur);
  if (settings.showBook) parts.push(citation.roman);
  if (settings.showTheme && citation.themes.length > 0) parts.push(citation.themes.join(', '));

  const title = parts.length > 0 ? parts.join(' — ') : 'Citation du jour';

  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title, body });
  } else {
    new Notification(title, { body, icon: 'icons/icon-192.svg', badge: 'icons/icon-192.svg', tag: 'citation-du-jour', renotify: true });
  }
}

function startNotificationScheduler() {
  stopNotificationScheduler();
  if (!settings.notifEnabled) return;
  notifCheckInterval = setInterval(checkNotificationTime, 30000);
  checkNotificationTime();
}

function stopNotificationScheduler() {
  if (notifCheckInterval) { clearInterval(notifCheckInterval); notifCheckInterval = null; }
}

function restartNotificationScheduler() { startNotificationScheduler(); }

function checkNotificationTime() {
  if (!settings.notifEnabled) return;
  const now = new Date();
  const today = now.toDateString();
  if (localStorage.getItem('lastNotifDate') === today) return;

  const [targetH, targetM] = settings.notifTime.split(':').map(Number);
  if (now.getHours() > targetH || (now.getHours() === targetH && now.getMinutes() >= targetM)) {
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
      navigator.share({ title: 'Citation du jour', text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => showToast('Citation copiee !')).catch(() => showToast('Impossible de copier'));
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
      if ('periodicSync' in reg) {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (status.state === 'granted') {
          await reg.periodicSync.register('daily-citation', { minInterval: 24 * 60 * 60 * 1000 });
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
  setTimeout(() => toast.classList.remove('show'), 2500);
}
