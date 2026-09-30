const GLOBAL_CASE_ACCESS_ROLES = [
  "SUPER_ADMIN",
  "ADMIN_LEADERSHIP",
  "ACCOUNTING_STAFF",
];

const hasGlobalCaseAccess = (roleName) =>
  GLOBAL_CASE_ACCESS_ROLES.includes(roleName);

/** Prisma `Case` where clause: cases the user may see (list/hub scoping). */
const accessibleCaseWhere = (currentUser) => {
  if (hasGlobalCaseAccess(currentUser.role?.name)) return {};
  return {
    participants: {
      some: {
        userId: currentUser.id,
        role: currentUser.role?.name,
        accessStatus: "ACTIVE",
      },
    },
  };
};

/** Nest under a relation field, e.g. `{ case: accessibleCaseRelationWhere(user) }`. */
const accessibleCaseRelationWhere = (currentUser) => ({
  case: accessibleCaseWhere(currentUser),
});

module.exports = {
  hasGlobalCaseAccess,
  accessibleCaseWhere,
  accessibleCaseRelationWhere,
};
