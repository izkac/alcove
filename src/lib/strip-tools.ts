export const STRIP_TOOL_CATEGORIES = [
  { id: "system", label: "System" },
  { id: "command", label: "Command" },
  { id: "folders", label: "Folders" },
  { id: "network", label: "Network" },
  { id: "developer", label: "Developer" },
] as const

export type StripToolCategory = (typeof STRIP_TOOL_CATEGORIES)[number]["id"]

export type StripTool = {
  id: string
  label: string
  category: StripToolCategory
  /** ShellExecute target. `%VAR%` is expanded on open. */
  launch: string
  args?: string
  /** Icon source when `launch` has none of its own: `file` or `file,index`. */
  icon?: string
  /** Drawn only when the icon source yields nothing (non-Windows, missing file). */
  glyph: string
}

/** Shown until the user picks a different set in Settings. */
export const DEFAULT_STRIP_TOOL_IDS = ["cmd", "control", "services"]

export const STRIP_TOOLS: StripTool[] = [
  {
    id: "control",
    label: "Control Panel",
    category: "system",
    launch: "%SystemRoot%\\System32\\control.exe",
    glyph: "sliders",
  },
  {
    id: "settings",
    label: "Windows Settings",
    category: "system",
    launch: "ms-settings:",
    icon: "%SystemRoot%\\ImmersiveControlPanel\\SystemSettings.exe",
    glyph: "settings",
  },
  {
    id: "services",
    label: "Services",
    category: "system",
    launch: "%SystemRoot%\\System32\\services.msc",
    icon: "%SystemRoot%\\System32\\filemgmt.dll",
    glyph: "cog",
  },
  {
    id: "taskmgr",
    label: "Task Manager",
    category: "system",
    launch: "%SystemRoot%\\System32\\Taskmgr.exe",
    glyph: "layout-list",
  },
  {
    id: "devmgmt",
    label: "Device Manager",
    category: "system",
    launch: "%SystemRoot%\\System32\\devmgmt.msc",
    icon: "%SystemRoot%\\System32\\devmgr.dll,5",
    glyph: "cpu",
  },
  {
    id: "eventvwr",
    label: "Event Viewer",
    category: "system",
    launch: "%SystemRoot%\\System32\\eventvwr.msc",
    icon: "%SystemRoot%\\System32\\eventvwr.exe",
    glyph: "scroll",
  },
  {
    id: "resmon",
    label: "Resource Monitor",
    category: "system",
    launch: "%SystemRoot%\\System32\\resmon.exe",
    glyph: "activity",
  },
  {
    id: "msinfo",
    label: "System Information",
    category: "system",
    launch: "%SystemRoot%\\System32\\msinfo32.exe",
    glyph: "info",
  },
  {
    id: "diskmgmt",
    label: "Disk Management",
    category: "system",
    launch: "%SystemRoot%\\System32\\diskmgmt.msc",
    icon: "%SystemRoot%\\System32\\dmdskres.dll",
    glyph: "hard-drive",
  },
  {
    id: "compmgmt",
    label: "Computer Management",
    category: "system",
    launch: "%SystemRoot%\\System32\\compmgmt.msc",
    icon: "%SystemRoot%\\System32\\mycomput.dll,2",
    glyph: "monitor",
  },
  {
    id: "taskschd",
    label: "Task Scheduler",
    category: "system",
    launch: "%SystemRoot%\\System32\\taskschd.msc",
    icon: "%SystemRoot%\\System32\\miguiresource.dll,1",
    glyph: "calendar",
  },
  {
    id: "cmd",
    label: "Command Prompt",
    category: "command",
    launch: "%SystemRoot%\\System32\\cmd.exe",
    glyph: "terminal",
  },
  {
    id: "powershell",
    label: "PowerShell",
    category: "command",
    launch: "%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    glyph: "terminal",
  },
  {
    id: "wt",
    label: "Windows Terminal",
    category: "command",
    launch: "wt.exe",
    glyph: "app-window",
  },
  {
    id: "notepad",
    label: "Notepad",
    category: "command",
    launch: "%SystemRoot%\\System32\\notepad.exe",
    glyph: "file-text",
  },
  {
    id: "this-pc",
    label: "This PC",
    category: "folders",
    launch: "shell:MyComputerFolder",
    glyph: "monitor",
  },
  {
    id: "profile",
    label: "User folder",
    category: "folders",
    launch: "shell:Profile",
    glyph: "user",
  },
  {
    id: "appdata",
    label: "AppData",
    category: "folders",
    launch: "shell:AppData",
    glyph: "folder",
  },
  {
    id: "localappdata",
    label: "Local AppData",
    category: "folders",
    launch: "shell:Local AppData",
    glyph: "folder-open",
  },
  {
    id: "temp",
    label: "Temp",
    category: "folders",
    launch: "%TEMP%",
    glyph: "folder",
  },
  {
    id: "startup",
    label: "Startup",
    category: "folders",
    launch: "shell:Startup",
    glyph: "rocket",
  },
  {
    id: "downloads",
    label: "Downloads",
    category: "folders",
    launch: "shell:Downloads",
    glyph: "download",
  },
  {
    id: "ncpa",
    label: "Network connections",
    category: "network",
    launch: "%SystemRoot%\\System32\\ncpa.cpl",
    glyph: "network",
  },
  {
    id: "firewall",
    label: "Windows Firewall",
    category: "network",
    launch: "%SystemRoot%\\System32\\wf.msc",
    icon: "%SystemRoot%\\System32\\FirewallControlPanel.dll",
    glyph: "shield",
  },
  {
    id: "env",
    label: "Environment variables",
    category: "developer",
    launch: "%SystemRoot%\\System32\\rundll32.exe",
    args: "sysdm.cpl,EditEnvironmentVariables",
    icon: "%SystemRoot%\\System32\\sysdm.cpl",
    glyph: "braces",
  },
  {
    id: "optionalfeatures",
    label: "Optional features",
    category: "developer",
    launch: "%SystemRoot%\\System32\\optionalfeatures.exe",
    glyph: "boxes",
  },
  {
    id: "developers",
    label: "Developer settings",
    category: "developer",
    launch: "ms-settings:developers",
    icon: "%SystemRoot%\\ImmersiveControlPanel\\SystemSettings.exe",
    glyph: "code",
  },
  {
    id: "regedit",
    label: "Registry Editor",
    category: "developer",
    launch: "%SystemRoot%\\regedit.exe",
    glyph: "database",
  },
  {
    id: "godmode",
    label: "All tasks",
    category: "developer",
    launch: "shell:::{ED7BA470-8E54-465E-825C-99712043E01C}",
    glyph: "layout-grid",
  },
]

const KNOWN_IDS = new Set(STRIP_TOOLS.map((tool) => tool.id))

/** Drops unknown ids. Missing / non-array values become the defaults. */
export function migrateStripToolIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [...DEFAULT_STRIP_TOOL_IDS]
  return uniqueKnown(ids)
}

export function uniqueKnown(ids: unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (typeof id !== "string" || !KNOWN_IDS.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Catalog order, so the left cluster stays still when the user toggles items. */
export function toolsForIds(ids: string[] | null | undefined): StripTool[] {
  const selected = new Set(Array.isArray(ids) ? ids : DEFAULT_STRIP_TOOL_IDS)
  return STRIP_TOOLS.filter((tool) => selected.has(tool.id))
}

export function toggleStripToolId(ids: string[], id: string): string[] {
  if (!KNOWN_IDS.has(id)) return ids
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}
