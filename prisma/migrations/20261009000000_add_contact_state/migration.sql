ALTER TABLE "contacts"
ADD COLUMN "state" TEXT;

CREATE INDEX "contacts_state_idx" ON "contacts"("state");
