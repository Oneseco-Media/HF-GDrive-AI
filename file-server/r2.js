const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

const ENABLE_R2 = !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET_NAME);

let s3Client;

if (ENABLE_R2) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Uploads a file to Cloudflare R2
 * @param {string} localFilePath - Path to the local file
 * @param {string} originalName - Original name of the file
 * @returns {Promise<Object>} - Information about the uploaded file
 */
async function uploadFileToR2(localFilePath, originalName) {
  if (!ENABLE_R2) {
    throw new Error('Cloudflare R2 is not configured');
  }

  const fileStream = fs.createReadStream(localFilePath);
  const key = `${Date.now()}-${originalName}`;

  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileStream,
  };

  try {
    const data = await s3Client.send(new PutObjectCommand(uploadParams));
    return {
      key: key,
      bucket: BUCKET_NAME,
      etag: data.ETag,
      url: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${key}`
    };
  } catch (error) {
    console.error('Error uploading to R2:', error);
    throw error;
  }
}

module.exports = {
  uploadFileToR2,
  ENABLE_R2
};
