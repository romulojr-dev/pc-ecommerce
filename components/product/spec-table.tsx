import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { getSpecRows, type BuilderCategorySlug, type Specs } from "@/lib/specs"
import { cn } from "@/lib/utils"

type SpecTableProps<C extends BuilderCategorySlug> = {
  category: C
  // Parsed specs: check Product.specs with validateSpecs() first
  specs: Specs<C>
  // Names the table for screen readers
  caption?: string
  // Hidden by default, since the page shows its own heading above the table
  captionHidden?: boolean
  className?: string
}

// A product's specs as a label/value table (docs/specs/009-spec-table). Rows
// and their order come from the category's field metadata; missing optional
// values are left out. Grouped categories get one <tbody> per group, headed by
// a rowgroup header. No client hooks, so server components can render it.
export function SpecTable<C extends BuilderCategorySlug>({
  category,
  specs,
  caption = "Specifications",
  captionHidden = true,
  className,
}: SpecTableProps<C>) {
  return (
    <Table className={cn("text-sm", className)}>
      <TableCaption
        className={cn(
          captionHidden
            ? "sr-only"
            : "mt-0 mb-2 caption-top text-left text-base font-medium text-foreground"
        )}
      >
        {caption}
      </TableCaption>
      {getSpecRows(category, specs).map(({ group, rows }) => (
        <TableBody key={group ?? "specs"}>
          {group && (
            <TableRow className="hover:bg-transparent">
              <TableHead
                scope="rowgroup"
                colSpan={2}
                className="h-auto pt-5 pb-2 font-semibold"
              >
                {group}
              </TableHead>
            </TableRow>
          )}
          {rows.map((row) => (
            // Rows aren't interactive, so the primitive's hover is turned off
            <TableRow key={row.key} className="hover:bg-transparent">
              <TableHead
                scope="row"
                className="w-2/5 font-normal whitespace-normal text-muted-foreground"
              >
                {row.label}
              </TableHead>
              <TableCell className="whitespace-normal tabular-nums">
                {row.value}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      ))}
    </Table>
  )
}
