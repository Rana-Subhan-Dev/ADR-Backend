const fs = require("fs");
const puppeteer = require("puppeteer");
const billingRepository = require("../repositories/billing.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const { buildInvoiceHtml } = require("../shared/invoiceTemplates/buildInvoiceHtml");
const { fedarbCompany } = require("../constants/fedarbCompany.constants");

const allowedBillingRoles = [
  "SUPER_ADMIN",
  "ADMIN_LEADERSHIP",
  "ACCOUNTING_STAFF",
  "CASE_MANAGER",
  "NEUTRAL",
  "LAWYER",
  "CLIENT",
];

const SYSTEM_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

const resolveChromeExecutable = () => {
  for (const candidate of SYSTEM_CHROME_CANDIDATES) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
    }
  }
  return null;
};

const caseTypeLabel = (caseType) => {
  const map = {
    ARBITRATION: "Commercial Arbitration",
    MEDIATION: "Mediation",
    HYBRID_ADR: "Hybrid ADR",
    CUSTOM_ADR: "Custom ADR",
  };
  return map[caseType] || caseType || "—";
};

const buildInvoicePdfViewModel = (invoice) => {
  const caseData = invoice.case || {};
  const participants = caseData.participants || [];
  const neutral = participants.find((p) => p.role === "NEUTRAL");
  const payer = invoice.payerCaseParty;
  const billingConfig = caseData.billingConfiguration;
  const payerSplit = billingConfig?.payerSplits?.find(
    (row) => row.casePartyId === invoice.payerCasePartyId,
  );

  const isDraft = invoice.invoiceStatus === "DRAFT";
  const finalizedBy = invoice.finalizedBy;
  const authorizedName = finalizedBy
    ? `${finalizedBy.firstName || ""} ${finalizedBy.lastName || ""}`.trim()
    : "FedArb Accounting";
  const authorizedTitle =
    finalizedBy?.role?.name?.replace(/_/g, " ") || "Accounting Staff";

  return {
    company: fedarbCompany,
    isDraft,
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate || invoice.createdAt,
      dueDate: invoice.dueDate,
      invoiceStatus: invoice.invoiceStatus,
      clientBillingRef: invoice.clientBillingRef,
      subtotal: invoice.subtotal ?? invoice.amountDue,
      taxRate: invoice.taxRate || 0,
      taxAmount: invoice.taxAmount || 0,
      amountDue: invoice.amountDue,
    },
    billTo: {
      party: payer,
      attention: payerSplit?.invoiceContactName || null,
      email: payerSplit?.invoiceContactEmail || payer?.email || null,
    },
    matter: {
      caseNumber: caseData.caseNumber || "—",
      title: caseData.title || "—",
      matterType: caseTypeLabel(caseData.caseType),
      panelLabel: `Panel No. ${caseData.caseNumber || "—"}`,
      neutralName: neutral?.user
        ? `${neutral.user.firstName || ""} ${neutral.user.lastName || ""}`.trim()
        : "—",
      neutralRole:
        caseData.caseType === "MEDIATION" ? "Lead Mediator" : "Lead Arbitrator",
    },
    lineItems: invoice.lineItems || [],
    authorizedBy: {
      name: authorizedName || "FedArb Accounting",
      title: authorizedTitle,
      date: invoice.finalizedAt || invoice.invoiceDate || new Date(),
    },
    generatedAt: new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }),
  };
};

const renderInvoicePdfBuffer = async (html) => {
  const launchOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  };

  const executablePath = resolveChromeExecutable();
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("Could not find Chrome")) {
      throw new ApiError(
        500,
        "Invoice PDF renderer is missing Chrome. Run `npx puppeteer browsers install chrome` (or set PUPPETEER_EXECUTABLE_PATH).",
      );
    }
    throw error;
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};

const generateInvoicePdf = async (invoiceId, currentUser) => {
  if (!allowedBillingRoles.includes(currentUser?.role?.name)) {
    throw new ApiError(403, "You do not have permission to download invoices.");
  }

  const invoice = await billingRepository.findInvoiceById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  await caseService.getCaseById(invoice.caseId, currentUser);

  if (invoice.caseId) {
    const config = await billingRepository.findBillingConfigByCaseId(
      invoice.caseId,
    );
    if (invoice.case && config) {
      invoice.case.billingConfiguration = {
        ...(invoice.case.billingConfiguration || {}),
        payerSplits: config.payerSplits,
      };
    }
  }

  const view = buildInvoicePdfViewModel(invoice);
  const html = buildInvoiceHtml(view);
  const buffer = await renderInvoicePdfBuffer(html);

  return {
    buffer,
    filename: `Invoice-${invoice.invoiceNumber}.pdf`,
    invoice,
  };
};

module.exports = {
  generateInvoicePdf,
  buildInvoicePdfViewModel,
  renderInvoicePdfBuffer,
};
