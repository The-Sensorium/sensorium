# Local helper: re-wire the push pipeline after `supabase db reset`.
#
# Every reset re-seeds push_settings with edge_url=null / enabled=false (by
# design, so a fresh stack is inert). This script re-points it at the locally
# served send-push Edge Function and starts that worker in the background, so
# the cron pump can drain push_outbox rows again. Nothing here is secret beyond
# what is already in supabase/functions/.env (gitignored).
#
# Usage (from the repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/push-local.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'supabase\functions\.env'

$line = Get-Content $envFile | Select-String '^SENSORIUM_PUSH_SECRET=' | Select-Object -First 1
if (-not $line) {
  Write-Host 'SENSORIUM_PUSH_SECRET not found in supabase/functions/.env' -ForegroundColor Red
  exit 1
}
$secret = $line.Line.Substring('SENSORIUM_PUSH_SECRET='.Length).Trim()

$base = (supabase status -o json | ConvertFrom-Json).API_URL
if (-not $base) { throw 'supabase stack is not running' }
$edgeUrl = 'http://host.docker.internal' + ($base -replace '^http://[^:]+(:\d+).*', '$1') + '/functions/v1/send-push'

Write-Host "Wiring push_settings -> $edgeUrl"
node -e "const {createClient}=require('@supabase/supabase-js');(async()=>{const a=createClient(process.argv[1],process.argv[2]);const r=await a.from('push_settings').update({edge_url:process.argv[3],secret:process.argv[4],enabled:true}).eq('id',true);if(r.error)throw r.error;console.log('push_settings enabled')})().catch(e=>{console.error(e.message);process.exit(1)})" $base (supabase status -o json | ConvertFrom-Json).SERVICE_ROLE_KEY $edgeUrl $secret

Write-Host 'Starting send-push worker (background)...'
$npmBin = Join-Path $env:APPDATA 'npm\supabase.cmd'
if (-not (Test-Path $npmBin)) { $npmBin = 'supabase' }
$worker = Start-Process -FilePath $npmBin -ArgumentList @(
  'functions', 'serve', 'send-push', '--env-file', "`"$envFile`""
) -WorkingDirectory $root -RedirectStandardOutput (Join-Path $root 'push-worker.log') -RedirectStandardError (Join-Path $root 'push-worker.err.log') -WindowStyle Hidden -PassThru
Write-Host "Worker PID $($worker.Id). Log: push-worker.log"

Write-Host 'Done. The cron pump will now drain push_outbox every minute.'
