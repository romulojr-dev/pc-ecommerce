import { cn } from "@/lib/utils"

// The hero's artwork (docs/specs/016-home-page): a silicon wafer with a die
// grid and three callouts. Decorative, so hidden from screen readers. Inline
// and static: no request, no script, no animation, so it never holds up the
// page's LCP (the headline). Colors come from theme tokens, so it follows
// dark mode.
export function WaferIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 360"
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      <defs>
        <pattern
          id="wafer-dies"
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
          x="4"
          y="4"
        >
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="1.5"
            className="fill-muted stroke-border"
          />
        </pattern>
        <clipPath id="wafer-edge">
          <circle cx="220" cy="180" r="138" />
        </clipPath>
      </defs>

      {/* Outer guide ring and the wafer */}
      <circle
        cx="220"
        cy="180"
        r="158"
        fill="none"
        strokeDasharray="2 4"
        className="stroke-muted-foreground"
      />
      <circle cx="220" cy="180" r="140" className="fill-background" />
      <rect
        x="80"
        y="40"
        width="280"
        height="280"
        fill="url(#wafer-dies)"
        clipPath="url(#wafer-edge)"
      />
      <circle
        cx="220"
        cy="180"
        r="140"
        fill="none"
        strokeWidth="2.5"
        className="stroke-foreground"
      />

      {/* Callout lines and labels */}
      <g
        fill="none"
        strokeWidth="1"
        strokeDasharray="3 3"
        className="stroke-foreground"
      >
        <path d="M235 176 H386" />
        <path d="M276 100 L320 58 H386" />
        <path d="M162 244 L118 290 H58" />
      </g>
      <g className="fill-foreground">
        <circle cx="390" cy="176" r="3" />
        <circle cx="390" cy="58" r="3" />
        <circle cx="54" cy="290" r="3" />
      </g>
      <g className="fill-foreground font-mono text-[10px] font-medium">
        <text x="398" y="180">
          CPU
        </text>
        <text x="398" y="62">
          GPU
        </text>
        <text x="46" y="294" textAnchor="end">
          RAM
        </text>
      </g>

      {/* CPU: a solid die */}
      <rect
        x="208"
        y="167"
        width="20"
        height="20"
        rx="1.5"
        className="fill-foreground"
      />
      {/* GPU: a die with a core */}
      <rect
        x="250"
        y="100"
        width="20"
        height="20"
        rx="1.5"
        strokeWidth="2"
        className="fill-background stroke-foreground"
      />
      <rect x="256" y="106" width="8" height="8" className="fill-foreground" />
      {/* RAM: a module with chips */}
      <rect
        x="144"
        y="224"
        width="20"
        height="20"
        rx="1.5"
        strokeWidth="2"
        className="fill-background stroke-foreground"
      />
      <g className="fill-foreground">
        <rect x="148.5" y="229" width="2.5" height="10" />
        <rect x="152.75" y="229" width="2.5" height="10" />
        <rect x="157" y="229" width="2.5" height="10" />
      </g>
    </svg>
  )
}
