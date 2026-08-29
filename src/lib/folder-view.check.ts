/**
 * Live-folder item layouts. Run: npm run check
 */
import assert from "node:assert/strict"
import { fileTypeLabel, folderIconSize, folderViewFor } from "./folder-view.ts"
import type { DesktopIcon } from "../types.ts"

assert.equal(folderViewFor({}), "icons")
assert.equal(folderViewFor({ folderView: "list" }), "list")
assert.equal(folderViewFor({ folderView: "nope" }), "icons")

assert.equal(folderIconSize("icons", 52), 52)
assert.equal(folderIconSize("large", 52), 80)
assert.equal(folderIconSize("list", 52), 18)

const zip: DesktopIcon = {
  id: "z",
  name: "setup.zip",
  kind: "installer",
  extension: "zip",
  alcoveId: "downloads",
  groupHint: "installers",
}
assert.equal(fileTypeLabel(zip), "ZIP")
assert.equal(
  fileTypeLabel({ ...zip, kind: "folder", extension: undefined, name: "Old" }),
  "Folder",
)

console.log("folder view: all checks passed")
