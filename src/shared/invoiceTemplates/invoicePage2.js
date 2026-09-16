const {
  escapeHtml,
  formatDate,
  formatDateShort,
} = require("./baseLayout");
const { renderContinuedHeader } = require("./invoicePage1");

const renderInvoicePage2 = (view) => {
  const { company, invoice, matter, authorizedBy, generatedAt, isDraft } = view;

  return `
  <section class="page page--sheet page-break">
    ${renderContinuedHeader({ company, invoice, matter })}

    <div class="section-block">
      <h2 class="section-heading">Payment Instructions</h2>
      <div class="payment-cards">
        <div class="card">
          <h3 class="card-title card-title--accent">Wire Transfer / ACH</h3>
          <div class="kv-list">
            <div class="kv-row">
              <span class="kv-label">Bank</span>
              <strong class="kv-value">${escapeHtml(company.bankName)}</strong>
            </div>
            <div class="kv-row">
              <span class="kv-label">Routing (ABA)</span>
              <strong class="kv-value">${escapeHtml(company.bankRouting)}</strong>
            </div>
            <div class="kv-row">
              <span class="kv-label">Account</span>
              <strong class="kv-value">${escapeHtml(company.bankAccountMasked)}</strong>
            </div>
            <div class="kv-row">
              <span class="kv-label">SWIFT</span>
              <strong class="kv-value">${escapeHtml(company.bankSwift)}</strong>
            </div>
            <div class="kv-row">
              <span class="kv-label">Reference</span>
              <strong class="kv-value">${escapeHtml(invoice.invoiceNumber)}</strong>
            </div>
          </div>
        </div>
        <div class="card">
          <h3 class="card-title card-title--muted">Check / Other</h3>
          <p class="card-body">
            Make checks payable to <strong>${escapeHtml(company.legalName)}</strong>
            and mail to the address on this invoice. Include the invoice number on the memo line.
          </p>
          <div class="questions">
            <p class="questions-title">Questions?</p>
            <p class="questions-body">
              Contact the FedArb Accounting Department at ${escapeHtml(company.phone)}
              or ${escapeHtml(company.email)} and reference invoice
              <strong class="kv-value">${escapeHtml(invoice.invoiceNumber)}</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="section-block">
      <h2 class="section-heading">Terms &amp; Conditions</h2>
      <div class="terms-grid">
        <div>
          Payment is due within 30 days of the invoice date unless otherwise stated.
          Late balances may accrue a finance charge of 1.5% per month. All amounts are
          denominated in USD. Fees are non-refundable except as provided under the
          FedArb Administrative Rules.
        </div>
        <div>
          Billing disputes must be submitted in writing within 15 days of receipt.
          Undisputed amounts remain due and payable. This invoice is subject to the
          FedArb Terms of Service and applicable Arbitration / Mediation Agreement.
        </div>
      </div>
    </div>

    <div class="auth-box">
      <div>
        <p class="auth-label">Authorized by FedArb Accounting</p>
        <div class="sig-line"></div>
        <p class="auth-name">
          ${escapeHtml(authorizedBy.name)}, ${escapeHtml(authorizedBy.title)}
        </p>
        <p class="auth-date">Date: ${escapeHtml(formatDate(authorizedBy.date))}</p>
      </div>
      <div>
        <p class="auth-label">Document Reference</p>
        <div class="kv-list">
          <div class="kv-row">
            <span class="kv-label">Invoice</span>
            <strong class="kv-value">${escapeHtml(invoice.invoiceNumber)}</strong>
          </div>
          <div class="kv-row">
            <span class="kv-label">Case File</span>
            <strong class="kv-value">${escapeHtml(matter.caseNumber)}</strong>
          </div>
          <div class="kv-row">
            <span class="kv-label">Generated</span>
            <strong class="kv-value">${escapeHtml(generatedAt)}</strong>
          </div>
          <div class="kv-row">
            <span class="kv-label">Portal Status</span>
            <strong class="kv-value">${
              isDraft ? "Draft · Editable" : "Finalized · Read-Only"
            }</strong>
          </div>
        </div>
      </div>
    </div>

    <p class="footer">
      Confidential — For intended recipient only · ${escapeHtml(company.legalName)} —
      ${escapeHtml(company.addressLine1)}, ${escapeHtml(company.addressLine2)} —
      ${escapeHtml(company.email)}
    </p>
  </section>`;
};

module.exports = { renderInvoicePage2, formatDateShort };
