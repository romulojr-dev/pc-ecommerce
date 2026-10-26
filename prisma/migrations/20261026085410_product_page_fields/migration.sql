-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "boxContents" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preorderShipsOn" DATE;
