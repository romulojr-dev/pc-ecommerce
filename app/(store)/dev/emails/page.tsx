import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { DevEmailList } from "@/components/email/dev-email-list"
import { Container } from "@/components/layout/container"
import { listFakeEmails } from "@/lib/email/dev-emails"
import { DEV_EMAILS_COPY, devEmailsEnabled } from "@/lib/email/dev-view"
import { env } from "@/lib/env"

// The emails the fake transport recorded, for tests, previews and local runs
// (docs/specs/036-order-emails, Behavior 14–15). A dev tool, not part of the
// shop: it exists only when EMAIL_TRANSPORT is fake and never in Production,
// and is a plain 404 otherwise, before anything is read. Not linked, not
// indexed, no loading state (so the 404 keeps its status). Its emails carry
// links that open orders, so it shares the order pages' headers
// (no-store, no-referrer; next.config.ts).

export const metadata: Metadata = {
  title: DEV_EMAILS_COPY.title,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function DevEmailsPage() {
  if (!devEmailsEnabled(env.EMAIL_TRANSPORT, env.VERCEL_ENV)) notFound()
  await connection()

  const emails = await listFakeEmails()
  return (
    <Container className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {DEV_EMAILS_COPY.title}
        </h1>
        <p className="text-sm text-muted-foreground">{DEV_EMAILS_COPY.note}</p>
      </header>
      <DevEmailList emails={emails} />
    </Container>
  )
}
