const { invoicePdfStyles } = require("./invoicePdfStyles");
const { renderInvoicePage1 } = require("./invoicePage1");
const { renderInvoicePage2 } = require("./invoicePage2");

const buildInvoiceHtml = (view) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Invoice ${view.invoice?.invoiceNumber || ""}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>${invoicePdfStyles}</style>
  </head>
  <body>
    ${renderInvoicePage1(view)}
    ${renderInvoicePage2(view)}
  </body>
</html>`;

module.exports = {
  buildInvoiceHtml,
  renderInvoicePage1,
  renderInvoicePage2,
};
