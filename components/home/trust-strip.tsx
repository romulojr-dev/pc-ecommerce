import { FastDeliveryIcon } from "@/components/icons/fast-delivery-icon"
import { GenuineSealIcon } from "@/components/icons/genuine-seal-icon"
import { PaymentCardsIcon } from "@/components/icons/payment-cards-icon"
import { siteConfig } from "@/lib/site"

const items = [
  {
    icon: FastDeliveryIcon,
    title: "Fast delivery",
    text: "Quick shipping to your door, or pick it up in store.",
  },
  {
    icon: GenuineSealIcon,
    title: "Genuine parts",
    text: "Brand-new components with manufacturer warranty.",
  },
  {
    icon: PaymentCardsIcon,
    title: "Flexible payment",
    text: "GCash, Maya, cards, cash on delivery and installments.",
  },
]

// Three selling points, centered as a group, with no borders or backgrounds.
// The section is named by aria-label; the item titles are plain text, since a
// heading here would skip a level.
export function TrustStrip() {
  return (
    <section
      aria-label={`Why shop with ${siteConfig.name}`}
      className="mb-20 py-2"
    >
      <ul className="flex flex-wrap justify-center gap-x-16 gap-y-8">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-center gap-4">
            <Icon aria-hidden="true" className="size-16 shrink-0" />
            <div className="flex w-[180px] flex-col gap-1.5">
              <p className="text-base font-semibold tracking-[-0.01em]">
                {title}
              </p>
              <p className="text-[13px] leading-[1.55] text-muted-foreground">
                {text}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
