const StorageProvider = require("./storageProvider");

class S3StorageProvider extends StorageProvider {
  async uploadFile() {
    throw new Error("S3 storage is not configured.");
  }

  async deleteFile() {
    throw new Error("S3 storage is not configured.");
  }

  async getReadStream() {
    throw new Error("S3 storage is not configured.");
  }
}

module.exports = S3StorageProvider;
