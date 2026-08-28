const { PrismaClient, RoleName, PermissionAction } = require("@prisma/client");
const { PERMISSIONS } = require("../src/constants/permission.constants");

const prisma = new PrismaClient();

const ROLE_DESCRIPTIONS = {
  [RoleName.SUPER_ADMIN]:
    "Full platform access, including role/permission management.",
  [RoleName.ADMIN_LEADERSHIP]:
    "Administrative and leadership oversight across all cases.",
  [RoleName.CASE_MANAGER]: "Manages assigned cases end-to-end.",
  [RoleName.NEUTRAL]: "Mediator/arbitrator assigned to cases.",
  [RoleName.LAWYER]: "External attorney representing a party on a case.",
  [RoleName.CLIENT]: "External party/claimant or respondent on a case.",
  [RoleName.ACCOUNTING_STAFF]:
    "Billing, invoicing, and timesheet approval access.",
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

  for (const [roleName, modules] of Object.entries(PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });

    for (const [module, actions] of Object.entries(modules)) {
      for (const action of actions) {
        const permission = await prisma.permission.upsert({
          where: { module_action: { module, action } },
          update: {},
          create: { module, action },
        });

        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: { isGranted: true },
          create: {
            roleId: role.id,
            permissionId: permission.id,
            isGranted: true,
          },
        });
      }
    }
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
