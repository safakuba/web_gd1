import { SpeedGlow } from './SpeedGlow'
import { SpeedDisplay } from './SpeedDisplay'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useAnimations } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  AdditiveBlending,
  AnimationClip,
  AnimationMixer,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  FrontSide,
  Light,
  LoopRepeat,
  MathUtils,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  Points,
  SRGBColorSpace,
  ShaderMaterial,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { SceneDefinition, SceneId } from '../types'

export const MODEL_URL = './assets/models/watch_base.glb'
export const INFLATE_MODEL_URL = './assets/models/watch_inflate.fullframe.optimized.glb'
export const SQUASH_MODEL_URL = './assets/models/watch_squash.glb'
export const CYCLE_MODEL_URL = './assets/models/watch_cycle.glb'
export const RUST_MODEL_URL = './assets/models/watch_rust_fixed.glb'
export const ECHO_MODEL_URL = './assets/models/watch_echo_master.animated.glb'
export const FUTURE_MODEL_URL = './assets/models/watch_future.glb'
export const SPEED_MODEL_URL = './assets/models/watch_speed.optimized.glb'
const FREEZE_MODEL_URL = './assets/models/watch_freeze.glb?v=morph-2'
export const PRESENCE_MODEL_URL = './assets/models/watch_presence.glb'
export const WORLD_TIME_MODEL_URL = './assets/models/watch_worldtime.glb'

const AUTHORED_MODELS: Partial<Record<SceneId, string>> = {
  stretch: INFLATE_MODEL_URL,
  squash: SQUASH_MODEL_URL,
  acceleration: SPEED_MODEL_URL,
  stillness: FREEZE_MODEL_URL,
  loop: CYCLE_MODEL_URL,
  aging: RUST_MODEL_URL,
  disintegration: PRESENCE_MODEL_URL,
  layering: WORLD_TIME_MODEL_URL,
  echo: ECHO_MODEL_URL,
  futures: FUTURE_MODEL_URL,
}

export const modelUrlForScene = (sceneId: SceneId) => AUTHORED_MODELS[sceneId] ?? MODEL_URL

type InitialTransform = {
  position: Vector3
  rotation: [number, number, number]
  scale: Vector3
}

const easeInOut = (value: number) => value * value * (3 - 2 * value)
const pulse = (value: number) => 0.5 - 0.5 * Math.cos(value * Math.PI * 2)
const hash = (value: string) => [...value].reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 17)

const draco = new DRACOLoader()
  .setDecoderPath(import.meta.env.VITE_DRACO_PATH || 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  .setWorkerLimit(2)

export function useWatchAsset(modelUrl: string) {
  const asset = useLoader(GLTFLoader, modelUrl, (loader) => {
    loader.setDRACOLoader(draco)
    loader.setMeshoptDecoder(MeshoptDecoder)
  })
  useEffect(() => retainAsset(modelUrl, asset.scene), [asset.scene, modelUrl])
  return asset
}

type RetainedAsset = { count: number; scene: Object3D; releaseTimer?: number }
const retainedAssets = new Map<string, RetainedAsset>()

function disposeSourceScene(root: Object3D) {
  const textures = new Set<{ dispose: () => void }>()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value && typeof value === 'object' && 'isTexture' in value && 'dispose' in value) {
          textures.add(value as { dispose: () => void })
        }
      })
      material.dispose()
    })
  })
  textures.forEach((texture) => texture.dispose())
}

function retainAsset(url: string, scene: Object3D) {
  const current = retainedAssets.get(url) ?? { count: 0, scene }
  if (current.releaseTimer) window.clearTimeout(current.releaseTimer)
  current.count += 1
  current.scene = scene
  current.releaseTimer = undefined
  retainedAssets.set(url, current)
  return () => {
    const retained = retainedAssets.get(url)
    if (!retained) return
    retained.count = Math.max(0, retained.count - 1)
    if (retained.count > 0) return
    retained.releaseTimer = window.setTimeout(() => {
      const latest = retainedAssets.get(url)
      if (!latest || latest.count > 0) return
      disposeSourceScene(latest.scene)
      useLoader.clear(GLTFLoader, url)
      retainedAssets.delete(url)
    }, 1500)
  }
}

function makeParticleGeometry(root: Object3D, limit: number) {
  root.updateMatrixWorld(true)
  const source: number[] = []
  const sourceNormals: number[] = []
  const sourceColors: number[] = []
  const world = new Vector3()
  const worldNormal = new Vector3()
  let totalVertices = 0
  root.traverse((object) => {
    if (object instanceof Mesh) totalVertices += object.geometry.getAttribute('position')?.count ?? 0
  })
  const stride = Math.max(1, Math.ceil(totalVertices / limit))
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const position = object.geometry.getAttribute('position')
    const normal = object.geometry.getAttribute('normal')
    if (!position) return
    const firstMaterial = (Array.isArray(object.material) ? object.material[0] : object.material) as MeshStandardMaterial
    const sourceColor = firstMaterial instanceof MeshStandardMaterial ? firstMaterial.color : new Color('#8f989f')
    for (let index = 0; index < position.count; index += stride) {
      world.fromBufferAttribute(position as BufferAttribute, index).applyMatrix4(object.matrixWorld)
      source.push(world.x, world.y, world.z)
      if (normal) worldNormal.fromBufferAttribute(normal as BufferAttribute, index).transformDirection(object.matrixWorld)
      else worldNormal.set(0, 1, 0)
      sourceNormals.push(worldNormal.x, worldNormal.y, worldNormal.z)
      sourceColors.push(sourceColor.r, sourceColor.g, sourceColor.b)
    }
  })

  const count = Math.min(limit, Math.floor(source.length / 3))
  const positions = new Float32Array(count * 3)
  const directions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = source[index * 3]
    positions[index * 3 + 1] = source[index * 3 + 1]
    positions[index * 3 + 2] = source[index * 3 + 2]
    normals[index * 3] = sourceNormals[index * 3]
    normals[index * 3 + 1] = sourceNormals[index * 3 + 1]
    normals[index * 3 + 2] = sourceNormals[index * 3 + 2]
    colors[index * 3] = sourceColors[index * 3]
    colors[index * 3 + 1] = sourceColors[index * 3 + 1]
    colors[index * 3 + 2] = sourceColors[index * 3 + 2]
    const seed = ((index * 47) % 211) / 211
    const angle = index * 2.399963
    directions[index * 3] = sourceNormals[index * 3] * 0.38 + Math.cos(angle) * 0.34
    directions[index * 3 + 1] = sourceNormals[index * 3 + 1] * 0.18 + (seed - 0.5) * 0.16
    directions[index * 3 + 2] = sourceNormals[index * 3 + 2] * 0.38 + Math.sin(angle) * 0.24
    seeds[index] = seed
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aDirection', new BufferAttribute(directions, 3))
  geometry.setAttribute('aNormal', new BufferAttribute(normals, 3))
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3))
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1))
  return geometry
}

const DISINTEGRATION_PARTICLE_LINGER_SECONDS = 4
const DISINTEGRATION_EMPTY_HOLD_SECONDS = 10

function DisintegrationEffect({ root, meshes, duration, reducedQuality, playingRef, resetToken }: { root: Object3D; meshes: Mesh[]; duration: number; reducedQuality: boolean; playingRef: RefObject<boolean>; resetToken: number }) {
  const points = useRef<Points>(null)
  const elapsed = useRef(0)
  const geometry = useMemo(() => makeParticleGeometry(root, reducedQuality ? 4200 : 11000), [root, reducedQuality])
  const material = useMemo(() => new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uSize: { value: reducedQuality ? 0.65 : 0.85 },
      uLingerAmount: { value: 0 },
      uLingerFade: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute vec3 aDirection;
      attribute vec3 aNormal;
      attribute vec3 aColor;
      attribute float aSeed;
      uniform float uProgress;
      uniform float uSize;
      uniform float uLingerAmount;
      uniform float uLingerFade;
      uniform float uTime;
      varying float vAlpha;
      varying float vSeed;
      varying vec3 vParticleNormal;
      varying vec3 vParticleColor;
      varying vec3 vParticlePosition;
      void main() {
        float height = clamp((position.y + 0.03) / 3.93, 0.0, 1.0);
        float cluster = sin(position.x * 8.7 + position.z * 13.1) * 0.025 + sin(position.z * 31.0) * 0.012;
        float start = (1.0 - height) * 0.68 + (aSeed - 0.5) * 0.075 + cluster;
        float p = clamp((uProgress - start) * 3.25, 0.0, 1.0);
        float flow = p * p * (3.0 - 2.0 * p);
        vec3 drift = aDirection * flow * mix(0.28, 1.65, aSeed);
        drift.x += sin(p * 5.5 + aSeed * 23.0) * flow * 0.18;
        drift.z += cos(p * 4.2 + aSeed * 17.0) * flow * 0.11;
        float sporeTime = uTime * mix(0.28, 0.52, aSeed);
        drift.x += sin(sporeTime + aSeed * 31.0) * uLingerAmount * mix(0.025, 0.11, aSeed);
        drift.y += sin(sporeTime * 0.73 + aSeed * 19.0) * uLingerAmount * mix(0.018, 0.075, aSeed);
        drift.z += cos(sporeTime * 0.61 + aSeed * 27.0) * uLingerAmount * mix(0.02, 0.085, aSeed);
        vec3 scattered = position + drift;
        scattered.y -= flow * mix(0.32, 1.85, aSeed);
        vec4 mvPosition = modelViewMatrix * vec4(scattered, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float sizeVariation = mix(0.22, 1.65, pow(aSeed, 2.6));
        gl_PointSize = max(0.65, uSize * (92.0 / max(1.0, -mvPosition.z)) * sizeVariation);
        vAlpha = smoothstep(0.0, 0.08, p) * (1.0 - smoothstep(0.62, 1.0, p)) * uLingerFade;
        vSeed = aSeed;
        vParticleNormal = normalize(aNormal);
        vParticleColor = aColor;
        vParticlePosition = scattered;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying float vSeed;
      varying vec3 vParticleNormal;
      varying vec3 vParticleColor;
      varying vec3 vParticlePosition;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float angle = vSeed * 6.2831853;
        mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        p = rotation * p;
        float shard = smoothstep(0.72, 0.96, vSeed);
        p.x *= mix(1.0, 2.8, shard);
        float polar = atan(p.y, p.x);
        float irregularRadius = 0.47 + sin(polar * mix(5.0, 8.0, vSeed) + vSeed * 31.0) * 0.055;
        float d = length(p);
        if (d > irregularRadius) discard;

        vec3 normal = normalize(vParticleNormal);
        vec3 frontDirection = normalize(vec3(4.042352, 6.703259, 0.451898) - vParticlePosition);
        vec3 rearDirection = normalize(vec3(-2.486696, 6.175981, 0.78497) - vParticlePosition);
        vec3 magentaDirection = normalize(vec3(-0.174222, 9.8973, 7.979158) - vParticlePosition);
        float lighting = 0.2 + max(dot(normal, frontDirection), 0.0) * 0.62 + max(dot(normal, rearDirection), 0.0) * 0.32;
        float magenta = max(dot(normal, magentaDirection), 0.0) * 0.13;
        vec3 materialColor = mix(vec3(0.15, 0.18, 0.21), max(vParticleColor, vec3(0.12)), 0.58);
        materialColor = mix(materialColor, vec3(0.8, 0.12, 0.68), magenta);
        float edge = smoothstep(irregularRadius, irregularRadius - 0.08, d);
        float glint = pow(max(0.0, 1.0 - d * 2.0), 9.0) * mix(0.05, 0.55, vSeed);
        vec3 litColor = materialColor * lighting + vec3(glint);
        gl_FragColor = vec4(litColor, vAlpha * edge * mix(0.52, 0.94, vSeed));
      }
    `,
  }), [reducedQuality])

  const dissolveProgress = useRef({ value: 0 })
  useLayoutEffect(() => {
    const restore: (() => void)[] = []
    meshes.forEach((mesh) => {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      list.forEach((candidate) => {
        if (!(candidate instanceof MeshStandardMaterial)) return
        const previousCompile = candidate.onBeforeCompile
        const previousKey = candidate.customProgramCacheKey
        candidate.onBeforeCompile = (shader) => {
          shader.uniforms.uDissolveProgress = dissolveProgress.current
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n varying vec3 vDissolveWorld;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\n vDissolveWorld = (modelMatrix * vec4(position, 1.0)).xyz;`)
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n uniform float uDissolveProgress;\n varying vec3 vDissolveWorld;\n float dissolveHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.17, 0.23)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\n float dissolveNoise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(dissolveHash(i), dissolveHash(i+vec3(1,0,0)), f.x), mix(dissolveHash(i+vec3(0,1,0)), dissolveHash(i+vec3(1,1,0)), f.x), f.y), mix(mix(dissolveHash(i+vec3(0,0,1)), dissolveHash(i+vec3(1,0,1)), f.x), mix(dissolveHash(i+vec3(0,1,1)), dissolveHash(i+vec3(1,1,1)), f.x), f.y), f.z); }\n float dissolveFbm(vec3 p) { float value = 0.0; value += dissolveNoise(p) * 0.55; p = p * 2.07 + 3.1; value += dissolveNoise(p) * 0.28; p = p * 2.03 + 1.7; value += dissolveNoise(p) * 0.17; return value; }`)
            .replace('#include <dithering_fragment>', `float dissolveFront = clamp(uDissolveProgress / 0.68, 0.0, 1.0);\n float dissolveTail = smoothstep(0.68, 1.0, uDissolveProgress) * 0.20;\n float dissolveCut = 1.0 - dissolveFront - dissolveTail;\n float height = clamp((vDissolveWorld.y + 0.03) / 3.93, 0.0, 1.0);\n float broadGrain = (dissolveFbm(vDissolveWorld * 3.9) - 0.5) * 0.19;\n float fineGrain = (dissolveNoise(vDissolveWorld * 23.0) - 0.5) * 0.045;\n float organicField = height + broadGrain + fineGrain;\n float distanceBelow = dissolveCut - height;\n float pocketNoise = dissolveFbm(vDissolveWorld * 7.5 + vec3(7.2, 1.3, 4.8));\n bool mainFront = organicField > dissolveCut;\n bool earlyPocket = uDissolveProgress > 0.035 && distanceBelow > 0.025 && distanceBelow < 0.27 && pocketNoise > mix(0.86, 0.73, uDissolveProgress);\n if (mainFront || earlyPocket) discard;\n #include <dithering_fragment>`)
        }
        candidate.customProgramCacheKey = () => `watch-dissolve-${candidate.uuid}`
        candidate.needsUpdate = true
        restore.push(() => {
          candidate.onBeforeCompile = previousCompile
          candidate.customProgramCacheKey = previousKey
          candidate.needsUpdate = true
        })
      })
    })
    return () => restore.forEach(reset => reset())
  }, [meshes])

  useEffect(() => {
    elapsed.current = 0
    root.visible = true
  }, [resetToken, root])
  useEffect(() => () => {
    root.visible = true
    geometry.dispose()
    material.dispose()
  }, [root, geometry, material])

  useFrame((_, delta) => {
    if (playingRef.current) elapsed.current += delta
    const cycleDuration = duration + DISINTEGRATION_PARTICLE_LINGER_SECONDS + DISINTEGRATION_EMPTY_HOLD_SECONDS
    const cycleTime = elapsed.current % cycleDuration
    const progress = Math.min(cycleTime / duration, 1)
    const lingerTime = MathUtils.clamp(cycleTime - duration, 0, DISINTEGRATION_PARTICLE_LINGER_SECONDS)
    const lingerProgress = lingerTime / DISINTEGRATION_PARTICLE_LINGER_SECONDS
    const isLingering = cycleTime >= duration && cycleTime < duration + DISINTEGRATION_PARTICLE_LINGER_SECONDS
    const particleProgress = isLingering ? 0.82 + lingerProgress * 0.12 : progress * 0.82
    root.visible = cycleTime < duration
    material.uniforms.uProgress.value = particleProgress
    material.uniforms.uLingerAmount.value = isLingering ? easeInOut(Math.min(1, lingerProgress * 2.5)) : 0
    material.uniforms.uLingerFade.value = isLingering ? 1 - easeInOut(lingerProgress) : 1
    material.uniforms.uTime.value = elapsed.current
    dissolveProgress.current.value = progress
    if (points.current) points.current.visible = cycleTime < duration + DISINTEGRATION_PARTICLE_LINGER_SECONDS && progress > 0.015
  })
  return <points ref={points} geometry={geometry} material={material} />
}

function CrystalField({ duration, reducedQuality }: { duration: number; reducedQuality: boolean }) {
  const count = reducedQuality ? 18 : 32
  const crystals = useRef<Group>(null)
  useFrame(({ clock }) => {
    const progress = (clock.elapsedTime % duration) / duration
    crystals.current?.children.forEach((crystal, index) => {
      const local = MathUtils.clamp((progress - index / count * 0.58) * 3.3, 0, 1)
      crystal.scale.y = (0.18 + ((index * 29) % 11) * 0.035) * easeInOut(local)
    })
  })
  return (
    <group ref={crystals}>
      {Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2
        const radius = 1.15 + ((index * 17) % 9) * 0.04
        return (
          <mesh key={index} position={[Math.cos(angle) * radius, Math.sin(index * 1.7) * 0.55, Math.sin(angle) * radius]} rotation={[angle * 0.25, angle, angle * 0.1]} scale={[0.07, 0, 0.07]}>
            <coneGeometry args={[1, 2.6, 5]} />
            <meshPhysicalMaterial color="#b8eeff" emissive="#68c8ff" emissiveIntensity={0.22} roughness={0.08} metalness={0.05} transmission={0.5} thickness={0.2} transparent opacity={0.82} />
          </mesh>
        )
      })}
    </group>
  )
}

function GhostCopies({ source, sceneId, duration, reducedQuality }: { source: Object3D; sceneId: SceneId; duration: number; reducedQuality: boolean }) {
  const count = reducedQuality ? 2 : 4
  const group = useRef<Group>(null)
  const ghosts = useMemo(() => Array.from({ length: count }, (_, index) => {
    const ghost = clone(source)
    ghost.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.material = new MeshBasicMaterial({
        color: sceneId === 'futures' ? ['#ff42cf', '#4fe1ff', '#9b72ff', '#ffad45'][index] : '#57b9ff',
        wireframe: sceneId === 'layering',
        transparent: true,
        opacity: 0.1 + index * 0.025,
        depthWrite: false,
        blending: AdditiveBlending,
      })
    })
    return ghost
  }), [count, sceneId, source])

  useEffect(() => () => ghosts.forEach((ghost) => ghost.traverse((object) => {
    if (object instanceof Mesh) (object.material as MeshBasicMaterial).dispose()
  })), [ghosts])

  useFrame(({ clock }) => {
    const progress = (clock.elapsedTime % duration) / duration
    group.current?.children.forEach((ghost, index) => {
      const offset = index + 1
      const spread = sceneId === 'futures' ? Math.sin(progress * Math.PI) * 0.42 : 0.08 * offset
      ghost.position.set(
        sceneId === 'futures' ? (index - (count - 1) / 2) * spread : sceneId === 'echo' ? -0.1 * offset : 0,
        sceneId === 'futures' ? Math.sin(index * 2.1) * 0.09 : sceneId === 'layering' ? 0 : 0.03 * offset,
        -0.055 * offset,
      )
      const scale = sceneId === 'layering' ? 1 + offset * 0.035 * easeInOut(progress) : 1
      ghost.scale.setScalar(scale)
    })
  })

  return (
    <group ref={group}>
      {ghosts.map((ghost, index) => {
        const offset = index + 1
        return <primitive key={index} object={ghost} position={[0, 0, -0.055 * offset]} rotation={[0, sceneId === 'echo' ? -0.035 * offset : 0, 0]} />
      })}
    </group>
  )
}

type RustChannel = {
  material: string
  arrayIndex: number
  target: { socket: string }
  samples: number[]
}

type RustAnimationData = {
  timeline: { durationSeconds: number; sampleFps: number }
  channels: RustChannel[]
}

let rustReleaseTimer: number | undefined

function sampleRustChannel(channel: RustChannel, time: number, data: RustAnimationData) {
  const position = (time % data.timeline.durationSeconds) * data.timeline.sampleFps
  const left = Math.min(Math.floor(position), channel.samples.length - 1)
  const right = Math.min(left + 1, channel.samples.length - 1)
  return MathUtils.lerp(channel.samples[left], channel.samples[right], position - Math.floor(position))
}

function sampleNormalizedRustChannel(channel: RustChannel, time: number, data: RustAnimationData) {
  const value = sampleRustChannel(channel, time, data)
  let min = Infinity
  let max = -Infinity
  channel.samples.forEach((sample) => {
    min = Math.min(min, sample)
    max = Math.max(max, sample)
  })
  return max > min ? MathUtils.clamp((value - min) / (max - min), 0, 1) : MathUtils.clamp(value, 0, 1)
}

const RUST_ROOT = './assets/rust-baked/'
const RUST_FIXED_URLS = [
  './assets/rust-fixed/rust_strap/rust_baseColor.webp',
  './assets/rust-fixed/rust_strap/rust_roughness.webp',
  './assets/rust-fixed/rust_strap/rust_metallic.webp',
  './assets/rust-fixed/rust_case/rust_baseColor.webp',
  './assets/rust-fixed/rust_case/rust_roughness.webp',
  './assets/rust-fixed/rust_case/rust_metallic.webp',
  './assets/rust-fixed/rust_buttons/rust_baseColor.webp',
  './assets/rust-fixed/rust_buttons/rust_roughness.webp',
  './assets/rust-fixed/rust_buttons/rust_metallic.webp',
  './assets/rust-baked/static/cas_displej/rust_baseColor.webp',
  './assets/rust-baked/static/kolem_displeje/rust_baseColor.webp',
  './assets/rust-fixed/rust_strap/rust_timing.webp',
  './assets/rust-baked/static/cas_displej/clean_baseColor.webp',
  './assets/rust-baked/static/kolem_displeje/clean_baseColor.webp',
] as const

const RUST_FIXED_TEXTURE_OFFSET: Record<string, number> = {
  RUST_STRAP: 0,
  RUST_CASE: 3,
  RUST_BUTTONS: 6,
  DISPLAY_DIRT: 9,
  MIMODISPLAY_DIRT: 10,
}

function RustFixedAnimation({ meshes, resetToken, playingRef }: { meshes: Mesh[]; resetToken: number; playingRef: RefObject<boolean> }) {
  const [animationData, setAnimationData] = useState<RustAnimationData | null>(null)
  const progressUniforms = useRef(new Map<string, { value: number }>())
  const elapsed = useRef(0)
  const textures = useLoader(TextureLoader, [...RUST_FIXED_URLS])
  useEffect(() => () => {
    textures.forEach(texture => texture.dispose())
    useLoader.clear(TextureLoader, [...RUST_FIXED_URLS])
  }, [textures])

  useEffect(() => { elapsed.current = 0 }, [resetToken])
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${RUST_ROOT}texture-animation.json`, { signal: controller.signal })
      .then((response) => response.json() as Promise<RustAnimationData>)
      .then(setAnimationData)
      .catch((error) => { if (error.name !== 'AbortError') console.error(error) })
    return () => controller.abort()
  }, [])

  const targets = useMemo(() => meshes.filter((mesh) => mesh.name in RUST_FIXED_TEXTURE_OFFSET), [meshes])

  useLayoutEffect(() => {
    textures.forEach((texture, index) => {
      texture.flipY = false
      texture.colorSpace = [0, 3, 6, 9, 10, 12, 13].includes(index) ? SRGBColorSpace : NoColorSpace
    })
    document.body.dataset.rustTargets = targets.map((mesh) => mesh.name).join(',')

    targets.forEach((mesh) => {
      const sourceMaterial = Array.isArray(mesh.material)
        ? mesh.material.find((material): material is MeshStandardMaterial => material instanceof MeshStandardMaterial)
        : mesh.material instanceof MeshStandardMaterial ? mesh.material : null
      if (!sourceMaterial) return

      const offset = RUST_FIXED_TEXTURE_OFFSET[mesh.name]
      const isMetal = offset < 9
      const hasTiming = mesh.name === 'RUST_STRAP'
      if (mesh.name === 'DISPLAY_DIRT') {
        sourceMaterial.emissiveIntensity = 0
        sourceMaterial.emissiveMap = null
      }
      if (mesh.name === 'DISPLAY_DIRT' || mesh.name === 'MIMODISPLAY_DIRT') {
        sourceMaterial.map = textures[mesh.name === 'DISPLAY_DIRT' ? 12 : 13]
        sourceMaterial.color.set('#ffffff')
        sourceMaterial.needsUpdate = true
      }
      const rustColor = textures[offset]
      const rustRoughness = isMetal ? textures[offset + 1] : null
      const rustMetallic = isMetal ? textures[offset + 2] : null

      sourceMaterial.onBeforeCompile = (shader) => {
        const progress = { value: 0 }
        progressUniforms.current.set(mesh.name, progress)
        shader.uniforms.uRustProgress = progress
        shader.uniforms.uRustColor = { value: rustColor }
        if (isMetal) {
          shader.uniforms.uRustRoughness = { value: rustRoughness }
          shader.uniforms.uRustMetallic = { value: rustMetallic }
        }
        if (hasTiming) shader.uniforms.uRustTiming = { value: textures[11] }
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>
            uniform float uRustProgress;
            uniform sampler2D uRustColor;
            ${hasTiming ? 'uniform sampler2D uRustTiming;' : ''}
            ${isMetal ? 'uniform sampler2D uRustRoughness; uniform sampler2D uRustMetallic;' : ''}`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            float rustBlend = uRustProgress;
            #ifdef USE_MAP
              ${hasTiming ? 'float rustTimingValue = texture2D(uRustTiming, vMapUv).r;\nrustBlend = smoothstep(rustTimingValue - 0.035, rustTimingValue + 0.035, uRustProgress);' : ''}
              vec4 rustColorSample = texture2D(uRustColor, vMapUv);
              diffuseColor.rgb = mix(diffuseColor.rgb, rustColorSample.rgb, rustBlend);
            #endif`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            ${isMetal
              ? '#ifdef USE_MAP\nfloat rustRoughnessValue = texture2D(uRustRoughness, vMapUv).r;\nroughnessFactor = mix(roughnessFactor, rustRoughnessValue, rustBlend);\n#endif'
              : '#ifdef USE_MAP\nvec3 dirtSurface = texture2D(uRustColor, vMapUv).rgb;\nfloat dirtGrain = dot(dirtSurface, vec3(0.299, 0.587, 0.114));\nfloat dirtRoughness = mix(0.38, 0.82, dirtGrain);\nroughnessFactor = mix(roughnessFactor, dirtRoughness, rustBlend);\n#endif'}`)
          .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
            ${isMetal ? '#ifdef USE_MAP\nfloat rustMetallicValue = texture2D(uRustMetallic, vMapUv).r;\nmetalnessFactor = mix(metalnessFactor, rustMetallicValue, rustBlend);\n#endif' : ''}`)
      }
      sourceMaterial.customProgramCacheKey = () => `rust-fixed-direct-${mesh.name}`
      sourceMaterial.needsUpdate = true
    })

    return () => {
      delete document.body.dataset.rustTargets
      progressUniforms.current.clear()
    }
  }, [targets, textures])

  useFrame((_, delta) => {
    if (playingRef.current) elapsed.current += delta
    const localTime = elapsed.current
    const progress = (localTime % 7.5) / 7.5
    const reveal = easeInOut(progress)
    document.body.dataset.rustReveal = reveal.toFixed(3)
    progressUniforms.current.forEach((uniform, objectName) => {
      if (animationData && (objectName === 'DISPLAY_DIRT' || objectName === 'MIMODISPLAY_DIRT')) {
        const materialName = objectName === 'DISPLAY_DIRT' ? 'Material.008' : 'ramecek'
        const channel = animationData.channels.find((candidate) => candidate.material === materialName)
        uniform.value = channel ? sampleNormalizedRustChannel(channel, localTime, animationData) : reveal
      } else {
        uniform.value = reveal
      }
    })
  })

  return null
}

function SquashMaterialRepair({ meshes }: { meshes: Mesh[] }) {
  const base = useWatchAsset(MODEL_URL)

  useLayoutEffect(() => {
    const materialsByName = new Map<string, MeshStandardMaterial>()
    base.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => {
        if (material instanceof MeshStandardMaterial && material.name) materialsByName.set(material.name, material)
      })
    })

    meshes.forEach((mesh) => {
      const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const repaired = current.map((material) => {
        const replacement = materialsByName.get(material.name)
        if (!replacement) return material
        material.dispose()
        return replacement.clone()
      })
      mesh.material = Array.isArray(mesh.material) ? repaired : repaired[0]
    })

    return undefined
  }, [base.scene, meshes])

  return null
}

export function FreezeModel({ playingRef }: { playingRef: RefObject<boolean> }) {
  const { scene, animations } = useWatchAsset(FREEZE_MODEL_URL)
  const instance = useMemo(() => scene.clone(true), [scene])
  const { actions, mixer } = useAnimations(animations, instance)
  const iceMaterials = useRef<MeshPhysicalMaterial[]>([])
  useFrame(({ scene: world }) => {
    mixer.timeScale = playingRef.current ? 1 : 0
    // An explicit environment map lets the ice use its own reflection intensity.
    for (const material of iceMaterials.current) {
      if (material.envMap !== world.environment) {
        material.envMap = world.environment
        material.needsUpdate = true
      }
    }
  }, -1)
  useEffect(() => {
    const clip = animations.find(candidate => candidate.tracks.some(track => track.name.includes('morphTargetInfluences')))
    const action = clip && actions[clip.name]
    action?.reset().setLoop(LoopRepeat, Infinity).play()
    return () => { action?.stop() }
  }, [actions, animations])
  useLayoutEffect(() => {
    instance.visible = true
    instance.scale.set(1, 1, 1)
    const originals = new Map<Mesh, Material | Material[]>()
    const replacements = new Map<MeshStandardMaterial, MeshPhysicalMaterial>()
    function refractiveIce(source: Material) {
      if (!/^ICE_MATERIAL(?:\.\d+)?$/.test(source.name) || !(source instanceof MeshStandardMaterial)) return source
      const existing = replacements.get(source)
      if (existing) return existing
      const ice = new MeshPhysicalMaterial()
      ice.name = source.name
      ice.color.copy(source.color)
      ice.map = source.map
      ice.normalMap = source.normalMap
      ice.normalScale.set(0.55, 0.55)
      ice.roughnessMap = source.roughnessMap
      ice.metalness = source.metalness
      ice.metalnessMap = source.metalnessMap
      ice.setValues({
        transparent: false, opacity: 1, depthWrite: true, transmission: 0.94,
        ior: 1.31, thickness: 0.85, attenuationColor: new Color('#cbe7ff'),
        attenuationDistance: 4, roughness: 1, side: FrontSide,
        envMapIntensity: 2.2, sheen: 0.35, sheenRoughness: 0.45,
        sheenColor: new Color('#d9eeff'),
        emissiveIntensity: 0,
      })
      ice.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.08, 0.92, roughnessFactor);')
      }
      iceMaterials.current.push(ice)
      replacements.set(source, ice)
      return ice
    }
    instance.traverse(object => {
      if (object instanceof Light) object.color.set('#eef7ff')
      if (!(object instanceof Mesh)) return
      const original = object.material
      originals.set(object, original)
      object.material = Array.isArray(original) ? original.map(refractiveIce) : refractiveIce(original)
    })
    return () => {
      originals.forEach((original, mesh) => { mesh.material = original })
      iceMaterials.current = []
      replacements.forEach(material => material.dispose())
    }
  }, [instance])
  return <primitive object={instance} dispose={null} />
}

type EchoGhost = {
  root: Object3D
  materials: Material[]
  opacity: number
}

function EchoTrailEffect({ source, clip, timeRef, reducedQuality, resetToken }: {
  source: Object3D
  clip: AnimationClip
  timeRef: RefObject<number>
  reducedQuality: boolean
  resetToken: number
}) {
  const count = reducedQuality ? 10 : 32
  const trailStep = reducedQuality ? 0.08 : 0.05
  const interpolants = useMemo(() => {
    const create = (suffix: string) => {
      const track = clip.tracks.find((item) => item.name.endsWith(suffix))
      return track
        ? (track as unknown as { createInterpolant(): { evaluate(time: number): ArrayLike<number> } }).createInterpolant()
        : undefined
    }
    return {
      position: create('.position'),
      quaternion: create('.quaternion'),
      scale: create('.scale'),
    }
  }, [clip])
  const ghosts = useMemo<EchoGhost[]>(() => Array.from({ length: count }, (_, index) => {
    const root = clone(source)
    const materials: Material[] = []
    root.name = `echo_trail_${index + 1}`
    root.visible = true
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.renderOrder = 2 + index
      object.frustumCulled = false
      object.material = (Array.isArray(object.material) ? object.material : [object.material]).map((sourceMaterial) => {
        const material = sourceMaterial.clone()
        const originalOpacity = material.opacity
        material.transparent = true
        material.depthWrite = false
        material.opacity = 0
        material.userData.echoOriginalOpacity = originalOpacity
        if (material instanceof MeshStandardMaterial) material.color.lerp(new Color('#8fbfff'), 0.1)
        materials.push(material)
        return material
      })
      if (object.material.length === 1) object.material = object.material[0]
    })
    return { root, materials, opacity: 1 - index / count }
  }), [count, source])

  useEffect(() => {
    ghosts.forEach((ghost, index) => {
      ghost.opacity = 1 - index / count
      ghost.root.visible = false
    })
  }, [count, ghosts, resetToken])

  useEffect(() => () => {
    ghosts.forEach((ghost) => ghost.materials.forEach((material) => material.dispose()))
  }, [ghosts])

  useFrame(() => {
    const duration = Math.max(clip.duration, 0.001)
    const headTime = timeRef.current % duration
    const headPosition = interpolants.position?.evaluate(headTime)
    const headRotation = interpolants.quaternion?.evaluate(headTime)
    const headScale = interpolants.scale?.evaluate(headTime)
    if (headPosition) source.position.fromArray(headPosition)
    if (headRotation) source.quaternion.fromArray(headRotation).normalize()
    if (headScale) source.scale.fromArray(headScale)

    ghosts.forEach((ghost, index) => {
      const historicTime = timeRef.current - trailStep * Math.pow(index + 1, 1.25)
      ghost.root.visible = historicTime > 0
      if (historicTime <= 0) return
      const sampleTime = historicTime % duration
      const position = interpolants.position?.evaluate(sampleTime)
      const rotation = interpolants.quaternion?.evaluate(sampleTime)
      const scale = interpolants.scale?.evaluate(sampleTime)
      if (position) ghost.root.position.fromArray(position)
      if (rotation) ghost.root.quaternion.fromArray(rotation).normalize()
      if (scale) ghost.root.scale.fromArray(scale)
      const fade = Math.pow(1 - index / count, 1.1) * 0.32
      ghost.materials.forEach((material) => {
        material.opacity = (material.userData.echoOriginalOpacity as number) * fade
      })
    })
  })

  return <group>{ghosts.map((ghost) => <primitive key={ghost.root.uuid} object={ghost.root} />)}</group>
}

const LCD_SEGMENTS: Record<string, string> = {
  '0': 'abcedf', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
}

const WORLD_TIME_DISPLAY_TEXTURE_URL = './assets/textures/worldtime/hodinky-displej.webp'

// Five-column LCD glyphs for the two-letter weekday field.
const weekdayGlyphs: Record<string, number[]> = {
  S: [15,16,14,1,30], U: [17,17,17,17,14], M: [17,27,21,17,17],
  O: [14,17,17,17,14], T: [31,4,4,4,4], W: [17,17,21,27,17],
  E: [31,16,30,16,31], H: [17,17,31,17,17], F: [31,16,30,16,16],
  R: [30,17,30,20,18], A: [14,17,31,17,17],
}

function drawLcdDigit(context: CanvasRenderingContext2D, digit: string, x: number, y: number, width: number, height: number) {
  const thickness = Math.max(4, width * 0.15)
  const horizontalWidth = width - thickness * 1.15
  const verticalHeight = height * 0.5 - thickness * 1.35
  const active = LCD_SEGMENTS[digit] ?? ''
  const segments: Record<string, [number, number, number, number]> = {
    a: [x + thickness * 0.58, y, horizontalWidth, thickness],
    b: [x + width - thickness, y + thickness * 0.55, thickness, verticalHeight],
    c: [x + width - thickness, y + height * 0.5 + thickness * 0.25, thickness, verticalHeight],
    d: [x + thickness * 0.58, y + height - thickness, horizontalWidth, thickness],
    e: [x, y + height * 0.5 + thickness * 0.25, thickness, verticalHeight],
    f: [x, y + thickness * 0.55, thickness, verticalHeight],
    g: [x + thickness * 0.58, y + height * 0.5 - thickness * 0.5, horizontalWidth, thickness],
  }
  Object.entries(segments).forEach(([name, [sx, sy, sw, sh]]) => {
    context.globalAlpha = active.includes(name) ? 0.9 : 0.055
    context.fillRect(sx, sy, sw, sh)
  })
  context.globalAlpha = 1
}

function LocalTimeDisplay({ root }: { root: Object3D }) {
  const lcdSourceTexture = useLoader(TextureLoader, WORLD_TIME_DISPLAY_TEXTURE_URL)

  useLayoutEffect(() => {
    const display = root.getObjectByName('Displej')
    if (!display) {
      document.body.dataset.localTimeDisplay = 'missing'
      return undefined
    }

    let displayMesh: Mesh | undefined
    display.traverse((object) => {
      if (displayMesh || !(object instanceof Mesh)) return
      const list = Array.isArray(object.material) ? object.material : [object.material]
      if (list.some((material) => material.name === 'Material.008')) displayMesh = object
    })
    if (!displayMesh) {
      document.body.dataset.localTimeDisplay = 'material-missing'
      return undefined
    }
    const targetMesh = displayMesh

    const originalMaterial = targetMesh.material
    const originalList = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]
    const materialIndex = originalList.findIndex((material) => material.name === 'Material.008')
    const sourceMaterial = originalList[materialIndex]
    if (!(sourceMaterial instanceof MeshStandardMaterial)) {
      document.body.dataset.localTimeDisplay = 'unsupported-material'
      return undefined
    }

    const material = sourceMaterial.clone()
    const image = lcdSourceTexture.image as CanvasImageSource & { width?: number; height?: number }
    const width = image?.width || 2439
    const height = image?.height || 2864
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context || !image) {
      material.dispose()
      document.body.dataset.localTimeDisplay = 'texture-missing'
      return undefined
    }

    const texture = new CanvasTexture(canvas)
    texture.name = 'local_time_canvas'
    texture.flipY = false
    texture.colorSpace = SRGBColorSpace
    material.emissiveMap = texture
    material.map = texture
    material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.18)
    material.needsUpdate = true
    const nextList = [...originalList]
    nextList[materialIndex] = material
    targetMesh.material = Array.isArray(originalMaterial) ? nextList : material

    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    const dayFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit' })
    const lcdX = width * 0.25
    const lcdY = height * 0.35
    const lcdWidth = width * 0.5
    const lcdHeight = height * 0.22
    const redraw = () => {
      context.globalAlpha = 1
      context.clearRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      context.fillStyle = '#16231d'

      const now = new Date()
      const value = timeFormatter.format(now).replace(/\s/g, '')
      const weekday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][now.getDay()]
      const day = dayFormatter.format(now)
      context.globalAlpha = 0.86
      const top = lcdY + lcdHeight * 0.10
      const glyphHeight = lcdHeight * 0.23
      const glyphWidth = lcdWidth * 0.08
      for (let i = 0; i < 2; i++) {
        const x = lcdX + lcdWidth * (0.33 + i * 0.105)
        weekdayGlyphs[weekday[i]].forEach((bits, row) => {
          for (let col = 0; col < 5; col++) {
            if (bits & (16 >> col)) context.fillRect(x + col * glyphWidth / 5, top + row * glyphHeight / 5, glyphWidth / 5, glyphHeight / 5)
          }
        })
        drawLcdDigit(context, day[i], lcdX + lcdWidth * (0.79 + i * 0.09), top, glyphWidth, glyphHeight)
      }
      context.globalAlpha = 1

      const digitWidth = lcdWidth * 0.075
      const colonWidth = lcdWidth * 0.028
      const gap = lcdWidth * 0.012
      const digitHeight = lcdHeight * 0.48
      const totalWidth = digitWidth * 6 + colonWidth * 2 + gap * 7
      let cursor = lcdX + (lcdWidth - totalWidth) * 0.5
      const digitY = lcdY + lcdHeight * 0.43
      for (const character of value) {
        if (character === ':') {
          const radius = Math.max(3, colonWidth * 0.16)
          context.beginPath()
          context.arc(cursor + colonWidth * 0.5, digitY + digitHeight * 0.34, radius, 0, Math.PI * 2)
          context.arc(cursor + colonWidth * 0.5, digitY + digitHeight * 0.68, radius, 0, Math.PI * 2)
          context.fill()
          cursor += colonWidth + gap
        } else {
          drawLcdDigit(context, character, cursor, digitY, digitWidth, digitHeight)
          cursor += digitWidth + gap
        }
      }
      texture.needsUpdate = true
      document.body.dataset.localTimeValue = value
      document.body.dataset.localDateValue = `${weekday} ${day}`
    }

    redraw()
    const interval = window.setInterval(redraw, 1000)
    document.body.dataset.localTimeDisplay = 'ready'
    return () => {
      window.clearInterval(interval)
      targetMesh.material = originalMaterial
      texture.dispose()
      material.dispose()
      delete document.body.dataset.localTimeDisplay
      delete document.body.dataset.localTimeValue
      delete document.body.dataset.localDateValue
    }
  }, [lcdSourceTexture, root])

  return null
}

export function WatchModel({ scene, reducedQuality, resetToken, playingRef, orbitBounds }: { orbitBounds?: RefObject<Box3>; scene: SceneDefinition; reducedQuality: boolean; resetToken: number; playingRef: RefObject<boolean> }) {
  const neutralPreview = useMemo(() => new URLSearchParams(window.location.search).has('neutral'), [])
  const modelUrl = modelUrlForScene(scene.id)
  const hasAuthoredModel = modelUrl !== MODEL_URL
  const gltf = useWatchAsset(modelUrl)
  const container = useRef<Group>(null)
  const cycle = useRef(0)
  const animationTime = useRef(0)
  const model = useMemo(() => clone(gltf.scene), [gltf.scene])
  const mixer = useMemo(() => new AnimationMixer(model), [model])
  const pointer = useThree((state) => state.pointer)
  const echoPointer = useRef(new Vector2())
  const echoPointerReady = useRef(false)
  const echoSource = useMemo(() => model.getObjectByName('HODINKY.001') ?? model, [model])
  const hasAuthoredAnimation = gltf.animations.length > 0
  const meshes = useMemo(() => {
    const result: Mesh[] = []
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone()
      result.push(object)
    })
    return result
  }, [model])
  const initial = useMemo(() => {
    const map = new Map<Object3D, InitialTransform>()
    model.traverse((object) => map.set(object, {
      position: object.position.clone(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: object.scale.clone(),
    }))
    return map
  }, [model])

  useLayoutEffect(() => {
    if (hasAuthoredModel) {
      model.position.set(0, 0, 0)
      model.scale.setScalar(1)
      model.updateMatrixWorld(true)
      return
    }
    if (orbitBounds) {
      model.position.set(0, 0, 0)
      model.scale.setScalar(1)
    }
    model.updateMatrixWorld(true)
    let caseObject: Object3D | null = null
    model.traverse((object) => {
      if (object.name.startsWith('watch_case') && !caseObject) caseObject = object
    })
    const focus = caseObject ?? model
    const center = new Box3().setFromObject(focus).getCenter(new Vector3())
    const size = new Box3().setFromObject(focus).getSize(new Vector3())
    const scale = 3.05 / Math.max(size.x, size.y, size.z)
    model.position.copy(center).multiplyScalar(-scale)
    model.scale.setScalar(scale)
    model.updateMatrixWorld(true)
    if (orbitBounds) orbitBounds.current.setFromObject(model, true)
  }, [hasAuthoredModel, model, orbitBounds])

  useEffect(() => () => {
    meshes.forEach((mesh) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((material) => {
        material.dispose()
      })
    })
  }, [meshes])

  useEffect(() => {
    // Echo reads the authored tracks directly in EchoTrailEffect. Starting an
    // AnimationAction here would create a second, independent moving object.
    if (neutralPreview || !hasAuthoredAnimation || scene.id === 'echo') return
    const actions = gltf.animations.map((clip) => mixer.clipAction(clip, model))
    actions.forEach((action) => {
      action.setLoop(LoopRepeat, Infinity)
      action.clampWhenFinished = false
      action.reset().play()
    })
    return () => {
      actions.forEach((action) => action.stop())
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
    }
  }, [gltf.animations, hasAuthoredAnimation, mixer, model, neutralPreview, resetToken, scene.id])

  useEffect(() => { animationTime.current = 0 }, [resetToken])
  useEffect(() => {
    echoPointer.current.copy(pointer)
    echoPointerReady.current = false
  }, [pointer, resetToken])

  useFrame((_, delta) => {
    if (scene.id === 'echo') {
      if (echoPointerReady.current && playingRef.current) {
        // Pointer coordinates cover -1…1 across the canvas. A full-width gesture
        // advances roughly 1.4 seconds, keeping the authored motion deliberate.
        animationTime.current += pointer.distanceTo(echoPointer.current) * 0.7
      }
      echoPointer.current.copy(pointer)
      echoPointerReady.current = true
    } else {
      if (playingRef.current) animationTime.current += delta
      if (playingRef.current && !neutralPreview && hasAuthoredAnimation) mixer.update(delta)
    }
    cycle.current = (animationTime.current % scene.duration) / scene.duration
    const t = cycle.current
    const wave = pulse(t)
    const root = container.current
    if (!root) return

    root.position.set(0, 0, 0)
    root.rotation.set(0, 0, 0)
    root.scale.setScalar(1)

    if (scene.id === 'echo') root.position.y = 3.15

    if (!hasAuthoredAnimation) {
      model.traverse((object) => {
        if (object === model) return
        const base = initial.get(object)
        if (!base) return
        object.position.copy(base.position)
        object.rotation.set(...base.rotation)
        object.scale.copy(base.scale)
      })
    }

    meshes.forEach((mesh, index) => {
      const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      if (scene.id !== 'stillness') {
        materialList.forEach((material) => {
          if (!(material instanceof MeshStandardMaterial)) return
          const data = material.userData.__base ?? {
            color: material.color.clone(), roughness: material.roughness, metalness: material.metalness, opacity: material.opacity,
          }
          material.userData.__base = data
          material.color.copy(data.color)
          material.roughness = data.roughness
          material.metalness = data.metalness
          material.opacity = data.opacity
          material.transparent = data.opacity < 1
        })
      }

      if (!neutralPreview && scene.id === 'fragmentation') {
        const seed = Math.abs(hash(mesh.name))
        const phase = Math.sin(t * Math.PI)
        const direction = new Vector3(((seed % 19) - 9) / 9, (((seed >> 3) % 17) - 8) / 8, (((seed >> 6) % 23) - 11) / 11).normalize()
        mesh.position.addScaledVector(direction, phase * (0.3 + (seed % 8) * 0.06))
        mesh.rotation.x += phase * ((seed % 5) - 2) * 0.15
        mesh.rotation.z += phase * ((seed % 7) - 3) * 0.1
      }
      if (!neutralPreview && scene.id === 'relativity') {
        const turns = index % 3 === 0 ? 4 : index % 3 === 1 ? 1 : 0
        mesh.rotation.y += t * Math.PI * 2 * turns
      }
    })

    const morphName = neutralPreview || hasAuthoredAnimation ? null : scene.id === 'stretch' ? 'Stretch' : scene.id === 'squash' ? 'Squash' : null
    if (morphName) {
      let foundMorph = false
      meshes.forEach((mesh) => {
        const dictionary = mesh.morphTargetDictionary
        const influences = mesh.morphTargetInfluences
        if (!dictionary || !influences || dictionary[morphName] === undefined) return
        influences[dictionary[morphName]] = wave
        foundMorph = true
      })
      if (!foundMorph) root.scale.set(scene.id === 'stretch' ? 1 + wave * 0.08 : 1 + wave * 0.18, scene.id === 'stretch' ? 1 + wave * 0.48 : 1 - wave * 0.42, 1 - wave * 0.05)
    }
    if (!neutralPreview && scene.id === 'loop' && !hasAuthoredAnimation) root.rotation.y += Math.sin(t * Math.PI * 2) * 0.3
  })

  return (
    <group ref={container}>
      <primitive object={model} />
      {scene.id === 'acceleration' && <SpeedGlow meshes={meshes} elapsed={animationTime} />}
      {scene.id === 'acceleration' && <SpeedDisplay meshes={meshes} elapsed={animationTime} />}
      {scene.id === 'layering' && <LocalTimeDisplay root={model} />}
      {scene.id === 'squash' && <SquashMaterialRepair meshes={meshes} />}
      {!neutralPreview && scene.id === 'aging' && <RustFixedAnimation meshes={meshes} resetToken={resetToken} playingRef={playingRef} />}
      {!neutralPreview && scene.id === 'disintegration' && <DisintegrationEffect root={model} meshes={meshes} duration={scene.duration} reducedQuality={reducedQuality} resetToken={resetToken} playingRef={playingRef} />}
      {!neutralPreview && scene.id === 'echo' && gltf.animations[0] && <EchoTrailEffect source={echoSource} clip={gltf.animations[0]} timeRef={animationTime} reducedQuality={reducedQuality} resetToken={resetToken} />}
    </group>
  )
}
