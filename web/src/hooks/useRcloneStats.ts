import { useState, useEffect, useRef } from 'react'

export interface RcloneStats {
  speed: number        // bytes/s
  totalBytes: number
  bytes: number
  transfers: number    // active transfer count
  errors: number
}

// Polls core/stats every 2s when there are active tasks running
export const useRcloneStats = (active: boolean): RcloneStats | null => {
  const [stats, setStats] = useState<RcloneStats | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!active) {
      setStats(null)
      return
    }

    const poll = async () => {
      try {
        const res = await fetch('/api/rclone/core/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
        if (!res.ok) return
        const data = await res.json()
        setStats({
          speed:       data.speed       ?? 0,
          totalBytes:  data.totalBytes  ?? 0,
          bytes:       data.bytes       ?? 0,
          transfers:   data.transferring?.length ?? 0,
          errors:      data.errors      ?? 0
        })
      } catch { /* daemon may be offline */ }
    }

    poll()
    timerRef.current = setInterval(poll, 5000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [active])

  return stats
}
