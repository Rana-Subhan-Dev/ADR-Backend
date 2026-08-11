require("dotenv").config({ override: true });

const bcrypt = require("bcrypt");
const { PrismaClient, RoleName, UserType, UserStatus } = require("@prisma/client");

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@fedarb.com")
  .toLowerCase()
  .trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@1234";
const ADMIN_FIRST_NAME = process.env.ADMIN_FIRST_NAME || "Super";
const ADMIN_LAST_NAME = process.env.ADMIN_LAST_NAME || "Admin";

const main = async () => {
  const role = await prisma.role.findUnique({
    where: { name: RoleName.SUPER_ADMIN },
  });

  if (!role) {
    throw new Error(
      `Role "${RoleName.SUPER_ADMIN}" not found. Run \`pnpm prisma:seed\` first.`
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: {
      id: true,
      email: true,
      status: true,
      role: { select: { name: true } },
    },
  });

  if (existing) {
    console.log(
      `Admin already exists: ${existing.email} (${existing.role.name}, ${existing.status}). Skipping.`
    );
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      passwordHash,
      userType: UserType.INTERNAL,
      roleId: role.id,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      lastPasswordChangeAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      role: { select: { name: true } },
    },
  });

  console.log("SUPER_ADMIN created successfully.");
  console.log(`  email:    ${user.email}`);
  console.log(`  password: ${ADMIN_PASSWORD}`);
  console.log(`  role:     ${user.role.name}`);
  console.log(`  status:   ${user.status}`);
  console.log("Sign in via POST /api/v1/auth/signin");
};

main()
  .catch((error) => {
    console.error("Admin seed failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
