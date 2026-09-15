const prisma = require("../config/prisma");

const userSelect = { id: true, firstName: true, lastName: true, email: true };

const documentSelect = {
  id: true,
  name: true,
  caseId: true,
  deletedAt: true,
};

const expenseSelect = {
  id: true,
  timesheetId: true,
  expenseType: true,
  expenseDate: true,
  amount: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  receipts: {
    select: {
      id: true,
      documentId: true,
      createdAt: true,
      document: { select: documentSelect },
    },
  },
};

const reviewHistorySelect = {
  id: true,
  timesheetId: true,
  action: true,
  actorUserId: true,
  comment: true,
  createdAt: true,
  actor: { select: userSelect },
};

const select = {
  id: true,
  caseId: true,
  hearingId: true,
  neutralUserId: true,
  activityType: true,
  hours: true,
  entryDate: true,
  billingNotes: true,
  status: true,
  approvalStatus: true,
  rejectionComment: true,
  approvedByUserId: true,
  rejectedByUserId: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  neutral: { select: userSelect },
  approvedBy: { select: userSelect },
  rejectedBy: { select: userSelect },
  hearing: {
    select: {
      id: true,
      hearingReference: true,
      title: true,
      hearingDate: true,
      startTime: true,
      endTime: true,
    },
  },
  case: {
    select: {
      id: true,
      caseNumber: true,
      title: true,
      caseType: true,
    },
  },
  expenses: {
    orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
    select: expenseSelect,
  },
  reviewHistory: {
    orderBy: { createdAt: "asc" },
    select: reviewHistorySelect,
  },
};

const listSelect = {
  id: true,
  caseId: true,
  hearingId: true,
  neutralUserId: true,
  activityType: true,
  hours: true,
  entryDate: true,
  billingNotes: true,
  status: true,
  approvalStatus: true,
  rejectionComment: true,
  approvedByUserId: true,
  rejectedByUserId: true,
  submittedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  neutral: { select: userSelect },
  approvedBy: { select: userSelect },
  rejectedBy: { select: userSelect },
  hearing: {
    select: {
      id: true,
      hearingReference: true,
      title: true,
      hearingDate: true,
      startTime: true,
      endTime: true,
    },
  },
  case: {
    select: {
      id: true,
      caseNumber: true,
      title: true,
      caseType: true,
    },
  },
  expenses: {
    orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      expenseType: true,
      expenseDate: true,
      amount: true,
      description: true,
    },
  },
};

const create = (data, tx = prisma) =>
  tx.neutralTimesheet.create({ data, select });
const findById = (id, tx = prisma) =>
  tx.neutralTimesheet.findUnique({ where: { id }, select });
const update = (id, data, tx = prisma) =>
  tx.neutralTimesheet.update({ where: { id }, data, select });
const remove = (id, tx = prisma) =>
  tx.neutralTimesheet.delete({ where: { id }, select });
const getMany = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.neutralTimesheet.findMany({
      where,
      skip,
      take,
      orderBy: [{ entryDate: "desc" }, { id: "desc" }],
      select: listSelect,
    }),
    prisma.neutralTimesheet.count({ where }),
  ]);

const createExpense = (data, tx = prisma) =>
  tx.timesheetExpense.create({ data, select: expenseSelect });
const findExpenseById = (id, tx = prisma) =>
  tx.timesheetExpense.findUnique({ where: { id }, select: expenseSelect });
const updateExpense = (id, data, tx = prisma) =>
  tx.timesheetExpense.update({ where: { id }, data, select: expenseSelect });
const removeExpense = (id, tx = prisma) =>
  tx.timesheetExpense.delete({ where: { id }, select: expenseSelect });
const deleteExpensesForTimesheet = (timesheetId, tx = prisma) =>
  tx.timesheetExpense.deleteMany({ where: { timesheetId } });

const createExpenseReceipt = (data, tx = prisma) =>
  tx.timesheetExpenseReceipt.create({
    data,
    select: {
      id: true,
      expenseId: true,
      documentId: true,
      createdAt: true,
      document: { select: documentSelect },
    },
  });
const removeExpenseReceipt = (expenseId, documentId, tx = prisma) =>
  tx.timesheetExpenseReceipt.delete({
    where: { expenseId_documentId: { expenseId, documentId } },
  });

const createReviewHistory = (data, tx = prisma) =>
  tx.timesheetReviewHistory.create({ data, select: reviewHistorySelect });

module.exports = {
  create,
  findById,
  update,
  remove,
  getMany,
  createExpense,
  findExpenseById,
  updateExpense,
  removeExpense,
  deleteExpensesForTimesheet,
  createExpenseReceipt,
  removeExpenseReceipt,
  createReviewHistory,
};
