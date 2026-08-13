/**
 * Đẩy frame từ frame-pump → API /cameras/agent-ingest (AI chạy trên cloud).
 * Bật: AI_PIPELINE=1 + AI_CAMERA_ID + API_BASE_URL
 */
const axios = require('axios');
const https = require('https');
const { getPump, releasePump } = require('./frame-pump');

const agentHttps = new https.Agent({ rejectUnauthorized: false });

function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(v).trim().toLowerCase());
}

function createAiPipelineLoop({ ffmpegPath, getRtspUrl }) {
  let timer = null;
  let busy = false;
  let stopped = false;

  const enabled = envBool('AI_PIPELINE', false);
  const cameraId = String(process.env.AI_CAMERA_ID || '').trim();
  const apiBase = String(process.env.API_BASE_URL || process.env.PHHOTEL_API_URL || 'https://api.phhotel.vn').replace(/\/+$/, '');
  const agentToken = String(process.env.CAMERA_AGENT_TOKEN || process.env.AI_AGENT_TOKEN || '').trim();
  const intervalMs = Math.max(2000, Number(process.env.AI_PIPELINE_INTERVAL_MS || 5000) || 5000);

  async function tick() {
    if (stopped || busy || !enabled || !cameraId) return;
    const rtspUrl = typeof getRtspUrl === 'function' ? getRtspUrl() : String(process.env.AI_RTSP_URL || '');
    if (!rtspUrl) {
      console.warn('[ai-pipeline] thiếu AI_RTSP_URL / getRtspUrl');
      return;
    }

    busy = true;
    const pump = getPump(ffmpegPath, rtspUrl);
    pump.acquire();
    try {
      const jpg = await pump.waitForJpeg(12000);
      const imageBase64 = `data:image/jpeg;base64,${jpg.toString('base64')}`;
      const resp = await axios.post(
        `${apiBase}/cameras/agent-ingest`,
        {
          cameraId,
          agentToken: agentToken || undefined,
          imageBase64
        },
        {
          httpsAgent: agentHttps,
          timeout: 90000,
          validateStatus: () => true,
          headers: agentToken ? { 'x-agent-token': agentToken } : {}
        }
      );
      if (resp.status >= 400) {
        console.warn(`[ai-pipeline] ingest HTTP ${resp.status}:`, resp.data?.message || resp.statusText);
      } else {
        const stages = resp.data?.stages || {};
        const persons = stages.detect?.count ?? resp.data?.persons?.length ?? 0;
        console.log(`[ai-pipeline] ok persons=${persons} label=${resp.data?.label?.labelVi || '-'}`);
      }
    } catch (e) {
      console.warn('[ai-pipeline] error:', e?.message || e);
    } finally {
      setTimeout(() => releasePump(rtspUrl), 8000);
      busy = false;
    }
  }

  return {
    enabled: enabled && !!cameraId,
    start() {
      if (!enabled) {
        console.log('[ai-pipeline] tắt (AI_PIPELINE!=1)');
        return;
      }
      if (!cameraId) {
        console.warn('[ai-pipeline] cần AI_CAMERA_ID');
        return;
      }
      stopped = false;
      console.log(`[ai-pipeline] bật → ${apiBase}/cameras/agent-ingest mỗi ${intervalMs}ms camera=${cameraId}`);
      timer = setInterval(() => {
        tick().catch(() => {});
      }, intervalMs);
      // chạy sớm 1 lần
      setTimeout(() => tick().catch(() => {}), 2500);
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

module.exports = { createAiPipelineLoop };
