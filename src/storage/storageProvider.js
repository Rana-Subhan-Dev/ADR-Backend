class StorageProvider {
  async uploadFile() {
    throw new Error("uploadFile must be implemented.");
  }

  async deleteFile() {
    throw new Error("deleteFile must be implemented.");
  }

  async getReadStream() {
    throw new Error("getReadStream must be implemented.");
  }
}

module.exports = StorageProvider;
