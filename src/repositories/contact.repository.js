const prisma = require("../config/prisma");

const contactSelect = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  company: true,
  email: true,
  phone: true,
  state: true,
  role: true,
  notes: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
};

const findContactById = (id) =>
  prisma.contact.findUnique({ where: { id }, select: contactSelect });

const getContacts = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.contact.findMany({
      where,
      skip,
      take,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: contactSelect,
    }),
    prisma.contact.count({ where }),
  ]);

const createContact = (data) =>
  prisma.contact.create({ data, select: contactSelect });

const updateContact = (id, data) =>
  prisma.contact.update({ where: { id }, data, select: contactSelect });

const deleteContact = (id) =>
  prisma.contact.delete({ where: { id }, select: contactSelect });

module.exports = {
  contactSelect,
  findContactById,
  getContacts,
  createContact,
  updateContact,
  deleteContact,
};
