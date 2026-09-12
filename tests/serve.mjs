/* A static file server for the browser tests.
 *
 * The tests used to need one started by hand, which meant a test could pass
 * because a stale server was still up and fail on a fresh machine. This one
 * is started by the test that needs it, on a port the OS picks, and dies with
 * it. Standard library only, matching build.py.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary'
};

/** Serves the repository. Returns { origin, close }. */
export async function serve(root = ROOT) {
  const server = createServer(async (req, res) => {
    // Strip the query, and refuse anything that climbs out of the repository.
    const path = decodeURIComponent(req.url.split('?')[0]);
    let file = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': type });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((ok) => server.close(ok))
  };
}
