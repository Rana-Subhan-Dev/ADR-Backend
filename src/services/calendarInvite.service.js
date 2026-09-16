const { sendEmail } = require("../utils/sendEmail");

const pad = (value) => String(value).padStart(2, "0");

const toIcsUtc = (date) => {
  const d = new Date(date);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
};

const escapeIcs = (value = "") =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const buildIcs = ({
  uid,
  title,
  description,
  location,
  startTime,
  endTime,
  organizerEmail,
  method = "REQUEST",
  sequence = 0,
}) => {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FedArb//Hearings//EN",
    `METHOD:${method}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(startTime)}`,
    `DTEND:${toIcsUtc(endTime)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(description || "")}`,
    `LOCATION:${escapeIcs(location || "")}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    organizerEmail
      ? `ORGANIZER;CN=FedArb:mailto:${organizerEmail}`
      : "ORGANIZER;CN=FedArb:mailto:noreply@fedarb.gov",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
};

const sendHearingCalendarInvites = async ({
  hearing,
  recipients,
  method = "REQUEST",
  sequence = 0,
}) => {
  const emails = [
    ...new Set(
      (recipients || [])
        .map((row) => row.email || row.caseParticipant?.user?.email)
        .filter(Boolean),
    ),
  ];
  if (!emails.length) return { sent: 0, failed: 0 };

  const uid = `${hearing.id}@fedarb.hearings`;
  const description = [
    hearing.instructions || "",
    hearing.zoomJoinUrl ? `Zoom: ${hearing.zoomJoinUrl}` : "",
    hearing.zoomPasscode ? `Passcode: ${hearing.zoomPasscode}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ics = buildIcs({
    uid,
    title: hearing.title,
    description,
    location: hearing.zoomJoinUrl || hearing.location || "TBD",
    startTime: hearing.startTime,
    endTime: hearing.endTime,
    organizerEmail: process.env.SMTP_FROM || process.env.SMTP_USER,
    method,
    sequence,
  });

  let sent = 0;
  let failed = 0;
  for (const email of emails) {
    try {
      await sendEmail(
        `${method === "CANCEL" ? "Cancelled" : "Hearing"}: ${hearing.title}`,
        `${method === "CANCEL" ? "This hearing has been cancelled." : "You are invited to a hearing."}\n\n${description}`,
        email,
        "TEXT",
        [
          {
            filename: "hearing.ics",
            content: ics,
            contentType: "text/calendar; method=" + method,
          },
        ],
      );
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
};

module.exports = {
  buildIcs,
  sendHearingCalendarInvites,
};
