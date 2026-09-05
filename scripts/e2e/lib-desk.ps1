# Shared Win32 helpers for the desk e2e scripts.
# Finds Explorer's desktop icon host and Alcove's desk windows, and reports the
# facts the Show Desktop check asserts on: owner, z-order, visibility and what
# is actually painted at the middle of the desk.

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class Desk {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="GetClassNameW")] static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="GetWindowTextW")] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="FindWindowExW", ExactSpelling=true)] static extern IntPtr FindWindowExW(IntPtr p, IntPtr c, string cls, string win);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);

  delegate bool EnumProc(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }

  public const int GWLP_HWNDPARENT = -8;

  public static string Cls(IntPtr h) {
    if (h == IntPtr.Zero) return "NULL";
    var sb = new StringBuilder(256); GetClassNameW(h, sb, 256); return sb.ToString();
  }

  public static string Title(IntPtr h) {
    var sb = new StringBuilder(256); GetWindowTextW(h, sb, 256); return sb.ToString();
  }

  /// The WorkerW (or Progman) that owns SHELLDLL_DefView -- the window Explorer
  /// raises for Show Desktop, and the one a desk window must be owned by.
  public static IntPtr IconHost() {
    IntPtr host = IntPtr.Zero;
    EnumWindows((h, l) => {
      string c = Cls(h);
      if ((c == "WorkerW" || c == "Progman") &&
          FindWindowExW(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) {
        RECT r; GetWindowRect(h, out r);
        if ((r.R - r.L) >= 800 && (r.B - r.T) >= 600) host = h;
      }
      return true;
    }, IntPtr.Zero);
    return host;
  }

  /// Alcove's desk windows: title "Alcove" (the bar and search windows are
  /// "Alcove Bar" and "Alcove Search") and covering most of a screen. Matching
  /// on size alone once picked the search overlay when it happened to sit
  /// higher in z-order.
  public static IntPtr[] DeskWindows(int pid) {
    var found = new List<IntPtr>();
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == (uint)pid && IsWindowVisible(h) && Title(h) == "Alcove") {
        RECT r; GetWindowRect(h, out r);
        if ((r.R - r.L) >= 800 && (r.B - r.T) >= 600) found.Add(h);
      }
      return true;
    }, IntPtr.Zero);
    return found.ToArray();
  }

  /// Index among visible top-level windows, 0 = frontmost.
  public static int ZIndex(IntPtr target) {
    if (target == IntPtr.Zero) return -1;
    int idx = -1, i = 0;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      if (h == target) { idx = i; return false; }
      i++; return true;
    }, IntPtr.Zero);
    return idx;
  }

  public static bool Cloaked(IntPtr h) { int v; return DwmGetWindowAttribute(h, 14, out v, 4) == 0 && v != 0; }

  /// The top-level window painted at a screen point, or Zero.
  public static IntPtr RootAt(int x, int y) {
    IntPtr at = WindowFromPoint(new POINT { X = x, Y = y });
    if (at == IntPtr.Zero) return IntPtr.Zero;
    IntPtr root = GetAncestor(at, 2);
    return root == IntPtr.Zero ? at : root;
  }

  /// A left click at a screen point, through the real input queue so the
  /// window sees exactly what a user's click looks like.
  public static void ClickAt(int x, int y) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(250);
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
  }

  /// What is actually painted at the middle of the window. "self" means the
  /// desk is on top there; anything else names the window covering it.
  public static string CenterOwner(IntPtr h) {
    RECT r; GetWindowRect(h, out r);
    var pt = new POINT { X = (r.L + r.R) / 2, Y = (r.T + r.B) / 2 };
    IntPtr at = WindowFromPoint(pt);
    IntPtr root = GetAncestor(at, 2);
    return root == h ? "self" : Cls(root);
  }
}
"@

function Get-AlcoveProcess {
    Get-Process alcove -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Get-DeskSample {
    param([IntPtr]$Desk, [IntPtr]$Host_)
    $owner = [Desk]::GetWindowLongPtr($Desk, [Desk]::GWLP_HWNDPARENT)
    [pscustomobject]@{
        iconic      = [Desk]::IsIconic($Desk)
        visible     = [Desk]::IsWindowVisible($Desk)
        cloaked     = [Desk]::Cloaked($Desk)
        owner       = ('0x{0:X}' -f $owner.ToInt64())
        ownerIsHost = ($owner -eq $Host_)
        zDesk       = [Desk]::ZIndex($Desk)
        zHost       = [Desk]::ZIndex($Host_)
        centerOwner = [Desk]::CenterOwner($Desk)
    }
}
