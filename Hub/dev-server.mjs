import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  // Parse URL pathname, ignoring query string
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Root path defaults to index.html
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  let filePath = path.join(__dirname, pathname);

  // Clean URLs support: if file does not exist directly, try appending .html
  if (!fs.existsSync(filePath) || fs.statSync(filePath, { throwIfNoEntry: false })?.isDirectory()) {
    const withHtml = filePath + '.html';
    if (fs.existsSync(withHtml)) {
      filePath = withHtml;
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>404 Not Found — Travel and Challenge</title><meta charset="utf-8"></head>
<body style="font-family:system-ui;padding:2rem;text-align:center">
  <h1>404 — Page Not Found</h1>
  <p>The page <code>${pathname}</code> was not found.</p>
  <p><a href="/index.html">Return to Home</a> | <a href="/explore.html">Explore Destinations</a></p>
</body>
</html>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Travel and Challenge Dev Server running at: http://localhost:${PORT}`);
  console.log(`👉 Explore: http://localhost:${PORT}/explore.html (or /explore)`);
  console.log(`👉 Quests:  http://localhost:${PORT}/quests.html (or /quests)`);
  console.log(`👉 Planner: http://localhost:${PORT}/planner.html (or /planner)\n`);
});
