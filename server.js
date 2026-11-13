const { relative, resolve, sep, isAbsolute } = require("node:path");
const { realpathSync, statSync } = require("node:fs");

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const configuredBaseUrl =
  process.env.BASE_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`);
const parsedBaseUrl = new URL(configuredBaseUrl);
if (
  !["http:", "https:"].includes(parsedBaseUrl.protocol) ||
  parsedBaseUrl.username ||
  parsedBaseUrl.password ||
  parsedBaseUrl.pathname !== "/" ||
  parsedBaseUrl.search ||
  parsedBaseUrl.hash
) {
  throw new Error("BASE_URL must be an HTTP(S) origin.");
}
const baseUrl = parsedBaseUrl.origin;

const publicRoot = process.env.PUBLIC_DIR
  ? realpathSync(resolve(process.env.PUBLIC_DIR))
  : null;
const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function newCode() {
  let code = "";
  const bytes = new Uint8Array(16);
  while (code.length < 6) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < 248) code += alphabet[byte % alphabet.length];
      if (code.length === 6) break;
    }
  }
  return code;
}

function createLink(originalUrl) {
  let code;
  do {
    code = newCode();
  } while (links.has(code));

  const link = {
    code,
    url: originalUrl,
    shortUrl: `${baseUrl}/${code}`,
    hits: 0,
    createdAt: new Date().toISOString(),
  };
  links.set(code, link);
  return link;
}

function resolveStaticFile(pathname) {
  if (!publicRoot) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath =
    decodedPath === "/" ? "index.html" : decodedPath.replace(/^[/\\]+/, "");
  const candidatePath = resolve(publicRoot, relativePath);
  const candidateRelativePath = relative(publicRoot, candidatePath);
  if (
    candidateRelativePath === ".." ||
    candidateRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(candidateRelativePath)
  ) {
    return null;
  }

  try {
    if (!statSync(candidatePath).isFile()) return null;
    const realPath = realpathSync(candidatePath);
    const realRelativePath = relative(publicRoot, realPath);
    if (
      realRelativePath === ".." ||
      realRelativePath.startsWith(`..${sep}`) ||
      isAbsolute(realRelativePath)
    ) {
      return null;
    }
    return Bun.file(realPath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

Bun.serve({
  port,
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "POST" && pathname === "/api/links") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Request body must be valid JSON." }, 400);
      }

      if (!body || typeof body.url !== "string") {
        return jsonResponse({ error: "A valid HTTP(S) url is required." }, 400);
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(body.url);
      } catch {
        return jsonResponse({ error: "A valid HTTP(S) url is required." }, 400);
      }
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return jsonResponse({ error: "A valid HTTP(S) url is required." }, 400);
      }

      return jsonResponse(createLink(parsedUrl.href), 201);
    }

    if (request.method === "GET" && pathname === "/api/links") {
      return jsonResponse(Array.from(links.values()));
    }

    if (request.method === "GET") {
      const staticFile = resolveStaticFile(pathname);
      if (staticFile) {
        return new Response(staticFile, {
          headers: {
            ...corsHeaders,
            "Content-Type": staticFile.type || "application/octet-stream",
          },
        });
      }

      const code = pathname.startsWith("/") ? pathname.slice(1) : "";
      if (code && !code.includes("/")) {
        const link = links.get(code);
        if (link) {
          link.hits += 1;
          return new Response(null, {
            status: 302,
            headers: { ...corsHeaders, Location: link.url },
          });
        }
      }
    }

    return jsonResponse({ error: "Not found." }, 404);
  },
});
