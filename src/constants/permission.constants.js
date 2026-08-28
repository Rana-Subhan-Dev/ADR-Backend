const {
  PermissionModule,
  PermissionAction,
  RoleName,
} = require("@prisma/client");

const PERMISSIONS = {
  [RoleName.ADMIN_LEADERSHIP]: {
    [PermissionModule.USERS]: [PermissionAction.VIEW],
    [PermissionModule.CASES]: [PermissionAction.VIEW],
    [PermissionModule.PARTIES]: [PermissionAction.VIEW],
    [PermissionModule.ATTORNEYS]: [PermissionAction.VIEW],
    [PermissionModule.DOCUMENTS]: [PermissionAction.VIEW],
    [PermissionModule.TIMESHEETS]: [PermissionAction.VIEW],
    [PermissionModule.BILLING]: [
      PermissionAction.VIEW,
      PermissionAction.EXPORT,
    ],
    [PermissionModule.DOCUSIGN]: [PermissionAction.VIEW],
    [PermissionModule.REPORTS]: [
      PermissionAction.VIEW,
      PermissionAction.EXPORT,
    ],
    [PermissionModule.AUDIT_LOG]: [PermissionAction.VIEW],
  },
  [RoleName.CASE_MANAGER]: {
    [PermissionModule.CASES]: [
      PermissionAction.VIEW,
      PermissionAction.CREATE,
      PermissionAction.EDIT,
      PermissionAction.ASSIGN,
      PermissionAction.INVITE,
      PermissionAction.REVOKE,
    ],
    [PermissionModule.PARTIES]: [
      PermissionAction.VIEW,
      PermissionAction.CREATE,
      PermissionAction.EDIT,
      PermissionAction.DELETE,
    ],
    [PermissionModule.ATTORNEYS]: [
      PermissionAction.VIEW,
      PermissionAction.CREATE,
      PermissionAction.EDIT,
      PermissionAction.DELETE,
    ],
    [PermissionModule.DOCUMENTS]: [
      PermissionAction.VIEW,
      PermissionAction.CREATE,
      PermissionAction.EDIT,
      PermissionAction.DELETE,
      PermissionAction.INVITE,
      PermissionAction.REVOKE,
    ],
    [PermissionModule.TIMESHEETS]: [PermissionAction.VIEW],
    [PermissionModule.DOCUSIGN]: [
      PermissionAction.VIEW,
      PermissionAction.CREATE,
      PermissionAction.EDIT,
    ],
  },
  [RoleName.NEUTRAL]: {
    [PermissionModule.CASES]: [PermissionAction.VIEW, PermissionAction.CREATE],
    [PermissionModule.PARTIES]: [PermissionAction.VIEW],
    [PermissionModule.ATTORNEYS]: [PermissionAction.VIEW],
    [PermissionModule.DOCUMENTS]: [
      PermissionAction.VIEW,
      PermissionAction.CREATE,
    ],
    [PermissionModule.TIMESHEETS]: [
      PermissionAction.VIEW,
      PermissionAction.CREATE,
      PermissionAction.EDIT,
    ],
    [PermissionModule.DOCUSIGN]: [PermissionAction.VIEW],
  },
  [RoleName.LAWYER]: {
    [PermissionModule.CASES]: [PermissionAction.VIEW, PermissionAction.CREATE],
    [PermissionModule.PARTIES]: [PermissionAction.VIEW],
    [PermissionModule.ATTORNEYS]: [PermissionAction.VIEW],
    [PermissionModule.DOCUMENTS]: [
      PermissionAction.VIEW,
      PermissionAction.CREATE,
    ],
    [PermissionModule.DOCUSIGN]: [PermissionAction.VIEW],
  },
  [RoleName.CLIENT]: {
    [PermissionModule.CASES]: [PermissionAction.VIEW, PermissionAction.CREATE],
    [PermissionModule.PARTIES]: [PermissionAction.VIEW],
    [PermissionModule.ATTORNEYS]: [PermissionAction.VIEW],
    [PermissionModule.DOCUMENTS]: [
      PermissionAction.VIEW,
      PermissionAction.CREATE,
    ],
    [PermissionModule.DOCUSIGN]: [PermissionAction.VIEW],
  },
  [RoleName.ACCOUNTING_STAFF]: {
    [PermissionModule.BILLING]: [
      PermissionAction.VIEW,
      PermissionAction.CREATE,
      PermissionAction.EDIT,
      PermissionAction.APPROVE,
      PermissionAction.EXPORT,
    ],
    [PermissionModule.TIMESHEETS]: [
      PermissionAction.VIEW,
      PermissionAction.APPROVE,
    ],
  },
};

module.exports = { PERMISSIONS, PermissionModule, PermissionAction };
