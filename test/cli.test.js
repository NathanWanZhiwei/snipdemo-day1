'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { formatLinks, getBrowserCommand, run } = require('../cli');

function capture() {
  const output = { stdout: [], stderr: [] };
  output.options = {
    stdout: (text) => output.stdout.push(text),
    stderr: (text) => output.stderr.push(text),
  };
  return output;
}

test('help prints usage and succeeds without contacting the API', async () => {
  const output = capture();
  const code = await run(['help'], {
    ...output.options,
    fetchImpl: () => assert.fail('help should not fetch'),
  });
  assert.equal(code, 0);
  assert.match(output.stdout[0], /Usage:/);
  assert.deepEqual(output.stderr, []);
});

test('add validates input, posts JSON, and prints the short URL', async () => {
  const output = capture();
  let request;
  const code = await run(['add', 'https://example.com/path'], {
    ...output.options,
    apiBase: 'http://snip.test',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ shortUrl: 'http://snip.test/abc123' }), { status: 201 });
    },
  });
  assert.equal(code, 0);
  assert.equal(request.url, 'http://snip.test/api/links');
  assert.deepEqual(JSON.parse(request.options.body), { url: 'https://example.com/path' });
  assert.equal(output.stdout[0], 'http://snip.test/abc123');

  const invalid = capture();
  assert.equal(await run(['add', 'javascript:alert(1)'], invalid.options), 1);
  assert.match(invalid.stderr[0], /http or https/);
});

test('ls formats links in aligned columns and handles an empty list', async () => {
  const output = capture();
  const code = await run(['ls'], {
    ...output.options,
    fetchImpl: async () => new Response(JSON.stringify([
      { code: 'abc123', hits: 8, url: 'https://example.com' },
      { code: 'xy7890', hits: 0, url: 'https://example.org' },
    ])),
  });
  assert.equal(code, 0);
  assert.equal(output.stdout[0], formatLinks([
    { code: 'abc123', hits: 8, url: 'https://example.com' },
    { code: 'xy7890', hits: 0, url: 'https://example.org' },
  ]));
  assert.match(output.stdout[0], /code\s+hits\s+url/);

  const empty = capture();
  assert.equal(await run(['ls'], {
    ...empty.options,
    fetchImpl: async () => new Response('[]'),
  }), 0);
  assert.equal(empty.stdout[0], 'No links yet.');
});

test('open asks for a manual redirect and launches only its HTTP(S) target', async () => {
  const output = capture();
  let launched;
  const code = await run(['open', 'abc123'], {
    ...output.options,
    apiBase: 'http://snip.test',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'http://snip.test/abc123');
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 302, headers: { Location: 'https://example.com/' } });
    },
    openBrowser: async (url) => { launched = url; },
  });
  assert.equal(code, 0);
  assert.equal(launched, 'https://example.com/');
  assert.deepEqual(output.stderr, []);

  const missing = capture();
  assert.equal(await run(['open', 'abc123'], {
    ...missing.options,
    fetchImpl: async () => new Response(null, { status: 404 }),
  }), 1);
  assert.match(missing.stderr[0], /not found/);
});

test('unknown commands and unreachable backends fail with a useful message', async () => {
  const badCommand = capture();
  assert.equal(await run(['remove'], badCommand.options), 1);
  assert.match(badCommand.stderr[0], /Unknown command/);

  const offline = capture();
  assert.equal(await run(['ls'], {
    ...offline.options,
    apiBase: 'http://localhost:1',
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  }), 1);
  assert.match(offline.stderr[0], /Could not reach backend/);
});

test('browser command uses the platform default URL handler', () => {
  const url = 'https://example.com/';
  assert.deepEqual(getBrowserCommand(url, 'win32'), { command: 'explorer.exe', args: [url] });
  assert.deepEqual(getBrowserCommand(url, 'darwin'), { command: 'open', args: [url] });
  assert.deepEqual(getBrowserCommand(url, 'linux'), { command: 'xdg-open', args: [url] });
  assert.throws(() => getBrowserCommand(url, 'aix'), /not supported/);
});
