import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { env } from "@/lib/env"
import { siteConfig } from "@/lib/site"
import { cn } from "@/lib/utils"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  // Makes relative metadata URLs (canonicals, Open Graph) absolute
  // (docs/specs/017-seo). Never set a canonical here: every page that
  // doesn't set its own would inherit it.
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    template: `%s | ${siteConfig.name}`,
    default: siteConfig.name,
  },
  description: siteConfig.tagline,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        // Smooth scrolling for in-page links (the home page's "Shop deals"),
        // only when the visitor allows motion
        "font-sans antialiased motion-safe:scroll-smooth",
        fontSans.variable,
        fontMono.variable
      )}
    >
      <body className="flex min-h-svh flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
