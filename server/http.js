import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function securityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy',
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; "
    + "style-src 'self' 'unsafe-inline'; script-src 'self' https://usions.com; "
    + "frame-ancestors 'self' https://usions.com; object-src 'none'; base-uri 'none'");
}

export function createRequestHandler(world, distDirectory, store = null) {
  return async (request, response) => {
    securityHeaders(response);
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/healthz') {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({
        ok: true,
        game: 'steppe-strike',
        players: world.connectedPlayers().length,
        capacity: 96,
        tick: world.tickNumber,
        revision: world.revision,
        edits: world.voxels.edits.size,
        persistence: store?.health() || null,
        region: process.env.RAILWAY_REPLICA_REGION || 'local',
        uptime: Math.round(process.uptime()),
      }));
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end('Method not allowed');
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch {
      response.writeHead(400).end('Bad request');
      return;
    }
    const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
    let file = join(distDirectory, relative || 'index.html');
    if (!existsSync(file) || (await stat(file)).isDirectory()) file = join(distDirectory, 'index.html');
    if (!file.startsWith(distDirectory)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    response.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    response.setHeader('Cache-Control',
      file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
    response.statusCode = 200;
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  };
}
