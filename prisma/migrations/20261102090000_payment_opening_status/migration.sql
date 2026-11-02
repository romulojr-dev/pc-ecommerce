-- Alone in its migration: Postgres can't use a new enum value in the
-- transaction that adds it, and the next migration's index and CHECK name it
-- (docs/specs/034-start-payment-outside-transaction)
ALTER TYPE "PaymentStatus" ADD VALUE 'OPENING' BEFORE 'PENDING';
