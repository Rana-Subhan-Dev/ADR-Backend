const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 10000,
    timeout: 20000,
  },
});

module.exports = prisma;
