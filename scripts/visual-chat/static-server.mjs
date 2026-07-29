import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function isContained(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${sep}`);
}

export function resolveStaticRequest(distDirectory, requestUrl) {
  const root = resolve(distDirectory);
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  } catch {
    return null;
  }
  const relativePath = pathname.replace(/^\/+/, '');
  const candidate = resolve(root, relativePath || 'index.html');
  if (!isContained(root, candidate)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  if (!extname(relativePath)) {
    const fallback = resolve(root, 'index.html');
    return existsSync(fallback) ? fallback : null;
  }
  return null;
}

export async function startStaticServer({ distDirectory, host = '127.0.0.1', port = 0 }) {
  const root = resolve(distDirectory);
  const indexPath = resolve(root, 'index.html');
  if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
    throw new Error(`Built app entry is missing: ${indexPath}`);
  }
  const httpServer = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    const path = resolveStaticRequest(root, request.url ?? '/');
    if (!path) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(path).pipe(response);
  });

  await new Promise((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(port, host, () => {
      httpServer.off('error', rejectListen);
      resolveListen();
    });
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    httpServer.close();
    throw new Error('Static server did not expose a TCP address.');
  }
  return {
    baseUrl: `http://${host}:${address.port}`,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        httpServer.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  };
}
