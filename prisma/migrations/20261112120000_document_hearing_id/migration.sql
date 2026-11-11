-- AlterTable
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "hearingId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "documents_hearingId_idx" ON "documents"("hearingId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_hearingId_fkey'
  ) THEN
    ALTER TABLE "documents"
      ADD CONSTRAINT "documents_hearingId_fkey"
      FOREIGN KEY ("hearingId") REFERENCES "hearings"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
