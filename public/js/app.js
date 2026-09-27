
const API = (p, o) => fetch(p, o).then(r => r.json());
const qs = s => document.querySelector(s);
const state = { open: {}, cm: null, ws: null, term: null, current: null };

function toast(msg) {
  const t = qs('#toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._t); t._t = setTimeout(() => t.style.display = 'none', 2000);
}

function switchPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  qs('#panel-' + name).style.display = 'block';
  qs('#drawer').classList.remove('open');
  document.querySelectorAll('#tabs button, #drawer li').forEach(b =>
    b.classList.toggle('active', b.dataset.panel === name));
  if (name === 'editor' && state.cm) state.cm.refresh();
}

// ── File tree ──
async function loadTree() {
  const tree = qs('#tree'); tree.innerHTML = '';
  try { renderNodes(await API('/api/tree'), tree, ''); }
  catch (e) { toast('Error loading files'); }
}

function renderNodes(items, container, base) {
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'tree-item';
    const icon = item.type === 'dir' ? '📁' : '📄';
    el.innerHTML = '<span class="icon">' + icon + '</span>' +
      '<span>' + item.name + '</span>';
    el.onclick = async (e) => {
      e.stopPropagation();
      if (item.type === 'dir') {
        const kids = el.querySelector('.children');
        if (kids) { kids.remove(); return; }
        const sub = document.createElement('div'); sub.className = 'children';
        el.appendChild(sub);
        const data = await API('/api/tree?root=' + encodeURIComponent(item.path));
        renderNodes(data, sub, item.path);
      } else {
        openFile(item.path, el);
      }
    };
    el.ondblclick = async () => {
      if (item.type === 'file') {
        const name = prompt('Rename file:', item.name);
        if (name && name !== item.name) { /* rename via terminal */ }
      }
    };
    container.appendChild(el);
  });
}

// ── Editor ──
const MODES = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'javascript',
  py: 'python', sh: 'shell', bash: 'shell', zsh: 'shell',
  json: 'json', html: 'htmlmixed', htm: 'htmlmixed', css: 'css',
  md: 'markdown', yml: 'yaml', yaml: 'yaml', go: 'go', rs: 'rust',
  c: 'clike', h: 'clike', cpp: 'clike', java: 'clike', cs: 'clike'
};

async function openFile(filePath, node) {
  switchPanel('editor');
  try {
    const data = await API('/api/read?path=' + encodeURIComponent(filePath));
    if (!state.cm) initEditor(data);
    else state.cm.setValue(data.content);
    const mode = MODES[filePath.split('.').pop()] || null;
    state.cm.setOption('mode', mode);
    state.current = filePath;
    document.querySelectorAll('.tree-item').forEach(n => n.classList.remove('active'));
    if (node) node.classList.add('active');
    qs('#title').textContent = filePath.split('/').pop();
  } catch (e) { toast('Cannot open file'); }
}

function initEditor(data) {
  state.cm = CodeMirror(document.querySelector('#panel-editor'), {
    value: data.content, mode: 'javascript', theme: 'default',
    lineNumbers: true, lineWrapping: true, indentUnit: 2,
    matchBrackets: true, autoCloseBrackets: true,
    foldGutter: true, gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    keyMap: 'sublime', extraKeys: { 'Ctrl-S': saveFile, 'Cmd-S': saveFile }
  });
}

async function saveFile() {
  if (!state.cm || !state.current) return;
  await API('/api/write', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: state.current, content: state.cm.getValue() })
  });
  toast('Saved');
}

// ── Terminal ──
function initTerminal() {
  const el = qs('#term'); if (el) el.innerHTML = '';
  state.term = new Terminal({
    fontSize: 12, fontFamily: 'monospace', cursorBlink: true,
    scrollback: 5000, convertEol: true, theme: { background: '#0d1117', foreground: '#c9d1d9' }
  });
  state.term.open(el);
  state.ws = new WebSocket('ws://' + location.host + '/ws');
  state.ws.onmessage = e => {
    try { const m = JSON.parse(e.data);
      if (m.type === 'out') state.term.write(m.data);
      else if (m.type === 'exit') { state.term.write('\r\n[process exited: ' + m.code + ']\r\n'); }
    } catch { state.term.write(e.data); }
  };
  state.term.onData(d => { if (state.ws.readyState === 1) state.ws.send(d); });
  state.ws.onopen = () => state.term.focus();
  state.term.onResize(({cols, rows}) =>
    state.ws.send(JSON.stringify({ type:'resize', cols, rows })));
}

// ── Git ──
async function loadGit() {
  switchPanel('git');
  const s = await API('/api/git-status');
  qs('#git-status').textContent = s.output || 'clean';
  const l = await API('/api/git-log');
  qs('#git-log').textContent = l.output || 'no commits';
  const files = s.output.split('\n').filter(l => l.trim()).map(l => l.slice(3).trim());
  let diff = '';
  for (const f of files.slice(0, 5)) {
    const d = await API('/api/git-diff?file=' + encodeURIComponent(f));
    diff += d.output + '\n';
  }
  qs('#git-diff').textContent = diff;
}

async function commit() {
  const msg = prompt('Commit message:');
  if (!msg) return;
  const r = await API('/api/git-commit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg })
  });
  toast(r.output.includes('error') || r.output ? 'Committed' : 'Done');
  loadGit();
}

// ── Events ──
qs('#btn-menu').onclick = () => qs('#drawer').classList.toggle('open');
document.querySelectorAll('#tabs button, #drawer li').forEach(b =>
  b.onclick = () => {
    const p = b.dataset.panel;
    if (p === 'terminal' && !state.term) initTerminal();
    if (p === 'git') loadGit();
    if (p === 'files') loadTree();
    switchPanel(p);
  });
qs('#btn-settings').onclick = () => toast('Settings: Ctrl-, (coming soon)');
qs('#search-input').oninput = async e => {
  if (state.cm && e.target.value.length > 2) {
    state.cm.execCommand('find', e.target.value);
  }
};
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveFile(); }
});
switchPanel('files');
loadTree();
