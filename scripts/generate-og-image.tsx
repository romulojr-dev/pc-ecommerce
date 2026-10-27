import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { ImageResponse } from "next/og"

import { siteConfig } from "@/lib/site"

// pnpm images:og: writes the default link-preview image,
// public/images/og-default.png (docs/specs/017-seo). The output is
// committed; re-run only to change the artwork.

// 1200 × 630, the size Open Graph and X's large card expect. The text is
// Geist Regular, the one font next/og bundles (no bold weight). A script can't
// read the theme's CSS variables, so these are the light theme's neutral
// tokens as hex: foreground, muted-foreground, border, muted.
const WIDTH = 1200
const HEIGHT = 630
const FOREGROUND = "#0a0a0a"
const MUTED_FOREGROUND = "#737373"
const BORDER = "#e5e5e5"
const MUTED = "#f5f5f5"

// The hero's wafer, simplified: a circle of dies under a dashed guide ring.
// Only whole dies inside the wafer are drawn, so it needs no clip path; the
// grid is centred, so the wafer looks symmetric.
const WAFER = 400
const RADIUS = 170
const DIE = 24
const DIE_GAP = 4

function dies() {
  const centre = WAFER / 2
  const count = Math.floor((2 * RADIUS) / DIE)
  const start = centre - (count * DIE) / 2
  const cells: { x: number; y: number }[] = []
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      const x = start + column * DIE
      const y = start + row * DIE
      const corners = [
        [x, y],
        [x + DIE, y],
        [x, y + DIE],
        [x + DIE, y + DIE],
      ]
      const inside = corners.every(
        ([cx, cy]) => (cx - centre) ** 2 + (cy - centre) ** 2 <= RADIUS ** 2
      )
      if (inside) cells.push({ x, y })
    }
  }
  return cells
}

function Wafer() {
  const centre = WAFER / 2
  return (
    <svg width={WAFER} height={WAFER} viewBox={`0 0 ${WAFER} ${WAFER}`}>
      <circle
        cx={centre}
        cy={centre}
        r={RADIUS + 22}
        fill="none"
        stroke={MUTED_FOREGROUND}
        strokeWidth={2}
        strokeDasharray="3 7"
      />
      <circle cx={centre} cy={centre} r={RADIUS} fill="#ffffff" />
      {dies().map(({ x, y }) => (
        <rect
          key={`${x}-${y}`}
          x={x + DIE_GAP / 2}
          y={y + DIE_GAP / 2}
          width={DIE - DIE_GAP}
          height={DIE - DIE_GAP}
          rx={2}
          fill={MUTED}
          stroke={BORDER}
          strokeWidth={1.5}
        />
      ))}
      <circle
        cx={centre}
        cy={centre}
        r={RADIUS}
        fill="none"
        stroke={FOREGROUND}
        strokeWidth={3}
      />
    </svg>
  )
}

// The header's logo mark (components/layout/logo.tsx), drawn at 64 px
function LogoMark() {
  return (
    <svg width={64} height={64} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke={FOREGROUND} strokeWidth={1.25} />
      <path
        d="M9 2.46v19.08M15 2.46v19.08M2.46 9h19.08M2.46 15h19.08"
        stroke={FOREGROUND}
        strokeWidth={1.25}
      />
      <rect x="10.25" y="10.25" width="3.5" height="3.5" fill={FOREGROUND} />
    </svg>
  )
}

const image = new ImageResponse(
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 80px",
      backgroundColor: "#ffffff",
      color: FOREGROUND,
    }}
  >
    <div style={{ display: "flex", flexDirection: "column", width: 620 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <LogoMark />
        <div style={{ fontSize: 64, letterSpacing: -2 }}>pcsilicon</div>
      </div>
      <div
        style={{
          marginTop: 48,
          fontSize: 56,
          lineHeight: 1.1,
          letterSpacing: -1.5,
        }}
      >
        Build a PC that just works.
      </div>
      <div
        style={{
          marginTop: 24,
          fontSize: 30,
          lineHeight: 1.35,
          color: MUTED_FOREGROUND,
        }}
      >
        {siteConfig.tagline}
      </div>
    </div>
    <Wafer />
  </div>,
  { width: WIDTH, height: HEIGHT }
)

const out = fileURLToPath(
  new URL("../public/images/og-default.png", import.meta.url)
)
writeFileSync(out, Buffer.from(await image.arrayBuffer()))
console.log(`Wrote ${out}`)
