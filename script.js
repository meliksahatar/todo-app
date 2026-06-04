// --- Supabase yapılandırması ---
const SUPABASE_URL = 'https://ijcgvreinogjkdgvjnhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqY2d2cmVpbm9namtkZ3ZqbmhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTA3OTIsImV4cCI6MjA5NjE2Njc5Mn0.TObXIDgxEuSvkEdLkjMXwJ7YPcETKeWUEwOVh-9T4sc';
const REST_URL = `${SUPABASE_URL}/rest/v1/todos`;
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

// Oturum (access token + kullanıcı) tarayıcıda saklanır
let session = JSON.parse(localStorage.getItem('session')) || null;

function authHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${session ? session.access_token : SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

// --- Auth API (GoTrue REST) ---
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

function clearSession() {
  session = null;
  localStorage.removeItem('session');
}

// --- Todo REST API ---
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

// --- DOM elemanları ---
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authError = document.getElementById('auth-error');
const authSubtitle = document.getElementById('auth-subtitle');
const authToggle = document.getElementById('auth-toggle');
const authToggleLabel = document.getElementById('auth-toggle-label');
const userEmail = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const itemCount = document.getElementById('item-count');
const clearBtn = document.getElementById('clear-completed');
const filterBtns = document.querySelectorAll('.filter-btn');

let todos = [];
let filter = 'all';
let mode = 'login'; // 'login' | 'signup'

// --- Auth ekranı kontrolü ---
function setMode(m) {
  mode = m;
  authError.textContent = '';
  if (m === 'login') {
    authSubtitle.textContent = 'Devam etmek için giriş yap';
    authSubmit.textContent = 'Giriş Yap';
    authToggleLabel.textContent = 'Hesabın yok mu?';
    authToggle.textContent = 'Kaydol';
    authPassword.setAttribute('autocomplete', 'current-password');
  } else {
    authSubtitle.textContent = 'Yeni hesap oluştur';
    authSubmit.textContent = 'Kaydol';
    authToggleLabel.textContent = 'Zaten hesabın var mı?';
    authToggle.textContent = 'Giriş Yap';
    authPassword.setAttribute('autocomplete', 'new-password');
  }
}

authToggle.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

authForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.textContent = '';
  authSubmit.disabled = true;
  const email = authEmail.value.trim();
  const password = authPassword.value;
  try {
    const data = mode === 'signup'
      ? await signUp(email, password)
      : await signIn(email, password);
    saveSession(data);
    authForm.reset();
    showApp();
  } catch (err) {
    authError.textContent = err.message;
  } finally {
    authSubmit.disabled = false;
  }
});

logoutBtn.addEventListener('click', () => {
  clearSession();
  todos = [];
  showAuth();
});

function handleExpired() {
  clearSession();
  showAuth();
}

function showAuth() {
  appScreen.hidden = true;
  authScreen.hidden = false;
  setMode('login');
}

async function showApp() {
  authScreen.hidden = true;
  appScreen.hidden = false;
  userEmail.textContent = session.email;
  await load();
}

// --- Todo render & işlemler ---
function render() {
  list.innerHTML = '';
  const filtered = todos.filter(t => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  if (filtered.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Görev yok';
    list.appendChild(li);
  }

  filtered.forEach(todo => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.completed ? ' completed' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.completed;
    checkbox.addEventListener('change', () => toggle(todo));

    const span = document.createElement('span');
    span.textContent = todo.text;

    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.innerHTML = '&times;';
    del.addEventListener('click', () => remove(todo.id));

    li.append(checkbox, span, del);
    list.appendChild(li);
  });

  const remaining = todos.filter(t => !t.completed).length;
  itemCount.textContent = `${remaining} görev`;
}

async function load() {
  try {
    todos = await apiSelect();
    render();
  } catch (err) {
    alert(err.message);
  }
}

async function addTodo(text) {
  try {
    const created = await apiInsert(text);
    todos.push(created);
    render();
  } catch (err) {
    alert(err.message);
  }
}

async function toggle(todo) {
  try {
    const updated = await apiUpdate(todo.id, { completed: !todo.completed });
    const i = todos.findIndex(t => t.id === todo.id);
    if (i !== -1) todos[i] = updated;
    render();
  } catch (err) {
    alert(err.message);
  }
}

async function remove(id) {
  try {
    await apiDelete(`id=eq.${id}`);
    todos = todos.filter(t => t.id !== id);
    render();
  } catch (err) {
    alert(err.message);
  }
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addTodo(text);
  input.value = '';
  input.focus();
});

clearBtn.addEventListener('click', async () => {
  const completedIds = todos.filter(t => t.completed).map(t => t.id);
  if (completedIds.length === 0) return;
  try {
    await apiDelete(`id=in.(${completedIds.join(',')})`);
    todos = todos.filter(t => !t.completed);
    render();
  } catch (err) {
    alert(err.message);
  }
});

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filter = btn.dataset.filter;
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

// --- Başlangıç: oturum varsa uygulamayı göster ---
if (session && session.access_token) {
  showApp();
} else {
  showAuth();
}
