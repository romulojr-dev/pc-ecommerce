// The command line of the staff scripts (docs/specs/039-staff-sign-in-admin-
// shell, Rules 23–27). Pure. There is deliberately no password option: the
// password comes from a hidden prompt or from standard input.

export type StaffRole = "OWNER" | "STAFF"

export type StaffCommand =
  | {
      command: "create"
      email: string
      name: string
      role: StaffRole
      production: boolean
    }
  | { command: "enable"; email: string; production: boolean }
  | { command: "set-password"; email: string; production: boolean }
  | { command: "disable"; email: string; production: boolean }

export type ParsedStaffArgs =
  { ok: true; value: StaffCommand } | { ok: false; message: string }

const USAGE = {
  create:
    "Usage: pnpm staff:create --email <email> --name <name> --role owner|staff [--production]\n       pnpm staff:create --email <email> --enable [--production]",
  "set-password":
    "Usage: pnpm staff:set-password --email <email> [--production]",
  disable: "Usage: pnpm staff:disable --email <email> [--production]",
} as const

type Command = keyof typeof USAGE

const VALUE_OPTIONS = new Set(["--email", "--name", "--role"])
const FLAG_OPTIONS = new Set(["--enable", "--production"])

// "--email x" and "--email=x" both work
function readOptions(
  argv: string[]
):
  | { ok: true; values: Map<string, string>; flags: Set<string> }
  | { ok: false; message: string } {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const [name, inline] = arg.startsWith("--") ? splitOnce(arg, "=") : [arg]
    if (VALUE_OPTIONS.has(name)) {
      const value = inline ?? argv[++i]
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, message: `${name} needs a value.` }
      }
      values.set(name, value)
    } else if (FLAG_OPTIONS.has(name) && inline === undefined) {
      flags.add(name)
    } else {
      return { ok: false, message: `Unknown option: ${name}` }
    }
  }
  return { ok: true, values, flags }
}

function splitOnce(text: string, separator: string): [string, string?] {
  const index = text.indexOf(separator)
  return index === -1
    ? [text]
    : [text.slice(0, index), text.slice(index + separator.length)]
}

export function parseStaffArgs(
  command: Command,
  argv: string[]
): ParsedStaffArgs {
  const fail = (message: string): ParsedStaffArgs => ({
    ok: false,
    message: `${message}\n${USAGE[command]}`,
  })

  const options = readOptions(argv)
  if (!options.ok) return fail(options.message)
  const { values, flags } = options

  const email = values.get("--email")?.trim().toLowerCase()
  if (!email) return fail("--email is required.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("--email must be an email address.")
  }
  const production = flags.has("--production")

  if (command !== "create") {
    for (const extra of ["--name", "--role"]) {
      if (values.has(extra)) return fail(`Unknown option: ${extra}`)
    }
    if (flags.has("--enable")) return fail("Unknown option: --enable")
    return { ok: true, value: { command, email, production } }
  }

  if (flags.has("--enable")) {
    if (values.has("--name") || values.has("--role")) {
      return fail(
        "--enable re-enables an existing user; leave out --name and --role."
      )
    }
    return { ok: true, value: { command: "enable", email, production } }
  }

  const name = values.get("--name")?.trim()
  if (!name) return fail("--name is required.")
  const roleText = values.get("--role")?.trim().toLowerCase()
  if (!roleText) return fail("--role is required.")
  if (roleText === "demo") {
    return fail(
      "--role demo is not allowed here; the demo account comes from `pnpm db:seed --accounts-only`."
    )
  }
  if (roleText !== "owner" && roleText !== "staff") {
    return fail("--role must be owner or staff.")
  }
  return {
    ok: true,
    value: {
      command: "create",
      email,
      name,
      role: roleText === "owner" ? "OWNER" : "STAFF",
      production,
    },
  }
}
