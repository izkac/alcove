# e2e step 1 (boot): start the built Alcove and wait until it has actually taken
# over the desktop. Fails loudly rather than letting later steps measure a
# window that never attached.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib-desk.ps1"

# ALCOVE_EXE overrides the build location. Needed when cargo has to write its
# target dir outside the project, and handy for checking a packaged build.
if ($env:ALCOVE_EXE -and (Test-Path $env:ALCOVE_EXE)) {
    $exe = (Resolve-Path $env:ALCOVE_EXE).Path
} else {
    $exe = Join-Path $PSScriptRoot '..\..\src-tauri\target\release\alcove.exe' | Resolve-Path -ErrorAction SilentlyContinue
}
if (-not $exe) { Write-Error 'release alcove.exe not built -- run cargo build --release in src-tauri, or set ALCOVE_EXE'; exit 1 }
Write-Output "using $exe"

# Clear the previous run's samples: the assert step must never be able to
# judge a file this run did not write.
$stale = Join-Path $env:TEMP 'alcove-e2e-showdesktop.json'
if (Test-Path $stale) { Remove-Item $stale -Force }

$state = Join-Path $env:TEMP 'alcove-e2e-state.json'
$existing = Get-AlcoveProcess
if ($existing) {
    Write-Output "Alcove already running (pid $($existing.Id)); leaving it alone."
    @{ startedByE2E = $false; pid = $existing.Id } | ConvertTo-Json | Set-Content $state -Encoding utf8
} else {
    $p = Start-Process -FilePath $exe -PassThru
    Write-Output "started Alcove pid $($p.Id)"
    @{ startedByE2E = $true; pid = $p.Id } | ConvertTo-Json | Set-Content $state -Encoding utf8
}

# Wait for a desk window that is both visible and owned by the icon host.
# Owned-by-host is the whole point of the change, so booting is not "done"
# until that is true.
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
    $proc = Get-AlcoveProcess
    if ($proc) {
        $hostWnd = [Desk]::IconHost()
        if ($hostWnd -ne [IntPtr]::Zero) {
            $desks = [Desk]::DeskWindows($proc.Id)
            if ($desks.Count -gt 0) {
                $owner = [Desk]::GetWindowLongPtr($desks[0], [Desk]::GWLP_HWNDPARENT)
                if ($owner -eq $hostWnd) {
                    Write-Output ("desk attached and owned by icon host 0x{0:X}" -f $hostWnd.ToInt64())
                    exit 0
                }
            }
        }
    }
    Start-Sleep -Milliseconds 500
}
Write-Error 'Alcove never attached a desk window owned by the desktop icon host within 45s'
exit 1
