import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { tintStyle } from "@/lib/colors"
import type { SuggestedGroup } from "@/types"

type OnboardingDialogProps = {
  open: boolean
  groups: SuggestedGroup[]
  clutterCount: number
  onOrganize: (groups: SuggestedGroup[]) => void
  onStartEmpty: () => void
}

export function OnboardingDialog({
  open,
  groups,
  clutterCount,
  onOrganize,
  onStartEmpty,
}: OnboardingDialogProps) {
  const [draft, setDraft] = useState<SuggestedGroup[]>(groups)
  const enabled = useMemo(
    () => draft.filter((group) => group.enabled),
    [draft],
  )

  useEffect(() => {
    if (open) setDraft(groups)
  }, [open, groups])

  function mergeInto(sourceId: string, targetId: string) {
    setDraft((current) =>
      current.map((group) => {
        if (group.id === targetId) {
          const source = current.find((item) => item.id === sourceId)
          return {
            ...group,
            iconIds: [...group.iconIds, ...(source?.iconIds ?? [])],
          }
        }
        if (group.id === sourceId) {
          return { ...group, enabled: false, iconIds: [] }
        }
        return group
      }),
    )
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Give every icon a home</DialogTitle>
          <DialogDescription>
            {clutterCount} icons are sitting on a flat desktop. Alcove will
            scoop them into named spaces you can collapse when you need the
            wallpaper back.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {draft.map((group) => {
            if (!group.enabled) return null
            const others = enabled.filter((item) => item.id !== group.id)
            return (
              <div
                key={group.id}
                className="flex flex-col gap-2 rounded-xl border p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    style={tintStyle(group.color)}
                    className="tint-dot size-2.5 shrink-0 rounded-full"
                  />
                  <Input
                    value={group.name}
                    onChange={(event) =>
                      setDraft((current) =>
                        current.map((item) =>
                          item.id === group.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    aria-label="Alcove name"
                  />
                  <span className="w-8 text-right text-xs text-muted-foreground">
                    {group.iconIds.length}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {others.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Merge into</Label>
                      <Select onValueChange={(value) => mergeInto(group.id, value)}>
                        <SelectTrigger size="sm" className="w-40">
                          <SelectValue placeholder="Choose…" />
                        </SelectTrigger>
                        <SelectContent>
                          {others.map((other) => (
                            <SelectItem key={other.id} value={other.id}>
                              {other.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft((current) =>
                        current.map((item) =>
                          item.id === group.id
                            ? { ...item, enabled: false }
                            : item,
                        ),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onStartEmpty}>
            Start with an empty Inbox
          </Button>
          <Button onClick={() => onOrganize(draft)}>Organize desktop</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
