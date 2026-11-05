import type { Readable } from "node:stream"

import { staffMessages } from "@/lib/auth/staff-messages"

// Reading a password for the staff scripts (docs/specs/039-staff-sign-in-
// admin-shell, Rule 23). It is never an argument or an environment variable,
// and never echoed, logged or put in an error message: on a terminal it is a
// hidden prompt asked twice, otherwise the first line of standard input.

export class PasswordInputError extends Error {}

// The first line of a stream (piped input: `echo … | pnpm staff:create …`).
// Trailing \r and \n are dropped; nothing else is trimmed, since spaces can be
// part of a password.
export async function readPasswordFromStream(
  stream: Readable
): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString("utf8")
  const line = text.split(/\r?\n/)[0] ?? ""
  if (line.length === 0)
    throw new PasswordInputError(staffMessages.emptyPassword)
  return line
}

// One hidden line from a terminal: raw mode, no echo, Backspace works,
// Ctrl-C and Ctrl-D abort
function promptHidden(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  prompt: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(prompt)
    let value = ""
    const finish = (error?: PasswordInputError) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener("data", onData)
      stdout.write("\n")
      if (error) reject(error)
      else resolve(value)
    }
    const onData = (data: Buffer) => {
      for (const char of data.toString("utf8")) {
        if (char === "\r" || char === "\n") return finish()
        if (char === "\u0003" || char === "\u0004") {
          return finish(new PasswordInputError("Cancelled."))
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1)
        } else if (char >= " ") {
          value += char
        }
      }
    }
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on("data", onData)
  })
}

// Asked twice on a terminal; one line from a pipe
export async function readPassword(
  stdin: NodeJS.ReadStream = process.stdin,
  stdout: NodeJS.WriteStream = process.stdout
): Promise<string> {
  if (!stdin.isTTY) return readPasswordFromStream(stdin)

  const first = await promptHidden(stdin, stdout, staffMessages.passwordPrompt)
  if (first.length === 0)
    throw new PasswordInputError(staffMessages.emptyPassword)
  const again = await promptHidden(stdin, stdout, staffMessages.repeatPrompt)
  if (first !== again) throw new PasswordInputError(staffMessages.mismatch)
  return first
}
