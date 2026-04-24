import { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('s3');

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

if (!S3_CONFIGURED) {
  log.warn(
    {
      hasEndpoint: Boolean(S3_ENDPOINT),
      hasRegion: Boolean(S3_REGION),
      hasBucket: Boolean(S3_BUCKET),
      hasAccessKey: Boolean(S3_ACCESS_KEY_ID),
      hasSecret: Boolean(S3_SECRET_ACCESS_KEY),
    },
    'S3 not configured — photo routes will 503',
  );
} else {
  log.info({ endpoint: S3_ENDPOINT, region: S3_REGION, bucket: S3_BUCKET }, 'S3 configured');
}

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
      forcePathStyle: false,
    });
    log.debug('S3 client initialized');
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
  const t0 = Date.now();
  try {
    const cmd = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(client(), cmd, { expiresIn: DEFAULT_TTL });
    log.debug({ key, contentType, ttl: DEFAULT_TTL, durationMs: Date.now() - t0 }, 'presign PUT');
    return url;
  } catch (err) {
    log.error({ ...errContext(err), key, contentType }, 'presign PUT failed');
    throw err;
  }
}

export async function presignGet(key) {
  const t0 = Date.now();
  try {
    const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const url = await getSignedUrl(client(), cmd, { expiresIn: DEFAULT_TTL });
    log.debug({ key, ttl: DEFAULT_TTL, durationMs: Date.now() - t0 }, 'presign GET');
    return url;
  } catch (err) {
    log.error({ ...errContext(err), key }, 'presign GET failed');
    throw err;
  }
}

export async function deleteObject(key) {
  const t0 = Date.now();
  try {
    await client().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    log.info({ key, durationMs: Date.now() - t0 }, 's3 object deleted');
  } catch (err) {
    // Best-effort; orphaned objects preferable to failing the DB delete.
    log.error({ ...errContext(err), key }, 's3 delete failed (orphaned object)');
  }
}
