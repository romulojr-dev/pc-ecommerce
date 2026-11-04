-- A cash order's first status (docs/specs/038-cash-on-delivery). Alone in its
-- migration because Postgres can't use an enum value in the transaction that
-- adds it: the next migration, cod_orders, uses it.

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_CONFIRMATION';
