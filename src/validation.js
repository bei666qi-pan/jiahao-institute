export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 3;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function isAcceptedFile(file) {
  return Boolean(file && (IMAGE_TYPES.has(file.type) || DOCUMENT_TYPES.has(file.type) || /\.(txt|pdf|docx)$/i.test(file.name)));
}

export function validateFiles(list, { mode = 'chat' } = {}) {
  const files = [...list];
  const limit = mode === 'photo' ? 1 : MAX_FILES;
  if (!files.length) throw new Error('请选择需要鉴定的内容。');
  if (files.length > limit) throw new Error(mode === 'photo' ? '照片鉴定每次只能选择一张图片。' : `聊天记录每次最多选择 ${MAX_FILES} 份文件。`);
  for (const file of files) {
    if (!isAcceptedFile(file) || (mode === 'photo' && !IMAGE_TYPES.has(file.type))) {
      throw new Error(mode === 'photo' ? '照片仅支持 JPG、PNG 或 WebP。' : '仅支持 JPG、PNG、WebP、PDF、TXT 或 DOCX。');
    }
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} 超过 10MB，请压缩后重试。`);
  }
  return files;
}

export function decideFallbackWinner(firstScore, secondScore) {
  const difference = Number(firstScore) - Number(secondScore);
  return Math.abs(difference) <= 2 ? 'tie' : difference > 0 ? 'A' : 'B';
}
