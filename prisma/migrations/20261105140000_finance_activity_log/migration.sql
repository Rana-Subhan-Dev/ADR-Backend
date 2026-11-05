-- CreateTable
CREATE TABLE "finance_activity_logs" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "actingUserId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "caseId" TEXT,
    "caseNumber" TEXT,
    "matterName" TEXT,
    "invoiceId" TEXT,
    "invoiceNumber" TEXT,
    "timesheetId" TEXT,
    "timesheetNumber" TEXT,
    "paymentId" TEXT,
    "paymentNumber" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_activity_logs_occurredAt_idx" ON "finance_activity_logs"("occurredAt");

-- CreateIndex
CREATE INDEX "finance_activity_logs_caseId_idx" ON "finance_activity_logs"("caseId");

-- CreateIndex
CREATE INDEX "finance_activity_logs_invoiceId_idx" ON "finance_activity_logs"("invoiceId");

-- CreateIndex
CREATE INDEX "finance_activity_logs_timesheetId_idx" ON "finance_activity_logs"("timesheetId");

-- CreateIndex
CREATE INDEX "finance_activity_logs_paymentId_idx" ON "finance_activity_logs"("paymentId");

-- CreateIndex
CREATE INDEX "finance_activity_logs_action_idx" ON "finance_activity_logs"("action");

-- CreateIndex
CREATE INDEX "finance_activity_logs_actingUserId_idx" ON "finance_activity_logs"("actingUserId");

-- AddForeignKey
ALTER TABLE "finance_activity_logs" ADD CONSTRAINT "finance_activity_logs_actingUserId_fkey" FOREIGN KEY ("actingUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
