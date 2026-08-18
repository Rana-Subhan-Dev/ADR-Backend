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

const invitationTemplate = (roleName, setupUrl, expiresInDays) => {
  const roleLabel = formatRoleLabel(roleName);

  return getEmailLayout({
    title: "Invitation to join FEDARB",
    preheader: `You have been invited to FEDARB as a ${roleLabel}.`,
    bodyHtml: `
      <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:${NAVY};font-weight:bold;">
        Invitation to join FEDARB
      </h1>
      <p style="margin:0 0 16px 0;color:${BODY_TEXT};">
        You have been invited to access the FEDARB ADR Platform as a ${roleLabel}.
        Complete your account setup to begin using the platform.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 8px 0;">
        <tr>
          <td style="background-color:#F4F6F8;border-radius:8px;padding:14px 18px;">
            <p style="margin:0;font-size:13px;color:${MUTED_TEXT};letter-spacing:0.3px;">
              Assigned role
            </p>
            <p style="margin:4px 0 0 0;font-size:16px;font-weight:bold;color:${NAVY};">
              ${roleLabel}
            </p>
          </td>
        </tr>
      </table>
      ${primaryButton(setupUrl, "Accept Invitation and Set Up Account")}
      <p style="margin:20px 0 0 0;font-size:14px;color:${MUTED_TEXT};">
        This invitation expires in ${expiresInDays} days. If the button does not work, copy and paste the following link into your browser:
      </p>
      <p style="margin:8px 0 0 0;font-size:13px;color:${NAVY};word-break:break-all;">
        ${setupUrl}
      </p>
      <p style="margin:24px 0 0 0;font-size:13px;color:${MUTED_TEXT};">
        If you did not expect this invitation, you may ignore this email.
      </p>
    `,
  });
};

module.exports = {
  invitationTemplate,
};
