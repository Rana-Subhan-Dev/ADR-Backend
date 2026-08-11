const { InquiryStatus, PartySide } = require("@prisma/client");

const INQUIRY_SORT_FIELDS = {
  CREATED_AT: "createdAt",
  UPDATED_AT: "updatedAt",
  INQUIRY_DATE: "inquiryDate",
  MATTER_NAME: "matterName",
  STATUS: "status",
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

module.exports = {
  InquiryStatus,
  PartySide,
  INQUIRY_SORT_FIELDS,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
