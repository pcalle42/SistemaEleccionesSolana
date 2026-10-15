import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('./dist/', import.meta.url).pathname;
const port = Number(process.env.PORT ?? 3002);
const configuredApiOrigin = process.env.API_ORIGIN;
let apiConnectSource = '';
if (configuredApiOrigin) {
  const parsed = new URL(configuredApiOrigin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== configuredApiOrigin) {
    throw new Error('API_ORIGIN must contain only scheme://host[:port]');
  }
  apiConnectSource = ` ${parsed.origin}`;
}
const types = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.zkey': 'application/octet-stream',
};
const headers = {
  'Content-Security-Policy': `default-src 'self'; connect-src 'self' blob:${apiConnectSource}; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

const server = createServer((request, response) => {
  const pathname = normalize(
    decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname),
  ).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(root)) {
    response.writeHead(400, headers).end();
    return;
  }
  if ((!existsSync(file) || statSync(file).isDirectory()) && extname(pathname)) {
    response.writeHead(404, headers).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  response.writeHead(200, {
    ...headers,
    'Cache-Control': file.endsWith('index.html')
      ? 'no-store'
      : 'public, max-age=31536000, immutable',
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.closeIdleConnections();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
