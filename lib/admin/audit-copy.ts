// Every string the audit log screen shows (docs/specs/047-admin-audit-log-
// view, section 5). Pure.

export const AUDIT_COPY = {
  heading: "Audit log",
  intro: "A record of who changed what, and when. It can't be edited.",
  demoNote: "Customer details are hidden in the demo.",
  count: (n: number) => (n === 1 ? "1 change" : `${n} changes`),
  pageOf: (page: number, pageCount: number) => `Page ${page} of ${pageCount}`,
  paginationLabel: "Audit log pages",
  previous: "Previous",
  next: "Next",
  caption: "Recorded changes, newest first",
  columns: {
    when: "When",
    who: "Who",
    what: "What",
    which: "Which",
    changes: "Changes",
  },
  filters: {
    entity: "Entity",
    actor: "Person",
    from: "From (Philippine time)",
    to: "To (Philippine time)",
    allEntities: "All entities",
    allPeople: "All people",
    submit: "Apply",
    clear: "Clear filters",
  },
  showChanges: "Show changes",
  diffHeaders: { field: "Field", before: "Before", after: "After" },
  changedBadge: "Changed",
  noFields: "No field changes were recorded.",
  empty: "No changes recorded yet.",
  emptyFiltered: "No changes match these filters.",
  rangeCleared:
    "The start date was after the end date, so the dates were cleared.",
  listError: "Couldn't load the audit log. Try again.",
  retry: "Try again",
} as const
