const prisma = require("../config/prisma");

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  jobTitle: true,
  userType: true,
  status: true,
  roleId: true,
  role: {
    select: {
      id: true,
      name: true,
    },
  },
  deactivatedAt: true,
  deactivationReason: true,
  createdAt: true,
  updatedAt: true,
};

const getUsers = async ({ skip, take, where, orderBy }) => {
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy,
      select: USER_SELECT,
    }),

    prisma.user.count({ where }),
  ]);

  return { users, total };
};

const findUserById = async (id) => {
  return prisma.user.findUnique({
    where: { id },
    select: USER_SELECT,
  });
};

const updateUser = async (id, data) => {
  return prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });
};

module.exports = {
  getUsers,
  findUserById,
  updateUser,
};
