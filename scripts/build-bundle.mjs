import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--push") || args.filter((arg) => arg === "--push").length > 1) {
  throw new Error("Usage: node scripts/build-bundle.mjs [--push]");
}
const shouldPush = args.includes("--push");
const frontend = join(root, "frontend");
const bundle = join(root, "bundle");
const buildOutput = join(frontend, "dist", "snip-frontend", "browser");
const publicOutput = join(bundle, "public");

function run(command, commandArgs, cwd = root) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit code ${result.status}`);
  }
}

function capture(command, commandArgs, cwd = root) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit code ${result.status}`);
  }
  return result.stdout.trim();
}

function hasStagedChanges(cwd) {
  const result = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd,
    stdio: "ignore",
  });
  if (result.error) throw result.error;
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error(`git diff --cached --quiet failed with exit code ${result.status}`);
}

function writeIfChanged(path, content) {
  if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
    writeFileSync(path, content, "utf8");
  }
}

const git = (commandArgs, cwd = root) => run("git", commandArgs, cwd);
git(["submodule", "update", "--init", "--remote", "backend", "frontend", "cli"]);
git(["submodule", "update", "--init", "bundle"]);

const npmCli = resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
if (process.platform === "win32" && !existsSync(npmCli)) {
  throw new Error(`Could not find npm's JavaScript CLI at ${npmCli}`);
}
const npm = process.platform === "win32" ? process.execPath : "npm";
const npmPrefix = process.platform === "win32" ? [npmCli] : [];
run(npm, [...npmPrefix, "ci", "--no-audit", "--no-fund"], frontend);
if (shouldPush) {
  run(npm, [...npmPrefix, "audit", "--omit=dev", "--audit-level=high"], frontend);
}
const angularConfigPath = join(frontend, "angular.json");
const angularConfigSource = readFileSync(angularConfigPath, "utf8");
const angularConfig = JSON.parse(angularConfigSource);
const production = angularConfig.projects["snip-frontend"].architect.build.configurations.production;
const optimization = production.optimization;
if (optimization === undefined || optimization === true) {
  production.optimization = { scripts: true, styles: true, fonts: { inline: false } };
} else if (optimization === false) {
  production.optimization = { scripts: false, styles: false, fonts: { inline: false } };
} else if (typeof optimization === "object" && optimization !== null) {
  production.optimization = {
    ...optimization,
    fonts: { ...optimization.fonts, inline: false },
  };
} else {
  throw new Error("Unsupported Angular production optimization configuration.");
}
try {
  writeFileSync(angularConfigPath, `${JSON.stringify(angularConfig, null, 2)}\n`, "utf8");
  run(npm, [...npmPrefix, "run", "build"], frontend);
} finally {
  writeFileSync(angularConfigPath, angularConfigSource, "utf8");
}
if (!existsSync(join(buildOutput, "index.html"))) {
  throw new Error(`Angular build output is missing ${join(buildOutput, "index.html")}`);
}

rmSync(publicOutput, { recursive: true, force: true });
mkdirSync(publicOutput, { recursive: true });
cpSync(buildOutput, publicOutput, { recursive: true });
cpSync(join(root, "backend", "server.js"), join(bundle, "server.js"));
cpSync(join(root, "cli", "cli.js"), join(bundle, "cli.js"));
writeIfChanged(join(bundle, ".env"), "PUBLIC_DIR=./public\n");
writeIfChanged(
  join(bundle, "package.json"),
  `${JSON.stringify({ name: "snip-bundle", private: true, scripts: { start: "bun server.js" } }, null, 2)}\n`,
);
writeIfChanged(
  join(bundle, "Dockerfile"),
  [
    "FROM oven/bun:1-alpine",
    "WORKDIR /app",
    "COPY . .",
    "ENV PORT=3000",
    "EXPOSE 3000",
    'CMD ["bun", "server.js"]',
    "",
  ].join("\n"),
);
writeIfChanged(
  join(bundle, ".dockerignore"),
  [".git", ".gitmodules", "node_modules", "npm-debug.log*", ""].join("\n"),
);
writeIfChanged(
  join(bundle, "railway.json"),
  `${JSON.stringify(
    {
      $schema: "https://railway.com/railway.schema.json",
      build: { builder: "DOCKERFILE" },
      deploy: { healthcheckPath: "/api/links", healthcheckTimeout: 300 },
    },
    null,
    2,
  )}\n`,
);

git(["add", "-A"], bundle);
if (hasStagedChanges(bundle)) {
  git(["commit", "-m", "Build generated Snip bundle"], bundle);
} else {
  console.log("Bundle contents unchanged.");
}

git(["add", "bundle"]);
const pointerStatus = spawnSync("git", ["diff", "--cached", "--quiet", "--", "bundle"], {
  cwd: root,
  stdio: "ignore",
});
if (pointerStatus.error) throw pointerStatus.error;
if (pointerStatus.status === 1) {
  git(["commit", "--only", "bundle", "-m", "Update generated bundle pointer"]);
} else if (pointerStatus.status !== 0) {
  throw new Error(`git diff --cached --quiet -- bundle failed with exit code ${pointerStatus.status}`);
}

if (shouldPush) {
  git(["push", "origin", "HEAD:bundle"], bundle);
  git(["push", "origin", "HEAD:main"]);
}

const bundleHead = capture("git", ["rev-parse", "HEAD"], bundle);
console.log(`Bundle branch HEAD: ${bundleHead}`);
if (pointerStatus.status === 0 && !hasStagedChanges(bundle) && !shouldPush) {
  console.log("Main bundle pointer unchanged.");
}
