#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const USAGE = `Usage:
  snip add <url>    Create a short link
  snip ls           List links and hit counts
  snip open <code>  Open a short link in the default browser
  snip help         Show this help

Set SNIP_API to use a backend other than http://localhost:3000.`;

function getBrowserCommand(url, platform = process.platform) {
  if (platform === 'win32') {
    return { command: 'explorer.exe', args: [url] };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: [url] };
  }
  if (platform === 'linux' || platform === 'freebsd') {
    return { command: 'xdg-open', args: [url] };
  }
  throw new Error(`Opening links is not supported on ${platform}.`);
}

function openInBrowser(url, platform = process.platform) {
  const { command, args } = getBrowserCommand(url, platform);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function formatLinks(links) {
  const codeWidth = Math.max(4, ...links.map((link) => String(link.code).length));
  const hitsWidth = Math.max(4, ...links.map((link) => String(link.hits).length));
  const lines = [
    `${'code'.padEnd(codeWidth)}  ${'hits'.padStart(hitsWidth)}  url`,
    ...links.map(
      (link) =>
        `${String(link.code).padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`,
    ),
  ];
  return lines.join('\n');
}

function validateWebUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid http or https URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must be a valid http or https URL.`);
  }
  return url.href;
}

async function responseError(response) {
  let detail = '';
  try {
    const body = await response.json();
    if (typeof body.error === 'string') detail = `: ${body.error}`;
  } catch {
    // Error responses are not required to contain JSON.
  }
  return new Error(`API request failed (${response.status})${detail}`);
}

async function run(args, options = {}) {
  const stdout = options.stdout || ((text) => process.stdout.write(`${text}\n`));
  const stderr = options.stderr || ((text) => process.stderr.write(`${text}\n`));
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const apiBase = (options.apiBase || process.env.SNIP_API || 'http://localhost:3000').replace(/\/+$/, '');
  const fetchOptions = { signal: AbortSignal.timeout(10000) };

  try {
    if (!Array.isArray(args) || args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
      if (args && args.length > 1) throw new Error('Help does not accept additional arguments.');
      stdout(USAGE);
      return 0;
    }

    const [command, ...commandArgs] = args;
    if (command === 'add') {
      if (commandArgs.length !== 1) throw new Error('Usage: snip add <url>');
      const url = validateWebUrl(commandArgs[0], 'URL');
      const response = await fetchImpl(`${apiBase}/api/links`, {
        ...fetchOptions,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw await responseError(response);
      const link = await response.json();
      if (typeof link.shortUrl !== 'string') throw new Error('API response is missing shortUrl.');
      stdout(link.shortUrl);
      return 0;
    }

    if (command === 'ls') {
      if (commandArgs.length !== 0) throw new Error('Usage: snip ls');
      const response = await fetchImpl(`${apiBase}/api/links`, fetchOptions);
      if (!response.ok) throw await responseError(response);
      const links = await response.json();
      if (!Array.isArray(links)) throw new Error('API response must be a list of links.');
      stdout(links.length === 0 ? 'No links yet.' : formatLinks(links));
      return 0;
    }

    if (command === 'open') {
      if (commandArgs.length !== 1 || !/^[A-Za-z0-9]{6}$/.test(commandArgs[0])) {
        throw new Error('Usage: snip open <6-character code>');
      }
      const response = await fetchImpl(`${apiBase}/${encodeURIComponent(commandArgs[0])}`, {
        ...fetchOptions,
        redirect: 'manual',
      });
      if (response.status === 404) throw new Error(`Short link not found: ${commandArgs[0]}`);
      if (response.status !== 302) throw await responseError(response);
      const target = response.headers.get('location');
      if (!target) throw new Error('API redirect response is missing its Location header.');
      const destination = validateWebUrl(target, 'Redirect target');
      await (options.openBrowser || openInBrowser)(destination, options.platform || process.platform);
      return 0;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    const message = error && error.name === 'TimeoutError'
      ? 'Backend request timed out.'
      : error && error.name === 'AbortError'
        ? 'Backend request was cancelled.'
        : error instanceof TypeError && /fetch|network|connect/i.test(error.message)
          ? `Could not reach backend at ${apiBase}: ${error.message}`
          : error && error.message
            ? error.message
            : String(error);
    stderr(message);
    return 1;
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

module.exports = { formatLinks, getBrowserCommand, run };
