/**
 * Live-folder item layouts. Run: npm run check
 */
import assert from "node:assert/strict"
import {
  DEFAULT_FOLDER_SORT,
  fileTypeLabel,
  folderIconSize,
  folderViewFor,
  formatByteSize,
  formatModifiedAt,
  sortFolderItems,
  toggleFolderSort,
} from "./folder-view.ts"
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
  byteSize: 1536,
  modifiedAt: 1_700_000_000_000,
}
assert.equal(fileTypeLabel(zip), "ZIP")
assert.equal(
  fileTypeLabel({ ...zip, kind: "folder", extension: undefined, name: "Old" }),
  "Folder",
)

assert.equal(formatByteSize(undefined), "—")
assert.equal(formatByteSize(400), "400 bytes")
assert.equal(formatByteSize(1536), "1.5 KB")
assert.equal(formatByteSize(10 * 1024 * 1024), "10 MB")
assert.equal(formatModifiedAt(undefined), "—")
assert.notEqual(formatModifiedAt(zip.modifiedAt), "—")

const tiny: DesktopIcon = { ...zip, id: "a", name: "a.txt", byteSize: 10 }
const huge: DesktopIcon = { ...zip, id: "b", name: "b.bin", byteSize: 9_000_000 }
const bySize = sortFolderItems([tiny, huge], { column: "size", dir: "desc" })
assert.deepEqual(
  bySize.map((icon) => icon.id),
  ["b", "a"],
)

const flipped = toggleFolderSort(DEFAULT_FOLDER_SORT, "modified")
assert.equal(flipped.dir, "asc")
assert.equal(toggleFolderSort(DEFAULT_FOLDER_SORT, "name").column, "name")
assert.equal(toggleFolderSort(DEFAULT_FOLDER_SORT, "name").dir, "asc")

console.log("folder view: all checks passed")
