const crypto = require("crypto");
require("dotenv").config({ quiet: true });
const {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const multer = require("multer");
const multerS3 = require("multer-s3");
const ApiError = require("./apiError");

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
]);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

const getBucketName = () => {
  if (!process.env.AWS_BUCKET_NAME)
    throw new ApiError(500, "AWS_BUCKET_NAME is not configured.");
  return process.env.AWS_BUCKET_NAME;
};

const sanitizeFileName = (fileName) =>
  fileName
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");

const uploadToS3 = multer({
  storage: multerS3({
    s3,
    bucket: (_req, _file, callback) => {
      try {
        callback(null, getBucketName());
      } catch (error) {
        callback(error);
      }
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, callback) => {
      const fileName = sanitizeFileName(file.originalname) || "document";
      callback(
        null,
        `documents/${req.params.caseId}/${Date.now()}-${crypto.randomUUID()}-${fileName}`,
      );
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype))
      return callback(new ApiError(400, "Unsupported file type."));
    callback(null, true);
  },
});

const getSignedDownloadUrl = async (key, expiresInSeconds = 300) => {
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
};

const deleteS3Object = (key) =>
  s3.send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
  );

const deleteManyS3Objects = async (files = []) => {
  const objects = files.filter((file) => file?.key);
  await Promise.all(
    objects.map((file) =>
      Promise.resolve()
        .then(() => deleteS3Object(file.key))
        .catch(() => undefined),
    ),
  );
};

const cleanupUncommittedS3Uploads = async (error, req, _res, next) => {
  const files = req.files || (req.file ? [req.file] : []);
  const uncommittedFiles = files.filter(
    (file) => !file.s3Committed && !file.s3Cleaned,
  );
  await deleteManyS3Objects(uncommittedFiles);
  uncommittedFiles.forEach((file) => {
    file.s3Cleaned = true;
  });
  next(error);
};

module.exports = {
  s3,
  uploadToS3,
  getSignedDownloadUrl,
  deleteS3Object,
  deleteManyS3Objects,
  cleanupUncommittedS3Uploads,
};
