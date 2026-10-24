import type { builderCategories } from "@/lib/specs/registry"

type CategorySlug = keyof typeof builderCategories

// Category pages live at /<slug> (PRD clean URLs, e.g. /gpu/rtx-5070-12gb)
function categoryHref(slug: CategorySlug) {
  return `/${slug}`
}

export type FooterLink = { label: string; href: string }
export type FooterLinkGroup = { title: string; links: FooterLink[] }

export const siteConfig = {
  name: "PC Silicon",
  tagline:
    "PC parts, custom builds, and a PC Builder that checks compatibility for you.",
  author: "Romulo Ramos Jr.",
  email: "romu.dev@outlook.com",
  githubUrl: "https://github.com/romulojr-dev",
  linkedinUrl: "https://www.linkedin.com/in/romulo-dev/",
}

// Placeholder links: most of these routes 404 until their stories ship
export const footerLinkGroups: FooterLinkGroup[] = [
  {
    title: "Shop",
    links: [
      { label: "CPUs", href: categoryHref("cpu") },
      { label: "Graphics Cards", href: categoryHref("gpu") },
      { label: "Motherboards", href: categoryHref("motherboard") },
      { label: "Memory", href: categoryHref("memory") },
      { label: "Storage", href: categoryHref("storage") },
      { label: "Power Supplies", href: categoryHref("psu") },
    ],
  },
  {
    title: "Build",
    links: [
      { label: "PC Builder", href: "/builder" },
      { label: "Saved Builds", href: "/account/builds" },
      { label: "Compatibility Guide", href: "/guides/compatibility" },
      { label: "Build Guides", href: "/guides" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Track Order", href: "/orders/track" },
      { label: "Shipping & Store Pickup", href: "/help/shipping" },
      { label: "Returns & Warranty", href: "/help/returns" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
]
