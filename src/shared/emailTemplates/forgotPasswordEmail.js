const {
  getEmailLayout,
  primaryButton,
  BODY_TEXT,
  MUTED_TEXT,
  NAVY,
} = require("./baseLayout");

const formatRoleLabel = (roleName = "") =>
  roleName
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const forgotPasswordTemplate = (roleName, setupUrl, expiresInMinutes) => {
  const roleLabel = formatRoleLabel(roleName);

  return getEmailLayout({
    title: "Reset your FEDARB password",
    preheader: `Reset your FEDARB password for your ${roleLabel} account.`,
    bodyHtml: `
      <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:${NAVY};font-weight:bold;">
        Reset your FEDARB password
      </h1>
      <p style="margin:0 0 16px 0;color:${BODY_TEXT};">
        We received a request to reset the password for your FEDARB ADR Platform account
        (${roleLabel}). Use the button below to choose a new password.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 8px 0;">
        <tr>
          <td style="background-color:#F4F6F8;border-radius:8px;padding:14px 18px;">
            <p style="margin:0;font-size:13px;color:${MUTED_TEXT};letter-spacing:0.3px;">
              Account role
            </p>
            <p style="margin:4px 0 0 0;font-size:16px;font-weight:bold;color:${NAVY};">
              ${roleLabel}
            </p>
          </td>
        </tr>
      </table>
      ${primaryButton(setupUrl, "Reset Password")}
      <p style="margin:20px 0 0 0;font-size:14px;color:${MUTED_TEXT};">
        This link expires in ${expiresInMinutes} minutes. If the button does not work, copy and paste the following link into your browser:
      </p>
      <p style="margin:8px 0 0 0;font-size:13px;color:${NAVY};word-break:break-all;">
        ${setupUrl}
      </p>
      <p style="margin:24px 0 0 0;font-size:13px;color:${MUTED_TEXT};">
        If you did not request a password reset, you may ignore this email. Your password will remain unchanged.
      </p>
    `,
  });
};

module.exports = {
  forgotPasswordTemplate,
};
