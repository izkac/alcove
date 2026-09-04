import { crumbTrail } from "@/lib/crumbs"
import { cn } from "@/lib/utils"
import { ExternalLink } from "lucide-react"

type FolderCrumbsProps = {
  /** The drawer's own folder — the trail never goes above this. */
  root: string
  /** The folder being shown; equal to the root when not drilled in. */
  path?: string | null
  count?: number
  onCrumb?: (path: string) => void
  onOpenHere?: () => void
  className?: string
}

/**
 * Where a live-folder drawer currently is. At the root it reads as the plain
 * folder name it always did; drilled in it becomes the trail back out, plus the
 * escape hatch to Explorer that keeps this from pretending to be a file manager.
 */
export function FolderCrumbs({
  root,
  path,
  count,
  onCrumb,
  onOpenHere,
  className,
}: FolderCrumbsProps) {
  const trail = crumbTrail(root, path || root)
  return (
    <span
      className={cn("home-ink-faint flex min-w-0 items-center gap-1", className)}
      title={path || root}
    >
      {trail.map((crumb, index) => {
        const last = index === trail.length - 1
        return (
          <span key={crumb.path} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <span aria-hidden>/</span> : null}
            {last || !onCrumb ? (
              <span className={cn("truncate", last && "home-ink")}>{crumb.name}</span>
            ) : (
              <button
                type="button"
                className="truncate rounded outline-none hover:home-ink hover:underline focus-visible:outline-2 focus-visible:outline-sel"
                onClick={(event) => {
                  event.stopPropagation()
                  onCrumb(crumb.path)
                }}
              >
                {crumb.name}
              </button>
            )}
          </span>
        )
      })}
      {count === undefined ? null : (
        <span className="shrink-0">· {count} items</span>
      )}
      {onOpenHere ? (
        <button
          type="button"
          title="Open this folder in Explorer"
          aria-label="Open this folder in Explorer"
          className="shrink-0 rounded p-0.5 outline-none transition-colors duration-150 hover:bg-veil-hover hover:home-ink focus-visible:outline-2 focus-visible:outline-sel"
          onClick={(event) => {
            event.stopPropagation()
            onOpenHere()
          }}
        >
          <ExternalLink className="size-3" />
        </button>
      ) : null}
    </span>
  )
}
