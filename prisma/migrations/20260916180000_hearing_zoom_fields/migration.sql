-- Migrate ZoomStatus enum: GENERATED -> CREATED, add NOT_REQUIRED
CREATE TYPE "ZoomStatus_new" AS ENUM ('NOT_REQUIRED', 'PENDING', 'CREATED', 'FAILED', 'MANUALLY_LINKED');

ALTER TABLE "hearings" ALTER COLUMN "zoomStatus" DROP DEFAULT;

ALTER TABLE "hearings"
  ALTER COLUMN "zoomStatus" TYPE "ZoomStatus_new"
  USING (
    CASE
      WHEN "zoomStatus"::text = 'GENERATED' THEN 'CREATED'::"ZoomStatus_new"
      WHEN "zoomStatus"::text = 'PENDING' THEN 'PENDING'::"ZoomStatus_new"
      WHEN "zoomStatus"::text = 'FAILED' THEN 'FAILED'::"ZoomStatus_new"
      WHEN "zoomStatus"::text = 'MANUALLY_LINKED' THEN 'MANUALLY_LINKED'::"ZoomStatus_new"
      ELSE NULL
    END
  );

DROP TYPE "ZoomStatus";
ALTER TYPE "ZoomStatus_new" RENAME TO "ZoomStatus";

ALTER TABLE "hearings"
ADD COLUMN IF NOT EXISTS "instructions" TEXT,
ADD COLUMN IF NOT EXISTS "timezone" TEXT,
ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER,
ADD COLUMN IF NOT EXISTS "sendCalendarInvites" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "autoCreateZoom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "zoomStartUrl" TEXT,
ADD COLUMN IF NOT EXISTS "zoomPasscode" TEXT,
ADD COLUMN IF NOT EXISTS "zoomErrorMessage" TEXT,
ADD COLUMN IF NOT EXISTS "zoomAlternateHostUserId" TEXT;

CREATE INDEX IF NOT EXISTS "hearings_zoomStatus_idx" ON "hearings"("zoomStatus");
CREATE INDEX IF NOT EXISTS "hearings_hearingStatus_idx" ON "hearings"("hearingStatus");

DO $$ BEGIN
  ALTER TABLE "hearings"
  ADD CONSTRAINT "hearings_zoomAlternateHostUserId_fkey"
  FOREIGN KEY ("zoomAlternateHostUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
