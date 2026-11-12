# Snip backend

A zero-dependency Bun URL shortener. Links are stored in memory and are cleared
when the server restarts.

```sh
bun start
```

The server listens on `PORT` (default `3000`). Set `BASE_URL` to the public
origin used in generated short links; otherwise it uses
`https://$RAILWAY_PUBLIC_DOMAIN` when set, or `http://localhost:$PORT`.
Optionally set `PUBLIC_DIR` to serve static files from a directory, with
`/` serving its `index.html`.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link.
- `GET /api/links` lists all links.
- `GET /:code` redirects to the original URL and increments its hit count.
