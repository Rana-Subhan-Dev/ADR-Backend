const LocalStorageProvider = require("./localStorage.provider");
const S3StorageProvider = require("./s3Storage.provider");

const createStorageProvider = () => {
  const storageType = (process.env.STORAGE_TYPE || "local").toLowerCase();
  if (storageType === "local") return new LocalStorageProvider();
  if (storageType === "s3") return new S3StorageProvider();
  throw new Error(`Unsupported storage type: ${storageType}`);
};

module.exports = createStorageProvider();
