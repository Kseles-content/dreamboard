-- Version metadata fields
ALTER TABLE "board_versions"
  ADD COLUMN IF NOT EXISTS "authorUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "comment" TEXT,
  ADD COLUMN IF NOT EXISTS "restoredByUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "restoredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "board_versions_authorUserId_idx" ON "board_versions"("authorUserId");
CREATE INDEX IF NOT EXISTS "board_versions_restoredByUserId_idx" ON "board_versions"("restoredByUserId");

ALTER TABLE "board_versions"
  ADD CONSTRAINT "board_versions_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "board_versions"
  ADD CONSTRAINT "board_versions_restoredByUserId_fkey"
  FOREIGN KEY ("restoredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Audit logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" SERIAL NOT NULL,
  "boardId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_boardId_createdAt_idx" ON "audit_logs"("boardId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
