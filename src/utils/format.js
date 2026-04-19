/**
 * Format a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export const formatFileSize = (bytes) => {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes === 0) return '0 Bytes';
  if (bytes < 1024) return `${bytes} Bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

/**
 * Get a human-readable type label from a MIME type.
 * @param {string|null} mimeType
 * @param {boolean} isFolder
 * @returns {string}
 */
// Exact MIME → label. Add new types here, nothing else to change.
const MIME_LABELS = {
  'image/jpeg':        'JPEG Image',
  'image/jpg':         'JPEG Image',
  'image/png':         'PNG Image',
  'image/gif':         'GIF Image',
  'image/webp':        'WebP Image',
  'image/svg+xml':     'SVG Image',
  'image/heic':        'HEIC Image',
  'image/heif':        'HEIC Image',
  'image/bmp':         'BMP Image',
  'image/tiff':        'TIFF Image',
  'video/mp4':         'MP4 Video',
  'video/quicktime':   'MOV Video',
  'video/x-msvideo':   'AVI Video',
  'video/webm':        'WebM Video',
  'video/x-matroska':  'MKV Video',
  'video/mpeg':        'MPEG Video',
  'audio/mpeg':        'MP3 Audio',
  'audio/mp3':         'MP3 Audio',
  'audio/wav':         'WAV Audio',
  'audio/x-wav':       'WAV Audio',
  'audio/aac':         'AAC Audio',
  'audio/ogg':         'OGG Audio',
  'audio/flac':        'FLAC Audio',
  'application/pdf':   'PDF',
  'application/msword': 'Word Doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Doc',
  'application/vnd.ms-excel': 'Excel Sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Sheet',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'text/plain':        'Text File',
  'text/html':         'HTML File',
  'text/css':          'CSS File',
  'text/xml':          'XML File',
  'application/json':  'JSON File',
  'application/xml':   'XML File',
  'application/zip':   'ZIP Archive',
  'application/x-rar-compressed': 'RAR Archive',
  'application/vnd.rar':          'RAR Archive',
  'application/x-7z-compressed':  '7Z Archive',
  'application/x-tar': 'TAR Archive',
  'application/gzip':  'GZ Archive',
};

// Prefix fallbacks for unknown subtypes (e.g. image/avif → Image)
const MIME_PREFIX_FALLBACKS = [
  ['image/',  'Image'],
  ['video/',  'Video'],
  ['audio/',  'Audio'],
  ['text/',   'Text File'],
];

export const getTypeLabel = (mimeType, isFolder = false) => {
  if (isFolder) return 'Folder';
  if (!mimeType) return 'File';
  if (MIME_LABELS[mimeType]) return MIME_LABELS[mimeType];
  const fallback = MIME_PREFIX_FALLBACKS.find(([prefix]) => mimeType.startsWith(prefix));
  return fallback ? fallback[1] : 'File';
};

/**
 * Format an ISO date string to a smart human-readable label.
 * - Same minute  → "Just now"
 * - < 1 hour     → "X min ago"
 * - Today        → "Today, HH:MM"
 * - Yesterday    → "Yesterday, HH:MM"
 * - This year    → "Apr 14, HH:MM"
 * - Older        → "Apr 14 2024"
 * @param {string|Date} dateInput
 * @returns {string}
 */
export const formatDate = (dateInput) => {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm}`;

  // Just now (< 1 min)
  if (diffMin < 1) return 'Just now';

  // Minutes ago (< 60 min)
  if (diffMin < 60) return `${diffMin} min ago`;

  const dYear = d.getFullYear();
  const dMonth = d.getMonth();
  const dDate = d.getDate();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDate = now.getDate();

  // Today
  if (dYear === todayYear && dMonth === todayMonth && dDate === todayDate) {
    return `Today, ${timeStr}`;
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    dYear === yesterday.getFullYear() &&
    dMonth === yesterday.getMonth() &&
    dDate === yesterday.getDate()
  ) {
    return `Yesterday, ${timeStr}`;
  }

  // This year → "Apr 14, HH:MM"
  if (dYear === todayYear) {
    return `${months[dMonth]} ${dDate}, ${timeStr}`;
  }

  // Older → "Apr 14 2024"
  return `${months[dMonth]} ${dDate} ${dYear}`;
};
