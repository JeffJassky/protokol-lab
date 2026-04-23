// Client-side image prep: decode → resize → re-encode via canvas.
// Canvas export drops all EXIF (including GPS), which is the point — the
// marketing pitch says photos are private, so uploading raw metadata would
// break the promise even with a private bucket.

const FULL_MAX_EDGE = 1600;
const THUMB_MAX_EDGE = 240;
const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.78;

function loadImageBitmap(file) {
  // createImageBitmap handles orientation (EXIF rotation) on modern browsers.
  if ('createImageBitmap' in window) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() =>
      loadViaImgElement(file),
    );
  }
  return loadViaImgElement(file);
}

function loadViaImgElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
}

function resizeToBlob(source, maxEdge, mime, quality) {
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, dw, dh);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width: dw, height: dh }) : reject(new Error('toBlob failed'))),
      mime,
      quality,
    );
  });
}

export async function prepPhoto(file) {
  const source = await loadImageBitmap(file);
  // WebP gives ~30% smaller files than JPEG at equal perceptual quality and
  // both DO Spaces + every modern browser handle it. Fall back to JPEG only if
  // we somehow end up here on Safari <14, which is below our baseline anyway.
  const mime = 'image/jpeg';
  const [full, thumb] = await Promise.all([
    resizeToBlob(source, FULL_MAX_EDGE, mime, FULL_QUALITY),
    resizeToBlob(source, THUMB_MAX_EDGE, 'image/webp', THUMB_QUALITY),
  ]);
  if (source.close) source.close();
  return {
    fullBlob: full.blob,
    thumbBlob: thumb.blob,
    width: full.width,
    height: full.height,
    contentType: mime,
    ext: 'jpg',
    bytes: full.blob.size,
  };
}
