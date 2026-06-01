function toPublicImageUrl(value, fallbackKey = '') {
  const raw = value || fallbackKey || '';
  if (!raw) return raw;

  const normalized = String(raw).replace(/\\/g, '/');
  const uploadIndex = normalized.indexOf('/uploads/');
  if (uploadIndex >= 0) {
    return normalized.slice(uploadIndex);
  }

  if (normalized.startsWith('uploads/')) {
    return `/${normalized}`;
  }

  return raw;
}

function normalizeProductImage(row) {
  if (!row) return row;
  return {
    ...row,
    thumbnail_url: toPublicImageUrl(row.thumbnail_url, row.cos_key),
    original_url: toPublicImageUrl(row.original_url, row.cos_key),
  };
}

module.exports = { toPublicImageUrl, normalizeProductImage };
