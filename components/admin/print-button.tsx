"use client"

// Opens the browser's print dialog (docs/specs/041-admin-orders-list-detail,
// B16). It changes nothing.
export function PrintButton({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {children}
    </button>
  )
}
