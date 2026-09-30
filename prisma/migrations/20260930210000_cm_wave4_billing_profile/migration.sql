-- Payment notes / reference for CM payment tracking
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- User profile fields for CM Profile / Account
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bookList" BOOLEAN NOT NULL DEFAULT false;
