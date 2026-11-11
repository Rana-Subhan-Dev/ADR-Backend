const userRepository = require("../repositories/user.repository");
const prisma = require("../config/prisma");
const ApiError = require("../utils/apiError");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  USER_SORT_FIELDS,
  ADMIN_SETTABLE_STATUSES,
} = require("../constants/user.constants");

const getUsers = async (query) => {
  const page = Number(query.page) || DEFAULT_PAGE;

  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);

  const {
    search,
    role,
    status,
    sortBy = USER_SORT_FIELDS.CREATED_AT,
    sortOrder = "desc",
  } = query;

  const where = {};

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  if (role) {
    where.role = { name: role };
  }

  if (status) {
    where.status = status;
  }

  const skip = (page - 1) * limit;

  const orderBy = { [sortBy]: sortOrder };

  const { users, total } = await userRepository.getUsers({
    skip,
    take: limit,
    where,
    orderBy,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const getUserById = async (id) => {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  return user;
};

const updateUser = async (id, data) => {
  const existingUser = await userRepository.findUserById(id);

  if (!existingUser) {
    throw new ApiError(404, "User not found.");
  }

  return userRepository.updateUser(id, data);
};

const mapAssistant = (contacts = []) => {
  const contact = contacts[0];
  if (!contact) return null;
  return {
    id: contact.id,
    name: contact.name,
    title: contact.title || null,
    email: contact.email || null,
    phone: contact.phone || null,
  };
};

const mapBioFromProfile = (profile) => {
  if (!profile) {
    return {
      education: [],
      areasOfExpertise: [],
      licensedStates: [],
      languages: [],
      notes: [],
    };
  }
  const notes = Array.isArray(profile.bioNotes) ? profile.bioNotes : [];
  return {
    education: Array.isArray(profile.education) ? profile.education : [],
    areasOfExpertise: profile.specialties || [],
    licensedStates: profile.licensedStates || [],
    languages: profile.languages || [],
    notes: notes.map((n, index) => {
      if (typeof n === "string") {
        return { id: `note-${index}`, text: n };
      }
      const text = n.text ?? n.body ?? "";
      return { id: n.id || `note-${index}`, text };
    }),
  };
};

const getAssignedCaseManager = async (userId) => {
  const participant = await prisma.caseParticipant.findFirst({
    where: {
      userId,
      role: "NEUTRAL",
      accessStatus: "ACTIVE",
      case: {
        participants: {
          some: {
            role: "CASE_MANAGER",
            accessStatus: "ACTIVE",
          },
        },
      },
    },
    select: {
      case: {
        select: {
          participants: {
            where: {
              role: "CASE_MANAGER",
              accessStatus: "ACTIVE",
            },
            orderBy: [{ isPrimary: "desc" }],
            take: 1,
            select: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
      },
    },
  });
  return participant?.case?.participants?.[0]?.user || null;
};

const getCurrentUserProfile = async (userId) => {
  const user = await userRepository.findUserById(userId);
  if (!user) throw new ApiError(404, "User not found.");

  const [profile, caseManager] = await Promise.all([
    prisma.neutralProfile.findUnique({
      where: { userId },
      include: {
        supportContacts: { orderBy: { createdAt: "asc" }, take: 1 },
      },
    }),
    user.role?.name === "NEUTRAL"
      ? getAssignedCaseManager(userId)
      : Promise.resolve(null),
  ]);

  return {
    ...user,
    mobile: user.mobile || user.phone || null,
    assistant: mapAssistant(profile?.supportContacts || []),
    caseManager,
    bio: mapBioFromProfile(profile),
    neutralProfile: profile
      ? {
          id: profile.id,
          neutralType: profile.neutralType,
          specialties: profile.specialties,
          credentials: profile.credentials,
          yearsOfExperience: profile.yearsOfExperience,
        }
      : null,
  };
};

const updateCurrentUserProfile = async (userId, data) => {
  const existingUser = await userRepository.findUserById(userId);
  if (!existingUser) {
    throw new ApiError(404, "User not found.");
  }

  const allowed = {};
  for (const key of [
    "firstName",
    "lastName",
    "prefix",
    "informalName",
    "phone",
    "mobile",
    "jobTitle",
    "company",
    "bookList",
  ]) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      allowed[key] =
        ["phone", "mobile", "jobTitle", "company", "prefix", "informalName"].includes(
          key,
        )
          ? data[key] === ""
            ? null
            : data[key]
          : data[key];
    }
  }

  if (Object.keys(allowed).length === 0 && data.assistant === undefined) {
    throw new ApiError(400, "No profile fields provided.");
  }

  if (Object.keys(allowed).length) {
    await userRepository.updateUser(userId, allowed);
  }

  if (data.assistant !== undefined && existingUser.role?.name === "NEUTRAL") {
    let profile = await prisma.neutralProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      profile = await prisma.neutralProfile.create({
        data: {
          userId,
          neutralType: "BOTH",
          specialties: [],
        },
        select: { id: true },
      });
    }
    const existingContact = await prisma.neutralSupportContact.findFirst({
      where: { neutralProfileId: profile.id },
      orderBy: { createdAt: "asc" },
    });
    if (data.assistant === null) {
      if (existingContact) {
        await prisma.neutralSupportContact.delete({
          where: { id: existingContact.id },
        });
      }
    } else {
      const contactData = {
        name: data.assistant.name || "Assistant",
        title: data.assistant.title || null,
        email: data.assistant.email || null,
        phone: data.assistant.phone || null,
      };
      if (existingContact) {
        await prisma.neutralSupportContact.update({
          where: { id: existingContact.id },
          data: contactData,
        });
      } else {
        await prisma.neutralSupportContact.create({
          data: { neutralProfileId: profile.id, ...contactData },
        });
      }
    }
  }

  return getCurrentUserProfile(userId);
};

const getCurrentUserBio = async (userId) => {
  const user = await userRepository.findUserById(userId);
  if (!user) throw new ApiError(404, "User not found.");
  if (user.role?.name !== "NEUTRAL") {
    throw new ApiError(403, "Bio is only available for NEUTRAL users.");
  }
  const profile = await prisma.neutralProfile.findUnique({
    where: { userId },
  });
  return mapBioFromProfile(profile);
};

const updateCurrentUserBio = async (userId, data) => {
  const user = await userRepository.findUserById(userId);
  if (!user) throw new ApiError(404, "User not found.");
  if (user.role?.name !== "NEUTRAL") {
    throw new ApiError(403, "Bio is only available for NEUTRAL users.");
  }

  let profile = await prisma.neutralProfile.findUnique({
    where: { userId },
  });
  if (!profile) {
    profile = await prisma.neutralProfile.create({
      data: {
        userId,
        neutralType: "BOTH",
        specialties: [],
      },
    });
  }

  const expertise =
    data.areasOfExpertise !== undefined
      ? data.areasOfExpertise
      : data.specialties;

  const notes =
    data.notes !== undefined
      ? data.notes.map((n, index) => {
          if (typeof n === "string") {
            return { id: `note-${index}`, text: n };
          }
          return {
            id: n.id || `note-${index}`,
            text: n.text ?? n.body ?? "",
          };
        })
      : undefined;

  const updated = await prisma.neutralProfile.update({
    where: { id: profile.id },
    data: {
      ...(data.education !== undefined && { education: data.education }),
      ...(expertise !== undefined && { specialties: expertise }),
      ...(data.licensedStates !== undefined && {
        licensedStates: data.licensedStates,
      }),
      ...(data.languages !== undefined && { languages: data.languages }),
      ...(notes !== undefined && { bioNotes: notes }),
    },
  });

  return mapBioFromProfile(updated);
};

const updateUserStatus = async ({
  userId,
  status,
  reason,
  actingUserId,
  actingUserRole,
}) => {
  const existingUser = await userRepository.findUserById(userId);

  if (!existingUser) {
    throw new ApiError(404, "User not found.");
  }

  if (!ADMIN_SETTABLE_STATUSES.includes(status)) {
    throw new ApiError(400, "Invalid status.");
  }

  if (userId === actingUserId && status !== "ACTIVE") {
    throw new ApiError(400, "You cannot deactivate or lock your own account.");
  }

  const data = { status };

  if (status === "DEACTIVATED") {
    data.deactivatedAt = new Date();
    data.deactivatedById = actingUserId;
    data.deactivationReason = reason || null;
  }

  if (status === "ACTIVE") {
    data.deactivatedAt = null;
    data.deactivatedById = null;
    data.deactivationReason = null;
    data.failedLoginAttempts = 0;
    data.lockedUntil = null;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data,
    });

    await tx.auditLog.create({
      data: {
        actingUserId,
        actingUserRoleSnapshot: actingUserRole || null,
        action:
          status === "DEACTIVATED"
            ? "DEACTIVATE"
            : status === "LOCKED"
              ? "LOCK"
              : "REACTIVATE",
        module: "USERS",
        affectedRecordType: "User",
        affectedRecordId: userId,
        previousValue: { status: existingUser.status },
        newValue: { status: updated.status },
        reason: reason || null,
      },
    });

    return updated;
  });
};

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  getCurrentUserProfile,
  updateCurrentUserProfile,
  getCurrentUserBio,
  updateCurrentUserBio,
  updateUserStatus,
};
