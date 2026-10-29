import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// What the dialog is showing about the link (docs/specs/022-share-build,
// Behavior 3–9)
export type SharePhase =
  | { kind: "creating" }
  | { kind: "created"; url: string }
  | { kind: "error"; message: string }

export type CopyState = "idle" | "copied" | "failed"

const COPY_TEXT: Record<CopyState, string> = {
  idle: "",
  copied: "Link copied",
  failed: "Couldn’t copy the link. Select it and copy it yourself.",
}

type BodyProps = {
  phase: SharePhase
  copy: CopyState
  onCopy: () => void
  onRetry: () => void
  inputRef?: React.Ref<HTMLInputElement>
}

// The dialog's contents, apart from the dialog itself so its markup can be
// tested. The status region is always there, so a new line is announced.
export function ShareDialogBody({
  phase,
  copy,
  onCopy,
  onRetry,
  inputRef,
}: BodyProps) {
  return (
    <div className="flex flex-col gap-3" aria-busy={phase.kind === "creating"}>
      {phase.kind === "creating" && (
        <p className="text-sm text-muted-foreground">Creating your link…</p>
      )}

      {phase.kind === "created" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="share-link" className="text-sm font-medium">
              Share link
            </label>
            <div className="flex gap-2">
              <Input
                id="share-link"
                ref={inputRef}
                readOnly
                value={phase.url}
                className="h-9 text-sm"
              />
              <Button size="lg" className="h-9 text-sm" onClick={onCopy}>
                Copy link
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            This link shows these parts. Prices and stock are always up to date.
          </p>
        </>
      )}

      {phase.kind === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm">{phase.message}</p>
          <Button variant="outline" size="lg" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      <p role="status" className="min-h-5 text-sm">
        {COPY_TEXT[copy]}
      </p>
    </div>
  )
}
