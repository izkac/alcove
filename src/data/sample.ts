import type { AlcoveColor, DesktopIcon } from "@/types"

type SampleIcon = Omit<DesktopIcon, "alcoveId">

export const INBOX_ID = "inbox"

const SAMPLE_FILES: SampleIcon[] = [
  { id: "chrome", name: "Google Chrome", kind: "app", groupHint: "apps" },
  { id: "vscode", name: "Visual Studio Code", kind: "app", groupHint: "apps" },
  { id: "slack", name: "Slack", kind: "app", groupHint: "apps" },
  { id: "spotify", name: "Spotify", kind: "app", groupHint: "apps" },
  { id: "steam", name: "Steam", kind: "app", groupHint: "apps" },
  { id: "notepad", name: "Notepad", kind: "app", groupHint: "apps" },
  { id: "discord", name: "Discord", kind: "app", groupHint: "apps" },
  { id: "figma", name: "Figma", kind: "app", groupHint: "apps" },
  {
    id: "proposal",
    name: "Proposal.pdf",
    kind: "document",
    extension: "pdf",
    groupHint: "client-a",
  },
  {
    id: "contract",
    name: "Contract.docx",
    kind: "document",
    extension: "docx",
    groupHint: "client-a",
  },
  {
    id: "timeline",
    name: "Timeline.xlsx",
    kind: "document",
    extension: "xlsx",
    groupHint: "client-a",
  },
  {
    id: "budget",
    name: "Q3 budget.xlsx",
    kind: "document",
    extension: "xlsx",
    groupHint: "documents",
  },
  {
    id: "notes",
    name: "Meeting notes.docx",
    kind: "document",
    extension: "docx",
    groupHint: "documents",
  },
  {
    id: "readme",
    name: "README.txt",
    kind: "document",
    extension: "txt",
    groupHint: "documents",
  },
  {
    id: "invoice",
    name: "Invoice-April.pdf",
    kind: "document",
    extension: "pdf",
    groupHint: "documents",
  },
  {
    id: "spec",
    name: "Spec.md",
    kind: "document",
    extension: "md",
    groupHint: "documents",
  },
  {
    id: "roadmap",
    name: "Roadmap.pptx",
    kind: "document",
    extension: "pptx",
    groupHint: "documents",
  },
  {
    id: "tax",
    name: "Tax-2025.pdf",
    kind: "document",
    extension: "pdf",
    groupHint: "documents",
  },
  {
    id: "vacation",
    name: "vacation.jpg",
    kind: "image",
    extension: "jpg",
    groupHint: "photos",
  },
  {
    id: "dsc",
    name: "DSC_1042.jpg",
    kind: "image",
    extension: "jpg",
    groupHint: "photos",
  },
  {
    id: "family",
    name: "family.png",
    kind: "image",
    extension: "png",
    groupHint: "photos",
  },
  {
    id: "sunset",
    name: "sunset.webp",
    kind: "image",
    extension: "webp",
    groupHint: "photos",
  },
  { id: "projects", name: "Projects", kind: "folder", groupHint: "folders" },
  { id: "archive", name: "Archive", kind: "folder", groupHint: "folders" },
  { id: "camera", name: "Camera Roll", kind: "folder", groupHint: "folders" },
  { id: "workfiles", name: "Work files", kind: "folder", groupHint: "folders" },
  {
    id: "chrome-setup",
    name: "ChromeSetup.exe",
    kind: "installer",
    extension: "exe",
    groupHint: "installers",
  },
  {
    id: "node-msi",
    name: "node-v22.msi",
    kind: "installer",
    extension: "msi",
    groupHint: "installers",
  },
  {
    id: "alcove-zip",
    name: "alcove-setup.zip",
    kind: "installer",
    extension: "zip",
    groupHint: "installers",
  },
  {
    id: "steam-setup",
    name: "SteamSetup.exe",
    kind: "installer",
    extension: "exe",
    groupHint: "installers",
  },
  {
    id: "git-setup",
    name: "Git-64-bit.exe",
    kind: "installer",
    extension: "exe",
    groupHint: "installers",
  },
  {
    id: "docker",
    name: "Docker Desktop",
    kind: "shortcut",
    groupHint: "shortcuts",
  },
  {
    id: "terminal",
    name: "Windows Terminal",
    kind: "shortcut",
    groupHint: "shortcuts",
  },
  {
    id: "control",
    name: "Control Panel",
    kind: "shortcut",
    groupHint: "shortcuts",
  },
]

/**
 * Weights for the mock. On Windows these come from the file on disk; apps,
 * shortcuts and folders stay unsized there too, so they stay unsized here.
 */
const MOCK_BYTE_SIZES: Record<string, number> = {
  proposal: 2_400_000,
  contract: 84_000,
  timeline: 320_000,
  budget: 512_000,
  notes: 46_000,
  readme: 2_100,
  invoice: 240_000,
  spec: 18_000,
  roadmap: 6_800_000,
  tax: 1_200_000,
  vacation: 4_600_000,
  dsc: 8_900_000,
  family: 2_300_000,
  sunset: 1_400_000,
  "chrome-setup": 96_000_000,
  "node-msi": 78_000_000,
  "alcove-zip": 12_000_000,
  "steam-setup": 2_800_000,
  "git-setup": 68_000_000,
}

export const SAMPLE_ICONS: SampleIcon[] = SAMPLE_FILES.map((icon) => {
  const byteSize = MOCK_BYTE_SIZES[icon.id]
  return byteSize ? { ...icon, byteSize } : icon
})

export const SUGGESTED_GROUP_META: {
  id: string
  name: string
  color: AlcoveColor
}[] = [
  { id: "apps", name: "Apps", color: "sky" },
  { id: "client-a", name: "Client A", color: "violet" },
  { id: "documents", name: "Documents", color: "amber" },
  { id: "photos", name: "Photos", color: "rose" },
  { id: "folders", name: "Folders", color: "emerald" },
  { id: "installers", name: "Installers", color: "slate" },
  { id: "shortcuts", name: "Shortcuts", color: "sky" },
]

export const DEFAULT_PIN_IDS = ["chrome", "vscode", "terminal", "budget"]

export const INCOMING_FILES: Omit<DesktopIcon, "id" | "alcoveId">[] = [
  {
    name: "Screenshot 2026-08-28.png",
    kind: "image",
    extension: "png",
    groupHint: "photos",
  },
  {
    name: "Notes from call.docx",
    kind: "document",
    extension: "docx",
    groupHint: "documents",
  },
  {
    name: "installer-delta.zip",
    kind: "installer",
    extension: "zip",
    groupHint: "installers",
  },
  {
    name: "Offer letter.pdf",
    kind: "document",
    extension: "pdf",
    groupHint: "client-a",
  },
]
