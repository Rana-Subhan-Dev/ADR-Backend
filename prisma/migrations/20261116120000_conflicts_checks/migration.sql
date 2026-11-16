-- CreateEnum
CREATE TYPE "ConflictsSearchWindow" AS ENUM ('LAST_5_YEARS', 'ALL_RECORDS');

-- CreateEnum
CREATE TYPE "ConflictsCheckStatus" AS ENUM ('CLEAR', 'CONFLICTS_FOUND');

-- CreateTable
CREATE TABLE "conflicts_checks" (
    "id" TEXT NOT NULL,
    "neutralUserId" TEXT NOT NULL,
    "matterName" TEXT,
    "searchWindow" "ConflictsSearchWindow" NOT NULL DEFAULT 'LAST_5_YEARS',
    "parties" JSONB NOT NULL DEFAULT '[]',
    "counsel" JSONB NOT NULL DEFAULT '[]',
    "lawFirms" JSONB NOT NULL DEFAULT '[]',
    "otherParticipants" JSONB NOT NULL DEFAULT '[]',
    "status" "ConflictsCheckStatus" NOT NULL DEFAULT 'CLEAR',
    "title" TEXT NOT NULL,
    "resultLabel" TEXT NOT NULL,
    "windowLabel" TEXT NOT NULL,
    "namesSearched" INTEGER NOT NULL DEFAULT 0,
    "mattersSearched" INTEGER NOT NULL DEFAULT 0,
    "mattersTotal" INTEGER NOT NULL DEFAULT 0,
    "olderMatchCount" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conflicts_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflicts_check_matches" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "caseId" TEXT,
    "matterName" TEXT,
    "matchedParty" TEXT,
    "matchedHistoricalCase" TEXT,
    "matchType" TEXT,
    "matchSource" TEXT,
    "severity" TEXT,
    "notes" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "historicalDocumentId" TEXT,
    "historicalDocumentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflicts_check_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conflicts_checks_neutralUserId_runAt_idx" ON "conflicts_checks"("neutralUserId", "runAt");

-- CreateIndex
CREATE INDEX "conflicts_checks_runAt_idx" ON "conflicts_checks"("runAt");

-- CreateIndex
CREATE INDEX "conflicts_check_matches_checkId_idx" ON "conflicts_check_matches"("checkId");

-- CreateIndex
CREATE INDEX "conflicts_check_matches_caseId_idx" ON "conflicts_check_matches"("caseId");

-- AddForeignKey
ALTER TABLE "conflicts_checks" ADD CONSTRAINT "conflicts_checks_neutralUserId_fkey" FOREIGN KEY ("neutralUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts_checks" ADD CONSTRAINT "conflicts_checks_runByUserId_fkey" FOREIGN KEY ("runByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts_check_matches" ADD CONSTRAINT "conflicts_check_matches_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "conflicts_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts_check_matches" ADD CONSTRAINT "conflicts_check_matches_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
