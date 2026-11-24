import { useEffect, useState } from 'react'
import type { SceneId } from '../types'

type Stats = { median: number; p95: number; longFrames: number; transfer: number }

export function DebugHud({ sceneId }: { sceneId: SceneId }) {
  const [stats, setStats] = useState<Stats>({ median: 0, p95: 0, longFrames: 0, transfer: 0 })

  useEffect(() => {
    let animationFrame = 0
    let last = performance.now()
    let samples: number[] = []
    let lastReport = last

    const tick = (now: number) => {
      samples.push(now - last)
      last = now
      if (now - lastReport > 1000 && samples.length > 10) {
        const sorted = [...samples].sort((a, b) => a - b)
        const medianMs = sorted[Math.floor(sorted.length * 0.5)]
        const p95 = sorted[Math.floor(sorted.length * 0.95)]
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
        const transfer = resources.reduce((sum, entry) => sum + entry.transferSize, nav?.transferSize ?? 0)
        setStats({
          median: 1000 / medianMs,
          p95,
          longFrames: samples.filter((sample) => sample > 100).length,
          transfer: transfer / 1024 / 1024,
        })
        samples = []
        lastReport = now
      }
      animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [sceneId])

  return (
    <output className="debug-hud">
      <strong>QA · {sceneId}</strong>
      <span>median {stats.median.toFixed(1)} fps</span>
      <span>p95 {stats.p95.toFixed(1)} ms</span>
      <span>&gt;100 ms {stats.longFrames}</span>
      <span>transfer {stats.transfer.toFixed(2)} MB</span>
    </output>
  )
}
