Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Z {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct APPBARDATA { public int cbSize; public IntPtr hWnd; public uint uCallbackMessage; public uint uEdge; public RECT rc; public IntPtr lParam; }
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("shell32.dll")] public static extern IntPtr SHAppBarMessage(uint msg, ref APPBARDATA d);
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, out RECT r, uint c);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  public static string Cls(IntPtr h){ var s=new StringBuilder(128); GetClassName(h,s,128); return s.ToString(); }
  public static string Txt(IntPtr h){ var s=new StringBuilder(128); GetWindowText(h,s,128); return s.ToString(); }
}
"@
$d = New-Object Z+APPBARDATA; $d.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($d)
$state = [Z]::SHAppBarMessage(4, [ref]$d)
"taskbar ABM_GETSTATE = $state  (1=autohide, 2=alwaysontop)"
$wa = New-Object Z+RECT; [void][Z]::SystemParametersInfo(0x30, 0, [ref]$wa, 0)
"primary work area = $($wa.L),$($wa.T) - $($wa.R),$($wa.B)   screen = $([Z]::GetSystemMetrics(0))x$([Z]::GetSystemMetrics(1))"
"foreground = 0x{0:X}" -f [Z]::GetForegroundWindow().ToInt64()
""
$h = [Z]::GetTopWindow([IntPtr]::Zero); $i = 0
while ($h -ne [IntPtr]::Zero) {
  if ([Z]::IsWindowVisible($h)) {
    $r = New-Object Z+RECT; [void][Z]::GetWindowRect($h, [ref]$r)
    $ex = [Z]::GetWindowLongPtr($h, -20).ToInt64()
    $owner = [Z]::GetWindow($h, 4).ToInt64()
    $p = 0; [void][Z]::GetWindowThreadProcessId($h, [ref]$p)
    $name = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
    $w = $r.R - $r.L; $ht = $r.B - $r.T
    if ($w -gt 200 -or $name -match 'alcove|explorer') {
      "{0,3} 0x{1:X8} top={2} min={3} owner=0x{4:X} {5,5}x{6,-5} @{7},{8} [{9}] {10} '{11}'" -f $i, $h.ToInt64(), [int](($ex -band 8) -ne 0), [int][Z]::IsIconic($h), $owner, $w, $ht, $r.L, $r.T, $name, [Z]::Cls($h), [Z]::Txt($h)
    }
  }
  $h = [Z]::GetWindow($h, 2); $i++
}
