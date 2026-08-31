import { useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type ConfirmDialogProps = {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/**
 * Asks before something that leaves Alcove.
 *
 * Windows only shows its own delete prompt when the user has turned that
 * setting on, which is off by default — so the one action that touches a real
 * file cannot rely on it.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  // The caller drops its subject the moment the dialog closes; keep the last
  // wording so the close animation does not play out on an empty box.
  const shown = useRef({ title, body, confirmLabel })
  if (open) shown.current = { title, body, confirmLabel }
  const text = shown.current
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>{text.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" autoFocus onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {text.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
