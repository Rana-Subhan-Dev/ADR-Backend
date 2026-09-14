const path = require("path");
const fs = require("fs");

const COLORS = {
  navy: "#1A2B48",
  navyDeep: "#001842",
  headerGradientStart: "#0F172A",
  headerGradientEnd: "#1E3A5F",
  accentBlue: "#3B82F6",
  badgeFill: "#2563EB59",
  badgeText: "#93C5FD",
  white: "#FFFFFF",
  bodyText: "#374151",
  mutedText: "#9CA3AF",
  labelText: "#6B7280",
  pageBg: "#FFFFFF",
  softGray: "#F3F4F6",
  softBlue: "#EFF6FF",
  dueBar: "#FEF9C3",
  dueBarText: "#92400E",
  dueBarBorder: "#FEE68A",
  success: "#22C55E",
  border: "#E5E7EB",
  tableHeader: "#1A2B48",
};

const LOGO_PATH = path.join(
  __dirname,
  "..",
  "..",
  "assets",
  "brand",
  "fedarb-invoices-logo.png",
);

const escapeHtml = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

let cachedLogoDataUri = null;

const getLogoDataUri = () => {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const buffer = fs.readFileSync(LOGO_PATH);
    cachedLogoDataUri = `data:image/png;base64,${buffer.toString("base64")}`;
    return cachedLogoDataUri;
  } catch {
    return null;
  }
};

const renderLogoMark = ({ className = "logo-mark", alt = "FedArb" } = {}) => {
  const dataUri = getLogoDataUri();
  if (!dataUri) {
    return `<div class="${className}">F</div>`;
  }
  return `<img class="${className} logo-img" src="${dataUri}" alt="${escapeHtml(alt)}" />`;
};

const formatMoney = (value) => {
  const num = Number(value || 0);
  return `$${num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateShort = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

module.exports = {
  COLORS,
  LOGO_PATH,
  getLogoDataUri,
  renderLogoMark,
  escapeHtml,
  formatMoney,
  formatDate,
  formatDateShort,
};
