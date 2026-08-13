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

const server = app.listen(PORT, () => {
  const ips = getLocalIpv4s();
  const urls = [`http://localhost:${PORT}`].concat(ips.map(ip => `http://${ip}:${PORT}`));
  console.log(`camera-agent listening on :${PORT}`);
  console.log(`camera-agent urls: ${urls.join(' | ')}`);
  proxvn.start();
  aiLoop.start();
});

function shutdown() {
  try { aiLoop.stop(); } catch (_) {}
  try { proxvn.stop(); } catch (_) {}
  try { server.close(); } catch (_) {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
