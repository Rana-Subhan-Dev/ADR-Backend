-- CreateEnum
CREATE TYPE "DisputePartyStructure" AS ENUM ('SINGLE_PARTY', 'MULTI_PARTY');

-- CreateEnum
CREATE TYPE "PrimaryCommunicationMethod" AS ENUM ('EMAIL', 'PORTAL', 'EMAIL_AND_PORTAL');

-- AlterEnum
ALTER TYPE "CaseTimelineEventType" ADD VALUE IF NOT EXISTS 'MESSAGE_SENT';

-- AlterTable notifications (readAt may already exist in some envs)
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "notifications_recipientUserId_readAt_idx" ON "notifications"("recipientUserId", "readAt");

-- AlterTable inquiries
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "contactCellPhone" TEXT;
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "clientReference" TEXT;
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "caseTypeLabel" TEXT;

-- AlterTable cases
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "caseTypeLabel" TEXT;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "disputePartyStructure" "DisputePartyStructure";
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "isDraft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "referralSource" TEXT;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "primaryCommunicationMethod" "PrimaryCommunicationMethod";
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "notifyOnHearingScheduled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "notifyOnDocumentUploaded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "notifyOnCaseUpdate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "notifyOnDocuSignSent" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "cases_isDraft_idx" ON "cases"("isDraft");

-- CreateTable inquiry_preliminary_neutrals
CREATE TABLE IF NOT EXISTS "inquiry_preliminary_neutrals" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inquiry_preliminary_neutrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inquiry_preliminary_neutrals_inquiryId_userId_key" ON "inquiry_preliminary_neutrals"("inquiryId", "userId");
CREATE INDEX IF NOT EXISTS "inquiry_preliminary_neutrals_userId_idx" ON "inquiry_preliminary_neutrals"("userId");

DO $$ BEGIN
  ALTER TABLE "inquiry_preliminary_neutrals" ADD CONSTRAINT "inquiry_preliminary_neutrals_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inquiry_preliminary_neutrals" ADD CONSTRAINT "inquiry_preliminary_neutrals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
