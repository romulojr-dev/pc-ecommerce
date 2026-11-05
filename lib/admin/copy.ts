import type { UserRole } from "@/generated/prisma/client"

// Every string the sign-in form and the admin shell show
// (docs/specs/039-staff-sign-in-admin-shell, §5 Messages and copy). Pure.

export const ADMIN_COPY = {
  login: {
    title: "Staff sign in",
    subtitle: "PC Silicon admin.",
    emailLabel: "Email",
    passwordLabel: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    emailRequired: "Enter your email.",
    passwordRequired: "Enter your password.",
    wrongCredentials: "Email or password is incorrect.",
    failure: "Couldn't sign in. Try again.",
    rateLimited: (seconds: number) =>
      `Too many sign-in attempts. Wait ${seconds} ${
        seconds === 1 ? "second" : "seconds"
      } and try again.`,
  },
  demo: {
    heading: "Demo account",
    text: "Reviewers can look around Admin with this account. It can't change anything.",
    emailLabel: "Email",
    passwordLabel: "Password",
    use: "Use demo account",
  },
  shell: {
    ordersNav: "Orders",
    signOut: "Sign out",
    signingOut: "Signing out…",
    navLabel: "Admin",
    demoNotice: "Demo: customer details are hidden",
  },
  noAccess: {
    heading: "You don't have access to this page",
    body: "Your role can't open this area. Ask an owner if you think that's a mistake.",
    link: "Back to orders",
  },
  orders: {
    heading: "Orders",
    body: "The order list comes with the Admin panel.",
  },
  notFound: {
    heading: "Page not found.",
    link: "Go to Orders",
  },
  titles: {
    login: "Staff sign in · PC Silicon Admin",
    orders: "Orders · PC Silicon Admin",
    notFound: "Page not found · PC Silicon Admin",
    noAccess: "No access · PC Silicon Admin",
  },
} as const

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Owner",
  STAFF: "Staff",
  DEMO: "Demo (read-only)",
}

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role]
}
