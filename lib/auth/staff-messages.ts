import type {
  CreateResult,
  DisableResult,
  EnableResult,
  PasswordResult,
} from "./accounts"

// What the staff scripts and the seed's --accounts-only mode print
// (docs/specs/039-staff-sign-in-admin-shell, §5 Messages and copy). Pure, and
// none of them takes or prints a password.

const plural = (n: number) => `${n} session(s)`

export const staffMessages = {
  hostLine: (host: string) => `Database: ${host}`,

  created: (role: "OWNER" | "STAFF", email: string) =>
    `Created ${role.toLowerCase()} ${email}.`,
  passwordChanged: (email: string, sessions: number) =>
    `Changed the password for ${email} and ended ${plural(sessions)}.`,
  disabled: (email: string, sessions: number) =>
    `Disabled ${email} and ended ${plural(sessions)}.`,
  enabled: (email: string) => `Enabled ${email}.`,

  exists: (email: string) =>
    `${email} already exists. Use --enable to re-enable it.`,
  notFound: (email: string) => `No user with email ${email}.`,
  alreadyDisabled: (email: string) => `${email} is already disabled.`,
  alreadyEnabled: (email: string) => `${email} is not disabled.`,

  passwordPrompt: "Password (hidden): ",
  repeatPrompt: "Repeat password: ",
  mismatch: "The passwords don't match.",
  emptyPassword: "No password was given.",

  demoCreated: "Created the demo account.",
  demoExists: "The demo account already exists; left as it is.",
  demoSkipped: "DEMO_ACCOUNT_PASSWORD is not set; skipped the demo account.",
  accountsOnlyWithReset: "--accounts-only can't be combined with --reset.",
}

// One line per outcome of createStaffUser; `exit` is the process exit code
export function describeCreate(
  result: CreateResult,
  role: "OWNER" | "STAFF",
  email: string
): { text: string; exit: number } {
  if (result.status === "created")
    return { text: staffMessages.created(role, email), exit: 0 }
  if (result.status === "exists")
    return { text: staffMessages.exists(email), exit: 1 }
  return { text: result.message, exit: 1 }
}

export function describePassword(
  result: PasswordResult,
  email: string
): { text: string; exit: number } {
  if (result.status === "changed")
    return {
      text: staffMessages.passwordChanged(email, result.sessions),
      exit: 0,
    }
  if (result.status === "not-found")
    return { text: staffMessages.notFound(email), exit: 1 }
  return { text: result.message, exit: 1 }
}

export function describeDisable(
  result: DisableResult,
  email: string
): { text: string; exit: number } {
  if (result.status === "disabled")
    return { text: staffMessages.disabled(email, result.sessions), exit: 0 }
  if (result.status === "already-disabled")
    return { text: staffMessages.alreadyDisabled(email), exit: 0 }
  return { text: staffMessages.notFound(email), exit: 1 }
}

export function describeEnable(
  result: EnableResult,
  email: string
): { text: string; exit: number } {
  if (result.status === "enabled")
    return { text: staffMessages.enabled(email), exit: 0 }
  if (result.status === "already-enabled")
    return { text: staffMessages.alreadyEnabled(email), exit: 0 }
  return { text: staffMessages.notFound(email), exit: 1 }
}

export function describeDemo(result: CreateResult): {
  text: string
  exit: number
} {
  if (result.status === "created")
    return { text: staffMessages.demoCreated, exit: 0 }
  if (result.status === "exists")
    return { text: staffMessages.demoExists, exit: 0 }
  return { text: result.message, exit: 1 }
}
