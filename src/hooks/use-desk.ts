import { useCallback, useEffect, useState } from "react"
import {
  LOCAL_DESK,
  deskChannel,
  injectedDesk,
  type DeskChannelMessage,
  type DeskInfo,
} from "@/lib/desk-strip"
import { invoke, isTauri } from "@/lib/tauri"

export function useDesk() {
  const [desk, setDesk] = useState<DeskInfo>(() => injectedDesk() ?? LOCAL_DESK)
  const [desks, setDesks] = useState<DeskInfo[]>([LOCAL_DESK])
  const [stripHover, setStripHover] = useState(false)

  const refresh = useCallback(() => {
    if (!isTauri()) return
    invoke<DeskInfo>("this_desk").then(setDesk).catch(() => undefined)
    invoke<DeskInfo[]>("list_desks").then((list) => {
      if (list.length > 0) setDesks(list)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    refresh()
    if (!isTauri()) return
    const timer = window.setInterval(refresh, 2000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    const channel = deskChannel()
    if (!channel) return
    function onMessage(event: MessageEvent<DeskChannelMessage>) {
      const data = event.data
      if (data.type === "hover") {
        setStripHover(data.deskId === desk.id)
      }
    }
    channel.addEventListener("message", onMessage)
    return () => {
      channel.removeEventListener("message", onMessage)
      channel.close()
    }
  }, [desk.id])

  return { desk, desks, stripHover, refresh }
}
