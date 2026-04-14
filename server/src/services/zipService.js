const archiver = require('archiver');
const cosService = require('./cosService');

async function createZipStream(files, outputStream) {
  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.pipe(outputStream);

  for (const file of files) {
    const buffer = await cosService.getObject(file.key);
    archive.append(buffer, { name: file.name });
  }

  await archive.finalize();
}

module.exports = { createZipStream };
