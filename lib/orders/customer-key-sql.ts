import { Prisma } from "@/generated/prisma/client"

// The one definition of "same customer" in SQL (docs/specs/042-admin-
// customers, R1): `normalizeRecipient` ([lib/email/recipient.ts]) written as an
// expression on `o."guestEmail"`. The address is trimmed (the whitespace set
// JavaScript's trim() strips, which is wider than Postgres's btrim), lower-
// cased, and a `+tag` is cut from the part before the last "@" when the "+" is
// not the first character. An address with no "@", or an "@" first, is kept as
// trimmed and lower-cased. The customer list, the `buyer` filter and the order
// detail's rank lookup all use this fragment; customer-key-sql.db.test.ts
// checks it against the pure function. The order table must be aliased `o`.
//
// lower() and toLowerCase() agree on ASCII, which is all a valid address holds.

const SPACE = String.raw`[ \t\n\r\f\v   -     　﻿]`
const TRIM = `^${SPACE}+|${SPACE}+$`
// local part up to its first "+", that "+", anything, the last "@", the domain
const TAG = String.raw`^([^+]+)\+.*@([^@]*)$`

export function customerKeySql(): Prisma.Sql {
  return Prisma.sql`regexp_replace(
      lower(regexp_replace(o."guestEmail", ${TRIM}, '', 'g')),
      ${TAG}, ${String.raw`\1@\2`})`
}
