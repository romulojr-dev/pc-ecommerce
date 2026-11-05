import { type AdminAction, isOwnerOnly } from "./permissions"

// What a refused admin request says (docs/specs/040-admin-permissions-audit-
// masking, §5). The same text is on the disabled control and in the server's
// answer. Pure.

export const READ_ONLY_MESSAGE = "This account is read-only"
export const OWNERS_ONLY_MESSAGE = "Only owners can do this"
export const CANNOT_MESSAGE = "You can't do this."
export const ORIGIN_MESSAGE = "This request can't be accepted."
export const UNAUTHENTICATED_MESSAGE = "Your session ended. Sign in again."
export const INVALID_MESSAGE = "Check the form and try again."
export const FAILED_MESSAGE = "Something went wrong. Try again."

// The reason a role can't do an action: Demo is read-only, Staff is told the
// action is the owner's
export function denialMessage(role: string, action: AdminAction): string {
  if (role === "demo") return READ_ONLY_MESSAGE
  if (role === "staff" && isOwnerOnly(action)) return OWNERS_ONLY_MESSAGE
  return CANNOT_MESSAGE
}
