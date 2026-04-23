import { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const {
  S3_ENDPOINT,
  S3_REGION,
  S3_BUCKET,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_PRESIGN_TTL,
} = process.env;

export const S3_CONFIGURED = Boolean(
  S3_ENDPOINT && S3_REGION && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY,
);

// Fail fast on use when env is missing — avoids silent 500s that look like
// network errors to the client.
function assertConfigured() {
  if (!S3_CONFIGURED) {
    const err = new Error('S3 is not configured. Set S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY.');
    err.status = 503;
    throw err;
  }
}

let _client = null;
function client() {
  assertConfigured();
  if (!_client) {
    _client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
      // DO Spaces uses virtual-hosted style (bucket.endpoint), same as AWS.
      forcePathStyle: false,
    });
  }
  return _client;
}

const DEFAULT_TTL = Number(S3_PRESIGN_TTL) || 1800;

export function buildPhotoKey(userId, date, ext = 'jpg', variant = 'full') {
  const rand = crypto.randomBytes(8).toString('hex');
  const yyyy = date.slice(0, 4);
  const mm = date.slice(5, 7);
  const suffix = variant === 'thumb' ? '.thumb' : '';
  return `photos/${userId}/${yyyy}/${mm}/${date}-${rand}${suffix}.${ext}`;
}

export async function presignPut(key, contentType) {
  const cmd = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client(), cmd, { expiresIn: DEFAULT_TTL });
}

export async function presignGet(key) {
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  return getSignedUrl(client(), cmd, { expiresIn: DEFAULT_TTL });
}

export async function deleteObject(key) {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch (err) {
    // Best-effort; orphaned objects preferable to failing the DB delete.
    console.error('[s3] delete failed for', key, err.message);
  }
}
