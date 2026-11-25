import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { WatchExperience } from './components/WatchExperience'
import { DebugHud } from './components/DebugHud'
import { scenes } from './scenes'
import { PROJECT_ANNOTATION } from './data/phasesContent'
import { modelUrlForScene } from './components/WatchModel'

import { typographyVars } from './config/typography'
import { formatCzechText } from './lib/formatCzechText'

type TransitionPhase = 'running' | 'out' | 'in'

function ResetIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 9a8 8 0 1 1-.5 5M5 4v5h5" />
  </svg>
}

function Brand({ compact = false }: { compact?: boolean } = {}) {
  const dialog = useRef<HTMLDialogElement>(null)
  return <div className="brand">
    <span>12 FÁZÍ ČASU</span>{!compact && <small>INTERAKTIVNÍ STUDIE</small>}
    <button onPointerDown={event => event.stopPropagation()} className="annotation-toggle" aria-label="Anotace projektu" onClick={() => dialog.current?.showModal()}>{compact ? 'ⓘ' : 'ANOTACE'}</button>
    <dialog className="annotation-dialog" ref={dialog} aria-labelledby="annotation-heading"
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}
      onKeyDown={event => event.stopPropagation()}>
      <article>
        <button onPointerDown={event => event.stopPropagation()} aria-label="Zavřít anotaci" onClick={() => dialog.current?.close()}>×</button>
        <h2 id="annotation-heading">{PROJECT_ANNOTATION.title}</h2>
        {PROJECT_ANNOTATION.paragraphs.map(paragraph => (
          <p key={paragraph}>{formatCzechText(paragraph)}</p>
        ))}
      </article>
    </dialog>
  </div>
}

function GalleryCopy({ scene }: { scene: (typeof scenes)[number] }) {
  return <div className="gallery-band" data-phase={scene.index} style={typographyVars}>
    <h1>{formatCzechText(scene.title)}</h1>
    <p className="gallery-lead">{formatCzechText(scene.description)}</p>
  </div>
}

function Loader() {
  const { progress, active } = useProgress()

  return (
    <div className={`loader ${active ? 'is-active' : ''}`} aria-live="polite">
      <span>Načítání objektu</span>
      <strong>{Math.round(progress)}%</strong>
    </div>
  )
}

export default function App() {
  const forceMobile = useMemo(() => new URLSearchParams(window.location.search).has('mobile'), [])
  const [sceneIndex, setSceneIndex] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('scene')
    const index = scenes.findIndex((item) => item.id === requested)
    return index >= 0 ? index : 0
  })
  const [phase, setPhase] = useState<TransitionPhase>('in')
  const [transitionToken, setTransitionToken] = useState(0)
  const cameraResetRef = useRef(0)
  const [playing, setPlaying] = useState(true)
  const playingRef = useRef(true)
  const scene = scenes[sceneIndex]
  const debug = useMemo(() => new URLSearchParams(window.location.search).has('debug'), [])
  const [mobileLayout, setMobileLayout] = useState(() => forceMobile || window.matchMedia('(max-width: 800px), (pointer: coarse)').matches)
  const prefetchedAssets = useRef(new Set<string>())
  const transitionTimer = useRef<number | undefined>(undefined)

  const prefetchScene = useCallback((index: number) => {
    const target = scenes[(index + scenes.length) % scenes.length]
    const urls = [modelUrlForScene(target.id), ...(target.preloadAssets ?? [])]
    urls.forEach((href) => {
      if (prefetchedAssets.current.has(href)) return
      prefetchedAssets.current.add(href)
      const link = document.createElement('link')
      link.rel = 'prefetch'
      link.as = 'fetch'
      link.href = href
      link.crossOrigin = 'anonymous'
      document.head.appendChild(link)
    })
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 800px), (pointer: coarse)')
    const update = () => setMobileLayout(forceMobile || query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [forceMobile])

  useEffect(() => {
    transitionTimer.current = window.setTimeout(() => setPhase('running'), 760)
    return () => window.clearTimeout(transitionTimer.current)
  }, [])

  const selectScene = useCallback((nextIndex: number) => {
    const normalized = (nextIndex + scenes.length) % scenes.length
    if (normalized === sceneIndex && phase !== 'out') return
    window.clearTimeout(transitionTimer.current)
    if (normalized === sceneIndex) {
      setPhase('running')
      return
    }

    prefetchScene(normalized)
    setPhase('out')
    transitionTimer.current = window.setTimeout(() => {
      setSceneIndex(normalized)
      playingRef.current = true
      setPlaying(true)
      const url = new URL(window.location.href)
      url.searchParams.set('scene', scenes[normalized].id)
      window.history.replaceState({}, '', url)
      setTransitionToken((value) => value + 1)
      setPhase('in')
      transitionTimer.current = window.setTimeout(() => setPhase('running'), 760)
    }, 620)
  }, [phase, prefetchScene, sceneIndex])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') selectScene(sceneIndex + 1)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') selectScene(sceneIndex - 1)
      if (/^[1-9]$/.test(event.key)) selectScene(Number(event.key) - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sceneIndex, selectScene])

  const [sheetOpen, setSheetOpen] = useState(true)
  const swipe = useRef<{ x: number; y: number; canCollapse: boolean } | null>(null)
  const suppressTap = useRef(false)
  const sheetCopy = useRef<HTMLDivElement>(null)
  useEffect(() => { sheetCopy.current?.scrollTo(0, 0) }, [scene.id])
  const resetCamera = () => { cameraResetRef.current += 1 }
  const togglePlayback = () => setPlaying((value) => {
    playingRef.current = !value
    return !value
  })

  if (mobileLayout) {
    return (
      <main className="mobile-shell" style={{ '--accent': scene.accent } as React.CSSProperties}>
        <div className="grain" aria-hidden="true" />
        <header className="mobile-header">
          <Brand compact />
          <div className="mobile-controls">
            <button onPointerDown={event => event.stopPropagation()} className="camera-reset" onClick={resetCamera} aria-label="Vrátit kameru do výchozí polohy" title="Výchozí pohled"><ResetIcon /></button>
            <button onPointerDown={event => event.stopPropagation()} className="playback-toggle" onClick={togglePlayback} aria-label={playing ? 'Pozastavit animaci' : 'Přehrát animaci'} title={playing ? 'Pozastavit animaci' : 'Přehrát animaci'}>{playing ? 'Ⅱ' : '▶'}</button>
          </div>
        </header>

        <section className="mobile-stage" aria-label={scene.title}>
          <Suspense fallback={<Loader />}>
            <WatchExperience scene={scene} transitionToken={transitionToken} cameraResetRef={cameraResetRef} transitioning={phase !== 'running'} playingRef={playingRef} />
          </Suspense>
          <div className={`light-transition phase-${phase}`} aria-hidden="true" />
        </section>

        <section className="mobile-panel" data-expanded={sheetOpen}
          onTouchStart={event => {
            event.stopPropagation()
            suppressTap.current = false
            const touch = event.touches[0]
            const copy = sheetCopy.current
            swipe.current = event.touches.length === 1 ? {
              x: touch.clientX, y: touch.clientY,
              canCollapse: !copy?.contains(event.target as Node) || copy.scrollTop <= 1,
            } : null
          }}
          onTouchMove={event => event.stopPropagation()}
          onTouchCancel={event => { event.stopPropagation(); swipe.current = null }}
          onTouchEnd={event => {
            event.stopPropagation()
            const start = swipe.current
            swipe.current = null
            if (!start) return
            const touch = event.changedTouches[0]
            const dy = touch.clientY - start.y
            if (Math.abs(dy) < 32 || Math.abs(dy) < Math.abs(touch.clientX - start.x) * 1.2) return
            suppressTap.current = true
            if (dy < 0 || start.canCollapse) setSheetOpen(dy < 0)
          }}
          onClickCapture={event => {
            if (!suppressTap.current || event.detail === 0) return
            suppressTap.current = false
            event.preventDefault()
            event.stopPropagation()
          }}>
          <h1><button className="sheet-toggle" onPointerDown={event => event.stopPropagation()}
            aria-expanded={sheetOpen} aria-controls="mobile-scene-copy"
            aria-label={`${sheetOpen ? 'Sbalit' : 'Rozbalit'} popis: ${scene.title}`}
            onClick={() => setSheetOpen(open => !open)}>
            {formatCzechText(scene.title)}
          </button></h1>
          <div className="sheet-reveal" id="mobile-scene-copy" aria-hidden={!sheetOpen}>
            <div className="sheet-scroll" ref={sheetCopy} inert={!sheetOpen}>
              <div className="sheet-paragraphs">
                <p>{formatCzechText(scene.description)}</p>
              </div>
            </div>
          </div>
          <nav className="mobile-nav" aria-label="Animace času">
            <ol>
              {scenes.map((item, index) => (
                <li key={item.id}>
                  <button onPointerDown={event => event.stopPropagation()}
                    className={index === sceneIndex ? 'is-active' : ''}
                    onClick={() => selectScene(index)}
                    aria-current={index === sceneIndex ? 'step' : undefined}
                    aria-label={`${item.index}. ${item.title}`}
                  />
                </li>
              ))}
            </ol>
          </nav>
        </section>

        {debug && <DebugHud sceneId={scene.id} />}
      </main>
    )
  }

  return (
    <main className="app-shell" style={{ '--accent': scene.accent } as React.CSSProperties}>
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <p>Táhni pro otočení · scroll pro přiblížení</p>
          <div className="header-control">
            <span>výchozí pohled</span>
            <button onPointerDown={event => event.stopPropagation()} className="camera-reset" onClick={resetCamera} aria-label="Vrátit kameru do výchozí polohy" title="Výchozí pohled"><ResetIcon /></button>
          </div>
          <div className="header-control">
            <span>{playing ? 'pauza' : 'přehrát'}</span>
            <button onPointerDown={event => event.stopPropagation()} className="playback-toggle" onClick={togglePlayback} aria-label={playing ? 'Pozastavit animaci' : 'Přehrát animaci'} title={playing ? 'Pozastavit animaci' : 'Přehrát animaci'}>{playing ? 'Ⅱ' : '▶'}</button>
          </div>
        </div>
      </header>

      <section className="stage" aria-label={scene.title}>
        <Suspense fallback={<Loader />}>
          <WatchExperience scene={scene} transitionToken={transitionToken} cameraResetRef={cameraResetRef} transitioning={phase !== 'running'} playingRef={playingRef} />
        </Suspense>
        <div className={`light-transition phase-${phase}`} aria-hidden="true" />
      </section>

      <aside className="scene-copy" key={scene.id}>

        <GalleryCopy scene={scene} />
      </aside>

      <nav className="scene-nav" aria-label="Animace času">
        <ol>
          {scenes.map((item, index) => (
            <li key={item.id}>
              <button onPointerDown={event => event.stopPropagation()}
                className={index === sceneIndex ? 'is-active' : ''}
                onPointerEnter={() => prefetchScene(index)}
                onFocus={() => prefetchScene(index)}
                onClick={() => selectScene(index)}
                aria-current={index === sceneIndex ? 'step' : undefined}
                aria-label={`${item.index}. ${item.title}`}
              >
                <b>{item.title}</b>
                <span>{item.index}</span>
                <i />
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <footer>
        <span>Čas jako materiál</span>
        <span>Blender × WebGL</span>
      </footer>

      {debug && <DebugHud sceneId={scene.id} />}
    </main>
  )
}
