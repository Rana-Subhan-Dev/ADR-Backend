const { PrismaClient, RoleName } = require("@prisma/client");

const prisma = new PrismaClient();

const ROLE_DESCRIPTIONS = {
  [RoleName.SUPER_ADMIN]: "Full platform access, including role/permission management.",
  [RoleName.ADMIN_LEADERSHIP]: "Administrative and leadership oversight across all cases.",
  [RoleName.CASE_MANAGER]: "Manages assigned cases end-to-end.",
  [RoleName.NEUTRAL]: "Mediator/arbitrator assigned to cases.",
  [RoleName.LAWYER]: "External attorney representing a party on a case.",
  [RoleName.CLIENT]: "External party/claimant or respondent on a case.",
  [RoleName.ACCOUNTING_STAFF]: "Billing, invoicing, and timesheet approval access.",
};

const main = async () => {
  for (const name of Object.values(RoleName)) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: {
        name,
        description: ROLE_DESCRIPTIONS[name],
        isSystemDefined: true,
      },
    });
  }

  console.log(`Seeded ${Object.values(RoleName).length} roles.`);
};

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
