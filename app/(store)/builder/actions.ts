"use server"

import { shareBuild } from "@/lib/build-share"
import type { ShareResult } from "@/lib/build-state/share"

// The app's first server action (docs/specs/022-share-build, D12). Like every
// server action it is a public POST endpoint, so it trusts nothing it is sent
// and has no logic of its own: shareBuild checks the items, and returns only
// a slug or a reason. No account is needed to share. Rate limiting is #64.
export async function shareBuildAction(items: unknown): Promise<ShareResult> {
  return shareBuild(items)
}
