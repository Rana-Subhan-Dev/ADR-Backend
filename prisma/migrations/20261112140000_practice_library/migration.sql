-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PracticeLibraryItemType" AS ENUM ('FOLDER', 'FILE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "practice_library_items" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "itemType" "PracticeLibraryItemType" NOT NULL DEFAULT 'FILE',
  "parentId" TEXT,
  "fileKey" TEXT,
  "mimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_library_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "practice_library_items_parentId_sortOrder_idx"
  ON "practice_library_items"("parentId", "sortOrder");
CREATE INDEX IF NOT EXISTS "practice_library_items_isPublished_updatedAt_idx"
  ON "practice_library_items"("isPublished", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'practice_library_items_parentId_fkey'
  ) THEN
    ALTER TABLE "practice_library_items"
      ADD CONSTRAINT "practice_library_items_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "practice_library_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
