# Modern Motion Body Lab

Black-and-white, responsive gym website. Plain HTML and CSS with no package dependencies or build step.

## Run locally on macOS / zsh (recommended on this computer)

From the project folder:

```sh
./local-start.sh
./local-stop.sh
```

Start creates or reuses `.venv`, installs `requirements.txt`, creates `.env` if needed, and opens http://localhost:4200. Python 3.9+ is required. Use `./local-start.sh --no-browser` to skip opening the browser. The server keeps running in the background until stopped. Both shell scripts work from other folders too when invoked by their full paths.

The `./` prefix tells zsh to run a file from the current folder. `.ps1` files require PowerShell and cannot be run directly by zsh; use these `.sh` scripts instead.

## Run locally with PowerShell

Prerequisites: Python 3.9+ with `venv`/`pip`, and PowerShell (Windows PowerShell 5.1 or PowerShell 7+). Node.js is not needed for this method.

From PowerShell in the project folder:

```powershell
.\local-start.ps1
# Later, to stop the background server:
.\local-stop.ps1
```

On macOS/Linux with PowerShell installed:

```sh
pwsh -File ./local-start.ps1
pwsh -File ./local-stop.ps1
```

The start script creates or reuses `.venv`, installs `requirements.txt`, creates `.env` from `.env.example` if missing, starts the server in the background, and opens your browser. Use `./local-start.ps1 -NoBrowser` to skip opening the browser. Running start again reports the existing server instead of starting another copy. Your terminal can be closed while the server runs.

The current Python server uses only standard-library modules, so `requirements.txt` intentionally has no third-party packages. No dependency downloads are currently needed. Python itself and PowerShell must already be installed.

The default address is http://localhost:4200. Configure `PORT` (default `4200`) and `HOST` (default `localhost`) in `.env`. Restart after changes. This server is restricted to your computer. Logs and private lifecycle state are in `.local/`; the stop script uses that state even if you have changed `.env`. `.venv`, `.local`, and `.env` are excluded from Git and are outside the served `dist/` folder. Do not delete `.local` or `.venv` while the server is running.

If the port is busy, stop the existing preview or choose another `PORT`; the script will not kill an unrelated process. If Windows blocks scripts, use a process-only execution policy for the current PowerShell window after reviewing these scripts:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Alternative: run locally with Node.js

Install Node.js 22 or newer (npm is included), then open a terminal in this folder:

```sh
npm run dev
```

Visit http://localhost:4200. Press Ctrl+C to stop. `npm start` does the same thing. No `npm install` or API keys are needed.

A `.env` file is already provided locally. On a fresh clone, run `cp .env.example .env` if you want to customize `HOST` and `PORT`; defaults also work without a file. `.env` is ignored by Git and is never served to the browser. The preview serves only `dist/` and blocks dotfiles. Keep local preview on `localhost` unless you intentionally want network access.

If Node is not on PATH in this Mac's Codex workspace, use the installed runtime:

```sh
/Users/robins/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/serve.mjs
```

## Edit and check

- `dist/index.html`: content, navigation, and social placeholders.
- `dist/style.css`: black-and-white theme and responsive layout.
- `dist/assets/`: website imagery.
- `scripts/serve.mjs`: local preview server.

Save your changes and refresh the browser. Run `npm run check` to check the preview server's JavaScript syntax. Check the page at desktop and phone widths, follow navigation links, and expand the audience sections.

## Social profiles

Instagram, YouTube, Facebook, TikTok, and Snapchat currently display “Coming soon.” No profile URLs were supplied, so these are intentionally non-clickable placeholders.

When a real profile is ready, replace its `<span aria-disabled="true">…</span>` inside `.social-links` with an anchor, for example:

```html
<a href="YOUR_ACTUAL_PROFILE_URL" target="_blank" rel="noopener noreferrer">Instagram <small>Follow us ↗</small></a>
```

Social URLs are public content in the HTML; they do not need secrets or `.env` settings. `.env` configures only the local server. The hosted website uses the static `dist/` files, not the local preview server.

Social brand SVGs: [SVGL](https://github.com/pheralb/svgl), MIT license (copy in `dist/assets/social/LICENSE.txt`). Original color variants are stored locally in `dist/assets/social/`; brand marks remain trademarks of their respective owners.
