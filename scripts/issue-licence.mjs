/**
 * Issue an Alcove licence key.
 *
 *   node scripts/issue-licence.mjs "Ada Lovelace" 12
 *
 * Signs `<name>|<expires-unix>` with the licence key at
 * %USERPROFILE%\.tauri\alcove-licence.key and prints the key to paste into
 * Settings. Offline both ends: nothing to run, nothing to go down.
 *
 * The licence buys the update stream for that many months. When it lapses the
 * installed Alcove keeps working forever — it just stops being offered newer
 * versions, so there is nothing to revoke and no reason to phone home.
 */
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const [name, months = "12"] = process.argv.slice(2)
if (!name) {
  console.error('usage: node scripts/issue-licence.mjs "<name or email>" [months]')
  process.exit(1)
}

const keyPath =
  process.env.ALCOVE_LICENCE_KEY ??
  join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".tauri", "alcove-licence.key")

const expires = Math.floor(Date.now() / 1000) + Number(months) * 30 * 24 * 60 * 60
const payload = `${name}|${expires}`

const dir = mkdtempSync(join(tmpdir(), "alcove-licence-"))
const file = join(dir, "licence")
try {
  writeFileSync(file, payload, "utf8")
  // The Tauri CLI already knows this key format; no second signing tool to own.
  // Run its entry point under this node, not `npx` — node refuses to spawn a
  // .cmd shim without a shell, and a shell here would eat the quoting.
  const cliDir = dirname(
    createRequire(import.meta.url).resolve("@tauri-apps/cli/package.json"),
  )
  const tauriCli = join(cliDir, "tauri.js")
  execFileSync(
    process.execPath,
    [tauriCli, "signer", "sign", "-f", keyPath, "-p", "", file],
    { stdio: ["ignore", "pipe", "inherit"] },
  )
  // The .sig file is already base64 of the minisign text — do not encode twice.
  const signature = readFileSync(`${file}.sig`, "utf8").trim()
  const key = `${Buffer.from(payload).toString("base64")}.${signature}`
  console.log(`\nLicence for ${name}, updates until ${new Date(expires * 1000).toISOString().slice(0, 10)}:\n`)
  console.log(key)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
