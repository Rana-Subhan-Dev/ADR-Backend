-- AlterEnum DocuSignRecipientStatus
ALTER TYPE "DocuSignRecipientStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "DocuSignRecipientStatus" ADD VALUE IF NOT EXISTS 'SIGNED';
ALTER TYPE "DocuSignRecipientStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- AlterTable contacts
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "company" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

-- Backfill name split
UPDATE "contacts"
SET
  "firstName" = CASE
    WHEN "firstName" IS NULL AND position(' ' in trim("name")) > 0
      THEN split_part(trim("name"), ' ', 1)
    WHEN "firstName" IS NULL THEN trim("name")
    ELSE "firstName"
  END,
  "lastName" = CASE
    WHEN "lastName" IS NULL AND position(' ' in trim("name")) > 0
      THEN substring(trim("name") from position(' ' in trim("name")) + 1)
    ELSE "lastName"
  END
WHERE "firstName" IS NULL OR "lastName" IS NULL;

CREATE INDEX IF NOT EXISTS "contacts_ownerUserId_idx" ON "contacts"("ownerUserId");
CREATE INDEX IF NOT EXISTS "contacts_role_idx" ON "contacts"("role");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_ownerUserId_fkey'
  ) THEN
    ALTER TABLE "contacts"
      ADD CONSTRAINT "contacts_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
