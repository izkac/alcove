# e2e: clicking the desk must never pull it in front of an application.
#
# The desk is furniture. Windows raises whatever it activates, so a plain
# click used to throw the user's foreground app behind a full-screen window.
# The desk still takes focus -- it just must not change places with an app.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib-desk.ps1"

$proc = Get-AlcoveProcess
if (-not $proc) { Write-Error 'Alcove is not running'; exit 1 }
$desks = [Desk]::DeskWindows($proc.Id)
if ($desks.Count -eq 0) { Write-Error 'no desk window'; exit 1 }
$desk = $desks[0]

# Clear the screen so there is desk to click at all, then put a real app up.
$shell = New-Object -ComObject Shell.Application
$shell.MinimizeAll()
Start-Sleep -Milliseconds 1500
$np = Start-Process notepad.exe -PassThru
for ($i = 0; $i -lt 25 -and $np.MainWindowHandle -eq 0; $i++) { Start-Sleep -Milliseconds 200; $np.Refresh() }
$app = $np.MainWindowHandle
if ($app -eq 0) { Write-Error 'could not raise a test application'; exit 1 }
[void][Desk]::SetForegroundWindow($app)
Start-Sleep -Milliseconds 1200

$rect = New-Object Desk+RECT
[void][Desk]::GetWindowRect($app, [ref]$rect)
$zAppBefore  = [Desk]::ZIndex($app)
$zDeskBefore = [Desk]::ZIndex($desk)

# Find a pixel where the desk itself is on top, avoiding the app's rectangle.
$cx = -1; $cy = -1
for ($y = 120; $y -lt 1030 -and $cy -lt 0; $y += 40) {
    for ($x = 120; $x -lt 1900; $x += 40) {
        if ($x -ge $rect.L - 10 -and $x -le $rect.R + 10 -and $y -ge $rect.T - 10 -and $y -le $rect.B + 10) { continue }
        if ([Desk]::RootAt($x, $y) -eq $desk) { $cx = $x; $cy = $y; break }
    }
}
$failures = New-Object System.Collections.ArrayList
if ($cx -lt 0) {
    [void]$failures.Add('no visible desk pixel to click - the desk was not reachable')
} else {
    [Desk]::ClickAt($cx, $cy)
    Start-Sleep -Milliseconds 1500
    $zAppAfter  = [Desk]::ZIndex($app)
    $zDeskAfter = [Desk]::ZIndex($desk)
    $midOwner   = [Desk]::Cls([Desk]::RootAt((($rect.L + $rect.R) / 2), (($rect.T + $rect.B) / 2)))
    Write-Output ("clicked desk at ({0},{1})" -f $cx, $cy)
    Write-Output ("z before: app={0} desk={1}   z after: app={2} desk={3}" -f $zAppBefore, $zDeskBefore, $zAppAfter, $zDeskAfter)
    Write-Output ("the app's own middle now shows: {0}" -f $midOwner)
    if ($zDeskAfter -lt $zAppAfter) { [void]$failures.Add("the desk moved in front of the application (desk z=$zDeskAfter, app z=$zAppAfter)") }
    if ($midOwner -eq 'Tauri Window') { [void]$failures.Add('the desk is painted over the application') }
}

try { $np.CloseMainWindow() | Out-Null; if (-not $np.WaitForExit(3000)) { $np.Kill() } } catch {}
$shell.UndoMinimizeALL()

if ($failures.Count -gt 0) {
    Write-Output "FAIL:"
    $failures | ForEach-Object { Write-Output "  - $_" }
    exit 1
}
Write-Output 'PASS -- clicking the desk left every application where it was.'
exit 0
