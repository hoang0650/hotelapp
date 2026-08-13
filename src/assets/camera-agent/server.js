const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createProxvnTunnel } = require('./proxvn-tunnel');
const { getPump, releasePump } = require('./frame-pump');
const { createAiPipelineLoop } = require('./ai-pipeline-loop');

// Load camera-agent/.env if present (no dotenv dependency)
(function loadDotEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === '') {
        process.env[key] = val;
      }
    }
  } catch (_) {}
})();

let ffmpegPath = 'ffmpeg';
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  ffmpegPath = ffmpegInstaller.path;
  console.log('-> Đã tìm thấy FFMPEG tích hợp tại:', ffmpegPath);
} catch (err) {
  console.log('-> Không tìm thấy gói tích hợp, sử dụng FFMPEG hệ thống.');
}

const AGENT_TOKEN = process.env.CAMERA_AGENT_TOKEN || '';
const PORT = Number(process.env.PORT || 8787);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

let publicTunnelUrl = null;
const proxvn = createProxvnTunnel({
  localPort: PORT,
  onPublicUrl: (url) => {
    publicTunnelUrl = url;
    console.log(`camera-agent ProxVN public URL: ${url}`);
    console.log('→ Dán URL này vào hotelapp Camera Config → Agent URL');
  },
  onLog: (line) => {
    if (line) console.log(line);
  }
});

function isLocalRequest(req) {
  const ip = String(req.ip || '');
  return ip === '127.0.0.1' || ip === '::1' || ip.endsWith('127.0.0.1') || ip.endsWith('::1');
}

function isAuthorized(req) {
  const headerToken = String(req.headers['x-agent-token'] || '');
  const queryToken = String(req.query?.agentToken || '');
  const provided = headerToken || queryToken;
  // Không set CAMERA_AGENT_TOKEN → mở (chỉ nên expose qua ProxVN URL ngẫu nhiên)
  if (!AGENT_TOKEN) return true;
  return provided === AGENT_TOKEN;
}

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    publicUrl: publicTunnelUrl || proxvn.state.publicUrl || null,
    proxvn: {
      enabled: !!proxvn.state.enabled,
      server: proxvn.state.server,
      connected: !!proxvn.state.publicUrl
    }
  });
});

function getLocalIpv4s() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net && net.family === 'IPv4' && !net.internal && net.address) {
        ips.push(net.address);
      }
    }
  }
  return Array.from(new Set(ips));
}

app.get('/info', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const ips = getLocalIpv4s();
  const localUrls = [`http://localhost:${PORT}`].concat(ips.map(ip => `http://${ip}:${PORT}`));
  const publicUrl = publicTunnelUrl || proxvn.state.publicUrl || null;
  const urls = publicUrl ? [publicUrl, ...localUrls] : localUrls;
  res.status(200).json({
    ok: true,
    port: PORT,
    urls,
    localIps: ips,
    publicUrl,
    proxvn: {
      enabled: !!proxvn.state.enabled,
      server: proxvn.state.server,
      bin: proxvn.state.bin,
      publicUrl,
      lastError: proxvn.state.lastError,
      startedAt: proxvn.state.startedAt
    }
  });
});

app.get('/snapshot', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const rtspUrl = String(req.query.rtspUrl || '');
  return handleSnapshot(rtspUrl, res);
});

app.post('/snapshot', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const rtspUrl = String(req.body?.rtspUrl || '');
  return handleSnapshot(rtspUrl, res);
});

// MJPEG realtime — multipart tự ghép từ frame buffer (ổn định hơn -f mpjpeg)
app.get('/stream', (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const rtspUrl = String(req.query.rtspUrl || '');
  return handleMjpegStream(rtspUrl, res);
});

function handleMjpegStream(rtspUrl, res) {
  if (!rtspUrl) {
    return res.status(400).json({ message: 'Missing rtspUrl' });
  }

  const boundary = 'frame';
  const pump = getPump(ffmpegPath, rtspUrl);
  pump.acquire();

  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'Pragma': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  });

  let closed = false;
  let lastSentAt = 0;
  const timer = setInterval(() => {
    if (closed) return;
    const jpg = pump.getJpeg();
    if (!jpg) return;
    if (pump.latestAt && pump.latestAt <= lastSentAt) return;
    lastSentAt = pump.latestAt || Date.now();
    try {
      res.write(`--${boundary}\r\n`);
      res.write('Content-Type: image/jpeg\r\n');
      res.write(`Content-Length: ${jpg.length}\r\n\r\n`);
      res.write(jpg);
      res.write('\r\n');
    } catch (_) {
      cleanup();
    }
  }, 120);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    releasePump(rtspUrl);
    try { res.end(); } catch (_) {}
  };

  req.on('close', cleanup);
  res.on('close', cleanup);

  pump.waitForJpeg(10000).catch(() => {
    if (!closed) cleanup();
  });
}

async function handleSnapshot(rtspUrl, res) {
  if (!rtspUrl) {
    return res.status(400).json({ message: 'Missing rtspUrl' });
  }

  const pump = getPump(ffmpegPath, rtspUrl);
  pump.acquire();
  try {
    const jpg = await pump.waitForJpeg(10000);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(jpg);
  } catch (err) {
    return res.status(500).json({
      message: 'Snapshot thất bại',
      details: String(err.message || err).slice(-1200)
    });
  } finally {
    // Giữ pump thêm một lúc nếu stream đang xem; nếu không ai dùng sẽ tắt
    setTimeout(() => releasePump(rtspUrl), 15000);
  }
}

const aiLoop = createAiPipelineLoop({
  ffmpegPath,
  getRtspUrl: () => String(process.env.AI_RTSP_URL || '').trim()
});

function probeExistingAgent(port) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(
      { host: '127.0.0.1', port, path: '/health', timeout: 1200 },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body || '{}');
            resolve(res.statusCode === 200 && json && json.ok ? json : null);
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      try { req.destroy(); } catch (_) {}
      resolve(null);
    });
  });
}

function freePortWindows(port) {
  if (process.platform !== 'win32') return false;
  try {
    const { execSync } = require('child_process');
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of String(out || '').split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
    }
    if (!pids.size) return false;
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`[OK] Da dung tien trinh cu tren cong ${port} (PID ${pid})`);
      } catch (_) {}
    }
    return pids.size > 0;
  } catch (_) {
    return false;
  }
}

let server = null;

async function startListening() {
  const existing = await probeExistingAgent(PORT);
  if (existing) {
    console.log(`[OK] Camera Agent da dang chay tren cong ${PORT}.`);
    if (existing.publicUrl) {
      console.log(`camera-agent ProxVN public URL: ${existing.publicUrl}`);
      console.log('→ Dán URL này vào hotelapp Camera Config → Agent URL');
    } else {
      console.log(`Mo health: http://localhost:${PORT}/health`);
    }
    console.log('Khong can mo them cua so BAT_DAU. De cua so cu mo, hoac dong cua so cu roi chay lai.');
    process.exit(0);
  }

  server = app.listen(PORT, () => {
    const ips = getLocalIpv4s();
    const urls = [`http://localhost:${PORT}`].concat(ips.map(ip => `http://${ip}:${PORT}`));
    console.log(`camera-agent listening on :${PORT}`);
    console.log(`camera-agent urls: ${urls.join(' | ')}`);
    proxvn.start();
    aiLoop.start();
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.log('');
      console.log(`[CANH BAO] Cong ${PORT} dang bi chiem (thuong la Camera Agent cu con mo).`);
      if (freePortWindows(PORT)) {
        console.log('Dang thu khoi dong lai...');
        setTimeout(() => {
          server = app.listen(PORT, () => {
            const ips = getLocalIpv4s();
            const urls = [`http://localhost:${PORT}`].concat(ips.map(ip => `http://${ip}:${PORT}`));
            console.log(`camera-agent listening on :${PORT}`);
            console.log(`camera-agent urls: ${urls.join(' | ')}`);
            proxvn.start();
            aiLoop.start();
          });
          server.on('error', (err2) => {
            console.error(`[LOI] Van khong mo duoc cong ${PORT}:`, err2 && err2.message ? err2.message : err2);
            console.error('Hay dong cua so Camera Agent cu, hoac doi PORT trong file .env roi chay lai.');
            process.exit(1);
          });
        }, 800);
        return;
      }
      console.error('Hay dong cua so Camera Agent dang mo, roi bam dup BAT_DAU.bat lai.');
      console.error(`Hoac mo Task Manager → End task "Node.js", roi chay lai.`);
      process.exit(1);
    }
    console.error('[LOI] Khong khoi dong duoc agent:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

function shutdown() {
  try { aiLoop.stop(); } catch (_) {}
  try { proxvn.stop(); } catch (_) {}
  try { if (server) server.close(); } catch (_) {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startListening().catch((e) => {
  console.error('[LOI] Khoi dong that bai:', e && e.message ? e.message : e);
  process.exit(1);
});
