import Link from "next/link"

import { cn, focusRing } from "@/lib/utils"

type HomeSectionProps = {
  // The heading's id, which labels the section
  id: string
  title: string
  description?: string
  // A link beside the heading, e.g. "View all deals"
  action?: { label: string; href: string }
  className?: string
  children: React.ReactNode
}

// One section of the home page (docs/specs/016-home-page): a region named by
// its h2, with an optional line and link beside the heading
export function HomeSection({
  id,
  title,
  description,
  action,
  className,
  children,
}: HomeSectionProps) {
  return (
    <section aria-labelledby={id} className={cn("mt-16", className)}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2
            id={id}
            className="font-heading text-xl font-semibold tracking-tight"
          >
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && (
          <Link
            href={action.href}
            className={cn(
              "shrink-0 rounded-sm text-sm font-medium hover:underline",
              focusRing
            )}
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}
