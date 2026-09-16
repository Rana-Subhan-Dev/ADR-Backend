const { COLORS } = require("./baseLayout");

const FONT_INTER = `"Inter", Helvetica, Arial, sans-serif`;
const FONT_MONO = `"JetBrains Mono", "Courier New", Courier, monospace`;

const invoicePdfStyles = `
  @page {
    size: Letter;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: ${FONT_INTER};
    color: ${COLORS.bodyText};
    font-size: 11px;
    line-height: 1.45;
    background: ${COLORS.white};
    -webkit-font-smoothing: antialiased;
  }
  .font-mono,
  .invoice-badge,
  .meta-value.accent,
  .ref-code,
  .num,
  .amount,
  .totals-row strong,
  .totals-due span:last-child,
  .totals-due-amount,
  .continued-invoice,
  .continued-case,
  .client-ref,
  .kv strong,
  .kv-value {
    font-family: ${FONT_MONO};
  }
  .page {
    width: 8.5in;
    padding: 0;
    position: relative;
  }
  .page--sheet {
    min-height: 11in;
  }
  .page--flow {
    min-height: 0;
    height: auto;
  }
  .page-break {
    page-break-before: always;
    break-before: page;
  }
  .header {
    background: linear-gradient(
      90deg,
      ${COLORS.headerGradientStart} 0%,
      ${COLORS.headerGradientEnd} 100%
    );
    color: ${COLORS.white};
    padding: 28px 36px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .brand-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 420px;
  }
  .brand-row {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .logo-mark {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    background: ${COLORS.accentBlue};
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: ${FONT_MONO};
    font-weight: 700;
    font-size: 22px;
    color: ${COLORS.white};
    flex-shrink: 0;
  }
  img.logo-mark,
  img.logo-img {
    width: auto;
    height: 42px;
    max-width: 180px;
    border-radius: 0;
    background: transparent;
    display: block;
    object-fit: contain;
  }
  img.logo-mark--sm {
    height: 28px;
    max-width: 140px;
  }
  .brand-name {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 4px 0;
  }
  .brand-tag {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: #93C5FD;
    margin: 0;
    text-transform: uppercase;
  }
  .brand-contact {
    font-size: 10px;
    color: #C5CDD8;
    margin: 12px 0 0 0;
    line-height: 1.5;
    padding: 0;
  }
  .invoice-title-block { text-align: right; }
  .invoice-title {
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 0.03em;
    margin: 0 0 10px 0;
  }
  .invoice-badge {
    display: inline-block;
    background: ${COLORS.badgeFill};
    color: ${COLORS.badgeText};
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid ${COLORS.badgeText};
    letter-spacing: 0.02em;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    padding: 18px 36px;
    border-bottom: 1px solid ${COLORS.border};
  }
  .meta-label {
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${COLORS.mutedText};
    margin: 0 0 4px 0;
  }
  .meta-value {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: ${COLORS.bodyText};
  }
  .meta-value.accent { color: ${COLORS.accentBlue}; }
  .status-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${COLORS.success};
    margin-right: 0;
    flex-shrink: 0;
  }
  .status-text { color: ${COLORS.success}; font-weight: 600; }
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #DCFCE7;
    color: #15803D;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
  }
  .status-badge .status-dot {
    background: #15803D;
  }
  .parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    padding: 22px 36px;
  }
  .section-label {
    color: ${COLORS.accentBlue};
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0 0 8px 0;
  }
  .party-name {
    font-size: 14px;
    font-weight: 700;
    margin: 0 0 6px 0;
  }
  .party-lines {
    margin: 0;
    color: ${COLORS.bodyText};
    font-size: 11px;
    line-height: 1.55;
  }
  .party-email { color: ${COLORS.accentBlue}; }
  .client-ref {
    margin-top: 8px;
    font-size: 10px;
    color: ${COLORS.mutedText};
  }
  .matter-banner {
    margin: 0 0 18px 0;
    background: ${COLORS.softBlue};
    border-radius: 0;
    border-top: 1px solid #DBEAFE;
    border-bottom: 1px solid #DBEAFE;
    padding: 16px 36px;
    display: grid;
    grid-template-columns: 2fr 1.2fr 1.4fr;
    gap: 16px;
    align-items: start;
  }
  .matter-col--end {
    text-align: right;
    justify-self: end;
  }
  .matter-label {
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #60A5FA;
    margin: 0 0 4px 0;
    font-weight: 600;
  }
  .matter-value {
    margin: 0;
    font-weight: 700;
    font-size: 12px;
    color: #0F172A;
  }
  .matter-sub {
    margin: 2px 0 0 0;
    font-size: 10px;
    color: ${COLORS.mutedText};
    font-style: italic;
  }
  .services {
    padding: 0 36px 12px 36px;
  }
  .services--continued {
    margin-top: 28px;
    padding-top: 0;
  }
  .services-heading {
    margin: 0 0 14px 0;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0F172A;
    break-after: avoid;
    page-break-after: avoid;
  }
  .services--continued .services-heading {
    margin-bottom: 16px;
  }
  .services-continued {
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: none;
    color: ${COLORS.mutedText};
    font-size: 11px;
  }
  .services-header {
    display: grid;
    grid-template-columns: 14% 12% 38% 10% 12% 14%;
    align-items: center;
    background: #0F172A;
    color: ${COLORS.white};
    padding: 11px 0;
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .services-header > span {
    padding: 0 12px;
    border: 0;
  }
  .services-header > span.num {
    text-align: right;
  }
  table.services-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    border-spacing: 0;
  }
  table.services-table col.col-ref { width: 14%; }
  table.services-table col.col-date { width: 12%; }
  table.services-table col.col-desc { width: 38%; }
  table.services-table col.col-hrs { width: 10%; }
  table.services-table col.col-rate { width: 12%; }
  table.services-table col.col-amount { width: 14%; }
  table.services-table tbody td {
    padding: 12px;
    border: 0;
    vertical-align: top;
    font-size: 11px;
  }
  table.services-table tbody tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  table.services-table tbody tr:nth-child(even) td {
    background: #F8FAFC;
  }
  table.services-table tbody tr:nth-child(odd) td {
    background: ${COLORS.white};
  }
  .ref-code { color: ${COLORS.accentBlue}; font-weight: 600; }
  .svc-date { color: ${COLORS.labelText}; }
  .desc-main { font-weight: 700; margin: 0 0 2px 0; color: #0F172A; }
  .desc-sub { margin: 0; color: ${COLORS.mutedText}; font-size: 10px; }
  .num { text-align: right; white-space: nowrap; }
  .num.rate { color: ${COLORS.labelText}; font-weight: 500; }
  .amount { font-weight: 700; text-align: right; color: #0F172A; }
  .invoice-summary {
    width: 320px;
    margin: 8px 36px 28px auto;
    break-inside: avoid;
    page-break-inside: avoid;
    break-before: avoid-page;
    page-break-before: avoid;
  }
  .totals-card {
    width: 100%;
    margin: 0;
    border: 1px solid ${COLORS.border};
    border-radius: 10px;
    overflow: hidden;
    background: ${COLORS.white};
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    font-size: 12px;
    color: ${COLORS.labelText};
  }
  .totals-row strong {
    color: ${COLORS.bodyText};
    font-weight: 600;
  }
  .totals-due {
    background: #0F172A;
    color: ${COLORS.white};
    border-radius: 0;
    padding: 16px 18px;
    margin-top: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .totals-due-amount {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0;
    font-family: ${FONT_MONO};
  }
  .due-bar {
    margin: 14px 0 0 0;
    width: 100%;
    background: ${COLORS.dueBar};
    color: ${COLORS.dueBarText};
    border-radius: 8px;
    border: 1px solid ${COLORS.dueBarBorder};
    padding: 10px 12px;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 8px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .due-bar-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: ${COLORS.dueBarText};
  }
  .due-bar strong {
    font-weight: 700;
  }
  .continued-header {
    background: ${COLORS.headerGradientStart};
    color: ${COLORS.white};
    padding: 16px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .continued-header .brand-row--center {
    align-items: center;
  }
  .continued-header .brand-name {
    font-size: 15px;
    margin: 0;
    line-height: 1.2;
  }
  div.logo-mark--sm {
    width: 34px;
    height: 34px;
    font-size: 18px;
    border-radius: 7px;
  }
  .continued-meta {
    text-align: right;
    font-size: 11px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .continued-invoice {
    color: ${COLORS.badgeText};
    font-weight: 600;
  }
  .continued-sep {
    color: #94A3B8;
  }
  .continued-case {
    color: #CBD5E1;
    font-weight: 500;
  }
  .section-block {
    margin: 28px 36px 0 36px;
  }
  .section-heading {
    margin: 0 0 12px 0;
    padding: 0 0 10px 0;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0F172A;
    border-bottom: 2px solid #0F172A;
  }
  .payment-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .card {
    border: 1px solid ${COLORS.border};
    border-radius: 10px;
    padding: 18px;
    background: ${COLORS.white};
  }
  .card-title {
    margin: 0 0 14px 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .card-title--accent { color: ${COLORS.accentBlue}; }
  .card-title--muted { color: ${COLORS.labelText}; }
  .card-body {
    margin: 0 0 14px 0;
    color: ${COLORS.bodyText};
    font-size: 11px;
    line-height: 1.55;
  }
  .kv-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kv-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    font-size: 11px;
  }
  .kv-label {
    color: ${COLORS.labelText};
    flex-shrink: 0;
  }
  .kv-value {
    color: ${COLORS.bodyText};
    font-weight: 600;
    text-align: right;
  }
  .box {
    margin: 24px 36px;
    border: 1px solid ${COLORS.border};
    border-radius: 10px;
    padding: 18px;
  }
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  .box h3 {
    margin: 0 0 12px 0;
    color: ${COLORS.accentBlue};
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .kv { margin: 0 0 8px 0; font-size: 11px; }
  .kv span { color: ${COLORS.labelText}; }
  .kv strong { color: ${COLORS.bodyText}; }
  .questions {
    margin-top: 4px;
    background: ${COLORS.softBlue};
    border-radius: 6px;
    padding: 12px;
  }
  .questions-title {
    margin: 0 0 6px 0;
    color: ${COLORS.accentBlue};
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .questions-body {
    margin: 0;
    color: ${COLORS.bodyText};
    font-size: 10px;
    line-height: 1.5;
  }
  .terms-title {
    margin: 8px 36px 10px 36px;
    font-size: 13px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .terms-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    color: ${COLORS.labelText};
    font-size: 10px;
    line-height: 1.55;
  }
  .auth-box {
    margin: 28px 36px 0 36px;
    background: ${COLORS.softGray};
    border-radius: 10px;
    padding: 18px 20px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }
  .auth-label {
    margin: 0 0 12px 0;
    color: ${COLORS.labelText};
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .auth-name {
    margin: 0 0 4px 0;
    font-size: 12px;
    font-weight: 600;
    color: ${COLORS.bodyText};
  }
  .auth-date {
    margin: 0;
    font-size: 11px;
    color: ${COLORS.labelText};
  }
  .sig-line {
    border-bottom: 1.5px solid #0F172A;
    height: 36px;
    margin: 0 0 10px 0;
    width: 75%;
  }
  .footer {
    position: absolute;
    left: 36px;
    right: 36px;
    bottom: 18px;
    text-align: center;
    color: ${COLORS.mutedText};
    font-size: 9px;
  }
`;

module.exports = { invoicePdfStyles, FONT_INTER, FONT_MONO };
