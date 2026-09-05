# e2e step 2 (produce): drive the real Show Desktop the way Win+D does, and
# sample the desk window densely across the transition so a flash cannot hide
# between samples. Writes the samples for the assert step to judge.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib-desk.ps1"

$proc = Get-AlcoveProcess
if (-not $proc) { Write-Error 'Alcove is not running'; exit 1 }
$hostWnd = [Desk]::IconHost()
if ($hostWnd -eq [IntPtr]::Zero) { Write-Error 'no desktop icon host found'; exit 1 }
$desks = [Desk]::DeskWindows($proc.Id)
if ($desks.Count -eq 0) { Write-Error 'no desk window found'; exit 1 }
$desk = $desks[0]

$samples = New-Object System.Collections.ArrayList
function Sample($phase) {
    # Re-read the icon host every sample. Show Desktop moves SHELLDLL_DefView
    # into a WorkerW it creates on the spot, so the window the desk must be
    # owned by legitimately changes mid-gesture; comparing against a snapshot
    # taken before the gesture reports a fault that is not one.
    $live = [Desk]::IconHost()
    if ($live -eq [IntPtr]::Zero) { $live = $hostWnd }
    $s = Get-DeskSample -Desk $desk -Host_ $live
    $s | Add-Member -NotePropertyName phase -NotePropertyValue $phase
    [void]$samples.Add($s)
}

$shell = New-Object -ComObject Shell.Application
Sample 'before'
$shell.ToggleDesktop()
# 20 samples over ~2s: the old topmost pulse and the WebView repaint that
# followed it both land well inside this window.
for ($i = 1; $i -le 20; $i++) { Start-Sleep -Milliseconds 100; Sample "showdesktop+$($i*100)ms" }
$shell.ToggleDesktop()
for ($i = 1; $i -le 10; $i++) { Start-Sleep -Milliseconds 100; Sample "restore+$($i*100)ms" }

$out = Join-Path $env:TEMP 'alcove-e2e-showdesktop.json'
@{
    capturedAt = (Get-Date).ToString('o')
    deskHwnd   = ('0x{0:X}' -f $desk.ToInt64())
    hostHwnd   = ('0x{0:X}' -f $hostWnd.ToInt64())
    samples    = $samples
} | ConvertTo-Json -Depth 5 | Set-Content $out -Encoding utf8
Write-Output "wrote $out ($($samples.Count) samples)"
$samples | Format-Table phase,iconic,visible,ownerIsHost,zDesk,zHost,centerOwner -AutoSize | Out-String -Width 200
