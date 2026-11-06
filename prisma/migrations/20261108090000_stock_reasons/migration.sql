-- Why staff change stock (docs/specs/046-admin-inventory-adjustments). The
-- values are only added here: Postgres can't use an enum value in the
-- transaction that adds it, so the CHECKs that name them are in the next
-- migration.

-- AlterEnum
ALTER TYPE "StockMovementReason" ADD VALUE 'RECEIVED';
ALTER TYPE "StockMovementReason" ADD VALUE 'DAMAGED';
ALTER TYPE "StockMovementReason" ADD VALUE 'CORRECTION';
