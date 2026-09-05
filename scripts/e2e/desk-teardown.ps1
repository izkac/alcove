# e2e cleanup: stop Alcove only if this run started it, and never by kill --
# a killed Alcove leaves Explorer's desktop icons hidden.
$ErrorActionPreference = 'Continue'
$state = Join-Path $env:TEMP 'alcove-e2e-state.json'
if (-not (Test-Path $state)) { Write-Output 'no e2e state; nothing to tear down'; exit 0 }
$s = Get-Content $state -Raw | ConvertFrom-Json
if (-not $s.startedByE2E) { Write-Output 'Alcove was already running before the e2e; left running'; exit 0 }
$p = Get-Process -Id $s.pid -ErrorAction SilentlyContinue
if (-not $p) { Write-Output 'Alcove already exited'; exit 0 }
$p.CloseMainWindow() | Out-Null
if (-not $p.WaitForExit(8000)) {
    Write-Output 'Alcove did not close on request; leaving it running rather than killing it (a kill hides the desktop icons)'
    exit 0
}
Write-Output 'Alcove closed cleanly'
