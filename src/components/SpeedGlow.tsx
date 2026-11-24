import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, MathUtils, Mesh, MeshBasicMaterial, ShaderMaterial } from 'three'

const colors = ['#27e6ff', '#f953bd', '#54f59b']

// Sparse early hits lead into overlapping holds around the authored glitch peak.
const hits = [
  [2.04, 3.53, 4.82], [2.83, 3.92], [2.55, 3.78, 5.07],
  [3.13, 4.22], [2.33, 3.66, 4.96], [3.01, 4.12, 5.24],
]
const fillShare = 0.6
const edgeShare = 1 - fillShare

function bandEnvelope(time: number, group: number, copy: number) {
  let level = 0
  for (const [i, start] of hits[group].entries()) {
    const age = time - start - copy * (0.09 + group % 3 * 0.035)
    const hold = 0.2 + ((group + i * 3 + copy) % 5) * 0.05
    const attack = MathUtils.smoothstep(age, 0, 0.10)
    const release = 1 - MathUtils.smoothstep(age, 0.10 + hold, 0.26 + hold)
    level = Math.max(level, attack * release)
  }
  return level
}

// The export cuts the planar LCD into strips perpendicular to local X.
// Shading the cut on the original triangles follows even the tapered ends.
const vertexShader = `
  varying float localX;
  void main() {
    localX = position.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`
const fragmentShader = `
  varying float localX;
  uniform float cutX;
  uniform float strength;
  uniform vec3 tint;
  void main() {
    float d = abs(localX - cutX);
    float aa = clamp(fwidth(localX), 0.0001, 0.004);
    float core = 1. - smoothstep(0.001, 0.002 + aa, d);
    float halo = 0.19 * exp(-d / 0.0035);
    if (d > 0.018) discard;
    gl_FragColor = vec4(tint, (core + halo) * strength);
    #include <colorspace_fragment>
  }
`

export function SpeedGlow({ meshes, elapsed }: { meshes: Mesh[]; elapsed: RefObject<number> }) {
  const edges = useRef<{ overlay: Mesh; shader: ShaderMaterial; index: number }[]>([])
  const bands = useRef<{ source: Mesh; overlay: Mesh; material: MeshBasicMaterial; group: number; copy: number }[]>([])
  useLayoutEffect(() => {
    const hidden = meshes.filter(mesh => /^RGB_/.test(mesh.name) && mesh.visible)
    hidden.forEach(mesh => { mesh.visible = false })
    for (const source of hidden) {
      const match = /^RGB_(\d+)_(\d+)_/.exec(source.name)
      if (!match || !source.parent) continue
      const group = Math.floor(Number(match[1]) / 4)
      const copy = Number(match[2])
      const original = Array.isArray(source.material) ? source.material[0] : source.material
      const color = original.name.includes('Green') ? colors[2] : original.name.includes('Magenta') ? colors[1] : colors[0]
      const material = new MeshBasicMaterial({
        color: new Color(color).multiplyScalar(5), blending: AdditiveBlending,
        transparent: true, opacity: 0, depthWrite: false, side: DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      })
      const overlay = new Mesh(source.geometry, material)
      source.parent.add(overlay)
      bands.current.push({ source, overlay, material, group, copy })
    }
    for (const mesh of meshes) {
      const match = /^Slice_(\d+)_Displej$/.exec(mesh.name)
      if (!match) continue
      const index = Number(match[1])
      mesh.geometry.computeBoundingBox()
      const shader = new ShaderMaterial({
        vertexShader, fragmentShader,
        uniforms: {
          cutX: { value: mesh.geometry.boundingBox!.min.x },
          tint: { value: new Color(colors[index % colors.length]) },
          strength: { value: 0 },
        },
        transparent: true, blending: AdditiveBlending, depthWrite: false,
        side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      })
      const overlay = new Mesh(mesh.geometry, shader)
      overlay.renderOrder = 1
      mesh.add(overlay)
      edges.current.push({ overlay, shader, index })
    }
    return () => {
      for (const { overlay, shader } of edges.current) {
        overlay.removeFromParent()
        shader.dispose()
      }
      for (const { overlay, material } of bands.current) {
        overlay.removeFromParent()
        material.dispose()
      }
      bands.current = []
      edges.current = []
      hidden.forEach(mesh => { mesh.visible = true })
    }
  }, [meshes])

  useFrame(() => {
    const seconds = elapsed.current % 6
    for (const { source, overlay, material, group, copy } of bands.current) {
      const level = bandEnvelope(seconds, group, copy)
      overlay.visible = level > 0
      overlay.position.copy(source.position)
      overlay.quaternion.copy(source.quaternion)
      material.opacity = fillShare * level
    }
    const envelope = MathUtils.smoothstep(seconds, 1.5, 3.45) * (1 - MathUtils.smoothstep(seconds, 4.65, 6))
    const front = 7 + 10 * MathUtils.smoothstep(seconds, 2.1, 5.25)
    for (const { shader, index } of edges.current) {
      const distance = (index - front) / 3.3
      shader.uniforms.strength.value = edgeShare * 2.5 * envelope * (0.15 + 0.72 * Math.exp(-0.5 * distance * distance))
    }
  })
  return null
}
