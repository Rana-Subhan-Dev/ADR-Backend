const fedarbCompany = {
  legalName:
    process.env.FEDARB_LEGAL_NAME || "Federal Arbitration, Inc.",
  addressLine1:
    process.env.FEDARB_ADDRESS_LINE1 || "1250 Connecticut Avenue NW, Suite 810",
  addressLine2:
    process.env.FEDARB_ADDRESS_LINE2 || "Washington, D.C. 20036",
  phone: process.env.FEDARB_PHONE || "+1 (202) 555-0188",
  email: process.env.FEDARB_ACCOUNTING_EMAIL || "accounting@fedarb.gov",
  ein: process.env.FEDARB_EIN || "XX-XXXXXXX",
  bankName: process.env.FEDARB_BANK_NAME || "Capital One, N.A.",
  bankRouting: process.env.FEDARB_BANK_ROUTING || "056073502",
  bankAccountMasked: process.env.FEDARB_BANK_ACCOUNT_MASKED || "****8821",
  bankSwift: process.env.FEDARB_BANK_SWIFT || "HIBKUS44",
};

module.exports = { fedarbCompany };
