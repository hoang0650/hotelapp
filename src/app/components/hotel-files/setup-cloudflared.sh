#!/usr/bin/env bash
set -euo pipefail

TUNNEL_ID="${TUNNEL_ID:-}"
if [[ -z "$TUNNEL_ID" ]]; then
  read -r -p "Nhập Tunnel UUID (VD: f5c82bfd-be27-4709-864c-f1e11df3820b): " TUNNEL_ID
fi

TUNNEL_HOSTNAME="${TUNNEL_HOSTNAME:-camera-agent.phgrouptechs.com}"
CAMERA_AGENT_PORT="${CAMERA_AGENT_PORT:-8787}"
TUNNEL_LOCAL_URL="${TUNNEL_LOCAL_URL:-http://localhost:${CAMERA_AGENT_PORT}}"

command -v node >/dev/null 2>&1 || { echo "Thiếu node trong PATH"; exit 1; }
command -v cloudflared >/dev/null 2>&1 || { echo "Thiếu cloudflared trong PATH"; exit 1; }

CLOUDFLARED_DIR="${HOME}/.cloudflared"
mkdir -p "${CLOUDFLARED_DIR}"

CRED_FILE="${CLOUDFLARED_DIR}/${TUNNEL_ID}.json"
CONFIG_FILE="${CLOUDFLARED_DIR}/config.yml"

if [[ ! -f "${CRED_FILE}" ]]; then
  echo "Không thấy credentials file: ${CRED_FILE}"
  echo "Hãy chạy: cloudflared tunnel create <name> (hoặc copy file .json vào thư mục này)."
  exit 1
fi

cat > "${CONFIG_FILE}" <<YAML
tunnel: ${TUNNEL_ID}
credentials-file: ${CRED_FILE}

ingress:
  - hostname: ${TUNNEL_HOSTNAME}
    service: ${TUNNEL_LOCAL_URL}
  - service: http_status:404
YAML

echo "Đã tạo config: ${CONFIG_FILE}"

if [[ "${ROUTE_DNS:-}" == "1" || "${ROUTE_DNS:-}" == "true" ]]; then
  echo "Đang route DNS: ${TUNNEL_HOSTNAME} -> tunnel ${TUNNEL_ID}"
  cloudflared tunnel route dns "${TUNNEL_ID}" "${TUNNEL_HOSTNAME}"
fi

echo "Đang chạy camera-agent (PORT=${CAMERA_AGENT_PORT})..."
(
  export PORT="${CAMERA_AGENT_PORT}"
  if [[ -n "${CAMERA_AGENT_TOKEN:-}" ]]; then
    export CAMERA_AGENT_TOKEN
  fi
  node server.js
) &
AGENT_PID=$!
sleep 1
echo "camera-agent PID: ${AGENT_PID}"
echo "Test: ${TUNNEL_LOCAL_URL}/health"

echo "Đang chạy cloudflared tunnel run (Ctrl+C để dừng)..."
cloudflared tunnel run "${TUNNEL_ID}"
