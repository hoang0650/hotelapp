const { spawn } = require('child_process');

/**
 * Giữ 1 tiến trình ffmpeg/RTSP mở, luôn có JPEG mới nhất trong RAM.
 * Snapshot/stream đọc buffer → không mở lại RTSP mỗi lần (giảm delay mạnh).
 */
class FramePump {
  constructor(ffmpegPath, rtspUrl) {
    this.ffmpegPath = ffmpegPath;
    this.rtspUrl = rtspUrl;
    this.proc = null;
    this.latestJpeg = null;
    this.latestAt = 0;
    this.errTail = '';
    this.refs = 0;
    this.buffer = Buffer.alloc(0);
    this.restartTimer = null;
    this.stopped = false;
  }

  start() {
    if (this.proc || this.stopped) return;
    const args = [
      '-rtsp_transport', 'tcp',
      '-stimeout', '5000000',
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-probesize', '32',
      '-analyzeduration', '0',
      '-i', this.rtspUrl,
      '-an',
      '-vf', 'fps=8,scale=720:-2',
      '-q:v', '6',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1'
    ];

    const proc = spawn(this.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;
    this.buffer = Buffer.alloc(0);

    proc.stdout.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      // Tách từng frame JPEG (FFD8 ... FFD9)
      while (true) {
        const soi = this.buffer.indexOf(Buffer.from([0xff, 0xd8]));
        if (soi < 0) {
          this.buffer = Buffer.alloc(0);
          break;
        }
        if (soi > 0) this.buffer = this.buffer.slice(soi);
        const eoi = this.buffer.indexOf(Buffer.from([0xff, 0xd9]), 2);
        if (eoi < 0) {
          // giữ tối đa ~2MB đang ghép
          if (this.buffer.length > 2 * 1024 * 1024) this.buffer = this.buffer.slice(-512 * 1024);
          break;
        }
        this.latestJpeg = this.buffer.slice(0, eoi + 2);
        this.latestAt = Date.now();
        this.buffer = this.buffer.slice(eoi + 2);
      }
    });

    proc.stderr.on('data', (d) => {
      this.errTail = (this.errTail + d.toString('utf8')).slice(-2000);
    });

    proc.on('exit', () => {
      this.proc = null;
      if (this.stopped || this.refs <= 0) return;
      if (this.restartTimer) return;
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        this.start();
      }, 1500);
    });

    proc.on('error', () => {
      this.proc = null;
    });
  }

  acquire() {
    this.refs += 1;
    this.stopped = false;
    this.start();
  }

  release() {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs === 0) {
      this.stopped = true;
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
      }
      if (this.proc) {
        try { this.proc.kill('SIGKILL'); } catch (_) {}
        this.proc = null;
      }
    }
  }

  getJpeg() {
    return this.latestJpeg;
  }

  waitForJpeg(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const existing = this.getJpeg();
      if (existing) return resolve(existing);
      const start = Date.now();
      const timer = setInterval(() => {
        const jpg = this.getJpeg();
        if (jpg) {
          clearInterval(timer);
          return resolve(jpg);
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          return reject(new Error(this.errTail || 'Timeout chờ frame RTSP'));
        }
      }, 50);
    });
  }
}

const pumps = new Map();

function getPump(ffmpegPath, rtspUrl) {
  let pump = pumps.get(rtspUrl);
  if (!pump) {
    pump = new FramePump(ffmpegPath, rtspUrl);
    pumps.set(rtspUrl, pump);
  }
  return pump;
}

function releasePump(rtspUrl) {
  const pump = pumps.get(rtspUrl);
  if (!pump) return;
  pump.release();
  if (pump.refs <= 0) {
    pumps.delete(rtspUrl);
  }
}

module.exports = { getPump, releasePump };
