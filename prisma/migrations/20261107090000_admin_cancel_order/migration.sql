-- Cancel an order from Admin (docs/specs/044-admin-cancel-order): the staff
-- cancel reasons and the cancelled-by-the-store email. The values are not used
-- in this file; the existing Order CHECKs (a cancelled order has cancelledAt and
-- a reason) are unchanged.

-- AlterEnum
ALTER TYPE "OrderCancelReason" ADD VALUE 'OUT_OF_STOCK';
ALTER TYPE "OrderCancelReason" ADD VALUE 'CUSTOMER_REQUEST';
ALTER TYPE "OrderCancelReason" ADD VALUE 'OTHER';
ALTER TYPE "EmailType" ADD VALUE 'ORDER_CANCELLED_BY_STORE';
