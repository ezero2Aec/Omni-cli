# Omni IDE

A mobile-first, browser-based code editor and terminal that runs on localhost:8080.

## Features

- File tree explorer with lazy directory loading
- CodeMirror 5 editor with syntax highlighting (JS, Python, Shell, JSON, HTML, CSS, Markdown, YAML, Go, Rust, C-family)
- Integrated terminal via WebSocket (xterm.js)
- Git panel: status, log, diff, commit
- Mobile-optimized: drawer nav, bottom tab bar, safe-area insets, touch-friendly targets
- Dark theme

## Quick start

```bash
npm install
npm start
```

Then open http://127.0.0.1:8080 in any browser.

## CLI

```bash
npx omni-ide          # start server
PORT=9000 npx omni-ide   # custom port
```

## Architecture

| File | Purpose |
|------|---------|
| `server/index.js` | Express server, file API, git API, WebSocket terminal |
| `public/index.html` | SPA shell |
| `public/css/app.css` | Mobile-first styling |
| `public/js/app.js` | Frontend logic |
| `bin/omni-ide.js` | CLI entry point |

## API

- `GET /api/tree?root=.` — list directory
- `GET /api/read?path=FILE` — read file
- `POST /api/write` — write file (`{path, content}`)
- `DELETE /api/delete?path=PATH` — delete file/dir
- `POST /api/mkdir` — create directory (`{path}`)
- `GET /api/git-status` — git status
- `GET /api/git-log` — recent commits
- `GET /api/git-diff?file=FILE` — diff for file
- `POST /api/git-commit` — commit (`{message}`)
- `WS /ws` — terminal shell session

## License

MIT
