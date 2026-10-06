// Panel del historial (port de HistoryView.swift + manejo de teclado de PanelController.swift)
const api = window.clippy;
const $q = document.getElementById('q');
const $list = document.getElementById('list');
const $empty = document.getElementById('empty');
const $emptyText = document.getElementById('emptyText');
const $count = document.getElementById('count');

let items = [];
let filtered = [];
let selected = 0;

const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function fuzzyMatch(query, text) {
  const q = query.toLowerCase(), t = text.toLowerCase();
  let idx = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, idx);
    if (found < 0) return false;
    idx = found + ch.length;
  }
  return true;
}

function applyFilter() {
  const query = $q.value;
  if (!query) filtered = items;
  else {
    const fq = fold(query);
    filtered = items.filter(it => fold(it.search).includes(fq) || fuzzyMatch(query, it.preview));
  }
  if (selected >= filtered.length) selected = Math.max(0, filtered.length - 1);
  render();
}

const PIN_SVG = '<svg class="pin" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>';

function render() {
  $list.textContent = '';
  const isEmpty = filtered.length === 0;
  $empty.style.display = isEmpty ? 'flex' : 'none';
  $list.style.display = isEmpty ? 'none' : 'block';
  $emptyText.innerText = $q.value ? `Sin resultados para “${$q.value}”` : 'Tu historial está vacío.\nCopia algo para empezar.';
  const frag = document.createDocumentFragment();
  filtered.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (i === selected ? ' sel' : '');
    row.setAttribute('role', 'option');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i < 9 ? `Ctrl ${i + 1}` : '';
    row.appendChild(num);
    if (it.kind === 'image') {
      const wrap = document.createElement('div');
      wrap.className = 'imgwrap';
      const img = document.createElement('img');
      img.src = it.thumb;
      img.alt = 'Imagen';
      const dim = document.createElement('span');
      dim.className = 'dim';
      dim.textContent = it.size || 'Imagen';
      wrap.append(img, dim);
      row.appendChild(wrap);
    } else {
      const t = document.createElement('div');
      t.className = 'text';
      t.textContent = it.preview;
      row.appendChild(t);
    }
    if (it.pinned) row.insertAdjacentHTML('beforeend', PIN_SVG);
    row.addEventListener('mousemove', () => { if (selected !== i) { selected = i; updateSelection(); } });
    row.addEventListener('click', () => { selected = i; commit('paste'); });
    frag.appendChild(row);
  });
  $list.appendChild(frag);
  $count.textContent = String(filtered.length);
  scrollToSelected();
}

function updateSelection() {
  [...$list.children].forEach((el, i) => el.classList.toggle('sel', i === selected));
}

function scrollToSelected() {
  const el = $list.children[selected];
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function move(delta) {
  if (!filtered.length) return;
  selected = Math.min(Math.max(selected + delta, 0), filtered.length - 1);
  updateSelection();
  scrollToSelected();
}

function commit(action, index = selected) {
  const it = filtered[index];
  if (!it) return;
  api.send('history:commit', action, it.id);
}

document.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowDown') { move(1); e.preventDefault(); return; }
  if (k === 'ArrowUp') { move(-1); e.preventDefault(); return; }
  if (k === 'Tab') { move(e.shiftKey ? -1 : 1); e.preventDefault(); return; }
  if (k === 'Escape') { api.send('history:hide'); e.preventDefault(); return; }
  if (k === 'Enter') {
    e.preventDefault();
    if (e.altKey && e.shiftKey) commit('pastePlain');
    else if (e.altKey) commit('copyOnly');
    else commit('paste');
    return;
  }
  if (e.altKey && !e.ctrlKey && (e.code === 'KeyP')) {
    e.preventDefault();
    const it = filtered[selected]; if (it) api.send('history:pin', it.id);
    return;
  }
  if (e.altKey && !e.ctrlKey && k === 'Backspace') {
    e.preventDefault();
    const it = filtered[selected]; if (it) api.send('history:delete', it.id);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && /^Digit[1-9]$/.test(e.code)) {
    e.preventDefault();
    const idx = Number(e.code.slice(5)) - 1;
    if (filtered[idx]) commit('paste', idx);
  }
});

// Alt solo activaría el menú del sistema en Windows: evitarlo
document.addEventListener('keyup', e => { if (e.key === 'Alt') e.preventDefault(); });

$q.addEventListener('input', () => { selected = 0; applyFilter(); });

api.on('history:show', list => {
  items = list;
  $q.value = '';
  selected = 0;
  applyFilter();
  $list.scrollTop = 0;
  setTimeout(() => $q.focus(), 0);
});

api.on('history:update', list => {
  // Conservar la selección por id cuando cambia la lista (pin, borrar, nuevo item)
  const current = filtered[selected] && filtered[selected].id;
  items = list;
  applyFilter();
  if (current !== undefined) {
    const idx = filtered.findIndex(x => x.id === current);
    if (idx >= 0) { selected = idx; updateSelection(); }
  }
});

window.addEventListener('focus', () => $q.focus());
api.invoke('history:list').then(list => { items = list; applyFilter(); });
