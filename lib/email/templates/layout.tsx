import "server-only"

import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "react-email"

import { EMAIL_COPY } from "../copy"
import type { EmailEntry, EmailLine, EmailView } from "../view"

// The one layout the three order emails share (docs/specs/036-order-emails,
// Behavior 8–10): a text wordmark, the test-mode note, the view-model's
// parts in order, and the footer. Inline styles and tables only, since mail
// clients ignore most CSS; no images, so nothing can be blocked or tracked.
// A pure function of the view-model: HTML and plain text are both rendered
// from this tree.

const font =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const styles = {
  body: {
    backgroundColor: "#f4f4f5",
    margin: 0,
    padding: "24px 0",
    fontFamily: font,
    color: "#18181b",
  },
  container: {
    backgroundColor: "#ffffff",
    maxWidth: "560px",
    margin: "0 auto",
    padding: "24px",
    borderRadius: "8px",
  },
  brand: { fontSize: "20px", fontWeight: 700, margin: "0 0 16px" },
  note: {
    backgroundColor: "#fef3c7",
    color: "#78350f",
    fontSize: "13px",
    lineHeight: "18px",
    padding: "10px 12px",
    borderRadius: "6px",
    margin: "0 0 20px",
  },
  text: { fontSize: "15px", lineHeight: "22px", margin: "0 0 12px" },
  muted: { fontSize: "13px", lineHeight: "18px", color: "#52525b" },
  heading: { fontSize: "15px", fontWeight: 600, margin: "20px 0 8px" },
  button: {
    backgroundColor: "#18181b",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 600,
    padding: "12px 20px",
    borderRadius: "6px",
    textDecoration: "none",
    display: "inline-block",
  },
  rule: { borderColor: "#e4e4e7", margin: "20px 0" },
  cellRight: { textAlign: "right", fontSize: "15px", verticalAlign: "top" },
  cell: { fontSize: "15px", verticalAlign: "top" },
} as const

function Line({ line, part = false }: { line: EmailLine; part?: boolean }) {
  return (
    <Row style={{ margin: part ? "0 0 6px 12px" : "0 0 8px" }}>
      <Column style={styles.cell}>
        {part && line.slot && (
          <Text style={{ ...styles.muted, margin: 0 }}>{line.slot}</Text>
        )}
        <Text style={{ ...styles.text, margin: 0 }}>{line.name}</Text>
        <Text style={{ ...styles.muted, margin: 0 }}>{line.unit}</Text>
      </Column>
      <Column style={styles.cellRight}>{line.total}</Column>
    </Row>
  )
}

function Entry({ entry }: { entry: EmailEntry }) {
  if (entry.kind === "single") return <Line line={entry.line} />
  return (
    <Section style={{ margin: "0 0 8px" }}>
      <Row>
        <Column style={{ ...styles.cell, fontWeight: 600 }}>
          {entry.name}
        </Column>
        <Column style={{ ...styles.cellRight, fontWeight: 600 }}>
          {entry.total}
        </Column>
      </Row>
      {entry.parts.map((part, index) => (
        <Line key={index} line={part} part />
      ))}
    </Section>
  )
}

export function EmailDocument({ view }: { view: EmailView }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{view.lead}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{EMAIL_COPY.brand}</Text>
          <Text style={styles.note}>{view.testNote}</Text>

          {view.greeting && <Text style={styles.text}>{view.greeting}</Text>}
          <Text style={styles.text}>{view.lead}</Text>
          {view.details.map((detail) => (
            <Text key={detail} style={styles.text}>
              {detail}
            </Text>
          ))}
          {view.statusLine && (
            <Text style={{ ...styles.text, fontWeight: 600 }}>
              {view.statusLine}
            </Text>
          )}

          {view.action && (
            <Section style={{ margin: "16px 0" }}>
              <Button href={view.action.href} style={styles.button}>
                {view.action.label}
              </Button>
            </Section>
          )}
          {view.links.map((link) => (
            <Text key={link.href} style={styles.text}>
              <Link href={link.href}>{link.label}</Link>
            </Text>
          ))}

          {view.entries && (
            <>
              <Hr style={styles.rule} />
              <Heading as="h2" style={styles.heading}>
                {EMAIL_COPY.itemsHeading}
              </Heading>
              {view.entries.map((entry, index) => (
                <Entry key={index} entry={entry} />
              ))}
            </>
          )}

          {view.totals && (
            <>
              <Hr style={styles.rule} />
              {view.totals.map((row) => (
                <Row key={row.label} style={{ margin: "0 0 4px" }}>
                  <Column
                    style={{
                      ...styles.cell,
                      fontWeight: row.strong ? 700 : 400,
                    }}
                  >
                    {row.label}
                  </Column>
                  <Column
                    style={{
                      ...styles.cellRight,
                      fontWeight: row.strong ? 700 : 400,
                    }}
                  >
                    {row.value}
                  </Column>
                </Row>
              ))}
            </>
          )}

          {view.where && (
            <>
              <Hr style={styles.rule} />
              <Heading as="h2" style={styles.heading}>
                {view.where.heading}
              </Heading>
              {view.where.kind === "delivery" ? (
                <>
                  <Text style={{ ...styles.text, margin: 0 }}>
                    {view.where.lines[0]}
                  </Text>
                  <Text style={styles.text}>{view.where.lines[1]}</Text>
                </>
              ) : (
                <>
                  <Text style={{ ...styles.text, margin: 0 }}>
                    {view.where.address}
                  </Text>
                  <Text style={{ ...styles.text, color: "#52525b" }}>
                    {view.where.hours}
                  </Text>
                  <Text style={styles.text}>{view.where.note}</Text>
                </>
              )}
            </>
          )}

          <Hr style={styles.rule} />
          {view.linkNote && <Text style={styles.muted}>{view.linkNote}</Text>}
          <Text style={styles.muted}>{view.footer}</Text>
        </Container>
      </Body>
    </Html>
  )
}
