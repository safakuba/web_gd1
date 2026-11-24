import type { Group, Material, Mesh, Object3D, PerspectiveCamera, WebGLRenderer } from 'three'

export type SceneId =
  | 'stretch'
  | 'squash'
  | 'acceleration'
  | 'stillness'
  | 'loop'
  | 'disintegration'
  | 'aging'
  | 'layering'
  | 'echo'
  | 'fragmentation'
  | 'futures'
  | 'relativity'

export type EffectType = SceneId

export type OrbitLimits = {
  minPolarAngle: number
  maxPolarAngle: number
  minAzimuthAngle: number
  maxAzimuthAngle: number
  minDistance: number
  maxDistance: number
}

export type CameraPreset = {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

export type SceneDefinition = {
  id: SceneId
  index: string
  title: string
  description: string
  animationNote: string
  duration: number
  effect: EffectType
  camera: CameraPreset
  orbit: OrbitLimits
  accent: string
  preloadAssets?: string[]
}

export type WatchRuntime = {
  root: Group
  meshes: Mesh[]
  materials: Material[]
  initialTransforms: WeakMap<Object3D, { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }>
}

export type EffectContext = {
  renderer: WebGLRenderer
  camera: PerspectiveCamera
  runtime: WatchRuntime
}
