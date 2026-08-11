const buildJwtPayload = (user) => ({
  id: user.id,
  email: user.email,
  role: user.role?.name,
});

const sanitizeUser = (user) => {
  const { passwordHash, failedLoginAttempts, lockedUntil, ...safeUser } = user;

  return safeUser;
};

module.exports = {
  buildJwtPayload,
  sanitizeUser,
};
