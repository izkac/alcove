# e2e step 3 (assert): the desk must hold its place across Show Desktop.
# These are the invariants that were false before ownership: the desk used to
# be covered by the raised WorkerW and only clawed its way back with a topmost
# pulse, which is the flash this change removes.
$ErrorActionPreference = 'Stop'
$path = Join-Path $env:TEMP 'alcove-e2e-showdesktop.json'
if (-not (Test-Path $path)) { Write-Error "no samples at $path -- run desk-showdesktop.ps1 first"; exit 1 }
$data = Get-Content $path -Raw | ConvertFrom-Json

# A missing or short sample set must fail, not pass silently. Without this an
# empty file reports "PASS -- 0 samples", and a leftover file from an earlier
# green run would stand in for a produce step that actually failed.
$expected = 31
$count = @($data.samples).Count
if ($count -lt $expected) {
    Write-Output "FAIL -- expected $expected samples, got $count. The show-desktop step did not complete."
    exit 1
}
$stamp = [datetime]$data.capturedAt
$age = (Get-Date) - $stamp
if ($age.TotalMinutes -gt 10) {
    Write-Output ("FAIL -- samples are {0:N1} minutes old; this is a stale file, not this run." -f $age.TotalMinutes)
    exit 1
}

$failures = New-Object System.Collections.ArrayList
foreach ($s in $data.samples) {
    if ($s.iconic)        { [void]$failures.Add("$($s.phase): desk was minimized") }
    if (-not $s.visible)  { [void]$failures.Add("$($s.phase): desk was not visible") }
    if ($s.cloaked)       { [void]$failures.Add("$($s.phase): desk was cloaked") }
    if (-not $s.ownerIsHost) { [void]$failures.Add("$($s.phase): desk owner is $($s.owner), not the live icon host") }
    # The desktop being raised over the desk is exactly the cover that used to
    # force the pulse. Owned, it must never happen.
    if ($s.centerOwner -in @('WorkerW','Progman')) {
        [void]$failures.Add("$($s.phase): the desktop covered the desk (center shows $($s.centerOwner))")
    }
}

if ($failures.Count -gt 0) {
    Write-Output "FAIL -- $($failures.Count) violation(s):"
    $failures | ForEach-Object { Write-Output "  - $_" }
    exit 1
}
Write-Output "PASS -- $($data.samples.Count) samples across Show Desktop: desk never minimized, hidden, cloaked, disowned, or covered by the desktop."
exit 0
