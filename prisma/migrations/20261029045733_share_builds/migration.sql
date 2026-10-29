-- CreateTable
CREATE TABLE "Build" (
    "id" TEXT NOT NULL,
    "shareSlug" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildItem" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "BuildItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Build_shareSlug_key" ON "Build"("shareSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Build_contentHash_key" ON "Build"("contentHash");

-- CreateIndex
CREATE INDEX "BuildItem_productId_idx" ON "BuildItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "BuildItem_buildId_slot_productId_key" ON "BuildItem"("buildId", "slot", "productId");

-- AddForeignKey
ALTER TABLE "BuildItem" ADD CONSTRAINT "BuildItem_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildItem" ADD CONSTRAINT "BuildItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A BuildItem holds at least one unit. Prisma can't express a CHECK, so it
-- lives only here.
ALTER TABLE "BuildItem" ADD CONSTRAINT "BuildItem_quantity_check" CHECK ("quantity" >= 1);
