// What `import "server-only"` resolves to in Vitest. In Next, that package
// throws when a client bundle pulls the module in; the tests run in Node, so
// it is empty (docs/specs/036-order-emails, §6 Server only).
export {}
