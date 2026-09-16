const {
  escapeHtml,
  formatMoney,
  formatDate,
  formatDateShort,
  renderLogoMark,
} = require("./baseLayout");

const PAGE_HEIGHT_PX = 1056;
const PAGE1_FIXED_PX = 580;
const CONTINUED_FIXED_PX = 170;
const SUMMARY_BLOCK_PX = 180;
const PAGE_BOTTOM_PAD_PX = 40;

const partyDisplayName = (party) => {
  if (!party) return "—";
  if (party.organizationName) return party.organizationName;
  return [party.firstName, party.lastName].filter(Boolean).join(" ") || "—";
};

const partyAddressLines = (party) => {
  if (!party) return [];
  const lines = [];
  if (party.streetAddress) lines.push(party.streetAddress);
  const cityLine = [party.city, party.state, party.postalCode]
    .filter(Boolean)
    .join(", ");
  if (cityLine) lines.push(cityLine);
  return lines;
};

const statusLabel = (invoice) => {
  if (invoice.invoiceStatus === "DRAFT") return "Draft";
  if (invoice.invoiceStatus === "ISSUED" || invoice.invoiceStatus === "SENT") {
    return "Finalized";
  }
  return invoice.invoiceStatus;
};

const estimateRowHeightPx = (item) => {
  let height = 44;
  if (item?.secondaryDescription) height += 16;
  if ((item?.description || "").length > 70) height += 14;
  return height;
};

const paginateLineItems = (lineItems = []) => {
  const items = Array.isArray(lineItems) ? lineItems : [];
  if (!items.length) {
    return [{ items: [], showSummary: true, isFirst: true }];
  }

  const pages = [];
  let index = 0;
  let isFirst = true;

  while (index < items.length) {
    const remaining = items.slice(index);
    const fixed = isFirst ? PAGE1_FIXED_PX : CONTINUED_FIXED_PX;
    const availWithSummary =
      PAGE_HEIGHT_PX - fixed - SUMMARY_BLOCK_PX - PAGE_BOTTOM_PAD_PX;
    const availWithoutSummary = PAGE_HEIGHT_PX - fixed - PAGE_BOTTOM_PAD_PX;

    let height = 0;
    let countWithSummary = 0;
    for (const item of remaining) {
      const rowH = estimateRowHeightPx(item);
      if (height + rowH <= availWithSummary) {
        height += rowH;
        countWithSummary += 1;
      } else break;
    }

    if (countWithSummary === remaining.length) {
      pages.push({
        items: remaining,
        showSummary: true,
        isFirst,
      });
      break;
    }

    height = 0;
    let countWithout = 0;
    for (const item of remaining) {
      const rowH = estimateRowHeightPx(item);
      if (height + rowH <= availWithoutSummary) {
        height += rowH;
        countWithout += 1;
      } else break;
    }
    countWithout = Math.max(1, countWithout);
    if (countWithout >= remaining.length) {
      countWithout = Math.max(1, countWithSummary || remaining.length - 1);
    }

    pages.push({
      items: remaining.slice(0, countWithout),
      showSummary: false,
      isFirst,
    });
    index += countWithout;
    isFirst = false;
  }

  if (pages.length && !pages[pages.length - 1].showSummary) {
    pages[pages.length - 1].showSummary = true;
  }

  return pages;
};

const renderContinuedHeader = ({ company, invoice, matter }) => `
  <header class="continued-header">
    <div class="brand-row brand-row--center">
      ${renderLogoMark({ className: "logo-mark logo-mark--sm" })}
      <p class="brand-name">${escapeHtml(company.legalName)}</p>
    </div>
    <div class="continued-meta">
      <span class="continued-invoice">${escapeHtml(invoice.invoiceNumber)}</span>
      <span class="continued-sep">·</span>
      <span class="continued-case">${escapeHtml(matter.caseNumber)} — Continued</span>
    </div>
  </header>`;

const renderLineItemRows = (lineItems) =>
  (lineItems || [])
    .map((item) => {
      const isFlatFee =
        Number(item.quantity) === 1 && !item.relatedTimesheetId;
      const hoursCell = isFlatFee
        ? "—"
        : `${Number(item.quantity).toFixed(1)}h`;
      const rateCell = isFlatFee
        ? "—"
        : `${formatMoney(item.unitPrice)}/hr`;

      return `
      <tr>
        <td class="ref-code">${escapeHtml(item.referenceCode || "—")}</td>
        <td class="svc-date">${escapeHtml(formatDateShort(item.serviceDate))}</td>
        <td>
          <p class="desc-main">${escapeHtml(item.description)}</p>
          ${
            item.secondaryDescription
              ? `<p class="desc-sub">${escapeHtml(item.secondaryDescription)}</p>`
              : ""
          }
        </td>
        <td class="num">${escapeHtml(hoursCell)}</td>
        <td class="num rate">${escapeHtml(rateCell)}</td>
        <td class="amount">${escapeHtml(formatMoney(item.amount))}</td>
      </tr>`;
    })
    .join("");

const renderServicesTable = (lineItems, { showHeading }) => `
  <div class="services${showHeading ? "" : " services--continued"}">
    ${
      showHeading
        ? `<h2 class="services-heading">Services Rendered</h2>`
        : `<h2 class="services-heading">Services Rendered <span class="services-continued">(continued)</span></h2>`
    }
    <div class="services-header" aria-hidden="true">
      <span>Ref.</span>
      <span>Date</span>
      <span>Description</span>
      <span class="num">Hrs</span>
      <span class="num">Rate</span>
      <span class="num">Amount</span>
    </div>
    <table class="services-table">
      <colgroup>
        <col class="col-ref" />
        <col class="col-date" />
        <col class="col-desc" />
        <col class="col-hrs" />
        <col class="col-rate" />
        <col class="col-amount" />
      </colgroup>
      <tbody>
        ${
          renderLineItemRows(lineItems) ||
          `<tr><td colspan="6">No line items</td></tr>`
        }
      </tbody>
    </table>
  </div>`;

const renderInvoiceSummary = (invoice) => `
  <div class="invoice-summary">
    <div class="totals-card">
      <div class="totals-row">
        <span>Subtotal</span>
        <strong>${escapeHtml(formatMoney(invoice.subtotal))}</strong>
      </div>
      <div class="totals-row">
        <span>Tax (${escapeHtml(Number(invoice.taxRate || 0).toFixed(2))}%)</span>
        <strong>${escapeHtml(formatMoney(invoice.taxAmount))}</strong>
      </div>
      <div class="totals-due">
        <span>TOTAL DUE</span>
        <span class="totals-due-amount">${escapeHtml(formatMoney(invoice.amountDue))}</span>
      </div>
    </div>
    <div class="due-bar">
      <svg class="due-bar-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4"/>
        <line x1="8" y1="7.2" x2="8" y2="11.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="8" cy="5" r="0.9" fill="currentColor"/>
      </svg>
      <span>Payment due by <strong>${escapeHtml(formatDate(invoice.dueDate))}</strong></span>
    </div>
  </div>`;

const renderFirstPageChrome = (view) => {
  const { company, invoice, billTo, matter } = view;
  return `
    <header class="header">
      <div class="brand-block">
        <div class="brand-row">
          ${renderLogoMark()}
          <div>
            <p class="brand-name">${escapeHtml(company.legalName)}</p>
            <p class="brand-tag">FEDARB • ADR CASE MANAGEMENT PLATFORM</p>
          </div>
        </div>
        <p class="brand-contact">
          ${escapeHtml(company.addressLine1)}<br/>
          ${escapeHtml(company.addressLine2)}<br/>
          ${escapeHtml(company.phone)} · ${escapeHtml(company.email)}
        </p>
      </div>
      <div class="invoice-title-block">
        <p class="invoice-title">INVOICE</p>
        <span class="invoice-badge">${escapeHtml(invoice.invoiceNumber)}</span>
      </div>
    </header>

    <div class="meta-grid">
      <div>
        <p class="meta-label">Invoice Date</p>
        <p class="meta-value">${escapeHtml(formatDate(invoice.invoiceDate))}</p>
      </div>
      <div>
        <p class="meta-label">Due Date</p>
        <p class="meta-value">${escapeHtml(formatDate(invoice.dueDate))}</p>
      </div>
      <div>
        <p class="meta-label">Case Reference</p>
        <p class="meta-value accent">${escapeHtml(matter.caseNumber)}</p>
      </div>
      <div>
        <p class="meta-label">Matter Type</p>
        <p class="meta-value">${escapeHtml(matter.matterType)}</p>
      </div>
      <div>
        <p class="meta-label">Status</p>
        <p class="meta-value">
          <span class="status-badge">
            <span class="status-dot"></span>${escapeHtml(statusLabel(invoice))}
          </span>
        </p>
      </div>
    </div>

    <div class="parties">
      <div>
        <p class="section-label">Bill To</p>
        <p class="party-name">${escapeHtml(partyDisplayName(billTo.party))}</p>
        <p class="party-lines">
          ${billTo.attention ? `Attn: ${escapeHtml(billTo.attention)}<br/>` : ""}
          ${partyAddressLines(billTo.party)
            .map((line) => `${escapeHtml(line)}<br/>`)
            .join("")}
          ${
            billTo.email
              ? `<span class="party-email">${escapeHtml(billTo.email)}</span>`
              : ""
          }
        </p>
        ${
          invoice.clientBillingRef
            ? `<p class="client-ref">Client Billing Ref: ${escapeHtml(invoice.clientBillingRef)}</p>`
            : ""
        }
      </div>
      <div>
        <p class="section-label">Remit To</p>
        <p class="party-name">${escapeHtml(company.legalName)}</p>
        <p class="party-lines">
          ${company.ein ? `EIN: ${escapeHtml(company.ein)}<br/>` : ""}
          ${escapeHtml(company.addressLine1)}<br/>
          ${escapeHtml(company.addressLine2)}<br/>
          ${escapeHtml(company.phone)}<br/>
          <span class="party-email">${escapeHtml(company.email)}</span>
        </p>
      </div>
    </div>

    <div class="matter-banner">
      <div class="matter-col">
        <p class="matter-label">Matter</p>
        <p class="matter-value">${escapeHtml(matter.title)}</p>
      </div>
      <div class="matter-col">
        <p class="matter-label">Panel</p>
        <p class="matter-value">${escapeHtml(matter.panelLabel)}</p>
      </div>
      <div class="matter-col matter-col--end">
        <p class="matter-label">Lead Arbitrator</p>
        <p class="matter-value">${escapeHtml(matter.neutralName)}</p>
        <p class="matter-sub">${escapeHtml(matter.neutralRole)}</p>
      </div>
    </div>`;
};

const renderInvoiceContentPages = (view) => {
  const { company, invoice, matter, lineItems } = view;
  const pages = paginateLineItems(lineItems);

  return pages
    .map((page, pageIndex) => {
      const pageBreakClass = pageIndex === 0 ? "" : " page-break";
      const header = page.isFirst
        ? renderFirstPageChrome(view)
        : renderContinuedHeader({ company, invoice, matter });

      return `
  <section class="page page--sheet${pageBreakClass}">
    ${header}
    ${renderServicesTable(page.items, { showHeading: page.isFirst })}
    ${page.showSummary ? renderInvoiceSummary(invoice) : ""}
  </section>`;
    })
    .join("\n");
};

const renderInvoicePage1 = (view) => renderInvoiceContentPages(view);

module.exports = {
  renderInvoicePage1,
  renderInvoiceContentPages,
  renderContinuedHeader,
  paginateLineItems,
};
