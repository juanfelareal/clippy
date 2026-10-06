// Helper persistente de PowerShell (solo Windows), mismo patrón que Hablapp.
// Empuja cambios de estado sin sondear desde Node:
//   S|<clipboardSeq>|<hwndPrimerPlano>|<pid>|<hkl>|<clase>
// y acepta comandos por stdin:
//   focus <hwnd>  → devuelve F|1 o F|0  (devuelve el foco a la app donde estabas)
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class ClippyWin {
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint thread);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static string State() {
    IntPtr fg = GetForegroundWindow();
    uint pid; uint tid = GetWindowThreadProcessId(fg, out pid);
    long hkl = GetKeyboardLayout(tid).ToInt64() & 0xFFFFFFFF;
    var sb = new StringBuilder(128); GetClassName(fg, sb, 128);
    return "S|" + GetClipboardSequenceNumber() + "|" + fg.ToInt64() + "|" + pid + "|" + hkl + "|" + sb.ToString();
  }
  public static bool Focus(long h) {
    IntPtr w = new IntPtr(h);
    if (GetForegroundWindow() == w) return true;
    if (IsIconic(w)) ShowWindow(w, 9);
    if (SetForegroundWindow(w)) return true;
    // Truco: una tecla sin asignar (0x88) libera el bloqueo de primer plano y reintenta
    keybd_event(0x88, 0, 0, UIntPtr.Zero); keybd_event(0x88, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(w);
    return GetForegroundWindow() == w;
  }
}
"@
$parent = [int]$args[0]
$last = ''
# [Console]::In.ReadLineAsync() es síncrono (SyncTextReader): usar un StreamReader propio
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $reader.ReadLineAsync()
$i = 0
[Console]::Out.WriteLine('READY')
while ($true) {
  $s = [ClippyWin]::State()
  if ($s -ne $last) { [Console]::Out.WriteLine($s); $last = $s }
  if ($pending.IsCompleted) {
    $line = $pending.Result
    if ($line -eq $null) { break }
    if ($line.StartsWith('focus ')) {
      $ok = [ClippyWin]::Focus([long]$line.Substring(6))
      if ($ok) { [Console]::Out.WriteLine('F|1') } else { [Console]::Out.WriteLine('F|0') }
    }
    $pending = $reader.ReadLineAsync()
  }
  $i++
  if ($i % 40 -eq 0) { try { [void][System.Diagnostics.Process]::GetProcessById($parent) } catch { break } }
  Start-Sleep -Milliseconds 120
}
`;

class WinHelper extends EventEmitter {
  constructor(log = () => {}) {
    super();
    this.log = log;
    this.proc = null;
    this.ready = false;
    this.state = null; // { seq, hwnd, pid, hkl, cls }
    this.focusWaiters = [];
    this.restarts = 0;
  }

  get available() { return this.ready && !!this.proc; }

  start() {
    if (process.platform !== 'win32' || this.proc) return;
    const file = path.join(os.tmpdir(), `clippy-helper-${process.pid}.ps1`);
    // BOM UTF-8 para que PowerShell 5.1 lea bien el archivo
    fs.writeFileSync(file, '\ufeff' + PS_SCRIPT, 'utf8');
    this.file = file;
    const p = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = p;
    p.on('error', e => this.log('winhelper error', e.message));
    let buf = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', chunk => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        this._line(line);
      }
    });
    p.stderr.on('data', d => this.log('winhelper stderr', String(d).slice(0, 300)));
    p.on('exit', code => {
      this.log('winhelper exit', code);
      this.proc = null; this.ready = false;
      this.focusWaiters.splice(0).forEach(r => r(false));
      if (!this.stopping && this.restarts++ < 5) setTimeout(() => this.start(), 2000);
    });
  }

  _line(line) {
    if (line === 'READY') { this.ready = true; this.log('winhelper ready'); this.emit('ready'); return; }
    if (line.startsWith('S|')) {
      const [, seq, hwnd, pid, hkl, cls] = line.split('|');
      const prev = this.state;
      this.state = { seq: Number(seq), hwnd, pid: Number(pid), hkl: Number(hkl), cls: cls || '' };
      if (!prev || prev.seq !== this.state.seq) this.emit('clipboard', this.state.seq);
      if (!prev || prev.hwnd !== this.state.hwnd) this.emit('foreground', this.state);
      if (!prev || prev.hkl !== this.state.hkl) this.emit('layout', this.state.hkl);
      return;
    }
    if (line.startsWith('F|')) { const r = this.focusWaiters.shift(); if (r) r(line === 'F|1'); }
  }

  // Devuelve el foco a una ventana (hwnd como string). Resuelve true/false.
  focus(hwnd, timeout = 600) {
    if (!this.available || !hwnd) return Promise.resolve(false);
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      this.focusWaiters.push(finish);
      setTimeout(() => { const i = this.focusWaiters.indexOf(finish); if (i >= 0) this.focusWaiters.splice(i, 1); finish(false); }, timeout);
      try { this.proc.stdin.write(`focus ${hwnd}\n`); } catch { finish(false); }
    });
  }

  stop() {
    this.stopping = true;
    if (this.proc) { try { this.proc.stdin.end(); } catch {} try { this.proc.kill(); } catch {} }
    this.proc = null;
    if (this.file) { try { fs.unlinkSync(this.file); } catch {} }
  }
}

module.exports = { WinHelper };
