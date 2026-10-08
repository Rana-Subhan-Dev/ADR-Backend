const contactRepository = require("../repositories/contact.repository");
const ApiError = require("../utils/apiError");

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN_LEADERSHIP"];

const emptyToNull = (value) =>
  value === undefined || value === "" ? null : value;

const isAdmin = (user) => ADMIN_ROLES.includes(user?.role?.name);

const composeName = (firstName, lastName, fallback) => {
  const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
  return composed || fallback || "";
};

const mapContact = (contact) => {
  if (!contact) return contact;
  const firstName = contact.firstName || null;
  const lastName = contact.lastName || null;
  return {
    ...contact,
    firstName,
    lastName,
    name:
      contact.name || composeName(firstName, lastName, contact.email) || null,
    company: contact.company || null,
  };
};

const assertCanAccessContact = (contact, currentUser) => {
  if (isAdmin(currentUser)) return;
  if (contact.ownerUserId && contact.ownerUserId === currentUser.id) return;
  if (!contact.ownerUserId && isAdmin(currentUser)) return;
  if (contact.ownerUserId !== currentUser.id) {
    throw new ApiError(404, "Contact not found.");
  }
};

const buildWritePayload = (data, { requireNames = false } = {}) => {
  const firstName =
    data.firstName !== undefined
      ? emptyToNull(data.firstName?.trim())
      : undefined;
  const lastName =
    data.lastName !== undefined
      ? emptyToNull(data.lastName?.trim())
      : undefined;
  const company =
    data.company !== undefined ? emptyToNull(data.company?.trim()) : undefined;
  const state =
    data.state !== undefined ? emptyToNull(data.state?.trim()) : undefined;

  let name = data.name !== undefined ? data.name?.trim() : undefined;
  if (firstName !== undefined || lastName !== undefined) {
    name = composeName(
      firstName ?? data.firstName,
      lastName ?? data.lastName,
      name,
    );
  } else if (data.name && (requireNames || !firstName)) {
    const parts = String(data.name).trim().split(/\s+/);
    return {
      name: data.name.trim(),
      firstName: parts[0] || null,
      lastName: parts.slice(1).join(" ") || null,
      ...(company !== undefined && { company }),
      ...(state !== undefined && { state }),
      email:
        data.email !== undefined
          ? emptyToNull(data.email?.trim()?.toLowerCase())
          : undefined,
      phone: data.phone !== undefined ? emptyToNull(data.phone) : undefined,
      role: data.role !== undefined ? emptyToNull(data.role) : undefined,
      notes: data.notes !== undefined ? emptyToNull(data.notes) : undefined,
    };
  }

  const payload = {
    ...(name !== undefined && { name }),
    ...(firstName !== undefined && { firstName }),
    ...(lastName !== undefined && { lastName }),
    ...(company !== undefined && { company }),
    ...(state !== undefined && { state }),
    ...(data.email !== undefined && {
      email: emptyToNull(data.email?.trim()?.toLowerCase()),
    }),
    ...(data.phone !== undefined && { phone: emptyToNull(data.phone) }),
    ...(data.role !== undefined && { role: emptyToNull(data.role) }),
    ...(data.notes !== undefined && { notes: emptyToNull(data.notes) }),
  };
  return payload;
};

const getContacts = async (query, currentUser) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 100;
  const where = {};

  if (!isAdmin(currentUser)) {
    where.ownerUserId = currentUser.id;
  } else if (query.ownerUserId) {
    where.ownerUserId = query.ownerUserId;
  } else if (query.mine === true || query.mine === "true") {
    where.ownerUserId = currentUser.id;
  }

  if (query.role) where.role = query.role;
  if (query.state) {
    where.state = { contains: query.state, mode: "insensitive" };
  }

  if (query.search) {
    const term = { contains: query.search, mode: "insensitive" };
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { name: term },
          { firstName: term },
          { lastName: term },
          { company: term },
          { email: term },
          { phone: term },
          { state: term },
          { role: term },
        ],
      },
    ];
  }

  const [contacts, total] = await contactRepository.getContacts({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    contacts: contacts.map(mapContact),
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

const getContactById = async (contactId, currentUser) => {
  const contact = await contactRepository.findContactById(contactId);
  if (!contact) throw new ApiError(404, "Contact not found.");
  assertCanAccessContact(contact, currentUser);
  return mapContact(contact);
};

const createContact = async (data, currentUser) => {
  const payload = buildWritePayload(data, { requireNames: true });
  if (!payload.name) {
    throw new ApiError(400, "firstName/lastName or name is required.");
  }
  return mapContact(
    await contactRepository.createContact({
      ...payload,
      ownerUserId: currentUser.id,
    }),
  );
};

const updateContact = async (contactId, data, currentUser) => {
  const existing = await getContactById(contactId, currentUser);
  if (!isAdmin(currentUser) && existing.ownerUserId !== currentUser.id) {
    throw new ApiError(
      403,
      "You do not have permission to update this contact.",
    );
  }
  const payload = buildWritePayload({
    ...existing,
    ...data,
    firstName:
      data.firstName !== undefined ? data.firstName : existing.firstName,
    lastName: data.lastName !== undefined ? data.lastName : existing.lastName,
  });
  return mapContact(await contactRepository.updateContact(contactId, payload));
};

const deleteContact = async (contactId, currentUser) => {
  const existing = await getContactById(contactId, currentUser);
  if (!isAdmin(currentUser) && existing.ownerUserId !== currentUser.id) {
    throw new ApiError(
      403,
      "You do not have permission to delete this contact.",
    );
  }
  await contactRepository.deleteContact(contactId);
  return { id: contactId, deleted: true };
};

module.exports = {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
};
