// Calculadora natural (port de CalculatorView.swift + CalculatorPanelController.swift)
const api = window.clippy;
const $in = document.getElementById('in');
const $out = document.getElementById('out');
const $hint = document.getElementById('hint');
let result = null;

function update() {
  result = window.CalculatorEngine.evaluate($in.value);
  const ok = result !== null;
  $out.textContent = ok ? window.CalculatorEngine.format(result) : '—';
  $out.classList.toggle('none', !ok);
  $hint.style.visibility = ok ? 'visible' : 'hidden';
}

$in.addEventListener('input', update);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); api.send('calc:hide'); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (result !== null) api.send('calc:copy', window.CalculatorEngine.format(result));
  }
});
api.on('calc:show', () => { $in.value = ''; update(); setTimeout(() => $in.focus(), 0); });
window.addEventListener('focus', () => $in.focus());
update();
