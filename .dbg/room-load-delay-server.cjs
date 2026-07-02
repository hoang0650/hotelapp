const http = require('http');
const fs = require('fs');
const path = require('path');

const sessionId = 'room-load-delay';
const port = 7777;
const outDir = __dirname;
const logFile = path.join(outDir, `trae-debug-log-${sessionId}.ndjson`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, `${sessionId}.env`),
  `DEBUG_SERVER_URL=http://127.0.0.1:${port}/event\nDEBUG_SESSION_ID=${sessionId}\n`,
  'utf8'
);
fs.writeFileSync(logFile, '', 'utf8');

const sendJson = (res, code, payload) => {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/event') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        parsed.ts = parsed.ts || Date.now();
        fs.appendFileSync(logFile, `${JSON.stringify(parsed)}\n`, 'utf8');
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String(error && error.message ? error.message : error) });
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/logs')) {
    const content = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    const lines = content.split(/\r?\n/).filter(Boolean).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
    sendJson(res, 200, { ok: true, sessionId, count: lines.length, logs: lines });
    return;
  }

  if (req.method === 'DELETE' && req.url === '/logs') {
    fs.writeFileSync(logFile, '', 'utf8');
    sendJson(res, 200, { ok: true, sessionId, cleared: true });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    const count = fs.existsSync(logFile)
      ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).length
      : 0;
    sendJson(res, 200, { ok: true, sessionId, port, count });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Debug server listening on http://127.0.0.1:${port}\n`);
});
