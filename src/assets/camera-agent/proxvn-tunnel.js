const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Auto-start ProxVN HTTP tunnel for camera-agent.
 * Env:
 *   PROXVN_ENABLED=true|1|yes   (default: true if PROXVN_SERVER set)
 *   PROXVN_SERVER=host:8882
 *   PROXVN_BIN=path/to/proxvn   (optional)
 *   PROXVN_CERT_PIN=sha256hex   (optional)
 *   PROXVN_INSECURE=true        (optional, self-signed control cert)
 *   PROXVN_ID=camera-agent-xxx  (optional)
 *   PROXVN_UI=false             (default false)
 */

function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

function resolveProxvnBin() {
  if (process.env.PROXVN_BIN) {
    return process.env.PROXVN_BIN;
  }

  const platform = process.platform;
  const arch = process.arch;
  let file = null;
  if (platform === 'win32') file = 'proxvn-windows-amd64.exe';
  else if (platform === 'darwin') file = arch === 'arm64' ? 'proxvn-darwin-arm64' : 'proxvn-darwin-amd64';
  else if (platform === 'linux') file = arch === 'arm64' ? 'proxvn-linux-arm64' : 'proxvn-linux-amd64';
  else return null;

  const candidates = [
    path.join(__dirname, 'bin', file),
    path.join(__dirname, '..', '..', '..', 'proxvn_tunnel_full', 'bin', 'client', file),
    path.join(process.cwd(), 'proxvn_tunnel_full', 'bin', 'client', file),
    path.join(process.cwd(), 'bin', file),
    file
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {}
  }
  return null;
}

function parsePublicUrl(text) {
  if (!text) return null;
  const patterns = [
    /Public URL:\s*(https?:\/\/[^\s]+)/i,
    /🌐\s*Public URL:\s*(https?:\/\/[^\s]+)/i,
    /(https:\/\/[a-z0-9-]+\.[a-z0-9.-]+)/i
  ];
  for (const re of patterns) {
    const m = String(text).match(re);
    if (m && m[1]) {
      return m[1].replace(/[)\].,;]+$/, '');
    }
  }
  return null;
}

function createProxvnTunnel({ localPort, onPublicUrl, onLog }) {
  const server = String(process.env.PROXVN_SERVER || '').trim();
  const enabledExplicit = process.env.PROXVN_ENABLED;
  const enabled = enabledExplicit == null || enabledExplicit === ''
    ? !!server
    : envFlag('PROXVN_ENABLED', false);

  const state = {
    enabled,
    server: server || null,
    bin: null,
    child: null,
    publicUrl: null,
    lastError: null,
    startedAt: null
  };

  if (!enabled) {
    return {
      state,
      start() {
        onLog && onLog('ProxVN auto-tunnel disabled (set PROXVN_SERVER / PROXVN_ENABLED=true)');
      },
      stop() {}
    };
  }

  if (!server) {
    state.lastError = 'Missing PROXVN_SERVER (VD: 72.62.72.165:8882)';
    return {
      state,
      start() {
        onLog && onLog(`[proxvn] ${state.lastError}`);
      },
      stop() {}
    };
  }

  const bin = resolveProxvnBin();
  state.bin = bin;
  if (!bin) {
    state.lastError = 'Không tìm thấy ProxVN client binary. Đặt PROXVN_BIN hoặc copy vào camera-agent/bin/';
    return {
      state,
      start() {
        onLog && onLog(`[proxvn] ${state.lastError}`);
      },
      stop() {}
    };
  }

  const args = [
    '--server', server,
    '--proto', 'http',
    '--host', '127.0.0.1',
    String(localPort),
    '--ui=false'
  ];

  const certPin = String(process.env.PROXVN_CERT_PIN || '').trim();
  if (certPin) args.push('--cert-pin', certPin);
  if (envFlag('PROXVN_INSECURE', false)) args.push('--insecure');

  const clientId = String(process.env.PROXVN_ID || '').trim();
  if (clientId) args.push('--id', clientId);

  let restartTimer = null;
  let stopping = false;

  const start = () => {
    if (stopping) return;
    if (state.child) return;

    onLog && onLog(`[proxvn] starting: ${bin} ${args.join(' ')}`);
    const child = spawn(bin, args, {
      cwd: path.dirname(bin),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    state.child = child;
    state.startedAt = new Date().toISOString();
    state.lastError = null;

    const handleChunk = (buf) => {
      const text = buf.toString('utf8');
      onLog && onLog(text.trimEnd());
      const url = parsePublicUrl(text);
      if (url && url !== state.publicUrl) {
        state.publicUrl = url.replace(/\/+$/, '');
        onLog && onLog(`[proxvn] publicUrl=${state.publicUrl}`);
        onPublicUrl && onPublicUrl(state.publicUrl);
      }
    };

    child.stdout.on('data', handleChunk);
    child.stderr.on('data', handleChunk);

    child.on('error', (err) => {
      state.lastError = err.message || String(err);
      state.child = null;
      onLog && onLog(`[proxvn] spawn error: ${state.lastError}`);
      scheduleRestart();
    });

    child.on('exit', (code, signal) => {
      state.child = null;
      if (stopping) return;
      state.lastError = `ProxVN exited code=${code} signal=${signal || ''}`;
      onLog && onLog(`[proxvn] ${state.lastError}`);
      scheduleRestart();
    });
  };

  const scheduleRestart = () => {
    if (stopping || restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      start();
    }, 5000);
  };

  const stop = () => {
    stopping = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (state.child) {
      try { state.child.kill('SIGTERM'); } catch (_) {}
      state.child = null;
    }
  };

  return { state, start, stop };
}

module.exports = {
  createProxvnTunnel,
  resolveProxvnBin,
  parsePublicUrl
};
