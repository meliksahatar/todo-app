// --- Supabase yapılandırması ---
const SUPABASE_URL = 'https://ijcgvreinogjkdgvjnhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqY2d2cmVpbm9namtkZ3ZqbmhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTA3OTIsImV4cCI6MjA5NjE2Njc5Mn0.TObXIDgxEuSvkEdLkjMXwJ7YPcETKeWUEwOVh-9T4sc';
const REST_URL = `${SUPABASE_URL}/rest/v1/todos`;
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

// AI yapılandırması (anahtar yalnızca tarayıcıda saklanır)
const AI_MODEL = 'claude-haiku-4-5-20251001';
const AI_ENDPOINT = 'https://api.anthropic.com/v1/messages';

let session = JSON.parse(localStorage.getItem('session')) || null;
let aiKey = localStorage.getItem('ai_key') || '';

function authHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${session ? session.access_token : SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ============ Auth API ============
async function signUp(email, password) {
  const res = await fetch(`${AUTH_URL}/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || data.error || 'Kayıt başarısız');
  if (!data.access_token) throw new Error('Kayıt tamamlandı fakat oturum açılamadı.');
  return data;
}

async function signIn(email, password) {
  const res = await fetch(`${AUTH_URL}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || data.error || 'Giriş başarısız');
  return data;
}

function saveSession(data) {
  session = { access_token: data.access_token, refresh_token: data.refresh_token, email: data.user.email };
  localStorage.setItem('session', JSON.stringify(session));
}
function clearSession() { session = null; localStorage.removeItem('session'); }

// ============ Todo REST API ============
async function apiSelect() {
  const res = await fetch(`${REST_URL}?select=*&order=created_at.asc`, { headers: authHeaders() });
  if (res.status === 401) { handleExpired(); throw new Error('Oturum süresi doldu, tekrar giriş yap'); }
  if (!res.ok) throw new Error('Görevler yüklenemedi');
  return res.json();
}
async function apiInsert(text) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Görev eklenemedi');
  return (await res.json())[0];
}
async function apiUpdate(id, fields) {
  const res = await fetch(`${REST_URL}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error('Görev güncellenemedi');
  return (await res.json())[0];
}
async function apiDelete(filter) {
  const res = await fetch(`${REST_URL}?${filter}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Görev silinemedi');
}

// ============ AI (Anthropic Claude) ============
async function callAI(system, user, maxTokens = 1024) {
  if (!aiKey) { openSettings(); throw new Error('Önce AI anahtarını ayarla (⚙️)'); }
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': aiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `AI hatası (${res.status})`);
  return data.content.map(b => b.text || '').join('').trim();
}

// Modelden JSON dizisi çıkar (kod bloğu/ekstra metin olsa bile)
function parseJsonArray(text) {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  const arr = JSON.parse(t);
  if (!Array.isArray(arr)) throw new Error('Beklenmeyen yanıt');
  return arr;
}

// ============ DOM ============
const $ = id => document.getElementById(id);
const authScreen = $('auth-screen'), appScreen = $('app-screen');
const authForm = $('auth-form'), authEmail = $('auth-email'), authPassword = $('auth-password');
const authSubmit = $('auth-submit'), authError = $('auth-error'), authSubtitle = $('auth-subtitle');
const authToggle = $('auth-toggle'), authToggleLabel = $('auth-toggle-label');
const userAvatar = $('user-avatar'), logoutBtn = $('logout-btn');

const form = $('todo-form'), input = $('todo-input'), list = $('todo-list');
const itemCount = $('item-count'), clearBtn = $('clear-completed');
const filterBtns = document.querySelectorAll('.filter-btn');

const aiToggle = $('ai-toggle'), aiPanel = $('ai-panel'), aiClose = $('ai-close');
const aiStatus = $('ai-status'), aiResults = $('ai-results');
const aiActionBtns = document.querySelectorAll('.chip-btn');

const settingsBtn = $('settings-btn'), settingsModal = $('settings-modal');
const aiKeyInput = $('ai-key-input'), keyError = $('key-error');
const keySave = $('key-save'), keyCancel = $('key-cancel'), keyClear = $('key-clear');
const toast = $('toast');

let todos = [], filter = 'all', mode = 'login';

// ============ Toast ============
let toastTimer;
function showToast(msg, isErr = false) {
  toast.textContent = msg;
  toast.classList.toggle('err', isErr);
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 250);
  }, 2600);
}

// ============ Auth UI ============
function setMode(m) {
  mode = m;
  authError.textContent = '';
  const login = m === 'login';
  authSubtitle.textContent = login ? 'Devam etmek için giriş yap' : 'Yeni hesap oluştur';
  authSubmit.textContent = login ? 'Giriş Yap' : 'Kaydol';
  authToggleLabel.textContent = login ? 'Hesabın yok mu?' : 'Zaten hesabın var mı?';
  authToggle.textContent = login ? 'Kaydol' : 'Giriş Yap';
  authPassword.setAttribute('autocomplete', login ? 'current-password' : 'new-password');
}
authToggle.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

authForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.textContent = '';
  authSubmit.disabled = true;
  try {
    const data = mode === 'signup'
      ? await signUp(authEmail.value.trim(), authPassword.value)
      : await signIn(authEmail.value.trim(), authPassword.value);
    saveSession(data);
    authForm.reset();
    showApp();
  } catch (err) {
    authError.textContent = err.message;
  } finally {
    authSubmit.disabled = false;
  }
});

logoutBtn.addEventListener('click', () => { clearSession(); todos = []; showAuth(); });
function handleExpired() { clearSession(); showAuth(); }

function showAuth() { appScreen.hidden = true; authScreen.hidden = false; setMode('login'); }
async function showApp() {
  authScreen.hidden = true;
  appScreen.hidden = false;
  userAvatar.textContent = session.email.charAt(0);
  userAvatar.title = session.email;
  await load();
}

// ============ Todo render ============
const PRI_LABEL = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };

function render() {
  list.innerHTML = '';
  const filtered = todos.filter(t =>
    filter === 'active' ? !t.completed : filter === 'completed' ? t.completed : true
  );

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Henüz görev yok ✨';
    list.appendChild(li);
  }

  filtered.forEach(todo => {
    const pri = todo.priority || 'medium';
    const li = document.createElement('li');
    li.className = `todo-item pri-${pri}` + (todo.completed ? ' completed' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = todo.completed;
    checkbox.addEventListener('change', () => toggle(todo));

    const span = document.createElement('span');
    span.className = 'text';
    span.textContent = todo.text;

    const badge = document.createElement('span');
    badge.className = `pri-badge ${pri}`;
    badge.textContent = PRI_LABEL[pri];

    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.innerHTML = '&times;';
    del.title = 'Sil';
    del.addEventListener('click', () => remove(todo.id));

    li.append(checkbox, span, badge, del);
    list.appendChild(li);
  });

  const remaining = todos.filter(t => !t.completed).length;
  itemCount.textContent = `${remaining} aktif görev`;
}

async function load() {
  try { todos = await apiSelect(); render(); }
  catch (err) { showToast(err.message, true); }
}
async function addTodo(text) {
  const created = await apiInsert(text);
  todos.push(created);
  render();
  return created;
}
async function toggle(todo) {
  try {
    const updated = await apiUpdate(todo.id, { completed: !todo.completed });
    const i = todos.findIndex(t => t.id === todo.id);
    if (i !== -1) todos[i] = updated;
    render();
  } catch (err) { showToast(err.message, true); }
}
async function remove(id) {
  try {
    await apiDelete(`id=eq.${id}`);
    todos = todos.filter(t => t.id !== id);
    render();
  } catch (err) { showToast(err.message, true); }
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  try { await addTodo(text); input.value = ''; input.focus(); }
  catch (err) { showToast(err.message, true); }
});

clearBtn.addEventListener('click', async () => {
  const ids = todos.filter(t => t.completed).map(t => t.id);
  if (!ids.length) return;
  try {
    await apiDelete(`id=in.(${ids.join(',')})`);
    todos = todos.filter(t => !t.completed);
    render();
  } catch (err) { showToast(err.message, true); }
});

filterBtns.forEach(btn => btn.addEventListener('click', () => {
  filter = btn.dataset.filter;
  filterBtns.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}));

// ============ AI panel ============
aiToggle.addEventListener('click', () => {
  const open = aiPanel.hidden;
  aiPanel.hidden = !open;
  aiToggle.classList.toggle('active', open);
  if (open) input.focus();
});
aiClose.addEventListener('click', () => { aiPanel.hidden = true; aiToggle.classList.remove('active'); });

function aiBusy(msg) {
  aiResults.innerHTML = '';
  aiStatus.hidden = false;
  aiStatus.classList.remove('error');
  aiStatus.innerHTML = `<span class="spinner"></span> ${msg}`;
  aiActionBtns.forEach(b => b.disabled = true);
}
function aiDone(errMsg) {
  aiActionBtns.forEach(b => b.disabled = false);
  if (errMsg) {
    aiStatus.hidden = false;
    aiStatus.classList.add('error');
    aiStatus.textContent = '⚠️ ' + errMsg;
  } else {
    aiStatus.hidden = true;
  }
}

function renderSuggestions(items, showAddAll = true) {
  aiResults.innerHTML = '';
  items.forEach(text => {
    const row = document.createElement('div');
    row.className = 'ai-suggestion';
    const span = document.createElement('span');
    span.textContent = text;
    const add = document.createElement('button');
    add.textContent = '+';
    add.title = 'Listeye ekle';
    add.addEventListener('click', async () => {
      try {
        await addTodo(text);
        row.classList.add('added');
        add.textContent = '✓';
      } catch (err) { showToast(err.message, true); }
    });
    row.append(span, add);
    aiResults.appendChild(row);
  });
  if (showAddAll && items.length > 1) {
    const all = document.createElement('button');
    all.className = 'ai-addall';
    all.textContent = `Hepsini ekle (${items.length})`;
    all.addEventListener('click', async () => {
      all.disabled = true;
      for (const row of aiResults.querySelectorAll('.ai-suggestion:not(.added) button')) row.click();
      showToast('Tüm öneriler eklendi ✓');
    });
    aiResults.appendChild(all);
  }
}

async function aiBreakdown() {
  const goal = input.value.trim();
  if (!goal) return showToast('Önce bir hedef yaz', true);
  aiBusy('Hedef alt görevlere bölünüyor…');
  try {
    const out = await callAI(
      'Sen bir proje planlama asistanısın. Kullanıcının hedefini, sırayla yapılabilecek somut ve eyleme dönük alt görevlere böl. Yanıtı SADECE Türkçe string\'lerden oluşan bir JSON dizisi olarak ver, başka hiçbir şey yazma. En fazla 8 madde.',
      `Hedef: ${goal}`
    );
    const items = parseJsonArray(out);
    aiDone();
    renderSuggestions(items);
  } catch (err) { aiDone(err.message); }
}

async function aiImprove() {
  const text = input.value.trim();
  if (!text) return showToast('Önce bir görev yaz', true);
  aiBusy('Metin iyileştiriliyor…');
  try {
    const out = await callAI(
      'Verilen görev metnini daha net, somut ve eyleme dönük TEK bir cümleye dönüştür. Sadece iyileştirilmiş metni döndür; tırnak, açıklama veya ek bir şey yazma.',
      text
    );
    const improved = out.replace(/^["'`]|["'`]$/g, '').trim();
    input.value = improved;
    input.focus();
    aiDone();
    aiResults.innerHTML = '';
    showToast('Metin iyileştirildi ✓');
  } catch (err) { aiDone(err.message); }
}

async function aiSuggest() {
  aiBusy('Öneriler hazırlanıyor…');
  const current = todos.map(t => t.text);
  const extra = input.value.trim();
  try {
    const out = await callAI(
      'Kullanıcının yapılacaklar listesine bakıp, işine yarayacak ilgili YENİ görevler öner. Mevcut görevleri tekrarlama. Yanıtı SADECE Türkçe string\'lerden oluşan bir JSON dizisi olarak ver. En fazla 5 madde.',
      `Mevcut görevler: ${JSON.stringify(current)}${extra ? `\nBağlam/ilgi alanı: ${extra}` : ''}`
    );
    const items = parseJsonArray(out);
    aiDone();
    renderSuggestions(items);
  } catch (err) { aiDone(err.message); }
}

async function aiPrioritize() {
  const active = todos.filter(t => !t.completed);
  if (!active.length) return showToast('Önceliklendirilecek aktif görev yok', true);
  aiBusy('Görevler önceliklendiriliyor…');
  try {
    const payload = active.map(t => ({ id: t.id, text: t.text }));
    const out = await callAI(
      'Verilen görevleri aciliyet ve önemine göre önceliklendir. Her görev için "high", "medium" veya "low" ata. Yanıtı SADECE şu biçimde bir JSON dizisi olarak ver: [{"id": <sayı>, "priority": "high|medium|low"}]. Başka hiçbir şey yazma.',
      JSON.stringify(payload)
    );
    const ranking = parseJsonArray(out);
    let changed = 0;
    for (const r of ranking) {
      if (!['high', 'medium', 'low'].includes(r.priority)) continue;
      const todo = todos.find(t => t.id === r.id);
      if (!todo || todo.priority === r.priority) continue;
      const updated = await apiUpdate(r.id, { priority: r.priority });
      const i = todos.findIndex(t => t.id === r.id);
      if (i !== -1) todos[i] = updated;
      changed++;
    }
    // yüksek öncelik üste gelecek şekilde sırala
    const order = { high: 0, medium: 1, low: 2 };
    todos.sort((a, b) => (order[a.priority] - order[b.priority]));
    render();
    aiDone();
    aiResults.innerHTML = '';
    showToast(changed ? `Öncelikler güncellendi (${changed}) ✓` : 'Öncelikler zaten güncel');
  } catch (err) { aiDone(err.message); }
}

const AI_ACTIONS = { breakdown: aiBreakdown, improve: aiImprove, suggest: aiSuggest, prioritize: aiPrioritize };
aiActionBtns.forEach(btn => btn.addEventListener('click', () => AI_ACTIONS[btn.dataset.ai]()));

// ============ AI ayar modalı ============
function openSettings() {
  aiKeyInput.value = aiKey;
  keyError.textContent = '';
  settingsModal.hidden = false;
}
function closeSettings() { settingsModal.hidden = true; }
settingsBtn.addEventListener('click', openSettings);
keyCancel.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettings(); });

keySave.addEventListener('click', () => {
  const k = aiKeyInput.value.trim();
  if (k && !k.startsWith('sk-ant-')) {
    keyError.textContent = 'Anthropic anahtarı "sk-ant-" ile başlamalı.';
    return;
  }
  aiKey = k;
  if (k) localStorage.setItem('ai_key', k); else localStorage.removeItem('ai_key');
  closeSettings();
  showToast(k ? 'AI anahtarı kaydedildi ✓' : 'Anahtar silindi');
});
keyClear.addEventListener('click', () => {
  aiKey = '';
  localStorage.removeItem('ai_key');
  aiKeyInput.value = '';
  showToast('Anahtar silindi');
});

// ============ Başlangıç ============
if (session && session.access_token) showApp(); else showAuth();
