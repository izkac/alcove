/**
 * Self-check for drill-down breadcrumbs. Run: npm run check
 *
 * The trail is what tells the user which folder a drawer is showing, so the
 * cases that matter are the ones where it could lie: a path outside the root, a
 * trailing separator, a case-different drive letter, or a sibling folder whose
 * name merely starts with the root's.
 */
import assert from "node:assert/strict"
import { crumbTrail, parentWithin } from "./crumbs.ts"

const root = "C:\\Users\\me\\Downloads"

assert.deepEqual(crumbTrail(root, root), [{ name: "Downloads", path: root }])
assert.deepEqual(crumbTrail(root, `${root}\\`), [{ name: "Downloads", path: root }])

assert.deepEqual(
  crumbTrail(root, `${root}\\installers\\old`).map((crumb) => crumb.name),
  ["Downloads", "installers", "old"],
)
assert.equal(
  crumbTrail(root, `${root}\\installers\\old`)[1]?.path,
  `${root}\\installers`,
  "each crumb carries the path it navigates to",
)

assert.deepEqual(
  crumbTrail(root, "c:\\users\\me\\downloads\\installers").map((crumb) => crumb.name),
  ["Downloads", "installers"],
  "Windows paths that differ only in case are still inside the root",
)

assert.deepEqual(
  crumbTrail(root, "C:\\Windows\\System32").map((crumb) => crumb.name),
  ["Downloads"],
  "a path outside the root collapses to the root — never claim to show it",
)

assert.deepEqual(
  crumbTrail(root, "C:\\Users\\me\\Downloads2\\x").map((crumb) => crumb.name),
  ["Downloads"],
  "a sibling with a shared prefix is not a child",
)

assert.equal(parentWithin(root, `${root}\\installers\\old`), `${root}\\installers`)
assert.equal(parentWithin(root, `${root}\\installers`), root)
assert.equal(parentWithin(root, root), null, "Backspace stops at the drawer's own folder")

assert.deepEqual(
  crumbTrail("/home/me/dl", "/home/me/dl/zips").map((crumb) => crumb.name),
  ["dl", "zips"],
  "posix separators work too, for the browser mock",
)

console.log("crumbs.check ok")
