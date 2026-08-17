const path = require("path");

const NAVY = "#001842";
const WHITE = "#FFFFFF";
const BODY_TEXT = "#334155";
const MUTED_TEXT = "#64748B";
const PAGE_BG = "#F4F6F8";

const LOGO_CID = "fedarb-logo";
const LOGO_PATH = path.join(
  __dirname,
  "..",
  "..",
  "assets",
  "brand",
  "fedarb-logo.png"
);

const getEmailLayout = ({ title, preheader = "", bodyHtml }) => {
  const safePreheader = preheader || title;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${PAGE_BG};font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${PAGE_BG};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:${WHITE};border-radius:8px;overflow:hidden;">
            <tr>
              <td align="center" style="background-color:${NAVY};padding:28px 32px;">
                <img src="cid:${LOGO_CID}" alt="FEDARB" width="180" style="display:block;border:0;outline:none;text-decoration:none;max-width:180px;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:40px 40px 32px 40px;color:${BODY_TEXT};font-size:16px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="background-color:${NAVY};padding:24px 40px;text-align:center;">
                <p style="margin:0;color:${WHITE};font-size:13px;line-height:1.5;letter-spacing:0.4px;">
                  FEDARB ADR Platform
                </p>
                <p style="margin:8px 0 0 0;color:#C5CDD8;font-size:12px;line-height:1.5;">
                  This message was sent by FEDARB. Please do not reply to this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const primaryButton = (href, label) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px 0;">
    <tr>
      <td align="center" bgcolor="${NAVY}" style="border-radius:8px;">
        <a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:bold;color:${WHITE};text-decoration:none;border-radius:8px;background-color:${NAVY};">
          ${label}
        </a>
      </td>
    </tr>
  </table>
`;

module.exports = {
  NAVY,
  WHITE,
  BODY_TEXT,
  MUTED_TEXT,
  LOGO_CID,
  LOGO_PATH,
  getEmailLayout,
  primaryButton,
};
