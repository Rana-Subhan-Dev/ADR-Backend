-- CreateEnum
CREATE TYPE "InvoiceAttachmentType" AS ENUM ('NEUTRAL_FIRM_INVOICE', 'PLATFORM_TIMESHEETS', 'EXPENSE_RECEIPTS');

-- Recreate InvoiceType enum (cannot ADD VALUE and USE it in the same transaction)
CREATE TYPE "InvoiceType_new" AS ENUM ('DEPOSIT', 'PROGRESS', 'ADMINISTRATIVE', 'FINAL', 'REFUND');

ALTER TABLE "invoices" ALTER COLUMN "invoiceType" DROP DEFAULT;
ALTER TABLE "invoices"
  ALTER COLUMN "invoiceType" TYPE TEXT USING ("invoiceType"::text);

UPDATE "invoices"
SET "invoiceType" = 'PROGRESS'
WHERE "invoiceType" = 'STANDARD';

ALTER TABLE "invoices"
  ALTER COLUMN "invoiceType" TYPE "InvoiceType_new"
  USING ("invoiceType"::"InvoiceType_new");

DROP TYPE "InvoiceType";
ALTER TYPE "InvoiceType_new" RENAME TO "InvoiceType";

-- CreateTable invoice_batches
CREATE TABLE "invoice_batches" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "invoiceType" "InvoiceType" NOT NULL,
    "billingInputSource" "BillingInputSource",
    "billingPeriodStart" TIMESTAMP(3),
    "billingPeriodEnd" TIMESTAMP(3),
    "firmInvoiceNumber" TEXT,
    "firmInvoiceDate" TIMESTAMP(3),
    "firmInvoiceAmount" DECIMAL(12,2),
    "firmExpensesAmount" DECIMAL(12,2),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invoice_batches_pkey" PRIMARY KEY ("id")
);

-- AlterTable invoices
ALTER TABLE "invoices"
ADD COLUMN "invoiceBatchId" TEXT,
ADD COLUMN "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "billingInputSource" "BillingInputSource",
ADD COLUMN "billingPeriodStart" TIMESTAMP(3),
ADD COLUMN "billingPeriodEnd" TIMESTAMP(3),
ADD COLUMN "firmInvoiceNumber" TEXT,
ADD COLUMN "firmInvoiceDate" TIMESTAMP(3),
ADD COLUMN "firmInvoiceAmount" DECIMAL(12,2),
ADD COLUMN "firmExpensesAmount" DECIMAL(12,2),
ADD COLUMN "clientBillingRef" TEXT,
ADD COLUMN "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "finalizedAt" TIMESTAMP(3),
ADD COLUMN "finalizedByUserId" TEXT;

-- AlterTable invoice_line_items
ALTER TABLE "invoice_line_items"
ADD COLUMN "secondaryDescription" TEXT,
ADD COLUMN "serviceDate" TIMESTAMP(3),
ADD COLUMN "referenceCode" TEXT,
ADD COLUMN "sourceLabel" TEXT;

-- CreateTable invoice_attachments
CREATE TABLE "invoice_attachments" (
    "id" TEXT NOT NULL,
    "invoiceBatchId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attachmentType" "InvoiceAttachmentType" NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invoice_attachments_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "invoice_batches_caseId_idx" ON "invoice_batches"("caseId");
CREATE INDEX "invoices_invoiceBatchId_idx" ON "invoices"("invoiceBatchId");
CREATE INDEX "invoice_attachments_documentId_idx" ON "invoice_attachments"("documentId");
CREATE UNIQUE INDEX "invoice_attachments_invoiceBatchId_documentId_key" ON "invoice_attachments"("invoiceBatchId", "documentId");

-- FKs
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_invoiceBatchId_fkey" FOREIGN KEY ("invoiceBatchId") REFERENCES "invoice_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_finalizedByUserId_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_attachments" ADD CONSTRAINT "invoice_attachments_invoiceBatchId_fkey" FOREIGN KEY ("invoiceBatchId") REFERENCES "invoice_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_attachments" ADD CONSTRAINT "invoice_attachments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
