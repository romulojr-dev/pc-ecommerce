"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Dialog } from "@base-ui/react/dialog"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { ArrowRightIcon, CheckIcon, LayoutGridIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { MenuCategory } from "@/lib/categories"
import { categoryHref, isCurrentCategory } from "@/lib/site"
import { cn, focusRing } from "@/lib/utils"

// The header's category drawer: a panel that slides in from the left with a
// curved leading edge that settles flat (after the curved menu on 21st.dev).
// Base UI's Dialog gives it the focus trap, Escape, scroll lock and the
// returned focus; Motion only animates it. MotionConfig drops the movement
// when the visitor asks for reduced motion.

const EASE = [0.76, 0, 0.24, 1] as const

const panel = {
  initial: { x: "calc(-100% - 100px)" },
  enter: { x: 0, transition: { duration: 0.7, ease: EASE } },
  exit: { x: "calc(-100% - 100px)", transition: { duration: 0.6, ease: EASE } },
}

// The edge, in a 100 × 100 box stretched to the panel's height: it starts as
// a bulge ahead of the panel and flattens as the panel arrives
const BULGED = "M0 0 L0 100 Q200 50 0 0"
const FLAT = "M0 0 L0 100 Q0 50 0 0"

const curve = {
  initial: { d: BULGED },
  enter: { d: FLAT, transition: { duration: 0.9, ease: EASE } },
  exit: { d: BULGED, transition: { duration: 0.6, ease: EASE } },
}

const MotionLink = motion.create(Link)

function CurvedEdge() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute top-0 -right-[99px] h-full w-[100px] fill-background"
    >
      <motion.path
        variants={curve}
        initial="initial"
        animate="enter"
        exit="exit"
      />
    </svg>
  )
}

type DrawerLinkProps = MenuCategory & {
  index: number
  current: boolean
  onNavigate: () => void
}

// One category: its number, then its name, whose letters ripple on hover and
// keyboard focus. The letters are aria-hidden and the name is read once from
// the visually hidden copy, so the link's name stays "CPU", not "C P U".
function DrawerLink({
  name,
  slug,
  index,
  current,
  onNavigate,
}: DrawerLinkProps) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -24 }}
      animate={{
        opacity: 1,
        x: 0,
        transition: { delay: 0.35 + index * 0.04, duration: 0.4 },
      }}
      className="border-b"
    >
      <MotionLink
        href={categoryHref(slug)}
        onClick={onNavigate}
        aria-current={current ? "page" : undefined}
        initial="rest"
        whileHover="hover"
        whileFocus="hover"
        className={cn(
          "group/drawer-link flex items-baseline gap-4 rounded-sm py-4 text-3xl leading-tight font-light tracking-[-0.035em] aria-[current=page]:font-semibold",
          focusRing
        )}
      >
        <span
          aria-hidden="true"
          className="w-7 shrink-0 text-sm font-normal tracking-normal text-muted-foreground tabular-nums"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="sr-only">{name}</span>
        <motion.span
          aria-hidden="true"
          variants={{ rest: { x: 0 }, hover: { x: -12 } }}
          transition={{ type: "spring", staggerChildren: 0.03 }}
          className="block min-w-0 [overflow-wrap:anywhere]"
        >
          {name.split("").map((letter, i) => (
            <motion.span
              key={i}
              variants={{ rest: { x: 0 }, hover: { x: 12 } }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="inline-block whitespace-pre"
            >
              {letter}
            </motion.span>
          ))}
        </motion.span>
        {current && (
          <CheckIcon
            aria-hidden="true"
            className="ml-auto size-5 self-center"
          />
        )}
      </MotionLink>
    </motion.li>
  )
}

function CategoryDrawer({ categories }: { categories: MenuCategory[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  // Client navigation keeps the layout mounted, so a link closes the drawer
  const close = () => setOpen(false)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button
            variant="ghost"
            size="lg"
            className={cn("shrink-0", focusRing)}
          />
        }
      >
        <LayoutGridIcon aria-hidden="true" data-icon="inline-start" />
        Categories
      </Dialog.Trigger>
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {open && (
            <Dialog.Portal keepMounted>
              <Dialog.Backdrop
                render={
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.4 } }}
                    exit={{ opacity: 0, transition: { duration: 0.5 } }}
                  />
                }
                className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-xs"
              />
              <Dialog.Popup
                render={
                  <motion.div
                    variants={panel}
                    initial="initial"
                    animate="enter"
                    exit="exit"
                  />
                }
                className="fixed inset-y-0 left-0 z-50 h-dvh w-full max-w-md bg-background text-foreground outline-none"
              >
                <div className="flex h-full flex-col overflow-y-auto px-10 pt-8 pb-8">
                  <div className="flex items-center justify-between border-b pb-3">
                    <Dialog.Title className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                      Categories
                    </Dialog.Title>
                    <Dialog.Close
                      render={
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          className={cn("-mr-2", focusRing)}
                        />
                      }
                    >
                      <XIcon aria-hidden="true" className="size-5" />
                      <span className="sr-only">Close</span>
                    </Dialog.Close>
                  </div>
                  <nav aria-label="Categories" className="mt-2">
                    <ul>
                      {categories.map((category, index) => (
                        <DrawerLink
                          key={category.slug}
                          {...category}
                          index={index}
                          current={isCurrentCategory(pathname, category.slug)}
                          onNavigate={close}
                        />
                      ))}
                    </ul>
                  </nav>
                  <div className="mt-auto pt-10">
                    <Link
                      href="/builder"
                      onClick={close}
                      className={cn(
                        "group/builder flex items-center justify-between gap-4 rounded-lg bg-muted p-4 text-sm transition-colors hover:bg-[#EBEBEB] dark:hover:bg-accent/70",
                        focusRing
                      )}
                    >
                      <span>
                        <span className="block font-semibold">
                          Not sure what fits?
                        </span>
                        <span className="block text-foreground/70">
                          The PC Builder checks every part as you pick.
                        </span>
                      </span>
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 transition-transform group-hover/builder:translate-x-0.5"
                      />
                    </Link>
                  </div>
                </div>
                <CurvedEdge />
              </Dialog.Popup>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </MotionConfig>
    </Dialog.Root>
  )
}

export { CategoryDrawer }
