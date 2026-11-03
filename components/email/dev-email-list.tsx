import {
  DEV_EMAILS_COPY,
  DEV_EMAILS_SANDBOX,
  frameDocument,
  linkify,
} from "@/lib/email/dev-view"
import { dateTimeText } from "@/lib/orders/time"

// The emails /dev/emails lists (docs/specs/036-order-emails, Behavior 14).
// Server-rendered, no client code: the HTML version sits in a sandboxed frame
// that blocks scripts but lets a link open in a new tab; the text version is
// shown with its URLs as links.

export type DevEmailRow = {
  id: string
  from: string
  to: string
  subject: string
  html: string
  text: string
  createdAt: Date
}

function TextVersion({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
      {linkify(text).map((part, index) =>
        "href" in part ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {part.href}
          </a>
        ) : (
          part.text
        )
      )}
    </pre>
  )
}

export function DevEmailList({ emails }: { emails: DevEmailRow[] }) {
  if (emails.length === 0) {
    return <p className="text-sm">{DEV_EMAILS_COPY.empty}</p>
  }
  return (
    <ul className="flex flex-col gap-8">
      {emails.map((email) => (
        <li key={email.id}>
          <article className="flex flex-col gap-3 rounded-lg border p-5">
            <h2 className="text-base font-medium">{email.subject}</h2>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{DEV_EMAILS_COPY.to}</dt>
              <dd>{email.to}</dd>
              <dt className="text-muted-foreground">{DEV_EMAILS_COPY.from}</dt>
              <dd>{email.from}</dd>
              <dt className="text-muted-foreground">{DEV_EMAILS_COPY.sent}</dt>
              <dd>{dateTimeText(email.createdAt)}</dd>
            </dl>
            <h3 className="text-sm font-medium">{DEV_EMAILS_COPY.html}</h3>
            <iframe
              title={`${DEV_EMAILS_COPY.html}: ${email.subject}`}
              sandbox={DEV_EMAILS_SANDBOX}
              srcDoc={frameDocument(email.html)}
              className="h-[640px] w-full max-w-[640px] rounded-md border bg-white"
            />
            <h3 className="text-sm font-medium">{DEV_EMAILS_COPY.text}</h3>
            <TextVersion text={email.text} />
          </article>
        </li>
      ))}
    </ul>
  )
}
