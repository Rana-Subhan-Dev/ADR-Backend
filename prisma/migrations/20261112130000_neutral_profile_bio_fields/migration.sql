-- AlterTable User
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "prefix" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "informalName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mobile" TEXT;

-- AlterTable NeutralProfile
ALTER TABLE "neutral_profiles" ADD COLUMN IF NOT EXISTS "education" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "neutral_profiles" ADD COLUMN IF NOT EXISTS "licensedStates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "neutral_profiles" ADD COLUMN IF NOT EXISTS "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "neutral_profiles" ADD COLUMN IF NOT EXISTS "bioNotes" JSONB NOT NULL DEFAULT '[]';
