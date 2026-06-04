// --- Supabase yapılandırması ---
const SUPABASE_URL = 'https://ijcgvreinogjkdgvjnhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqY2d2cmVpbm9namtkZ3ZqbmhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTA3OTIsImV4cCI6MjA5NjE2Njc5Mn0.TObXIDgxEuSvkEdLkjMXwJ7YPcETKeWUEwOVh-9T4sc';
const REST_URL = `${SUPABASE_URL}/rest/v1/todos`;
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

let session = JSON.parse(localStorage.getItem('session')) || null;

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
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.completed ? ' completed' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = todo.completed;
    checkbox.addEventListener('change', () => toggle(todo));

    const span = document.createElement('span');
    span.className = 'text';
    span.textContent = todo.text;

    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.innerHTML = '&times;';
    del.title = 'Sil';
    del.addEventListener('click', () => remove(todo.id));

    li.append(checkbox, span, del);
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

// ============ Başlangıç ============
if (session && session.access_token) showApp(); else showAuth();
