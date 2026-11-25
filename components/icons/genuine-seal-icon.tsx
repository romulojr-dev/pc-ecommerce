// A scalloped seal reading "100%" over a "GENUINE" ribbon (drawn for PC
// Silicon). Black parts are currentColor, white parts the background color.

// The rosette: center (32, 30), base radius 25, 18 scallops of amplitude 1.9,
// 180 samples. Computed once, when the module loads.
const N = 180
export const ROSETTE_PATH =
  "M" +
  Array.from({ length: N }, (_, i) => {
    const t = (2 * Math.PI * i) / N
    const r = 25 + 1.9 * Math.cos(18 * t)
    return `${(32 + r * Math.sin(t)).toFixed(2)} ${(30 - r * Math.cos(t)).toFixed(2)}`
  }).join(" L") +
  "Z"

export function GenuineSealIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      aria-hidden="true"
      {...props}
    >
      <path d={ROSETTE_PATH} fill="currentColor" />
      <circle
        cx="32"
        cy="30"
        r="19"
        fill="none"
        strokeWidth="1.5"
        className="stroke-background"
      />
      <text
        x="32"
        y="28.5"
        textAnchor="middle"
        fontFamily="inherit"
        fontSize="12"
        fontWeight="700"
        letterSpacing="-0.5"
        className="fill-background"
      >
        100%
      </text>
      <path
        d="M3 34h58l-3 5 3 5H3l3-5z"
        fill="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        className="stroke-background"
      />
      <text
        x="32"
        y="42"
        textAnchor="middle"
        fontFamily="inherit"
        fontSize="7"
        fontWeight="700"
        letterSpacing="0.8"
        className="fill-background"
      >
        GENUINE
      </text>
    </svg>
  )
}
