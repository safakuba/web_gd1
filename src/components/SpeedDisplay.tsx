import { useFrame, useLoader } from '@react-three/fiber'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { CanvasTexture, LinearFilter, Mesh, MeshStandardMaterial, SRGBColorSpace, TextureLoader } from 'three'

// Digit coordinates follow the original 2439 × 2864 atlas. The baked crop
// retains the original colon, date, scratches and LCD grain.
const slots = [790, 940, 1129, 1281]
const digits = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg']
const horizontal = [[4,0], [73,0], [85,8], [73,23], [15,23], [0,7]]
const vertical = [[12,0], [23,12], [23,77], [12,90], [0,77], [0,15]]
const segments = [
  ['a',8,0,horizontal], ['b',80,8,vertical], ['c',80,103,vertical],
  ['d',8,179,horizontal], ['e',0,103,vertical], ['f',0,8,vertical], ['g',8,89,horizontal],
] as const

export function SpeedDisplay({ meshes, elapsed }: { meshes: Mesh[]; elapsed: RefObject<number> }) {
  const background = useLoader(TextureLoader, './assets/textures/speed-lcd.webp')
  const redraw = useRef<((minutes: number) => void) | null>(null)
  useLayoutEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 944
    canvas.height = 528
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const texture = new CanvasTexture(canvas)
    texture.flipY = false
    texture.colorSpace = SRGBColorSpace
    texture.generateMipmaps = false
    texture.minFilter = LinearFilter
    texture.repeat.set(2439 / canvas.width, 2864 / canvas.height)
    texture.offset.set(-736 / canvas.width, -864 / canvas.height)
    const materials = meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .filter((m): m is MeshStandardMaterial => m instanceof MeshStandardMaterial && m.name === 'Material.008')
    const originals = materials.map(m => ({ map: m.emissiveMap, intensity: m.emissiveIntensity }))
    for (const m of materials) {
      m.emissiveMap = texture
      m.emissiveIntensity = 0.95
      m.needsUpdate = true
    }
    let last = -1
    const draw = (minutes: number) => {
      if (last === minutes) return
      last = minutes
      ctx.drawImage(background.image, 0, 0)
      const time = String(Math.floor(minutes / 60)).padStart(2, '0') + String(minutes % 60).padStart(2, '0')
      ctx.fillStyle = 'rgba(12,25,28,0.86)'
      for (let i = 0; i < slots.length; i++) {
        for (const [name, dx, dy, points] of segments) {
          if (!digits[Number(time[i])].includes(name)) continue
          ctx.beginPath()
          points.forEach(([x,y], index) => {
            const px = slots[i] - 736 + dx + x
            const py = 1110 - 864 + dy + y
            if (index === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          })
          ctx.closePath()
          ctx.fill()
        }
      }
      texture.needsUpdate = true
    }
    draw(715)
    redraw.current = draw
    return () => {
      redraw.current = null
      materials.forEach((m,i) => {
        m.emissiveMap = originals[i].map
        m.emissiveIntensity = originals[i].intensity
        m.needsUpdate = true
      })
      texture.dispose()
    }
  }, [background, meshes])
  useFrame(() => {
    const phase = (elapsed.current % 6) / 6
    redraw.current?.((715 + Math.floor(1440 * phase ** 3)) % 1440)
  })
  return null
}
