import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
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
