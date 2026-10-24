import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn, focusRing } from "@/lib/utils"

// Visual only (spec 002 R2): enabled, but Subscribe does nothing yet
function NewsletterForm() {
  return (
    <div className="flex max-w-md flex-col gap-3">
      <Label htmlFor="deal-alerts-email" className="text-sm">
        Get deal alerts
      </Label>
      <div className="flex gap-2">
        <Input
          id="deal-alerts-email"
          type="email"
          placeholder="you@email.com"
          autoComplete="email"
          className="h-9 flex-1 rounded-xl border-transparent bg-muted px-3 md:text-sm dark:bg-muted"
        />
        <Button
          type="button"
          size="lg"
          className={cn("h-9 rounded-xl px-4 text-sm", focusRing)}
        >
          Subscribe
        </Button>
      </div>
    </div>
  )
}

export { NewsletterForm }
