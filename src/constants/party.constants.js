const { PartyType, PartySide } = require("@prisma/client");

module.exports = {
  PartyType,
  PartySide,
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
};
