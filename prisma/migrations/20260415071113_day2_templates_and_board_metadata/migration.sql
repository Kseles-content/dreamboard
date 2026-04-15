-- AlterTable
ALTER TABLE "boards" ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastOpenedAt" TIMESTAMP(3),
ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boards_isPinned_lastOpenedAt_idx" ON "boards"("isPinned", "lastOpenedAt");

-- CreateIndex
CREATE INDEX "boards_templateId_idx" ON "boards"("templateId");

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
