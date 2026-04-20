$ErrorActionPreference = "Stop"

$tunnelId = $env:TUNNEL_ID
if ([string]::IsNullOrWhiteSpace($tunnelId)) {
  $tunnelId = Read-Host "Nhập Tunnel UUID (VD: f5c82bfd-be27-4709-864c-f1e11df3820b)"
}

$hostname = $env:TUNNEL_HOSTNAME
if ([string]::IsNullOrWhiteSpace($hostname)) {
  $hostname = "camera-agent.phgrouptechs.com"
}

$localPort = $env:CAMERA_AGENT_PORT
if ([string]::IsNullOrWhiteSpace($localPort)) {
  $localPort = "8787"
}

$localUrl = $env:TUNNEL_LOCAL_URL
if ([string]::IsNullOrWhiteSpace($localUrl)) {
  $localUrl = "http://localhost:$localPort"
}

$token = $env:CAMERA_AGENT_TOKEN

function Assert-Command($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Không tìm thấy '$name' trong PATH. Hãy cài $name và mở lại terminal."
  }
}

Assert-Command "node"
Assert-Command "cloudflared"

$cloudflaredDir = Join-Path $env:USERPROFILE ".cloudflared"
New-Item -ItemType Directory -Force -Path $cloudflaredDir | Out-Null

$credFile = Join-Path $cloudflaredDir "$tunnelId.json"
$configFile = Join-Path $cloudflaredDir "config.yml"

if (-not (Test-Path $credFile)) {
  Write-Host "Không thấy credentials file: $credFile"
  Write-Host "Hãy chắc chắn bạn đã chạy: cloudflared tunnel create <name> trên đúng user Windows, hoặc copy file .json vào đây."
  throw "Missing tunnel credentials."
}

$yaml = @"
tunnel: $tunnelId
credentials-file: $credFile

ingress:
  - hostname: $hostname
    service: $localUrl
  - service: http_status:404
"@

Set-Content -Path $configFile -Value $yaml -Encoding UTF8
Write-Host "Đã tạo config: $configFile"

$shouldRouteDns = $env:ROUTE_DNS
if ($shouldRouteDns -eq "1" -or $shouldRouteDns -eq "true") {
  Write-Host "Đang route DNS: $hostname -> tunnel $tunnelId"
  & cloudflared tunnel route dns $tunnelId $hostname
}

Write-Host "Đang chạy camera-agent (PORT=$localPort)..."
$agentEnv = New-Object System.Collections.Generic.Dictionary[string,string]
$agentEnv["PORT"] = $localPort
if (-not [string]::IsNullOrWhiteSpace($token)) {
  $agentEnv["CAMERA_AGENT_TOKEN"] = $token
}

$agentProc = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory (Split-Path -Parent $MyInvocation.MyCommand.Path) -PassThru -NoNewWindow -Environment $agentEnv
Start-Sleep -Seconds 1
Write-Host "camera-agent PID: $($agentProc.Id)"
Write-Host "Test: $localUrl/health"

Write-Host "Đang chạy cloudflared tunnel run (Ctrl+C để dừng)..."
& cloudflared tunnel run $tunnelId
