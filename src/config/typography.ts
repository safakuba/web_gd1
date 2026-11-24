import type { CSSProperties } from 'react'

// Rodina se dědí z projektu. Řezy systémového písma: 300 light, 400 regular,
// 500 medium, 600 semibold, 700 bold (dostupnost závisí na instalovaném písmu).
// letterSpacing je proklad v em, fontSize velikost, lineHeight násobek velikosti.
const body = { fontWeight: 400, letterSpacing: '0em', fontSize: '15px', lineHeight: 1.45 }
export const typography = {
  sceneTitle: { fontWeight: 300, letterSpacing: '-.03em', fontSize: 'calc(2 * var(--sceneLead-fontSize) * var(--sceneLead-lineHeight))', lineHeight: 1 },
  sceneLead: body,
  sceneCaption: body,
}

export const typographyVars = Object.fromEntries(Object.entries(typography).flatMap(
  ([role, settings]) => Object.entries(settings).map(([key, value]) => [`--${role}-${key}`, String(value)])
)) as CSSProperties
