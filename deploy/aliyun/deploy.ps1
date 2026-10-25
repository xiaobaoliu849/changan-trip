# Upload the app from this Windows PC to a Linux server and (re)install it.
# Usage: powershell -ExecutionPolicy Bypass -File deploy\aliyun\deploy.ps1 -Server 1.2.3.4 [-User root] [-Key path\to\key] [-Port 8001]
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$User = "root",
  [string]$Key = "",
  # Port 80 is often taken by another app on the same server; this one gets its own.
  [int]$Port = 8001
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $root

if (-not (Test-Path ".env")) { Write-Host "Missing .env (OPENAI_NEXT_API_KEY, EVEROS_API_KEY)"; exit 1 }
# Always rebuild: a stale dist would ship yesterday's game.
Push-Location frontend; npm install --no-audit --no-fund; npm run build; Pop-Location
if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build failed"; exit 1 }

$tar = Join-Path $env:TEMP "changan.tar.gz"
# The backend reads xiaoyong.png from frontend/public for the Big Wild Goose Pagoda postcard.
tar -czf $tar --exclude=__pycache__ backend frontend/dist frontend/public/assets/img/xiaoyong.png requirements.txt deploy .env
$opts = @("-o", "StrictHostKeyChecking=accept-new")
if ($Key) { $opts += @("-i", $Key) }
# The bundle carries .env (API keys): upload it into a directory only we can read, and delete it
# afterwards whether or not setup succeeded.
$remote = (ssh @opts "${User}@${Server}" "rm -rf /tmp/changan.*; mktemp -d /tmp/changan.XXXXXXXX" | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or -not $remote) { Remove-Item $tar -Force; Write-Host "Could not reach the server"; exit 1 }
$remote = $remote.Trim()
scp @opts $tar "${User}@${Server}:$remote/app.tar.gz"
$scpExit = $LASTEXITCODE
Remove-Item $tar -Force
if ($scpExit -ne 0) { Write-Host "Upload failed"; exit 1 }
ssh @opts "${User}@${Server}" "cd $remote && tar -xzf app.tar.gz && sudo PORT=$Port bash deploy/aliyun/setup.sh; code=`$?; cd / && rm -rf $remote; exit `$code"
if ($LASTEXITCODE -ne 0) { Write-Host "Deploy failed (see above)"; exit 1 }
Write-Host "Open http://${Server}:$Port  (allow TCP $Port in the Aliyun security group first)"
