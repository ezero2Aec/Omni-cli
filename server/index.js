import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = process.cwd();
const TOKEN = process.env.TOKEN || '';

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  if (TOKEN) {
    const t = req.headers['x-ide-token'];
    if (t !== TOKEN) return res.status(401).json({ error: 'unauthorized' });
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/node_modules', express.static(path.join(__dirname, '../node_modules')));

// ── File helpers ──
const resolve = (p) => { const r = path.resolve(ROOT, p); if (!r.startsWith(ROOT)) return null; return r; };

const routes = (app) => {
  app.get('/api/tree', (req, res) => {
    const root = resolve(req.query.root || '.');
    if (!root) return res.status(400).json({ error: 'bad path' });
    const walk = (dir) => {
      let entries;
      try { entries = fs.readdirSync(dir); } catch { return []; }
      return entries.filter(e => !e.startsWith('.')).map(name => {
        const fp = path.join(dir, name);
        const st = fs.statSync(fp);
        return { name, path: path.relative(ROOT, fp), type: st.isDirectory() ? 'dir' : 'file' };
      }).sort((a,b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
    };
    res.json(walk(root));
  });

  app.get('/api/read', (req, res) => {
    const fp = resolve(req.query.path || '.');
    if (!fp) return res.status(400).json({ error: 'bad path' });
    const st = fs.statSync(fp);
    if (st.isDirectory()) return res.status(400).json({ error: 'is directory' });
    const max = 5 * 1024 * 1024;
    if (st.size > max) return res.status(413).json({ error: 'file too large' });
    res.json({ path: path.relative(ROOT, fp), content: fs.readFileSync(fp, 'utf8') });
  });

  app.post('/api/write', (req, res) => {
    const { path: p, content } = req.body;
    const fp = resolve(p);
    if (!fp) return res.status(400).json({ error: 'bad path' });
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, content);
    res.json({ ok: true });
  });

  app.delete('/api/delete', (req, res) => {
    const fp = resolve(req.query.path);
    if (!fp) return res.status(400).json({ error: 'bad path' });
    fs.rmSync(fp, { recursive: true });
    res.json({ ok: true });
  });

  app.post('/api/mkdir', (req, res) => {
    const fp = resolve(req.body.path);
    if (!fp) return res.status(400).json({ error: 'bad path' });
    fs.mkdirSync(fp, { recursive: true });
    res.json({ ok: true });
  });

  app.get('/api/git-status', (req, res) => {
    const c = spawn('git', ['status','--short','--branch'], { cwd: ROOT });
    let out = '';
    c.stdout.on('data', d => out += d);
    c.on('close', () => res.json({ output: out }));
  });

  app.get('/api/git-log', (req, res) => {
    const c = spawn('git', ['log','--oneline','-20'], { cwd: ROOT });
    let out = '';
    c.stdout.on('data', d => out += d);
    c.on('close', () => res.json({ output: out }));
  });

  app.get('/api/git-diff', (req, res) => {
    const file = resolve(req.query.file);
    if (!file) return res.status(400).json({ error: 'bad path' });
    const rel = path.relative(ROOT, file);
    const c = spawn('git', ['diff', rel], { cwd: ROOT });
    let out = '';
    c.stdout.on('data', d => out += d);
    c.on('close', () => res.json({ output: out }));
  });

  app.post('/api/git-commit', (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'missing message' });
    const c = spawn('git', ['add','-A'], { cwd: ROOT });
    c.on('close', () => {
      const c2 = spawn('git', ['commit', '-m', message], { cwd: ROOT, shell: true });
      let out = '';
      c2.stdout.on('data', d => out += d); c2.stderr.on('data', d => out += d);
      c2.on('close', () => res.json({ output: out }));
    });
  });
};

routes(app);

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`Omni IDE: http://${HOST}:${PORT}`);
});

// ── WebSocket terminal ──
const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', ws => {
  const shell = process.env.SHELL || 'zsh';
  const pty = spawn(shell, ['-i'], { cwd: ROOT, stdio: ['pipe','pipe','pipe'] });
  pty.stdout.on('data', d => ws.send(JSON.stringify({ type:'out', data: d.toString() })));
  pty.stderr.on('data', d => ws.send(JSON.stringify({ type:'out', data: d.toString() })));
  pty.on('close', code => { ws.send(JSON.stringify({ type:'exit', code })); ws.close(); });
  ws.on('message', m => {
    try { const j = JSON.parse(m); if (j.type === 'resize') pty.stdout.columns = j.cols; } catch {}
    pty.stdin.write(m);
  });
  ws.on('close', () => pty.kill());
});
