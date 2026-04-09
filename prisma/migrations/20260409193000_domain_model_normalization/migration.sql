-- Create enum for normalized card types
CREATE TYPE "CardType" AS ENUM ('text', 'image', 'sticker', 'link');

-- Create normalized cards table
CREATE TABLE "cards" (
  "id" TEXT NOT NULL,
  "boardId" INTEGER NOT NULL,
  "type" "CardType" NOT NULL,
  "content" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "zIndex" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cards"
  ADD CONSTRAINT "cards_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "boards"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "cards_boardId_idx" ON "cards"("boardId");

-- Normalize boards / versions / share_links / upload_assets
DROP INDEX IF EXISTS "board_versions_boardId_ownerUserId_idx";
DROP INDEX IF EXISTS "share_links_boardId_ownerUserId_idx";
DROP INDEX IF EXISTS "upload_assets_boardId_ownerUserId_idx";

ALTER TABLE "boards"
  DROP COLUMN IF EXISTS "stateJson";

ALTER TABLE "board_versions"
  DROP COLUMN IF EXISTS "ownerUserId",
  ALTER COLUMN "snapshotJson" TYPE JSONB USING "snapshotJson"::jsonb;

CREATE INDEX "board_versions_boardId_idx" ON "board_versions"("boardId");

ALTER TABLE "share_links"
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3),
  DROP COLUMN IF EXISTS "ownerUserId";

CREATE INDEX "share_links_boardId_idx" ON "share_links"("boardId");

ALTER TABLE "upload_assets"
  DROP COLUMN IF EXISTS "ownerUserId",
  DROP COLUMN IF EXISTS "updatedAt";

CREATE INDEX "upload_assets_boardId_idx" ON "upload_assets"("boardId");
