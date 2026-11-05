"use client"

import { useEffect } from "react"
import { getSupabaseClient } from "@/lib/supabase/client"

export function useProjectChatRead(userId: string | undefined, conversationId: string | undefined, through: string | undefined, onRead: () => void) {
  useEffect(() => {
    if (!userId || !conversationId || !through) return
    let active = true
    const mark = async () => {
      if (document.hidden) return
      const { error } = await getSupabaseClient().from("project_conversation_members")
        .update({ last_read_at: through })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .or(`last_read_at.is.null,last_read_at.lt.${through}`)
      if (active && !error) onRead()
    }
    void mark()
    document.addEventListener("visibilitychange", mark)
    return () => {
      active = false
      document.removeEventListener("visibilitychange", mark)
    }
  }, [conversationId, onRead, through, userId])
}
