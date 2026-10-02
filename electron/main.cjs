const { app, BrowserWindow } = require('electron');
const path = require('path');
const net = require('net');

const PORT = process.env.PORT || '3000';

function waitForPort(port, tries = 90) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { s.end(); resolve(true); });
      s.on('error', () => {
        if (++n >= tries) reject(new Error('backend did not start'));
        else setTimeout(tick, 1000);
      });
    };
    tick();
  });
}

async function startBackend() {
  const res = process.resourcesPath;
  const fs = require('fs');
  const inPkg = fs.existsSync(path.join(res, 'server.ts')) || fs.existsSync(path.join(res, 'app.asar'));
  const cwd = inPkg ? res : path.join(__dirname, '..');
  // bundled backend must run from real files (asarUnpack), never from inside app.asar
  const candidates = [
    path.join(cwd, 'app.asar.unpacked', 'dist-server', 'server.cjs'),
    path.join(cwd, 'dist-server', 'server.cjs'),
  ];
  const entry = candidates.find((p) => fs.existsSync(p));
  if (!entry) throw new Error('backend bundle missing: run npm run build:server');
  // client data lives in per-user dir (Program Files is read-only).
  // SUPABASE_ANON is public by design (license RPC only); service key never ships.
  const dataDir = process.env.WA_DATA_DIR || path.join(app.getPath('userData'), 'server-data');
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://svqbdcpehcrpjptgavwd.supabase.co';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2cWJkY3BlaGNycGpwdGdhdndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NTY5ODksImV4cCI6MjEwNjQzMjk4OX0.f4Wf60I4uzu3pGd5RCDYa6mPHGUmh7guAqH3XJzZayg';
  process.env.WA_DATA_DIR = dataDir;
  process.env.PORT = PORT;
  process.env.NODE_ENV = 'production';
  process.chdir(cwd);
  // in-process: no child_process.fork (fails inside packaged apps), backend boots here
  require(entry);
  await waitForPort(Number(PORT));
}

async function createWindow() {
  await startBackend();
  const win = new BrowserWindow({
    width: 1280, height: 800,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });
  win.loadURL(`http://127.0.0.1:${PORT}`);
  win.webContents.on('did-fail-load', () => setTimeout(() => win.loadURL(`http://127.0.0.1:${PORT}`), 2000));
}

app.whenReady().then(createWindow).catch((e) => { console.error(e); app.quit(); });
app.on('window-all-closed', () => app.quit());
