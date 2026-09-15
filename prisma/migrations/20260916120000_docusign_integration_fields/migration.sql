-- AlterTable: allow nullable DocuSign envelope id until send completes
ALTER TABLE "docusign_envelopes" ALTER COLUMN "envelopeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "docusign_envelopes"
ADD COLUMN IF NOT EXISTS "templateName" TEXT,
ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT,
ADD COLUMN IF NOT EXISTS "sentByUserId" TEXT;

-- AlterTable recipients
ALTER TABLE "docusign_recipients"
ADD COLUMN IF NOT EXISTS "routingOrder" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "docusignRecipientId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "docusign_envelope_events" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT,
    "actorEmail" TEXT,
    "rawPayload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "docusign_envelope_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "docusign_envelopes_sourceDocumentId_idx" ON "docusign_envelopes"("sourceDocumentId");
CREATE INDEX IF NOT EXISTS "docusign_envelopes_signedDocumentId_idx" ON "docusign_envelopes"("signedDocumentId");
CREATE INDEX IF NOT EXISTS "docusign_envelopes_sentByUserId_idx" ON "docusign_envelopes"("sentByUserId");
CREATE INDEX IF NOT EXISTS "docusign_recipients_email_idx" ON "docusign_recipients"("email");
CREATE INDEX IF NOT EXISTS "docusign_envelope_events_envelopeId_occurredAt_idx" ON "docusign_envelope_events"("envelopeId", "occurredAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "docusign_envelopes"
  ADD CONSTRAINT "docusign_envelopes_sourceDocumentId_fkey"
  FOREIGN KEY ("sourceDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "docusign_envelopes"
  ADD CONSTRAINT "docusign_envelopes_sentByUserId_fkey"
  FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "docusign_envelope_events"
  ADD CONSTRAINT "docusign_envelope_events_envelopeId_fkey"
  FOREIGN KEY ("envelopeId") REFERENCES "docusign_envelopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
