// Ventana de snippets (port de SnippetsView.swift)
const api = window.clippy;
const $list = document.getElementById('list');
const $n = document.getElementById('n');
const $title = document.getElementById('title');
const $trigger = document.getElementById('trigger');
const $expansion = document.getElementById('expansion');
const $error = document.getElementById('error');
const $save = document.getElementById('save');
const $cancel = document.getElementById('cancel');
const $del = document.getElementById('del');

let snippets = [];
let selectedId = null;

function render() {
  $list.textContent = '';
  if (!snippets.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = 'Aún no tienes snippets. Crea uno, por ejemplo //nit con tu NIT completo, y escríbelo en cualquier app.';
    $list.appendChild(d);
  }
  for (const s of snippets) {
    const el = document.createElement('div');
    el.className = 'item' + (s.id === selectedId ? ' sel' : '');
    const t = document.createElement('div'); t.className = 't'; t.textContent = '//' + s.trigger;
    const e = document.createElement('div'); e.className = 'e'; e.textContent = s.expansion.replace(/\n/g, ' ⏎ ');
    el.append(t, e);
    el.onclick = () => select(s.id);
    $list.appendChild(el);
  }
  $n.textContent = `${snippets.length} snippet${snippets.length === 1 ? '' : 's'}`;
  const editing = selectedId !== null;
  $title.textContent = editing ? 'Editar snippet' : 'Nuevo snippet';
  $save.textContent = editing ? 'Guardar cambios' : 'Agregar';
  $cancel.style.display = editing ? '' : 'none';
  $del.disabled = !editing;
  validate();
}

function validate() { $save.disabled = !$trigger.value.trim() || !$expansion.value; }

function showError(msg) { $error.textContent = msg ? '⚠ ' + msg : ''; $error.style.display = msg ? 'block' : 'none'; }

function select(id) {
  selectedId = id;
  const s = snippets.find(x => x.id === id);
  if (s) { $trigger.value = s.trigger; $expansion.value = s.expansion; }
  showError(null);
  render();
}

function clearForm() {
  selectedId = null; $trigger.value = ''; $expansion.value = ''; showError(null); render();
  $trigger.focus();
}

async function reload() { snippets = await api.invoke('snippets:list'); render(); }

async function save() {
  if ($save.disabled) return;
  const res = await api.invoke('snippets:save', { id: selectedId, trigger: $trigger.value, expansion: $expansion.value });
  if (res && res.error) { showError(res.error); return; }
  await reload();
  clearForm();
}

$trigger.addEventListener('input', () => { showError(null); validate(); });
$expansion.addEventListener('input', validate);
$save.onclick = save;
$cancel.onclick = clearForm;
document.getElementById('add').onclick = clearForm;
$del.onclick = async () => {
  if (!selectedId) return;
  await api.invoke('snippets:delete', selectedId);
  await reload();
  clearForm();
};
// Ctrl+Enter guarda (Enter normal en el textarea es salto de línea: multilínea)
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || document.activeElement === $trigger)) { e.preventDefault(); save(); }
});

api.invoke('app:info').then(info => { if (!info.hookActive) document.getElementById('warn').style.display = 'block'; });
reload().then(() => $trigger.focus());
