'use client'

import { useEffect, useState } from 'react'
import { recruitmentRpc } from '@/components/team-link/recruitment'

export function useProjectLeadership(projectId?: string, userId?: string) {
  const key = projectId && userId ? projectId + ':' + userId : undefined
  const [verifiedKey, setVerifiedKey] = useState<string>()

  useEffect(() => {
    if (!projectId || !key) return
    let active = true
    void recruitmentRpc<boolean>('is_project_leader', { p_project_id: projectId })
      .then((allowed) => { if (active) setVerifiedKey(allowed ? key : undefined) })
      .catch(() => { if (active) setVerifiedKey(undefined) })
    return () => { active = false }
  }, [projectId, key])

  return Boolean(key && verifiedKey === key)
}
