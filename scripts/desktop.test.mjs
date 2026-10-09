import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { runDesktop } from './desktop.mjs';

// Explicit resource check: node --test scripts/desktop.test.mjs.
test('desktop follows Vite fallback, forwards arguments and releases only its own server', async () => {
  const blockers = [];
  const listen = async port => {
    const server = createServer((_request, response) => response.end('other server'));
    blockers.push(server);
    server.listen(port, '127.0.0.1');
    await once(server, 'listening');
    return server;
  };
  let url;
  const inspect = async args => {
    assert.equal(args[0], 'dev');
    const configIndex = args.lastIndexOf('--config');
    const config = JSON.parse(args[configIndex + 1]);
    assert.equal(config.build.beforeDevCommand, '');
    url = config.build.devUrl;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<script type="module" src="\/src\/main.ts"><\/script>/);
  };
  const assertReleased = async () => {
    const probe = await listen(Number(new URL(url).port));
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  };
  try {
    await runDesktop([], inspect);
    assert.equal(new URL(url).hostname, '127.0.0.1');
    const firstPort = Number(new URL(url).port);
    assert.ok(firstPort >= 1420);
    await assertReleased();
    await listen(firstPort);
    const args = ['--no-watch', '--config', '{"build":{"devUrl":"http://wrong:1420"}}', '--', '--locked'];
    await runDesktop(args, async cliArgs => {
      await inspect(cliArgs);
      assert.deepEqual(cliArgs.slice(1, 4), args.slice(0, 3));
      assert.deepEqual(cliArgs.slice(-2), ['--', '--locked']);
      assert.ok(Number(new URL(url).port) > firstPort);
    });
    await assertReleased();
    await assert.rejects(runDesktop([], async cliArgs => {
      await inspect(cliArgs);
      throw new Error('native startup failed');
    }), /native startup failed/);
    await assertReleased();
    assert.equal(await (await fetch(`http://127.0.0.1:${firstPort}`)).text(), 'other server');
  } finally {
    await Promise.all(blockers.map(server => new Promise(resolve => {
      server.closeAllConnections();
      server.close(resolve);
    })));
  }
});
