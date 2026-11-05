"use server"

// Deliberately unguarded: the enumeration test must catch it. Never imported
// by the app.
export async function deleteEverythingAction(): Promise<string> {
  return "oops"
}
