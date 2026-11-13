# Snip

Snip is a tiny URL shortener built as one backend with two clients: an Angular web app and a Node.js CLI. Each component lives on its own orphan branch and is mounted into this superproject as a submodule.

## Layout

| Path | Branch | Contents |
| --- | --- | --- |
| `backend/` | `backend` | Bun API and optional static-file serving |
| `frontend/` | `frontend` | Angular 19 web client |
| `cli/` | `cli` | Zero-dependency CommonJS CLI |
| `bundle/` | `bundle` | Generated release output |

## API

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/api/links` with `{ "url": "https://..." }` | `201` with `{ code, url, shortUrl, hits, createdAt }`; `400` for invalid input |
| `GET` | `/api/links` | `200` with all links |
| `GET` | `/:code` | `302` to the original URL and increments hits; `404` for unknown codes |

Links are held in memory and are cleared when the backend restarts.

## Clone

Clone with `git clone --recurse-submodules https://github.com/NathanWanZhiwei/snipdemo-day1.git`. A plain clone leaves the component directories unpopulated.

## Run locally

In separate terminals from the superproject root:

1. `cd backend` then `bun start` (API at `http://localhost:3000`).
2. `cd frontend`, run `npm install`, then `npx ng serve` (UI at `http://localhost:4200`).
3. `cd cli`, then `node cli.js ls`.

The CLI also supports `node cli.js add <url>` and `node cli.js open <code>`. Set `SNIP_API` to use a backend other than `http://localhost:3000`.

## Update components

Commit and push changes from inside a component directory on its own branch. In the superproject, run `git submodule update --remote <path>`, stage that submodule path, and commit the pointer update. Submodule commits and pointer updates are separate changes.

The bundle branch is generated from the component branches; do not edit its files by hand. CI runs the bundle generator on an hourly schedule or manual dispatch, then rebuilds and scans the image when the bundle pointer is updated. Both release paths run the frontend tests and a production-dependency audit before building or publishing. The Docker job scans the built image for fixable high/critical vulnerabilities before pushing to `ghcr.io/nathanwanzhiwei/snipdemo-day1`.

## Generate a release bundle

From `main`, run `node scripts/build-bundle.mjs` to build the Angular app and regenerate the `bundle/` submodule locally. Run it again to verify an unchanged build is a safe no-op. Add `--push` to audit production dependencies, then publish the bundle branch and its pointer update to `main` only if the audit passes. GitHub Actions runs this hourly and explicitly dispatches the Docker workflow after a successful pointer update because pushes made with `GITHUB_TOKEN` do not start other push-triggered workflows. The current Angular 19 dependency set has known high-severity advisories and is not published by these guarded release jobs until a patched compatible release is available.
