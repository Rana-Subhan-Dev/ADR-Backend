-- AlterTable
ALTER TABLE "neutral_timesheets"
ADD COLUMN "billingNotes" TEXT,
ADD COLUMN "rejectedByUserId" TEXT,
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "TimesheetExpenseType" AS ENUM ('TRAVEL', 'HOTEL', 'MEALS', 'OTHER');

-- CreateEnum
CREATE TYPE "TimesheetReviewAction" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "timesheet_expenses" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "expenseType" "TimesheetExpenseType" NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_expense_receipts" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_expense_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_review_history" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "action" "TimesheetReviewAction" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_review_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timesheet_expenses_timesheetId_idx" ON "timesheet_expenses"("timesheetId");

-- CreateIndex
CREATE INDEX "timesheet_expense_receipts_documentId_idx" ON "timesheet_expense_receipts"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_expense_receipts_expenseId_documentId_key" ON "timesheet_expense_receipts"("expenseId", "documentId");

-- CreateIndex
CREATE INDEX "timesheet_review_history_timesheetId_createdAt_idx" ON "timesheet_review_history"("timesheetId", "createdAt");

-- CreateIndex
CREATE INDEX "timesheet_review_history_actorUserId_idx" ON "timesheet_review_history"("actorUserId");

-- CreateIndex
CREATE INDEX "neutral_timesheets_rejectedByUserId_idx" ON "neutral_timesheets"("rejectedByUserId");

-- AddForeignKey
ALTER TABLE "neutral_timesheets"
ADD CONSTRAINT "neutral_timesheets_rejectedByUserId_fkey"
FOREIGN KEY ("rejectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_expenses"
ADD CONSTRAINT "timesheet_expenses_timesheetId_fkey"
FOREIGN KEY ("timesheetId") REFERENCES "neutral_timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_expense_receipts"
ADD CONSTRAINT "timesheet_expense_receipts_expenseId_fkey"
FOREIGN KEY ("expenseId") REFERENCES "timesheet_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_expense_receipts"
ADD CONSTRAINT "timesheet_expense_receipts_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_review_history"
ADD CONSTRAINT "timesheet_review_history_timesheetId_fkey"
FOREIGN KEY ("timesheetId") REFERENCES "neutral_timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_review_history"
ADD CONSTRAINT "timesheet_review_history_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
