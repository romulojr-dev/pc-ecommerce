"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOutIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { authClient } from "@/lib/auth/client"

// Posts to the sign-out endpoint, which deletes only this browser's session
// row (the demo account is shared), then goes to the form
// (docs/specs/039-staff-sign-in-admin-shell, Rule 20)
export function SignOutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    if (busy) return
    setBusy(true)
    try {
      await authClient.signOut()
    } finally {
      // Whatever the answer, leave: the guard sends a signed-in person who
      // wasn't signed out straight back
      router.replace("/admin/login")
      router.refresh()
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={signOut}
      disabled={busy}
    >
      <LogOutIcon aria-hidden="true" data-icon="inline-start" />
      {busy ? ADMIN_COPY.shell.signingOut : ADMIN_COPY.shell.signOut}
    </Button>
  )
}
