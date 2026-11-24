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

function Brand() {
  const dialog = useRef<HTMLDialogElement>(null)
  return <div className="brand">
    <span>12 FÁZÍ ČASU</span><small>INTERAKTIVNÍ STUDIE</small>
    <button className="annotation-toggle" onClick={() => dialog.current?.showModal()}>ANOTACE</button>
    <dialog className="annotation-dialog" ref={dialog} aria-labelledby="annotation-heading"
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}
      onKeyDown={event => event.stopPropagation()}>
      <article>
        <button aria-label="Zavřít anotaci" onClick={() => dialog.current?.close()}>×</button>
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
    <p className="gallery-caption">{formatCzechText(scene.animationNote)}</p>
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
  const [panelHidden, setPanelHidden] = useState(false)
  const swipeStart = useRef<{ x: number; y: number; canCollapse: boolean } | null>(null)
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

  const beginSwipe = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0]
    const copy = (event.target as HTMLElement).closest('.mobile-copy')
    swipeStart.current = event.touches.length === 1
      ? { x: touch.clientX, y: touch.clientY, canCollapse: !copy || copy.scrollTop <= 0 }
      : null
  }
  const finishSwipe = (event: React.TouchEvent<HTMLElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dy) >= 30 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      if (dy < 0 || start.canCollapse) setPanelHidden(dy > 0)
    } else if (!panelHidden && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      selectScene(sceneIndex + (dx < 0 ? 1 : -1))
    }
  }

  const resetCamera = () => { cameraResetRef.current += 1 }
  const togglePlayback = () => setPlaying((value) => {
    playingRef.current = !value
    return !value
  })

  if (mobileLayout) {
    return (
      <main className="mobile-shell" data-panel-hidden={panelHidden} style={{ '--accent': scene.accent } as React.CSSProperties}>
        <div className="grain" aria-hidden="true" />
        <header className="mobile-header">
          <Brand />
          <div className="mobile-controls">
            <button className="camera-reset" onClick={resetCamera} aria-label="Vrátit kameru do výchozí polohy" title="Výchozí pohled">↺</button>
            <button className="playback-toggle" onClick={togglePlayback} aria-label={playing ? 'Pozastavit animaci' : 'Přehrát animaci'} title={playing ? 'Pozastavit animaci' : 'Přehrát animaci'}>{playing ? 'Ⅱ' : '▶'}</button>
          </div>
        </header>

        <section className="mobile-stage" aria-label={scene.title}>
          <Suspense fallback={<Loader />}>
            <WatchExperience scene={scene} transitionToken={transitionToken} cameraResetRef={cameraResetRef} transitioning={phase !== 'running'} playingRef={playingRef} />
          </Suspense>
          <div className={`light-transition phase-${phase}`} aria-hidden="true" />
          <span className="mobile-orbit-hint">otáčej jedním prstem · přibližuj dvěma</span>
        </section>

        <section
          className="mobile-panel"
          onTouchStart={beginSwipe}
          onTouchEnd={finishSwipe}
          onTouchCancel={() => { swipeStart.current = null }}
        >
          <button type="button" className="mobile-panel-handle" aria-expanded={!panelHidden}
            aria-label={panelHidden ? 'Vysunout lištu animací' : 'Schovat lištu animací'}
            onClick={() => setPanelHidden(hidden => !hidden)} />
          <div className="mobile-copy"><GalleryCopy scene={scene} /></div>

          <nav className="mobile-nav" aria-label="Animace času">
            <ol>
              {scenes.map((item, index) => (
                <li key={item.id}>
                  <button
                    className={index === sceneIndex ? 'is-active' : ''}
                    onPointerEnter={() => prefetchScene(index)}
                    onFocus={() => prefetchScene(index)}
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
            <button className="camera-reset" onClick={resetCamera} aria-label="Vrátit kameru do výchozí polohy" title="Výchozí pohled">↺</button>
          </div>
          <div className="header-control">
            <span>{playing ? 'pauza' : 'přehrát'}</span>
            <button className="playback-toggle" onClick={togglePlayback} aria-label={playing ? 'Pozastavit animaci' : 'Přehrát animaci'} title={playing ? 'Pozastavit animaci' : 'Přehrát animaci'}>{playing ? 'Ⅱ' : '▶'}</button>
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
              <button
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
