# Next.js template

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Testing

```bash
pnpm test                              # unit tests (Vitest), no database needed
pnpm test:watch                        # unit tests in watch mode
pnpm exec playwright install chromium  # once, before the first E2E run
pnpm test:e2e                          # E2E tests (Playwright); starts the dev server
```

Unit tests are `*.test.ts` next to the code they test. E2E tests live in `e2e/`.

CI runs on every pull request and every push to `main`
([.github/workflows/ci.yml](.github/workflows/ci.yml)): install, lint, type
check, migrations against a throwaway Postgres, unit tests, build, and E2E
tests against the production build. `main` requires it to pass.

## AI agent skills

The Prisma agent skills used by Claude Code are not committed. `.agents/` holds
the skill files and `.claude/skills/` links to them; both are gitignored.
`skills-lock.json` records which skills are installed and is committed.

On a new machine, restore them from the lockfile:

```bash
pnpm dlx skills@1.5.14 experimental_install
```

If that fails (the command is experimental), reinstall them for Claude Code only:

```bash
pnpm dlx skills@1.5.14 add prisma/skills --agent claude-code --skill '*' -y
```
