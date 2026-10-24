import Link from "next/link"
import { MailIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Container } from "@/components/layout/container"
import { Logo } from "@/components/layout/logo"
import { NewsletterForm } from "@/components/layout/newsletter-form"
import { GitHubIcon, LinkedInIcon } from "@/components/layout/social-icons"
import { footerLinkGroups, siteConfig } from "@/lib/site"
import { cn, focusRing } from "@/lib/utils"

const socialLink = cn(
  buttonVariants({ variant: "ghost", size: "icon-lg" }),
  focusRing,
  "[&_svg:not([class*='size-'])]:size-6"
)

function SiteFooter() {
  return (
    <footer className="shrink-0">
      <Container>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-16 pt-14">
          <div className="flex flex-col gap-4">
            <Logo />
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {siteConfig.tagline}
            </p>
            <div className="mt-6">
              <NewsletterForm />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-x-12">
            {footerLinkGroups.map((group) => {
              const headingId = `footer-${group.title.toLowerCase()}`
              return (
                <nav key={group.title} aria-labelledby={headingId}>
                  <h2 id={headingId} className="text-sm font-semibold">
                    {group.title}
                  </h2>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className={cn(
                            "rounded-sm text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                            focusRing
                          )}
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              )
            })}
          </div>
        </div>

        <Separator className="mt-10" />

        <div className="flex items-center justify-between gap-6 py-5">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {siteConfig.name} · A concept project
            by {siteConfig.author}
          </p>
          <div className="flex items-center gap-3">
            <a
              href={`mailto:${siteConfig.email}`}
              className={cn(
                buttonVariants({ size: "lg" }),
                focusRing,
                "mr-1 h-9 gap-2 rounded-xl px-4 text-sm"
              )}
            >
              <MailIcon aria-hidden="true" data-icon="inline-start" />
              {siteConfig.email}
            </a>
            <a
              href={siteConfig.githubUrl}
              aria-label="GitHub"
              className={socialLink}
            >
              <GitHubIcon />
            </a>
            <a
              href={siteConfig.linkedinUrl}
              aria-label="LinkedIn"
              className={socialLink}
            >
              <LinkedInIcon />
            </a>
          </div>
        </div>
      </Container>
    </footer>
  )
}

export { SiteFooter }
