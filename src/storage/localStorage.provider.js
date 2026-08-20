const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");
const StorageProvider = require("./storageProvider");

class LocalStorageProvider extends StorageProvider {
  constructor() {
    super();
    this.uploadDirectory = path.resolve(process.env.UPLOAD_DIR || "uploads");
  }

  async uploadFile(file) {
    await fs.mkdir(this.uploadDirectory, { recursive: true });
    const originalName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${Date.now()}-${crypto.randomUUID()}-${originalName}`;
    await fs.writeFile(path.join(this.uploadDirectory, key), file.buffer, {
      flag: "wx",
    });
    return { url: `/uploads/${key}`, key };
  }

  async deleteFile(key) {
    try {
      await fs.unlink(path.join(this.uploadDirectory, path.basename(key)));
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  async getReadStream(key) {
    return fsSync.createReadStream(
      path.join(this.uploadDirectory, path.basename(key)),
    );
  }
}

module.exports = LocalStorageProvider;
