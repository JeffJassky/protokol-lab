import multer from 'multer';

const MAX_FILES = 3;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per file

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  },
});

// Accept up to MAX_FILES files on the `images` field. Text-only JSON requests
// pass through untouched because multer only engages on multipart/form-data.
export const chatUpload = upload.array('images', MAX_FILES);

// When the request came in as multipart, the JSON body was sent as a single
// `payload` string field. Promote its fields onto req.body so downstream code
// can read req.body.messages / req.body.threadId the same way regardless of
// transport. On JSON requests this is a no-op.
export function parseChatPayload(req, _res, next) {
  if (typeof req.body?.payload === 'string') {
    try {
      const parsed = JSON.parse(req.body.payload);
      req.body = { ...parsed };
    } catch (err) {
      err.status = 400;
      return next(err);
    }
  }
  next();
}
