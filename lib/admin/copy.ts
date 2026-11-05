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
    caption: "Orders, newest first",
    paginationLabel: "Order pages",
    previous: "Previous",
    next: "Next",
    count: (total: number) => (total === 1 ? "1 order" : `${total} orders`),
    pageOf: (page: number, pages: number) => `Page ${page} of ${pages}`,
    filters: {
      status: "Status",
      allStatuses: "All statuses",
      payment: "Payment",
      allPayments: "All payments",
      online: "Online",
      cod: "Cash on delivery or pickup",
      number: "Order number",
      customer: "Customer",
      customerPlaceholder: "Name, email or mobile",
      customerTooShort: "Type at least 3 characters to search customers.",
      search: "Search",
      clear: "Clear filters",
    },
    empty: "No orders yet.",
    noMatch: "No orders match these filters.",
    error: "Couldn't load orders. Try again.",
    retry: "Try again",
    badges: {
      due: "Due for release",
      refund: "Refund required",
      check: "Needs checking",
    },
    columns: {
      number: "Order",
      placed: "Placed",
      customer: "Customer",
      status: "Status",
      payment: "Payment",
      fulfillment: "Fulfillment",
      total: "Total",
    },
    detail: {
      items: "Items",
      totals: "Totals",
      contact: "Contact",
      delivery: "Delivery",
      pickup: "Pickup",
      status: "Status",
      payments: "Payments",
      emails: "Emails",
      due: (time: string) => `Due ${time}`,
      wasDue: (time: string) => `Was due ${time}`,
      refundFlag:
        "Refund required: a payment arrived after the order was cancelled, or a second payment arrived.",
      checkFlag: "Needs checking: a payment's amount didn't match the order.",
      cashNoPayment: "Cash on delivery, no online payment",
      pickupNoPayment: "Pay on pickup, no online payment",
      noPayments: "No payment attempts.",
      noEmails: "No emails for this order.",
      packingSlip: "Packing slip",
      back: "Back to orders",
    },
    slip: {
      print: "Print",
      back: "Back to order",
      pickup: "Store pickup. Customer shows the order number and a valid ID.",
    },
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
