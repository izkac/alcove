import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { DesktopShell } from "@/components/desktop-shell"
import { useAlcoveDesktop } from "@/hooks/use-alcove-desktop"

function App() {
  const desktop = useAlcoveDesktop()
  return (
    <TooltipProvider>
      <DesktopShell desktop={desktop} />
      <Toaster theme="dark" position="top-right" />
    </TooltipProvider>
  )
}

export default App
