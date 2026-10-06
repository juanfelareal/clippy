const $p = document.getElementById('pill');
let t = null;
window.clippy.on('hud:show', msg => {
  $p.textContent = msg;
  $p.classList.remove('out');
  requestAnimationFrame(() => $p.classList.add('on'));
  clearTimeout(t);
  t = setTimeout(() => { $p.classList.add('out'); $p.classList.remove('on'); }, 1400);
});
