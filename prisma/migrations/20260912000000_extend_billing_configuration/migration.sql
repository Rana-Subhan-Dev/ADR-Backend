-- CreateEnum
CREATE TYPE "BillingInputSource" AS ENUM ('FIRM_INVOICE', 'PLATFORM_TIMESHEETS');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('DEPOSIT_BASED', 'STANDARD', 'MILESTONE');

-- CreateEnum
CREATE TYPE "TravelTimeRateType" AS ENUM ('FREE', 'CUSTOM_HOURLY', 'FULL_HOURLY');

-- CreateEnum
CREATE TYPE "BillingExpensesPolicy" AS ENUM ('NOT_ALLOWED', 'ALLOWED', 'BILLABLE_AS_INCURRED');

-- AlterTable
ALTER TABLE "billing_configurations"
ADD COLUMN "billingInputSource" "BillingInputSource" NOT NULL DEFAULT 'FIRM_INVOICE',
ADD COLUMN "billingMode" "BillingMode" NOT NULL DEFAULT 'DEPOSIT_BASED',
ADD COLUMN "neutralDailyRate" DECIMAL(10,2),
ADD COLUMN "includedHearingDays" INTEGER,
ADD COLUMN "includedPrePostHearingHours" DECIMAL(6,2),
ADD COLUMN "overageHourlyRate" DECIMAL(10,2),
ADD COLUMN "additionalDayRate" DECIMAL(10,2),
ADD COLUMN "customRate" DECIMAL(12,2),
ADD COLUMN "customRateDescription" TEXT,
ADD COLUMN "expensesPolicy" "BillingExpensesPolicy",
ADD COLUMN "travelTimeRateType" "TravelTimeRateType" NOT NULL DEFAULT 'FREE',
ADD COLUMN "travelTimeCustomHourlyRate" DECIMAL(10,2),
ADD COLUMN "splitBillingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "roundingResidualCasePartyId" TEXT,
ADD COLUMN "accountingAuditComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "fedArbFeeScheduleType" "CaseType",
ADD COLUMN "adminFeePercentage" DECIMAL(5,2),
ADD COLUMN "agreementFeePercentage" DECIMAL(5,2);

-- Drop legacy two-party split columns (replaced by billing_payer_splits)
ALTER TABLE "billing_configurations"
DROP COLUMN IF EXISTS "claimantSplitPercentage",
DROP COLUMN IF EXISTS "respondentSplitPercentage";

-- CreateTable
CREATE TABLE "billing_payer_splits" (
    "id" TEXT NOT NULL,
    "billingConfigurationId" TEXT NOT NULL,
    "casePartyId" TEXT NOT NULL,
    "invoiceContactEmail" TEXT,
    "invoiceContactName" TEXT,
    "splitPercentage" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_payer_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_additional_timekeepers" (
    "id" TEXT NOT NULL,
    "billingConfigurationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "expensesAllowed" "BillingExpensesPolicy" NOT NULL DEFAULT 'NOT_ALLOWED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_additional_timekeepers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_configurations_roundingResidualCasePartyId_idx" ON "billing_configurations"("roundingResidualCasePartyId");

-- CreateIndex
CREATE INDEX "billing_payer_splits_casePartyId_idx" ON "billing_payer_splits"("casePartyId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_payer_splits_billingConfigurationId_casePartyId_key" ON "billing_payer_splits"("billingConfigurationId", "casePartyId");

-- CreateIndex
CREATE INDEX "billing_additional_timekeepers_billingConfigurationId_idx" ON "billing_additional_timekeepers"("billingConfigurationId");

-- AddForeignKey
ALTER TABLE "billing_configurations" ADD CONSTRAINT "billing_configurations_roundingResidualCasePartyId_fkey" FOREIGN KEY ("roundingResidualCasePartyId") REFERENCES "case_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payer_splits" ADD CONSTRAINT "billing_payer_splits_billingConfigurationId_fkey" FOREIGN KEY ("billingConfigurationId") REFERENCES "billing_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payer_splits" ADD CONSTRAINT "billing_payer_splits_casePartyId_fkey" FOREIGN KEY ("casePartyId") REFERENCES "case_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_additional_timekeepers" ADD CONSTRAINT "billing_additional_timekeepers_billingConfigurationId_fkey" FOREIGN KEY ("billingConfigurationId") REFERENCES "billing_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
