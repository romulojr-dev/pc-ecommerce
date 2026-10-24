import { cn } from "@/lib/utils"

// Globe grid with a chip in the centre cell. Lines end on the circle
// (x or y = 12 ± 3, half-chord = sqrt(10² - 3²) ≈ 9.54)
function LogoMark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      aria-hidden="true"
      className={cn("size-9 shrink-0", className)}
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9 2.46v19.08M15 2.46v19.08M2.46 9h19.08M2.46 15h19.08" />
      <rect
        x="10.25"
        y="10.25"
        width="3.5"
        height="3.5"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

function Logo({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-3 text-3xl leading-none tracking-tight",
        className
      )}
      {...props}
    >
      <LogoMark />
      <span>
        <span className="font-bold">pc</span>silicon
      </span>
    </span>
  )
}

export { Logo, LogoMark }
