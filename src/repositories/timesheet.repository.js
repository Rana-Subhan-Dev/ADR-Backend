const prisma = require("../config/prisma");

const userSelect = { id: true, firstName: true, lastName: true, email: true };
const select = {
  id: true,
  caseId: true,
  hearingId: true,
  neutralUserId: true,
  activityType: true,
  hours: true,
  entryDate: true,
  status: true,
  approvalStatus: true,
  rejectionComment: true,
  approvedByUserId: true,
  createdAt: true,
  updatedAt: true,
  neutral: { select: userSelect },
  approvedBy: { select: userSelect },
  hearing: { select: { id: true, hearingReference: true, title: true } },
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
      select,
    }),
    prisma.neutralTimesheet.count({ where }),
  ]);

module.exports = { create, findById, update, remove, getMany };
