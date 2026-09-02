/**
 * Self-check for the in-app wallpaper picker. Run: npm run check
 */
import assert from "node:assert/strict"
import {
  isPicture,
  picturesIn,
  preferPictureFolders,
  PICTURE_CAP,
} from "./wallpaper-pictures.ts"
import type { HarvestedIcon } from "./harvest-merge.ts"

assert.equal(isPicture({ kind: "image" }), true)
assert.equal(isPicture({ kind: "document", extension: "jfif" }), true)
assert.equal(isPicture({ kind: "document", path: "C:\\shot.PNG" }), true)
assert.equal(isPicture({ kind: "app", extension: "exe" }), false)

function icon(name: string, kind: string, ext: string): HarvestedIcon {
  return {
    id: name,
    name,
    kind,
    extension: ext,
    groupHint: "photos",
    path: `C:\\${name}`,
    imageUrl: "",
  }
}

const mixed = [
  icon("notes.txt", "document", "txt"),
  icon("a.jpg", "image", "jpg"),
  icon("b.png", "image", "png"),
]
assert.deepEqual(
  picturesIn(mixed).map((item) => item.name),
  ["a.jpg", "b.png"],
)

const many = Array.from({ length: PICTURE_CAP + 10 }, (_, n) =>
  icon(`p${n}.jpg`, "image", "jpg"),
)
assert.equal(picturesIn(many).length, PICTURE_CAP)

assert.deepEqual(
  preferPictureFolders([
    { id: "downloads", name: "Downloads", path: "D" },
    { id: "pictures", name: "Pictures", path: "P" },
    { id: "desktop", name: "Desktop", path: "C" },
  ]).map((folder) => folder.id),
  ["pictures", "desktop", "downloads"],
)

console.log("wallpaper-pictures check ok")
