-- A stock movement's note, the history index and the CHECKs that tie every
-- reason to a sign, an actor and a note rule (docs/specs/046-admin-inventory-
-- adjustments, R2, R6, §6). The CHECKs are migration-only: Prisma can't
-- express them.

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN "note" TEXT;

-- Fail loudly, naming the rule and the number of rows, when existing movements
-- break a sign rule. (ADD CONSTRAINT would fail too, but without the count.)
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT count(*) INTO bad FROM "StockMovement"
    WHERE "reason" = 'ORDER_RESERVED' AND "change" >= 0;
  IF bad > 0 THEN
    RAISE EXCEPTION 'StockMovement_reserved_negative: % existing ORDER_RESERVED row(s) have change >= 0', bad;
  END IF;

  SELECT count(*) INTO bad FROM "StockMovement"
    WHERE "reason" = 'ORDER_RELEASED' AND "change" <= 0;
  IF bad > 0 THEN
    RAISE EXCEPTION 'StockMovement_released_positive: % existing ORDER_RELEASED row(s) have change <= 0', bad;
  END IF;
END $$;

-- Signs by reason (a Correction goes either way). "change <> 0" is already
-- StockMovement_change_check, from the place-order migration.
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_received_positive"
    CHECK ("reason" <> 'RECEIVED' OR "change" > 0),
  ADD CONSTRAINT "StockMovement_damaged_negative"
    CHECK ("reason" <> 'DAMAGED' OR "change" < 0),
  ADD CONSTRAINT "StockMovement_reserved_negative"
    CHECK ("reason" <> 'ORDER_RESERVED' OR "change" < 0),
  ADD CONSTRAINT "StockMovement_released_positive"
    CHECK ("reason" <> 'ORDER_RELEASED' OR "change" > 0);

-- A staff reason is always a named staff member's, and never an order's;
-- order movements may have no actor (the system)
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_staff_actor"
    CHECK ("reason" NOT IN ('RECEIVED', 'DAMAGED', 'CORRECTION') OR "actorId" IS NOT NULL),
  ADD CONSTRAINT "StockMovement_staff_no_order"
    CHECK ("reason" NOT IN ('RECEIVED', 'DAMAGED', 'CORRECTION') OR "orderId" IS NULL);

-- Notes: 1 to 500 characters, required for a Correction, never on an order
-- movement
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_note_length"
    CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500),
  ADD CONSTRAINT "StockMovement_correction_note"
    CHECK ("reason" <> 'CORRECTION' OR "note" IS NOT NULL),
  ADD CONSTRAINT "StockMovement_order_no_note"
    CHECK ("reason" NOT IN ('ORDER_RESERVED', 'ORDER_RELEASED') OR "note" IS NULL);

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_id_idx" ON "StockMovement"("productId", "createdAt" DESC, "id" DESC);
