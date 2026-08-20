const multer = require("multer");
const ApiError = require("../utils/apiError");

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype))
      return callback(new ApiError(400, "Unsupported file type."));
    callback(null, true);
  },
});

module.exports = upload;
