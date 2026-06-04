// --- Supabase yapılandırması ---
const SUPABASE_URL = 'https://ijcgvreinogjkdgvjnhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqY2d2cmVpbm9namtkZ3ZqbmhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTA3OTIsImV4cCI6MjA5NjE2Njc5Mn0.TObXIDgxEuSvkEdLkjMXwJ7YPcETKeWUEwOVh-9T4sc';
const REST_URL = `${SUPABASE_URL}/rest/v1/todos`;

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// REST API yardımcı fonksiyonları
async function apiSelect() {
  const res = await fetch(`${REST_URL}?select=*&order=created_at.asc`, { headers });
  if (!res.ok) throw new Error('Görevler yüklenemedi');
  return res.json();
}

async function apiInsert(text) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('Görev eklenemedi');
  return (await res.json())[0];
}

async function apiUpdate(id, fields) {
  const res = await fetch(`${REST_URL}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error('Görev güncellenemedi');
  return (await res.json())[0];
}

async function apiDelete(filter) {
  const res = await fetch(`${REST_URL}?${filter}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error('Görev silinemedi');
}

// --- DOM elemanları ---
const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const itemCount = document.getElementById('item-count');
const clearBtn = document.getElementById('clear-completed');
const filterBtns = document.querySelectorAll('.filter-btn');

let todos = [];
let filter = 'all';

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

load();
