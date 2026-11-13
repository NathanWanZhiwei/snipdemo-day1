# Snip CLI

Zero-dependency Node.js command-line client for the Snip URL shortener. Requires Node.js 20 or newer. The backend defaults to `http://localhost:3000`; set `SNIP_API` to use another backend.

```text
node cli.js add https://example.com
node cli.js ls
node cli.js open abc123
node cli.js help
```

The `snip` executable is available after installing this package globally or running `npm link`. The `snip`, `snip.cmd`, and `snip.ps1` wrappers run the CLI directly from this folder. Run tests with `npm test`.
