import Link from "next/link"
import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

// A button or link with a light that travels around its border (adapted from
// Magic UI's shimmer button). The colors default to the theme's primary pair,
// so it is black with a white shimmer in light mode and the reverse in dark
// mode, and the animation stops when the visitor asks for reduced motion.

type ShimmerProps = {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
}

const shimmerStyle = ({
  shimmerColor = "var(--primary-foreground)",
  shimmerSize = "0.05em",
  shimmerDuration = "3s",
  borderRadius = "var(--radius)",
  background = "var(--primary)",
}: ShimmerProps) =>
  ({
    "--spread": "90deg",
    "--shimmer-color": shimmerColor,
    "--shimmer-radius": borderRadius,
    "--speed": shimmerDuration,
    "--cut": shimmerSize,
    "--bg": background,
  }) as CSSProperties

const shimmerClass =
  "group/shimmer relative z-0 inline-flex cursor-pointer items-center justify-center overflow-hidden border border-white/10 px-6 py-3 whitespace-nowrap text-primary-foreground [background:var(--bg)] [border-radius:var(--shimmer-radius)] transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px"

function ShimmerLayers({ children }: { children?: React.ReactNode }) {
  return (
    <>
      {/* spark container */}
      <span
        aria-hidden="true"
        className="[container-type:size] absolute inset-0 -z-30 overflow-visible blur-[2px]"
      >
        {/* spark */}
        <span className="absolute inset-0 block [aspect-ratio:1] h-[100cqh] animate-shimmer-slide [border-radius:0] [mask:none] motion-reduce:animate-none">
          {/* spark before */}
          <span className="absolute -inset-full block w-auto [translate:0_0] rotate-0 animate-spin-around [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))] motion-reduce:animate-none" />
        </span>
      </span>
      {children}
      {/* highlight */}
      <span
        aria-hidden="true"
        className="absolute inset-0 size-full transform-gpu [border-radius:var(--shimmer-radius)] shadow-[inset_0_-8px_10px_#ffffff1f] transition-all duration-300 ease-in-out group-hover/shimmer:shadow-[inset_0_-6px_10px_#ffffff3f] group-active/shimmer:shadow-[inset_0_-10px_10px_#ffffff3f]"
      />
      {/* backdrop */}
      <span
        aria-hidden="true"
        className="absolute [inset:var(--cut)] -z-20 [border-radius:var(--shimmer-radius)] [background:var(--bg)]"
      />
    </>
  )
}

type ShimmerButtonProps = React.ComponentProps<"button"> & ShimmerProps

function ShimmerButton({
  shimmerColor,
  shimmerSize,
  shimmerDuration,
  borderRadius,
  background,
  className,
  style,
  children,
  ...props
}: ShimmerButtonProps) {
  return (
    <button
      data-slot="shimmer-button"
      style={{
        ...shimmerStyle({
          shimmerColor,
          shimmerSize,
          shimmerDuration,
          borderRadius,
          background,
        }),
        ...style,
      }}
      className={cn(shimmerClass, className)}
      {...props}
    >
      <ShimmerLayers>{children}</ShimmerLayers>
    </button>
  )
}

type ShimmerLinkProps = React.ComponentProps<typeof Link> & ShimmerProps

// The same look on a Next.js link, for navigation (the header's PC Builder)
function ShimmerLink({
  shimmerColor,
  shimmerSize,
  shimmerDuration,
  borderRadius,
  background,
  className,
  style,
  children,
  ...props
}: ShimmerLinkProps) {
  return (
    <Link
      data-slot="shimmer-button"
      style={{
        ...shimmerStyle({
          shimmerColor,
          shimmerSize,
          shimmerDuration,
          borderRadius,
          background,
        }),
        ...style,
      }}
      className={cn(shimmerClass, className)}
      {...props}
    >
      <ShimmerLayers>{children}</ShimmerLayers>
    </Link>
  )
}

export { ShimmerButton, ShimmerLink }
export type { ShimmerButtonProps, ShimmerLinkProps }
