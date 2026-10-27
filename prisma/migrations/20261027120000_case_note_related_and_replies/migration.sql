-- AlterTable case_notes: related record + reply threading
ALTER TABLE "case_notes" ADD COLUMN IF NOT EXISTS "relatedRecordType" TEXT;
ALTER TABLE "case_notes" ADD COLUMN IF NOT EXISTS "relatedRecordId" TEXT;
ALTER TABLE "case_notes" ADD COLUMN IF NOT EXISTS "parentNoteId" TEXT;

CREATE INDEX IF NOT EXISTS "case_notes_caseId_noteType_createdAt_idx"
  ON "case_notes"("caseId", "noteType", "createdAt");

CREATE INDEX IF NOT EXISTS "case_notes_parentNoteId_idx"
  ON "case_notes"("parentNoteId");

CREATE INDEX IF NOT EXISTS "case_notes_relatedRecordType_relatedRecordId_idx"
  ON "case_notes"("relatedRecordType", "relatedRecordId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_notes_parentNoteId_fkey'
  ) THEN
    ALTER TABLE "case_notes"
      ADD CONSTRAINT "case_notes_parentNoteId_fkey"
      FOREIGN KEY ("parentNoteId") REFERENCES "case_notes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
