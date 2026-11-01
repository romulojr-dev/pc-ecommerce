import { withPool } from "./stock"

// Changes a fake gateway session in the database the app server uses, for the
// one state the UI can't reach: a payment whose amount isn't the order's
// (docs/specs/032-payment-webhooks, X8). Same guard as the stock helper.
export async function setFakeSessionAmount(sessionId: string, amount: number) {
  await withPool(async (pool) => {
    const { rowCount } = await pool.query(
      'UPDATE "FakeGatewaySession" SET "amount" = $1 WHERE "id" = $2',
      [amount, sessionId]
    )
    if (rowCount !== 1) {
      throw new Error(
        `Expected one fake session ${sessionId}, changed ${rowCount}.`
      )
    }
  })
}
