import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

export async function runDesktop(args = [], runTauri) {
  const server = await createServer({ server: { host: '127.0.0.1' } });
  try {
    await server.listen();
    server.printUrls();
    const devUrl = server.resolvedUrls?.local[0];
    if (!devUrl) throw new Error('Vite did not publish a local development URL.');
    const config = JSON.stringify({ build: { beforeDevCommand: '', devUrl } });
    const separator = args.indexOf('--');
    const split = separator === -1 ? args.length : separator;
    const cliArgs = ['dev', ...args.slice(0, split), '--config', config, ...args.slice(split)];
    // Keeping Vite in this process also releases its port when the native CLI exits.
    runTauri ??= (await import('@tauri-apps/cli')).default.run;
    await runTauri(cliArgs, 'npm run desktop');
  } finally {
    await server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDesktop(process.argv.slice(2)).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
