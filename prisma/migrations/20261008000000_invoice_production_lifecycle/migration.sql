-- CreateEnum
CREATE TYPE "InvoiceReviewStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "InvoiceAudience" AS ENUM ('CLIENT', 'NEUTRAL');

-- AlterTable
ALTER TABLE "invoices"
ADD COLUMN "reviewStatus" "InvoiceReviewStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN "audience" "InvoiceAudience" NOT NULL DEFAULT 'CLIENT',
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "reviewNotes" TEXT,
ADD COLUMN "reviewDecisionNotes" TEXT,
ADD COLUMN "submittedForReviewAt" TIMESTAMP(3),
ADD COLUMN "submittedForReviewByUserId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidReason" TEXT,
ADD COLUMN "reissuedFromInvoiceId" TEXT;

-- CreateIndex
CREATE INDEX "invoices_reviewStatus_idx" ON "invoices"("reviewStatus");
CREATE INDEX "invoices_audience_idx" ON "invoices"("audience");
CREATE UNIQUE INDEX "invoices_reissuedFromInvoiceId_key" ON "invoices"("reissuedFromInvoiceId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_submittedForReviewByUserId_fkey" FOREIGN KEY ("submittedForReviewByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_reissuedFromInvoiceId_fkey" FOREIGN KEY ("reissuedFromInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
