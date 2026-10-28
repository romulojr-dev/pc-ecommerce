import { InfoIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

// What changed in the saved build since the last visit (docs/specs/020-
// builder-page, Behavior 6). The status region stays mounted, so the lines
// are announced when they appear.
export function BuildNotice({
  lines,
  onDismiss,
}: {
  lines: readonly string[]
  onDismiss: () => void
}) {
  return (
    <div role="status">
      {lines.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
          <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-1 flex-col gap-1 text-sm">
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}
