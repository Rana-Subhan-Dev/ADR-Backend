-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('INQUIRY', 'CONVERTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CaseLifecycleStatus" AS ENUM ('INTAKE', 'SCHEDULED', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('MEDIATION', 'ARBITRATION', 'HYBRID_ADR', 'CUSTOM_ADR');

-- CreateEnum
CREATE TYPE "FeeScheduleStatus" AS ENUM ('NOT_SET', 'PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ConflictCheckStatus" AS ENUM ('PENDING', 'CLEARED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "RevenueMilestoneStatus" AS ENUM ('ESTIMATED', 'INVOICED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "PartySide" AS ENUM ('CLAIMANT', 'RESPONDENT');

-- CreateEnum
CREATE TYPE "RepresentationDesignation" AS ENUM ('LEAD_COUNSEL', 'CO_COUNSEL');

-- CreateEnum
CREATE TYPE "CaseParticipantRole" AS ENUM ('CASE_MANAGER', 'NEUTRAL', 'LAWYER', 'CLIENT', 'ACCOUNTING_STAFF');

-- CreateEnum
CREATE TYPE "CaseParticipantAccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CaseParticipantInvitationStatus" AS ENUM ('NOT_INVITED', 'INVITED', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ParticipantLinkType" AS ENUM ('ASSIGNED', 'ATTACHED');

-- CreateEnum
CREATE TYPE "HearingType" AS ENUM ('MEDIATION_SESSION', 'ARBITRATION_HEARING', 'STATUS_CONFERENCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "HearingFormat" AS ENUM ('VIRTUAL', 'IN_PERSON', 'HYBRID');

-- CreateEnum
CREATE TYPE "HearingStatus" AS ENUM ('PENDING', 'HOLD_REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('SYNCED', 'PENDING', 'FAILED', 'NOT_SYNCED');

-- CreateEnum
CREATE TYPE "ZoomStatus" AS ENUM ('GENERATED', 'PENDING', 'FAILED', 'MANUALLY_LINKED');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('CLEAR', 'NEEDS_REVIEW', 'CONFLICT');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ConferenceCallStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentSubmissionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('INTERNAL_ONLY', 'NEUTRAL_ONLY', 'ALL_AUTHORIZED_PARTICIPANTS', 'SPECIFIC_PARTY_LAWYER_CLIENT', 'ACCOUNTING_FINANCE');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED');

-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentAccessAction" AS ENUM ('VIEWED', 'DOWNLOADED');

-- CreateEnum
CREATE TYPE "CaseNoteType" AS ENUM ('INTERNAL_NOTE', 'CASE_UPDATE', 'EXTERNAL_COMMENT');

-- CreateEnum
CREATE TYPE "CaseNoteVisibility" AS ENUM ('INTERNAL_ONLY', 'ALL_PARTICIPANTS', 'SPECIFIC_PARTICIPANTS');

-- CreateEnum
CREATE TYPE "CaseTimelineEventType" AS ENUM ('CASE_CREATED', 'STATUS_CHANGED', 'PARTY_ADDED', 'ATTORNEY_ADDED', 'NEUTRAL_ASSIGNED', 'PARTICIPANT_INVITED', 'PARTICIPANT_ACCESS_ACCEPTED', 'HEARING_SCHEDULED', 'ZOOM_LINK_GENERATED', 'CALENDAR_INVITE_SENT', 'DOCUMENT_UPLOADED', 'DOCUMENT_VISIBILITY_CHANGED', 'INVOICE_ISSUED', 'PAYMENT_RECEIVED', 'DOCUSIGN_SENT', 'DOCUSIGN_COMPLETED', 'CHECKLIST_ITEM_COMPLETED', 'CASE_CLOSED', 'CASE_REOPENED');

-- CreateEnum
CREATE TYPE "ChecklistCategory" AS ENUM ('READINESS', 'CLOSURE');

-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ChecklistItemType" AS ENUM ('SYSTEM_DERIVED', 'MANUAL');

-- CreateEnum
CREATE TYPE "TimesheetActivityType" AS ENUM ('PRE_HEARING_PREPARATION', 'REVIEW_OF_DOCUMENTS', 'HEARING_TIME', 'POST_HEARING_FOLLOW_UP', 'CASE_MANAGEMENT');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "TimesheetApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('HOURLY', 'FLAT', 'HYBRID');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('DEPOSIT', 'STANDARD', 'ADMINISTRATIVE', 'FINAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "DocuSignEnvelopeStatus" AS ENUM ('PENDING', 'SENT', 'COMPLETED', 'DECLINED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DocuSignRecipientStatus" AS ENUM ('SENT', 'COMPLETED', 'DECLINED');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('CALENDAR', 'ZOOM', 'DOCUSIGN', 'QUICKBOOKS', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "IntegrationSyncStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "MigrationRecordStatus" AS ENUM ('SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'INVITE_EXPIRED', 'DEACTIVATED', 'LOCKED');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('SUPER_ADMIN', 'ADMIN_LEADERSHIP', 'CASE_MANAGER', 'NEUTRAL', 'LAWYER', 'CLIENT', 'ACCOUNTING_STAFF');

-- CreateEnum
CREATE TYPE "PermissionModule" AS ENUM ('USERS', 'ROLES', 'CASES', 'PARTIES', 'ATTORNEYS', 'DOCUMENTS', 'BILLING', 'TIMESHEETS', 'DOCUSIGN', 'REPORTS', 'INTEGRATIONS', 'AUDIT_LOG');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'ASSIGN', 'INVITE', 'REVOKE');

-- CreateEnum
CREATE TYPE "NeutralType" AS ENUM ('MEDIATOR', 'ARBITRATOR', 'BOTH');

-- CreateEnum
CREATE TYPE "AccountInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TwoFactorMethod" AS ENUM ('TOTP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'MICROSOFT_365');

-- CreateEnum
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY');

-- CreateTable
CREATE TABLE "neutral_timesheets" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "hearingId" TEXT,
    "neutralUserId" TEXT NOT NULL,
    "activityType" "TimesheetActivityType" NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalStatus" "TimesheetApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionComment" TEXT,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "neutral_timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_configurations" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "billingType" "BillingType" NOT NULL,
    "neutralHourlyRate" DECIMAL(10,2),
    "caseManagementHourlyRate" DECIMAL(10,2),
    "flatFeeAmount" DECIMAL(12,2),
    "claimantSplitPercentage" DECIMAL(5,2),
    "respondentSplitPercentage" DECIMAL(5,2),
    "taxApplicability" BOOLEAN NOT NULL DEFAULT false,
    "deliveryContactEmail" TEXT,
    "billingNotes" TEXT,
    "setupFee" DECIMAL(12,2),
    "administrationFee" DECIMAL(12,2),
    "hasTrustAccount" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "inquiryId" TEXT,
    "title" TEXT NOT NULL,
    "caseType" "CaseType" NOT NULL,
    "disputeCategoryId" TEXT,
    "lifecycleStatus" "CaseLifecycleStatus" NOT NULL DEFAULT 'INTAKE',
    "stageId" TEXT,
    "caseValue" DECIMAL(14,2),
    "feeScheduleStatus" "FeeScheduleStatus",
    "conflictCheckStatus" "ConflictCheckStatus" NOT NULL DEFAULT 'PENDING',
    "isInternational" BOOLEAN NOT NULL DEFAULT false,
    "lastContactDate" TIMESTAMP(3),
    "followUpDate" TIMESTAMP(3),
    "nextStep" TEXT,
    "jurisdiction" TEXT,
    "closureSummary" TEXT,
    "reopenReason" TEXT,
    "legacyCaseNumber" TEXT,
    "legacyReferenceId" TEXT,
    "isMigrated" BOOLEAN NOT NULL DEFAULT false,
    "migrationBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_revenue_milestones" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "estimatedAmount" DECIMAL(12,2) NOT NULL,
    "revenueDate" TIMESTAMP(3),
    "status" "RevenueMilestoneStatus" NOT NULL DEFAULT 'ESTIMATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_revenue_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_submission_requests" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "status" "DocumentSubmissionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "dueDate" TIMESTAMP(3),
    "fulfillingDocumentId" TEXT,
    "requestedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_submission_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'INTERNAL_ONLY',
    "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "processingStatus" "DocumentProcessingStatus" NOT NULL DEFAULT 'PROCESSING',
    "currentVersionId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "legacyReferenceId" TEXT,
    "isMigrated" BOOLEAN NOT NULL DEFAULT false,
    "migrationBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "mimeType" TEXT,
    "changesNotes" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "isNewVersionOfExisting" BOOLEAN NOT NULL DEFAULT false,
    "notifyParticipants" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_grants" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "caseParticipantId" TEXT NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_logs" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "accessedByUserId" TEXT NOT NULL,
    "action" "DocumentAccessAction" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docusign_envelopes" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "templateId" TEXT,
    "status" "DocuSignEnvelopeStatus" NOT NULL DEFAULT 'PENDING',
    "failureMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastReminderSentAt" TIMESTAMP(3),
    "signedDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docusign_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docusign_recipients" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "status" "DocuSignRecipientStatus" NOT NULL DEFAULT 'SENT',
    "lastActivityAt" TIMESTAMP(3),
    "caseParticipantId" TEXT,
    "attorneyId" TEXT,
    "casePartyId" TEXT,

    CONSTRAINT "docusign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hearings" (
    "id" TEXT NOT NULL,
    "hearingReference" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "HearingType" NOT NULL,
    "title" TEXT NOT NULL,
    "format" "HearingFormat" NOT NULL,
    "holdingDate" TIMESTAMP(3),
    "dateConfirmed" TIMESTAMP(3),
    "hearingDate" TIMESTAMP(3),
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "location" TEXT,
    "hearingStatus" "HearingStatus" NOT NULL DEFAULT 'PENDING',
    "calendarProvider" "CalendarProvider",
    "calendarEventId" TEXT,
    "calendarSyncStatus" "CalendarSyncStatus",
    "zoomMeetingId" TEXT,
    "zoomJoinUrl" TEXT,
    "zoomStatus" "ZoomStatus",
    "conflictStatus" "ConflictStatus" NOT NULL DEFAULT 'CLEAR',
    "conflictOverrideReason" TEXT,
    "rescheduleReason" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hearings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hearing_attendees" (
    "id" TEXT NOT NULL,
    "hearingId" TEXT NOT NULL,
    "caseParticipantId" TEXT NOT NULL,
    "side" "PartySide",
    "attendanceStatus" "AttendanceStatus",
    "notes" TEXT,

    CONSTRAINT "hearing_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_conference_calls" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "inquiryId" TEXT,
    "status" "ConferenceCallStatus" NOT NULL DEFAULT 'SCHEDULED',
    "date" TIMESTAMP(3),
    "time" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_conference_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" TEXT NOT NULL,
    "inquiryDate" TIMESTAMP(3) NOT NULL,
    "matterName" TEXT NOT NULL,
    "initialContactName" TEXT NOT NULL,
    "inquiryContactType" TEXT,
    "fromFirm" TEXT,
    "counselFor" "PartySide",
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "caseType" "CaseType",
    "disputeCategoryId" TEXT,
    "locationJurisdiction" TEXT,
    "daysRequested" INTEGER,
    "timeFrameRequested" TEXT,
    "sourceOfInquiry" TEXT,
    "referredBy" TEXT,
    "comments" TEXT,
    "isInternational" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "status" "InquiryStatus" NOT NULL DEFAULT 'INQUIRY',
    "preliminaryCaseManagerId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispute_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_logs" (
    "id" TEXT NOT NULL,
    "integrationType" "IntegrationType" NOT NULL,
    "relatedRecordType" TEXT NOT NULL,
    "relatedRecordId" TEXT NOT NULL,
    "status" "IntegrationSyncStatus" NOT NULL,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_batches" (
    "id" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "importedByUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_record_logs" (
    "id" TEXT NOT NULL,
    "migrationBatchId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "sourceRowIdentifier" TEXT,
    "createdRecordId" TEXT,
    "status" "MigrationRecordStatus" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_record_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceType" "InvoiceType" NOT NULL,
    "invoiceStatus" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "payerCasePartyId" TEXT,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "specialInstructions" TEXT,
    "quickBooksInvoiceId" TEXT,
    "quickBooksSyncStatus" "IntegrationSyncStatus",
    "quickBooksLastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "relatedTimesheetId" TEXT,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "quickBooksPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "quickBooksCreditNoteId" TEXT,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_notes" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "noteType" "CaseNoteType" NOT NULL,
    "visibility" "CaseNoteVisibility" NOT NULL DEFAULT 'INTERNAL_ONLY',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_timeline_events" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "eventType" "CaseTimelineEventType" NOT NULL,
    "relatedRecordType" TEXT,
    "relatedRecordId" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "summary" TEXT NOT NULL,
    "actorUserId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "category" "ChecklistCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'PENDING',
    "type" "ChecklistItemType" NOT NULL,
    "relatedModule" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_participants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "role" "CaseParticipantRole" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "attorneyId" TEXT,
    "casePartyId" TEXT,
    "accessStatus" "CaseParticipantAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitationStatus" "CaseParticipantInvitationStatus" NOT NULL DEFAULT 'NOT_INVITED',
    "lastInviteSentAt" TIMESTAMP(3),
    "assignmentType" "ParticipantLinkType" NOT NULL,
    "assignmentReason" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_parties" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "partyType" "PartyType" NOT NULL,
    "side" "PartySide" NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "organizationName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "streetAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "notes" TEXT,
    "legacyReferenceId" TEXT,
    "isMigrated" BOOLEAN NOT NULL DEFAULT false,
    "migrationBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attorneys" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "lawFirmId" TEXT,
    "linkedUserId" TEXT,
    "legacyReferenceId" TEXT,
    "isMigrated" BOOLEAN NOT NULL DEFAULT false,
    "migrationBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attorneys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "law_firms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "law_firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_attorney_representations" (
    "id" TEXT NOT NULL,
    "casePartyId" TEXT NOT NULL,
    "attorneyId" TEXT NOT NULL,
    "designation" "RepresentationDesignation" NOT NULL DEFAULT 'LEAD_COUNSEL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_attorney_representations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actingUserId" TEXT,
    "actingUserRoleSnapshot" "RoleName",
    "action" TEXT NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "affectedRecordType" TEXT NOT NULL,
    "affectedRecordId" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "TwoFactorMethod" NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "two_factor_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "emailAttempted" TEXT NOT NULL,
    "isSuccessful" BOOLEAN NOT NULL,
    "failureReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "replacedByTokenId" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_calendar_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "externalCalendarId" TEXT,
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_calendar_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_invitations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "AccountInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_versions" (
    "id" TEXT NOT NULL,
    "documentType" "LegalDocumentType" NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "contentUrl" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acknowledgements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "legalDocumentVersionId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,

    CONSTRAINT "legal_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neutral_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "neutralType" "NeutralType" NOT NULL,
    "specialties" TEXT[],
    "defaultHourlyRate" DECIMAL(12,2),
    "bio" TEXT,
    "credentials" TEXT,
    "yearsOfExperience" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "neutral_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neutral_support_contacts" (
    "id" TEXT NOT NULL,
    "neutralProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "neutral_support_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "eventType" TEXT NOT NULL,
    "subject" TEXT,
    "templateData" JSONB,
    "relatedRecordType" TEXT,
    "relatedRecordId" TEXT,
    "deliveryStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" TEXT,
    "isSystemDefined" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "isGranted" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "jobTitle" TEXT,
    "profileImageUrl" TEXT,
    "userType" "UserType" NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "timezone" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastPasswordChangeAt" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "invitedById" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedById" TEXT,
    "deactivationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DocumentToDocumentTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DocumentToDocumentTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "neutral_timesheets_caseId_status_idx" ON "neutral_timesheets"("caseId", "status");

-- CreateIndex
CREATE INDEX "neutral_timesheets_neutralUserId_approvalStatus_idx" ON "neutral_timesheets"("neutralUserId", "approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "billing_configurations_caseId_key" ON "billing_configurations"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "cases_caseNumber_key" ON "cases"("caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "cases_inquiryId_key" ON "cases"("inquiryId");

-- CreateIndex
CREATE INDEX "cases_lifecycleStatus_idx" ON "cases"("lifecycleStatus");

-- CreateIndex
CREATE INDEX "cases_stageId_idx" ON "cases"("stageId");

-- CreateIndex
CREATE INDEX "cases_disputeCategoryId_idx" ON "cases"("disputeCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "case_stages_name_key" ON "case_stages"("name");

-- CreateIndex
CREATE UNIQUE INDEX "case_revenue_milestones_caseId_sequence_key" ON "case_revenue_milestones"("caseId", "sequence");

-- CreateIndex
CREATE INDEX "document_submission_requests_caseId_status_idx" ON "document_submission_requests"("caseId", "status");

-- CreateIndex
CREATE INDEX "document_submission_requests_status_dueDate_idx" ON "document_submission_requests"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_name_key" ON "document_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "document_tags_name_key" ON "document_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "documents_currentVersionId_key" ON "documents"("currentVersionId");

-- CreateIndex
CREATE INDEX "documents_caseId_categoryId_createdAt_idx" ON "documents"("caseId", "categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "documents_uploadedByUserId_idx" ON "documents"("uploadedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_versionNumber_key" ON "document_versions"("documentId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "document_access_grants_documentId_caseParticipantId_key" ON "document_access_grants"("documentId", "caseParticipantId");

-- CreateIndex
CREATE INDEX "document_access_logs_documentId_timestamp_idx" ON "document_access_logs"("documentId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "docusign_envelopes_envelopeId_key" ON "docusign_envelopes"("envelopeId");

-- CreateIndex
CREATE INDEX "docusign_envelopes_caseId_status_idx" ON "docusign_envelopes"("caseId", "status");

-- CreateIndex
CREATE INDEX "docusign_recipients_envelopeId_idx" ON "docusign_recipients"("envelopeId");

-- CreateIndex
CREATE UNIQUE INDEX "hearings_hearingReference_key" ON "hearings"("hearingReference");

-- CreateIndex
CREATE INDEX "hearings_caseId_hearingDate_idx" ON "hearings"("caseId", "hearingDate");

-- CreateIndex
CREATE INDEX "hearings_hearingDate_idx" ON "hearings"("hearingDate");

-- CreateIndex
CREATE UNIQUE INDEX "hearing_attendees_hearingId_caseParticipantId_key" ON "hearing_attendees"("hearingId", "caseParticipantId");

-- CreateIndex
CREATE INDEX "case_conference_calls_caseId_idx" ON "case_conference_calls"("caseId");

-- CreateIndex
CREATE INDEX "case_conference_calls_inquiryId_idx" ON "case_conference_calls"("inquiryId");

-- CreateIndex
CREATE INDEX "inquiries_status_idx" ON "inquiries"("status");

-- CreateIndex
CREATE INDEX "inquiries_preliminaryCaseManagerId_idx" ON "inquiries"("preliminaryCaseManagerId");

-- CreateIndex
CREATE INDEX "inquiries_disputeCategoryId_idx" ON "inquiries"("disputeCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_categories_name_key" ON "dispute_categories"("name");

-- CreateIndex
CREATE INDEX "integration_sync_logs_relatedRecordType_relatedRecordId_idx" ON "integration_sync_logs"("relatedRecordType", "relatedRecordId");

-- CreateIndex
CREATE INDEX "integration_sync_logs_integrationType_status_idx" ON "integration_sync_logs"("integrationType", "status");

-- CreateIndex
CREATE INDEX "migration_record_logs_migrationBatchId_status_idx" ON "migration_record_logs"("migrationBatchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_caseId_invoiceStatus_paymentStatus_idx" ON "invoices"("caseId", "invoiceStatus", "paymentStatus");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "case_notes_caseId_createdAt_idx" ON "case_notes"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "case_timeline_events_caseId_timestamp_idx" ON "case_timeline_events"("caseId", "timestamp");

-- CreateIndex
CREATE INDEX "case_timeline_events_caseId_eventType_idx" ON "case_timeline_events"("caseId", "eventType");

-- CreateIndex
CREATE INDEX "case_timeline_events_actorUserId_idx" ON "case_timeline_events"("actorUserId");

-- CreateIndex
CREATE INDEX "checklist_items_caseId_category_status_idx" ON "checklist_items"("caseId", "category", "status");

-- CreateIndex
CREATE INDEX "case_participants_caseId_role_accessStatus_idx" ON "case_participants"("caseId", "role", "accessStatus");

-- CreateIndex
CREATE INDEX "case_participants_userId_caseId_idx" ON "case_participants"("userId", "caseId");

-- CreateIndex
CREATE INDEX "case_parties_caseId_side_idx" ON "case_parties"("caseId", "side");

-- CreateIndex
CREATE UNIQUE INDEX "attorneys_linkedUserId_key" ON "attorneys"("linkedUserId");

-- CreateIndex
CREATE INDEX "attorneys_lawFirmId_idx" ON "attorneys"("lawFirmId");

-- CreateIndex
CREATE UNIQUE INDEX "law_firms_name_key" ON "law_firms"("name");

-- CreateIndex
CREATE UNIQUE INDEX "party_attorney_representations_casePartyId_attorneyId_key" ON "party_attorney_representations"("casePartyId", "attorneyId");

-- CreateIndex
CREATE INDEX "audit_logs_affectedRecordType_affectedRecordId_idx" ON "audit_logs"("affectedRecordType", "affectedRecordId");

-- CreateIndex
CREATE INDEX "audit_logs_actingUserId_idx" ON "audit_logs"("actingUserId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_credentials_userId_key" ON "two_factor_credentials"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "login_attempts_userId_attemptedAt_idx" ON "login_attempts"("userId", "attemptedAt");

-- CreateIndex
CREATE INDEX "login_attempts_emailAttempted_attemptedAt_idx" ON "login_attempts"("emailAttempted", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_accessTokenHash_key" ON "sessions"("accessTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replacedByTokenId_key" ON "refresh_tokens"("replacedByTokenId");

-- CreateIndex
CREATE INDEX "refresh_tokens_sessionId_idx" ON "refresh_tokens"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_calendar_connections_userId_provider_key" ON "user_calendar_connections"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "account_invitations_tokenHash_key" ON "account_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "account_invitations_userId_status_idx" ON "account_invitations"("userId", "status");

-- CreateIndex
CREATE INDEX "account_invitations_expiresAt_idx" ON "account_invitations"("expiresAt");

-- CreateIndex
CREATE INDEX "account_invitations_invitedById_idx" ON "account_invitations"("invitedById");

-- CreateIndex
CREATE UNIQUE INDEX "legal_acknowledgements_userId_legalDocumentVersionId_key" ON "legal_acknowledgements"("userId", "legalDocumentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "neutral_profiles_userId_key" ON "neutral_profiles"("userId");

-- CreateIndex
CREATE INDEX "neutral_support_contacts_neutralProfileId_idx" ON "neutral_support_contacts"("neutralProfileId");

-- CreateIndex
CREATE INDEX "notifications_recipientUserId_deliveryStatus_idx" ON "notifications"("recipientUserId", "deliveryStatus");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_module_action_key" ON "permissions"("module", "action");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_roleId_status_idx" ON "users"("roleId", "status");

-- CreateIndex
CREATE INDEX "users_status_updatedAt_idx" ON "users"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "_DocumentToDocumentTag_B_index" ON "_DocumentToDocumentTag"("B");

-- AddForeignKey
ALTER TABLE "neutral_timesheets" ADD CONSTRAINT "neutral_timesheets_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neutral_timesheets" ADD CONSTRAINT "neutral_timesheets_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "hearings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neutral_timesheets" ADD CONSTRAINT "neutral_timesheets_neutralUserId_fkey" FOREIGN KEY ("neutralUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neutral_timesheets" ADD CONSTRAINT "neutral_timesheets_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_configurations" ADD CONSTRAINT "billing_configurations_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_disputeCategoryId_fkey" FOREIGN KEY ("disputeCategoryId") REFERENCES "dispute_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "case_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_migrationBatchId_fkey" FOREIGN KEY ("migrationBatchId") REFERENCES "migration_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_revenue_milestones" ADD CONSTRAINT "case_revenue_milestones_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_submission_requests" ADD CONSTRAINT "document_submission_requests_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_submission_requests" ADD CONSTRAINT "document_submission_requests_fulfillingDocumentId_fkey" FOREIGN KEY ("fulfillingDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_submission_requests" ADD CONSTRAINT "document_submission_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "document_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_migrationBatchId_fkey" FOREIGN KEY ("migrationBatchId") REFERENCES "migration_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_grants" ADD CONSTRAINT "document_access_grants_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_grants" ADD CONSTRAINT "document_access_grants_caseParticipantId_fkey" FOREIGN KEY ("caseParticipantId") REFERENCES "case_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_grants" ADD CONSTRAINT "document_access_grants_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_accessedByUserId_fkey" FOREIGN KEY ("accessedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_envelopes" ADD CONSTRAINT "docusign_envelopes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_envelopes" ADD CONSTRAINT "docusign_envelopes_signedDocumentId_fkey" FOREIGN KEY ("signedDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_recipients" ADD CONSTRAINT "docusign_recipients_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "docusign_envelopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_recipients" ADD CONSTRAINT "docusign_recipients_caseParticipantId_fkey" FOREIGN KEY ("caseParticipantId") REFERENCES "case_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_recipients" ADD CONSTRAINT "docusign_recipients_attorneyId_fkey" FOREIGN KEY ("attorneyId") REFERENCES "attorneys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docusign_recipients" ADD CONSTRAINT "docusign_recipients_casePartyId_fkey" FOREIGN KEY ("casePartyId") REFERENCES "case_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearing_attendees" ADD CONSTRAINT "hearing_attendees_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "hearings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hearing_attendees" ADD CONSTRAINT "hearing_attendees_caseParticipantId_fkey" FOREIGN KEY ("caseParticipantId") REFERENCES "case_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_conference_calls" ADD CONSTRAINT "case_conference_calls_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_conference_calls" ADD CONSTRAINT "case_conference_calls_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_disputeCategoryId_fkey" FOREIGN KEY ("disputeCategoryId") REFERENCES "dispute_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_preliminaryCaseManagerId_fkey" FOREIGN KEY ("preliminaryCaseManagerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_batches" ADD CONSTRAINT "migration_batches_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_record_logs" ADD CONSTRAINT "migration_record_logs_migrationBatchId_fkey" FOREIGN KEY ("migrationBatchId") REFERENCES "migration_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payerCasePartyId_fkey" FOREIGN KEY ("payerCasePartyId") REFERENCES "case_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_relatedTimesheetId_fkey" FOREIGN KEY ("relatedTimesheetId") REFERENCES "neutral_timesheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_timeline_events" ADD CONSTRAINT "case_timeline_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_timeline_events" ADD CONSTRAINT "case_timeline_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_attorneyId_fkey" FOREIGN KEY ("attorneyId") REFERENCES "attorneys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_casePartyId_fkey" FOREIGN KEY ("casePartyId") REFERENCES "case_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_parties" ADD CONSTRAINT "case_parties_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_parties" ADD CONSTRAINT "case_parties_migrationBatchId_fkey" FOREIGN KEY ("migrationBatchId") REFERENCES "migration_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attorneys" ADD CONSTRAINT "attorneys_lawFirmId_fkey" FOREIGN KEY ("lawFirmId") REFERENCES "law_firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attorneys" ADD CONSTRAINT "attorneys_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attorneys" ADD CONSTRAINT "attorneys_migrationBatchId_fkey" FOREIGN KEY ("migrationBatchId") REFERENCES "migration_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_attorney_representations" ADD CONSTRAINT "party_attorney_representations_casePartyId_fkey" FOREIGN KEY ("casePartyId") REFERENCES "case_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_attorney_representations" ADD CONSTRAINT "party_attorney_representations_attorneyId_fkey" FOREIGN KEY ("attorneyId") REFERENCES "attorneys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actingUserId_fkey" FOREIGN KEY ("actingUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_credentials" ADD CONSTRAINT "two_factor_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replacedByTokenId_fkey" FOREIGN KEY ("replacedByTokenId") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_calendar_connections" ADD CONSTRAINT "user_calendar_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acknowledgements" ADD CONSTRAINT "legal_acknowledgements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acknowledgements" ADD CONSTRAINT "legal_acknowledgements_legalDocumentVersionId_fkey" FOREIGN KEY ("legalDocumentVersionId") REFERENCES "legal_document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neutral_profiles" ADD CONSTRAINT "neutral_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neutral_support_contacts" ADD CONSTRAINT "neutral_support_contacts_neutralProfileId_fkey" FOREIGN KEY ("neutralProfileId") REFERENCES "neutral_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DocumentToDocumentTag" ADD CONSTRAINT "_DocumentToDocumentTag_A_fkey" FOREIGN KEY ("A") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DocumentToDocumentTag" ADD CONSTRAINT "_DocumentToDocumentTag_B_fkey" FOREIGN KEY ("B") REFERENCES "document_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
