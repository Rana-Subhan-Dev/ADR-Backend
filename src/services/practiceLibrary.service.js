const prisma = require("../config/prisma");
const ApiError = require("../utils/apiError");
const { RoleName } = require("../constants/auth.constants");
const { getSignedDownloadUrl } = require("../utils/s3Helper");

const canManageLibrary = (user) =>
  [RoleName.SUPER_ADMIN, RoleName.ADMIN_LEADERSHIP, RoleName.CASE_MANAGER].includes(
    user?.role?.name,
  );

const canViewLibrary = (user) =>
  canManageLibrary(user) || user?.role?.name === RoleName.NEUTRAL;

const mapItem = async (item, { includeUrls = true } = {}) => {
  const base = {
    id: item.id,
    name: item.name,
    description: item.description || null,
    type: item.itemType,
    itemType: item.itemType,
    parentId: item.parentId,
    updatedAt: item.updatedAt,
    createdAt: item.createdAt,
    sortOrder: item.sortOrder,
    mimeType: item.mimeType || null,
    fileSizeBytes: item.fileSizeBytes || null,
    isPublished: item.isPublished,
    viewUrl: null,
    downloadUrl: null,
  };
  if (
    includeUrls &&
    item.itemType === "FILE" &&
    item.fileKey &&
    item.isPublished
  ) {
    try {
      const url = await getSignedDownloadUrl(item.fileKey, 600);
      base.viewUrl = url;
      base.downloadUrl = url;
    } catch {
      // leave URLs null if signing fails
    }
  }
  return base;
};

const listPracticeLibrary = async (query, currentUser) => {
  if (!canViewLibrary(currentUser)) {
    throw new ApiError(403, "Practice Library is not available for this role.");
  }
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 50;
  const sortBy = query.sortBy === "name" ? "name" : "updatedAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";
  const where = {
    ...(query.parentId ? { parentId: query.parentId } : { parentId: null }),
    ...(!canManageLibrary(currentUser) && { isPublished: true }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ],
    }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.practiceLibraryItem.findMany({
      where,
      orderBy: [{ [sortBy]: sortOrder }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.practiceLibraryItem.count({ where }),
  ]);
  const items = await Promise.all(rows.map((row) => mapItem(row)));
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  };
};

const getPracticeLibraryItem = async (id, currentUser) => {
  if (!canViewLibrary(currentUser)) {
    throw new ApiError(403, "Practice Library is not available for this role.");
  }
  const item = await prisma.practiceLibraryItem.findUnique({ where: { id } });
  if (!item || (!item.isPublished && !canManageLibrary(currentUser))) {
    throw new ApiError(404, "Practice library item not found.");
  }
  return mapItem(item);
};

const createPracticeLibraryItem = async (data, file, currentUser) => {
  if (!canManageLibrary(currentUser)) {
    throw new ApiError(403, "Only internal staff may manage Practice Library.");
  }
  const itemType = data.itemType || (file ? "FILE" : "FOLDER");
  if (itemType === "FILE" && !file) {
    throw new ApiError(400, "A file is required for FILE items.");
  }
  if (data.parentId) {
    const parent = await prisma.practiceLibraryItem.findUnique({
      where: { id: data.parentId },
      select: { id: true, itemType: true },
    });
    if (!parent || parent.itemType !== "FOLDER") {
      throw new ApiError(400, "parentId must reference a FOLDER item.");
    }
  }
  const created = await prisma.practiceLibraryItem.create({
    data: {
      name: data.name || file?.originalname || "Untitled",
      description: data.description || null,
      itemType,
      parentId: data.parentId || null,
      fileKey: file?.key || null,
      mimeType: file?.mimetype || null,
      fileSizeBytes: file?.size || null,
      sortOrder: Number(data.sortOrder) || 0,
      isPublished:
        data.isPublished === undefined
          ? true
          : data.isPublished === true || data.isPublished === "true",
    },
  });
  return mapItem(created);
};

module.exports = {
  listPracticeLibrary,
  getPracticeLibraryItem,
  createPracticeLibraryItem,
};
