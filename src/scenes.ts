import { phasesContent } from './data/phasesContent'
import type { SceneDefinition } from './types'

const camera = {
  position: [11.2, 24.4, -15.9] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
  fov: 39,
}

const orbit = {
  minPolarAngle: Math.PI * 0.01,
  maxPolarAngle: Math.PI * 0.99,
  minAzimuthAngle: -Math.PI * 100,
  maxAzimuthAngle: Math.PI * 100,
  minDistance: 2.25,
  maxDistance: 9.2,
}

export const scenes: SceneDefinition[] = [
  {
    ...phasesContent['01'], id: 'stretch', index: '01', duration: 6,
    effect: 'stretch', camera, orbit, accent: '#ff2fc8',
  },
  {
    ...phasesContent['02'], id: 'squash', index: '02', duration: 7.5,
    effect: 'squash', camera, orbit, accent: '#ff6b2c',
  },
  {
    ...phasesContent['03'], id: 'acceleration', index: '03', duration: 7.875,
    effect: 'acceleration', camera, orbit, accent: '#ffd84c',
  },
  {
    ...phasesContent['04'], id: 'stillness', index: '04', duration: 7.5,
    effect: 'stillness', camera, orbit, accent: '#a9e9ff',
  },
  {
    ...phasesContent['05'], id: 'loop', index: '05', duration: 7.8,
    effect: 'loop', camera, orbit, accent: '#ff4d6d',
  },
  {
    ...phasesContent['06'], id: 'disintegration', index: '06', duration: 9,
    effect: 'disintegration', camera, orbit, accent: '#d9b27c',
  },
  {
    ...phasesContent['07'], id: 'aging', index: '07', duration: 7.458333333333333,
    effect: 'aging', camera, orbit, accent: '#b96f42',
  },
  {
    ...phasesContent['08'], id: 'layering', index: '08', duration: 8,
    effect: 'layering', camera, orbit, accent: '#9e7bff',
  },
  {
    ...phasesContent['09'], id: 'echo', index: '09', duration: 7.5,
    effect: 'echo', camera, orbit, accent: '#54a8ff',
  },
  {
    ...phasesContent['10'], id: 'fragmentation', index: '10', duration: 9,
    effect: 'fragmentation', camera, orbit, accent: '#70ffbd',
  },
  {
    ...phasesContent['11'], id: 'futures', index: '11', duration: 7.5,
    effect: 'futures', camera, orbit, accent: '#ff7df2',
  },
  {
    ...phasesContent['12'], id: 'relativity', index: '12', duration: 10,
    effect: 'relativity', camera, orbit, accent: '#64e2ff',
  },
]
