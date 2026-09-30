const buildJwtPayload = (user) => ({
  id: user.id,
  email: user.email,
  role: user.role?.name,
});

const deriveAccessMeta = (user) => {
  const roleName = user?.role?.name || null;
  const elevated = ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "ACCOUNTING_STAFF"].includes(
    roleName,
  );
  return {
    accessScope: elevated ? "Organization" : "Assigned Cases Only",
    permissionLevel: roleName || "User",
  };
};

const sanitizeUser = (user) => {
  const { passwordHash, failedLoginAttempts, lockedUntil, ...safeUser } = user;
  const access = deriveAccessMeta(safeUser);
  return {
    ...safeUser,
    company: safeUser.company ?? null,
    bookList: Boolean(safeUser.bookList),
    lastLoginAt: safeUser.lastLoginAt ?? null,
    lastLogin: safeUser.lastLoginAt ?? null,
    accessScope: access.accessScope,
    permissionLevel: access.permissionLevel,
  };
};

module.exports = {
  buildJwtPayload,
  sanitizeUser,
  deriveAccessMeta,
};
