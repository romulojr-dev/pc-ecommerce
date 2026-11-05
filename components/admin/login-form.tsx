"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth/client"
import { ADMIN_COPY } from "@/lib/admin/copy"
import {
  signInFailureText,
  validateLogin,
  type LoginFieldErrors,
} from "@/lib/admin/login-view"

// The staff sign-in form (docs/specs/039-staff-sign-in-admin-shell, Rules 17
// and 31). It signs in through the HTTP endpoint with the Better Auth client,
// never a server action: only the HTTP route runs the rate limiter (D4).

export type DemoAccount = { email: string; password: string }

export type LoginFormViewProps = {
  email: string
  password: string
  fieldErrors: LoginFieldErrors
  // The line under the form after a sign-in that didn't work
  message: string | null
  busy: boolean
  // Shown when the environment has a demo password (D17)
  demo: DemoAccount | null
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onUseDemo: () => void
  emailRef?: React.Ref<HTMLInputElement>
  passwordRef?: React.Ref<HTMLInputElement>
  submitRef?: React.Ref<HTMLButtonElement>
}

// Markup only, so the states can be tested without a browser
export function LoginFormView({
  email,
  password,
  fieldErrors,
  message,
  busy,
  demo,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onUseDemo,
  emailRef,
  passwordRef,
  submitRef,
}: LoginFormViewProps) {
  const copy = ADMIN_COPY.login
  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <Card>
        <CardHeader>
          <h1 className="font-heading text-lg font-medium">{copy.title}</h1>
          <CardDescription>{copy.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate aria-busy={busy}>
            <FieldGroup>
              <Field data-invalid={fieldErrors.email ? true : undefined}>
                <FieldLabel htmlFor="admin-email">{copy.emailLabel}</FieldLabel>
                <Input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={
                    fieldErrors.email ? "admin-email-error" : undefined
                  }
                  disabled={busy}
                  ref={emailRef}
                />
                {fieldErrors.email && (
                  <FieldError id="admin-email-error">
                    {fieldErrors.email}
                  </FieldError>
                )}
              </Field>
              <Field data-invalid={fieldErrors.password ? true : undefined}>
                <FieldLabel htmlFor="admin-password">
                  {copy.passwordLabel}
                </FieldLabel>
                <Input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={
                    fieldErrors.password ? "admin-password-error" : undefined
                  }
                  disabled={busy}
                  ref={passwordRef}
                />
                {fieldErrors.password && (
                  <FieldError id="admin-password-error">
                    {fieldErrors.password}
                  </FieldError>
                )}
              </Field>

              {/* Always in the page, so a screen reader announces the text
                  when it appears */}
              <div
                aria-live="assertive"
                className="min-h-5 text-sm text-destructive"
                data-testid="login-message"
              >
                {message}
              </div>

              <Field>
                <Button type="submit" disabled={busy} ref={submitRef}>
                  {busy ? copy.submitting : copy.submit}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {demo && (
        <Card size="sm" aria-labelledby="demo-account-heading" role="region">
          <CardHeader>
            <h2
              id="demo-account-heading"
              className="font-heading text-sm font-medium"
            >
              {ADMIN_COPY.demo.heading}
            </h2>
            <CardDescription>{ADMIN_COPY.demo.text}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">
                {ADMIN_COPY.demo.emailLabel}
              </dt>
              <dd className="font-mono break-all">{demo.email}</dd>
              <dt className="text-muted-foreground">
                {ADMIN_COPY.demo.passwordLabel}
              </dt>
              <dd className="font-mono break-all">{demo.password}</dd>
            </dl>
            <Button
              type="button"
              variant="outline"
              onClick={onUseDemo}
              disabled={busy}
            >
              {ADMIN_COPY.demo.use}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function LoginForm({
  next,
  demo,
}: {
  // Already checked by safeNext on the server
  next: string
  demo: DemoAccount | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const errors = validateLogin({ email, password })
    setFieldErrors(errors)
    setMessage(null)
    if (errors.email) return emailRef.current?.focus()
    if (errors.password) return passwordRef.current?.focus()

    setBusy(true)
    let retryAfter: string | null = null
    try {
      const { error } = await authClient.signIn.email({
        email: email.trim(),
        password,
        fetchOptions: {
          onError: (context) => {
            retryAfter = context.response.headers.get("X-Retry-After")
          },
        },
      })
      if (error) {
        setMessage(signInFailureText(error.status, retryAfter))
        setPassword("")
        setBusy(false)
        // The field is disabled while busy; focus once it is enabled again
        requestAnimationFrame(() => passwordRef.current?.focus())
        return
      }
      // Stay busy while the next page loads
      router.replace(next)
    } catch {
      setMessage(signInFailureText(undefined, null))
      setBusy(false)
      requestAnimationFrame(() => submitRef.current?.focus())
    }
  }

  return (
    <LoginFormView
      email={email}
      password={password}
      fieldErrors={fieldErrors}
      message={message}
      busy={busy}
      demo={demo}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={onSubmit}
      onUseDemo={() => {
        if (!demo) return
        setEmail(demo.email)
        setPassword(demo.password)
        setFieldErrors({})
        setMessage(null)
        // The shopper's next step is pressing Sign in
        requestAnimationFrame(() => submitRef.current?.focus())
      }}
      emailRef={emailRef}
      passwordRef={passwordRef}
      submitRef={submitRef}
    />
  )
}
