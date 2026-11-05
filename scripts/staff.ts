// Must stay the first import: loads .env.local before @/lib/env reads it
import "../prisma/seed/load-env"

import { db } from "@/lib/db"
import { env } from "@/lib/env"
import {
  createStaffUser,
  disableStaff,
  enableStaff,
  setStaffPassword,
} from "@/lib/auth/accounts"
import { decideScriptTarget } from "@/lib/auth/script-guard"
import {
  describeCreate,
  describeDisable,
  describeEnable,
  describePassword,
  staffMessages,
} from "@/lib/auth/staff-messages"
import { parseStaffArgs } from "@/lib/auth/staff-args"
import { parseDatabaseUrl } from "@/lib/db-url"

import { PasswordInputError, readPassword } from "./read-password"

// pnpm staff:create | staff:set-password | staff:disable
// (docs/specs/039-staff-sign-in-admin-shell, Rules 23–27; how to run them
// against each database: docs/setup/admin-accounts.md). The password comes
// from a hidden prompt or from standard input, never from an argument. The
// target database host is printed before anything is written, and production
// needs --production.

const COMMANDS = ["create", "set-password", "disable"] as const
type Command = (typeof COMMANDS)[number]

const isCommand = (value: string | undefined): value is Command =>
  COMMANDS.some((command) => command === value)

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  if (!isCommand(command)) {
    console.error(
      "Usage: pnpm staff:create | staff:set-password | staff:disable (see docs/setup/admin-accounts.md)"
    )
    return 1
  }

  const parsed = parseStaffArgs(command, rest)
  if (!parsed.ok) {
    console.error(parsed.message)
    return 1
  }
  const args = parsed.value

  // The host first, then the decision. Nothing else is read or written
  // before it.
  const target = decideScriptTarget({
    databaseUrl: env.DATABASE_URL,
    productionHost: env.PRODUCTION_DATABASE_HOST,
    production: args.production,
  })
  const host =
    target.host ?? parseDatabaseUrl(env.DATABASE_URL)?.host ?? "(unknown)"
  console.log(staffMessages.hostLine(host))
  if (!target.ok) {
    console.error(target.message)
    return 1
  }

  switch (args.command) {
    case "create": {
      const password = await readPassword()
      const result = await db.$transaction((tx) =>
        createStaffUser(tx, {
          email: args.email,
          name: args.name,
          role: args.role,
          password,
        })
      )
      return report(describeCreate(result, args.role, args.email))
    }
    case "enable": {
      const result = await db.$transaction((tx) =>
        enableStaff(tx, { email: args.email })
      )
      return report(describeEnable(result, args.email))
    }
    case "set-password": {
      const password = await readPassword()
      const result = await db.$transaction((tx) =>
        setStaffPassword(tx, { email: args.email, password })
      )
      return report(describePassword(result, args.email))
    }
    case "disable": {
      const result = await db.$transaction((tx) =>
        disableStaff(tx, { email: args.email })
      )
      return report(describeDisable(result, args.email))
    }
  }
}

function report({ text, exit }: { text: string; exit: number }) {
  if (exit === 0) console.log(text)
  else console.error(text)
  return exit
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    // A message of ours, or only the error's name: Postgres and Prisma errors
    // can echo the values of the query
    console.error(
      error instanceof PasswordInputError
        ? error.message
        : `Failed: ${error instanceof Error ? error.name : "unknown error"}`
    )
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
