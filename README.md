# Snip Frontend

Angular 19 client for the Snip URL shortener. It uses the API at `http://localhost:3000`.

Start the backend first, then run:

```bash
npm install
npx ng serve
```

Open `http://localhost:4200`. Create and list links with the form; short-link clicks redirect through the backend.

Build the production app with `npx ng build`. The load-bearing output is `dist/snip-frontend/browser`.
Run the component tests with `npm test -- --watch=false`.
