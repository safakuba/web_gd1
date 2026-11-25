import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise } from '@react-three/postprocessing'
import { OrbitControls } from '@react-three/drei'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Box3, Color, Mesh, PerspectiveCamera, PMREMGenerator, PointLight, Quaternion, RectAreaLight, SpotLight, Vector3 } from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { SceneDefinition } from '../types'
import { scenes } from '../scenes'
import { MODEL_URL, PRESENCE_MODEL_URL, modelUrlForScene, useWatchAsset, WatchModel, FreezeModel } from './WatchModel'

const DEFAULT_CAMERA_DISTANCE_SCALE = 0.82
const MIN_ZOOM_DISTANCE_SCALE = 0.22

function CameraRig({ scene, resetRef, transitioning, mobile, orbitBounds }: { orbitBounds?: RefObject<Box3>; scene: SceneDefinition; resetRef: RefObject<number>; transitioning: boolean; mobile: boolean }) {
  const { camera, size } = useThree()
  const modelUrl = modelUrlForScene(scene.id)
  const cameraModelUrl = scene.id === 'stillness' ? modelUrlForScene('layering')
    : scene.id === 'fragmentation' ? PRESENCE_MODEL_URL : modelUrl
  const gltf = useWatchAsset(cameraModelUrl)
  const controls = useRef<OrbitControlsImpl>(null)
  const targetPosition = useRef(new Vector3(...scene.camera.position))
  const targetLook = useRef(new Vector3(...scene.camera.target))
  const orbitDistance = useRef(0)
  const resetProgress = useRef(1)
  const lastResetToken = useRef(resetRef.current)

  const authoredCamera = useMemo(() => {
    if (cameraModelUrl === MODEL_URL) return null
    gltf.scene.updateMatrixWorld(true)
    const source = gltf.scene.getObjectByName('CAM_MAIN') ?? gltf.scene.getObjectByName('CAM MAIN')
    if (!(source instanceof PerspectiveCamera)) return null

    const bounds = new Box3()
    gltf.scene.traverse((object) => {
      if (object instanceof Mesh && object.visible) bounds.expandByObject(object)
    })
    const center = bounds.getCenter(new Vector3())
    const position = source.getWorldPosition(new Vector3())
    const rotation = source.getWorldQuaternion(new Quaternion())
    const direction = new Vector3(0, 0, -1).applyQuaternion(rotation).normalize()
    const distance = Math.max(0.1, center.clone().sub(position).dot(direction))
    const target = position.clone().addScaledVector(direction, distance)
    const up = new Vector3(0, 1, 0).applyQuaternion(rotation).normalize()
    const mobileScale = mobile ? (size.width > size.height ? 1.12 : 1.38) : 1
    if (scene.id === 'fragmentation') {
      const target = new Vector3(0, 0, 0)
      const authoredDirection = position.clone().sub(center).normalize()
      const fragmentDistance = distance * mobileScale * DEFAULT_CAMERA_DISTANCE_SCALE
      return {
        position: target.clone().addScaledVector(authoredDirection, fragmentDistance),
        target,
        up,
        fov: source.fov,
        near: source.near,
        far: source.far,
        distance: fragmentDistance,
      }
    }
    // Echo travels across the full authored curve. Frame the complete path instead
    // of fitting the camera to the single master watch at its first keyframe.
    const framingScale = (scene.id === 'futures' ? 1.32 : scene.id === 'echo' ? 3 : 1) * mobileScale * DEFAULT_CAMERA_DISTANCE_SCALE
    const framedPosition = target.clone().add(position.clone().sub(target).multiplyScalar(framingScale))
    return { position: framedPosition, target, up, fov: source.fov, near: source.near, far: source.far, distance: distance * framingScale }
  }, [cameraModelUrl, gltf.scene, mobile, scene.id, size.height, size.width])

  useEffect(() => {
    const fallbackPosition = new Vector3(...scene.camera.position)
    if (mobile) fallbackPosition.multiplyScalar(size.width > size.height ? 1.08 : 1.28)
    const target = authoredCamera?.target.clone() ?? new Vector3(...scene.camera.target)
    if (!authoredCamera) fallbackPosition.sub(target).multiplyScalar(DEFAULT_CAMERA_DISTANCE_SCALE).add(target)
    const position = authoredCamera?.position.clone() ?? fallbackPosition
    const bounds = orbitBounds?.current
    if (bounds && !bounds.isEmpty()) {
      const offset = position.clone().sub(target)
      bounds.getCenter(target)
      const vertical = (authoredCamera?.fov ?? scene.camera.fov) * Math.PI / 360
      const horizontal = Math.atan(Math.tan(vertical) * size.width / size.height)
      const radius = bounds.getSize(new Vector3()).length() / 2
      orbitDistance.current = Math.max(offset.length(), 1.05 * radius / Math.sin(Math.min(vertical, horizontal)))
      position.copy(target).addScaledVector(offset.normalize(), orbitDistance.current)
      if (controls.current) controls.current.maxDistance = Math.max(controls.current.maxDistance, orbitDistance.current * 1.5)
    }
    targetPosition.current.copy(position)
    targetLook.current.copy(target)
    camera.position.copy(position)
    if (authoredCamera) camera.up.copy(authoredCamera.up)
    else camera.up.set(0, 1, 0)
    if (camera instanceof PerspectiveCamera) {
      camera.fov = authoredCamera?.fov ?? scene.camera.fov
      camera.near = mobile ? 0.1 : Math.max(0.05, authoredCamera?.near ?? 0.1)
      camera.far = mobile ? 100 : authoredCamera?.far ?? 100
      camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
    controls.current?.target.copy(target)
    controls.current?.update()
    resetProgress.current = 1
  }, [authoredCamera, camera, mobile, scene, size.height, size.width, orbitBounds])

  useFrame((_, delta) => {
    if (lastResetToken.current !== resetRef.current) {
      lastResetToken.current = resetRef.current
      resetProgress.current = 0
    }
    if (transitioning || resetProgress.current < 0.995) {
      const ease = 1 - Math.exp(-delta * 4.8)
      camera.position.lerp(targetPosition.current, ease)
      controls.current?.target.lerp(targetLook.current, ease)
      controls.current?.update()
      resetProgress.current = Math.min(1, resetProgress.current + delta * 1.4)
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={orbitBounds ? undefined : authoredCamera?.target.toArray() ?? scene.camera.target}
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={mobile ? 0.34 : 0.42}
      zoomSpeed={mobile ? 0.42 : 0.55}
      minDistance={authoredCamera ? authoredCamera.distance * MIN_ZOOM_DISTANCE_SCALE : scene.orbit.minDistance * 0.6}
      maxDistance={authoredCamera ? authoredCamera.distance * 1.5 : scene.orbit.maxDistance}
      minPolarAngle={scene.orbit.minPolarAngle}
      maxPolarAngle={scene.orbit.maxPolarAngle}
      minAzimuthAngle={scene.orbit.minAzimuthAngle}
      maxAzimuthAngle={scene.orbit.maxAzimuthAngle}
    />
  )
}

function MovingLights({ accent, mode }: { accent: string; mode?: 'rust' | 'ice' }) {
  const restrained = Boolean(mode)
  const key = useRef<SpotLight>(null)
  const rim = useRef<PointLight>(null)

  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    if (key.current) {
      key.current.position.x = Math.sin(time * 0.42) * 4.8
      key.current.position.z = 3.8 + Math.cos(time * 0.33) * 2
    }
    if (rim.current) {
      rim.current.position.y = Math.sin(time * 0.55) * 3.2
      rim.current.intensity = restrained ? 7 + Math.sin(time * 1.1) : 18 + Math.sin(time * 1.1) * 5
    }
  })

  return (
    <>
      <ambientLight intensity={restrained ? 0.2 : 0.18} color={mode === 'rust' ? '#fff4e8' : mode === 'ice' ? '#d8efff' : '#9fb4d4'} />
      <hemisphereLight args={[mode === 'rust' ? '#fff8ef' : '#dbe8ff', '#090611', restrained ? 0.22 : 0.24]} />
      <spotLight ref={key} position={[4, 5, 4]} intensity={restrained ? 14 : 36} angle={0.5} penumbra={0.86} color="#ffffff" />
      <pointLight ref={rim} position={[-4, 1, -2]} intensity={restrained ? 7 : 10} distance={9} color={accent} />
      <pointLight position={[1, -3, 2]} intensity={restrained ? 1 : 4} distance={7} color={restrained ? '#ffffff' : '#3157ff'} />
    </>
  )
}

function FreezeExposure() {
  const renderer = useThree(state => state.gl)
  useEffect(() => {
    const original = renderer.toneMappingExposure
    renderer.toneMappingExposure = original * 0.55
    return () => { renderer.toneMappingExposure = original }
  }, [renderer])
  return null
}

function PresenceLights({ neutral, ice }: { neutral: boolean; ice: boolean }) {
  const lights = useMemo(() => {
    const left = new RectAreaLight(ice ? '#eef7ff' : neutral ? '#ffffff' : '#ff00e2', 9.2, 6.94, 6.94)
    left.name = 'SVETLO LEVE'
    left.position.set(-0.174222, 9.8973, 7.979158)
    left.quaternion.set(-0.342485, 0.000896, -0.002458, 0.93952)

    const front = new RectAreaLight(ice ? '#eef7ff' : '#ffffff', 35.4, 1, 1)
    front.name = 'SVETLO ZEPREDU'
    front.position.set(4.042352, 6.703259, 0.451898)
    front.quaternion.set(-0.561986, -0.091399, -0.68704, 0.451435)

    const rear = new RectAreaLight(ice ? '#eef7ff' : '#ffffff', 35.4, 1, 1)
    rear.name = 'SVETLO ZEZADU'
    rear.position.set(-2.486696, 6.175981, 0.78497)
    rear.quaternion.set(-0.678009, -0.200759, 0.200759, 0.678009)
    return [left, front, rear]
  }, [neutral, ice])

  useEffect(() => () => lights.forEach((light) => light.dispose()), [lights])
  return <>{lights.map((light) => <primitive key={light.name} object={light} />)}</>
}

function Background({ accent, mode, neutral = false, ice = false }: { accent: string; mode?: 'rust' | 'ice' | 'presence'; neutral?: boolean; ice?: boolean }) {
  const restrained = Boolean(mode)
  const { gl, scene } = useThree()
  const worldTexture = useLoader(HDRLoader, './assets/environment/teufelsberg_1k.hdr')
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const target = pmrem.fromEquirectangular(worldTexture)
    const environment = target.texture
    scene.background = new Color('#030303')
    scene.environment = environment
    scene.environmentIntensity = restrained ? 0.52 : 0.68
    scene.fog = null
    return () => {
      scene.environment = null
      target.dispose()
      pmrem.dispose()
    }
  }, [gl, restrained, scene, worldTexture])
  return mode === 'presence' ? <PresenceLights neutral={neutral} ice={ice} /> : <MovingLights accent={accent} mode={mode} />
}

function TransmissionBudget({ mobile }: { mobile: boolean }) {
  const { gl, size, viewport } = useThree()
  useEffect(() => {
    gl.transmissionResolutionScale = mobile
      ? Math.min(1, 256 / (Math.max(size.width, size.height) * viewport.dpr))
      : 1
  }, [gl, mobile, size.width, size.height, viewport.dpr])
  return null
}

export const WatchExperience = memo(function WatchExperience({ scene, transitionToken, cameraResetRef, transitioning, playingRef }: { scene: SceneDefinition; transitionToken: number; cameraResetRef: RefObject<number>; transitioning: boolean; playingRef: RefObject<boolean> }) {
  const isMobile = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const restBounds = useRef(new Box3())
  const orbitBounds = scene.id === 'fragmentation' || scene.id === 'relativity' ? restBounds : undefined
  const host = useRef<HTMLDivElement>(null)
  const [inViewport, setInViewport] = useState(true)
  const [pageVisible, setPageVisible] = useState(document.visibilityState === 'visible')
  const activeRef = useRef(true)
  const reducedMotionRef = useRef(reducedMotion)
  activeRef.current = inViewport && pageVisible
  reducedMotionRef.current = reducedMotion
  const runtimePlayingRef = useMemo(() => ({
    get current() {
      return playingRef.current && activeRef.current && !reducedMotionRef.current
    },
  }) as RefObject<boolean>, [playingRef])

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), { rootMargin: '160px' })
    if (host.current) observer.observe(host.current)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
    }
  }, [])

  return (
    <div ref={host} className="watch-experience">
    <Canvas
      className="watch-canvas"
      dpr={isMobile ? [0.85, 1] : [1, 1.25]}
      frameloop={inViewport && pageVisible ? 'always' : 'never'}
      camera={{ position: scene.camera.position, fov: scene.camera.fov, near: 0.1, far: 100 }}
      gl={{ logarithmicDepthBuffer: false, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
      shadows={false}
    >
      <TransmissionBudget mobile={isMobile} />
      <Background
        neutral={scene.id === 'layering' || scene.id === 'fragmentation'}
        accent={scene.id === 'stillness' ? scenes.find(item => item.id === 'stretch')!.accent : scene.accent}
        mode={scene.id === 'aging' ? 'rust' : scene.id === 'layering' || scene.id === 'disintegration' || scene.id === 'fragmentation' ? 'presence' : undefined}
      />
      {scene.id === 'stillness' && <>
        <FreezeExposure />
        <directionalLight color="#cde6ff" intensity={0.65} position={[-3, 3, -4]} />
      </>}
      {scene.id === 'stillness' ? <FreezeModel playingRef={runtimePlayingRef} /> : <WatchModel orbitBounds={orbitBounds} scene={scene} reducedQuality={isMobile} resetToken={transitionToken} playingRef={runtimePlayingRef} />}
      <CameraRig orbitBounds={orbitBounds} key={scene.id} scene={scene} resetRef={cameraResetRef} transitioning={transitioning} mobile={isMobile} />
      {scene.id !== 'stillness' && (
        <EffectComposer multisampling={0}>
          {scene.id === 'acceleration' ? <Bloom intensity={0.85} luminanceThreshold={1.15} luminanceSmoothing={0.25} radius={0.38} mipmapBlur /> : <Bloom intensity={scene.id === 'aging' || scene.id === 'layering' ? 0.04 : isMobile ? 0.18 : 0.36} luminanceThreshold={scene.id === 'layering' ? 1.2 : 0.88} luminanceSmoothing={0.16} mipmapBlur />}
          <Noise opacity={0.018} />
        </EffectComposer>
      )}
    </Canvas>
    </div>
  )
})
