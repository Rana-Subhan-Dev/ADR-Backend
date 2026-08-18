const nodemailer = require("nodemailer");
const { LOGO_PATH, LOGO_CID } = require("../shared/emailTemplates/baseLayout");

const smtpPort = Number(process.env.SMTP_PORT);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort === 587,
  family: 4,
  auth: {
    user: process.env.SMTP_USER,
    pass: (process.env.SMTP_PASS || "").replace(/\s/g, ""),
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

const sendEmail = async (subject, content, email, type = "TEXT") => {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject,
    ...(type === "HTML" ? { html: content } : { text: content }),
    ...(type === "HTML" && {
      attachments: [
        {
          filename: "fedarb-logo.png",
          path: LOGO_PATH,
          cid: LOGO_CID,
        },
      ],
    }),
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  sendEmail,
};
