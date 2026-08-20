const prisma = require("../config/prisma");

const caseNoteSelect = {
  id: true,
  caseId: true,
  authorUserId: true,
  noteType: true,
  visibility: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
};

const createCaseNote = (data, tx = prisma) =>
  tx.caseNote.create({ data, select: caseNoteSelect });

const findCaseNoteById = (id, tx = prisma) =>
  tx.caseNote.findUnique({ where: { id }, select: caseNoteSelect });

const getCaseNotes = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.caseNote.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: caseNoteSelect,
    }),
    prisma.caseNote.count({ where }),
  ]);

const updateCaseNote = (id, data, tx = prisma) =>
  tx.caseNote.update({ where: { id }, data, select: caseNoteSelect });

const deleteCaseNote = (id, tx = prisma) =>
  tx.caseNote.delete({ where: { id }, select: caseNoteSelect });

module.exports = {
  createCaseNote,
  findCaseNoteById,
  getCaseNotes,
  updateCaseNote,
  deleteCaseNote,
};
