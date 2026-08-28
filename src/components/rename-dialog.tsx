import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type RenameDialogProps = {
  open: boolean
  title: string
  value: string
  onOpenChange: (open: boolean) => void
  onSave: (value: string) => void
}

export function RenameDialog({
  open,
  title,
  value,
  onOpenChange,
  onSave,
}: RenameDialogProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim()) {
              onSave(draft)
              onOpenChange(false)
            }
          }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!draft.trim()}
            onClick={() => {
              onSave(draft)
              onOpenChange(false)
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
