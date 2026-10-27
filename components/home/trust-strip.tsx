import {
  CircleCheckIcon,
  CreditCardIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from "lucide-react"

import { siteConfig } from "@/lib/site"

const items = [
  {
    icon: CircleCheckIcon,
    title: "Compatibility-checked",
    text: "The PC Builder flags parts that won’t fit or work together.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Genuine parts",
    text: "Brand-new components with manufacturer warranty.",
  },
  {
    icon: MapPinIcon,
    title: "Delivery or store pickup",
    text: "Ship it to your door or pick it up in store.",
  },
  {
    icon: CreditCardIcon,
    title: "Flexible payments",
    text: "GCash, Maya, cards, cash on delivery and installments.",
  },
]

// The trust strip (docs/specs/016-home-page). Its heading is for screen
// readers only, so the heading order stays intact. The lines use the
// foreground color: muted text on the muted surface would be under 4.5:1.
export function TrustStrip() {
  return (
    <section aria-labelledby="trust-strip" className="mt-16">
      <h2 id="trust-strip" className="sr-only">
        Why shop with {siteConfig.name}
      </h2>
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3 rounded-lg bg-muted p-4">
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <h3 className="text-sm font-medium">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
