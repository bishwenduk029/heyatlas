// lib/config/upload.ts

import { z } from "zod";

/**
 * Map MIME types to file extensions.
 * This is the primary source of file extensions.
 */
const MIME_TYPE_TO_EXTENSION = {
  // Images
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/apng": "apng",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/tiff": "tiff",
  "image/vnd.microsoft.icon": "ico",

  // Documents
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",

  // Audio and video files
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "audio/opus": "opus",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/x-matroska": "mkv",
  "video/x-flv": "flv",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-ms-wmv": "wmv",

  // Text files
  "text/plain": "txt",
  "text/csv": "csv",
  "text/markdown": "md",
  "text/html": "html",
  "text/css": "css",
  "text/javascript": "js",
  "application/json": "json", // Note: text/json is obsolete
  "application/xml": "xml", // Note: text/xml is also used
  "text/xml": "xml",
  "text/calendar": "ics",

  // Archives
  "application/zip": "zip",
  "application/x-rar-compressed": "rar",
  "application/x-7z-compressed": "7z",
} as const; // Use as const to ensure type safety

/**
 * Global file upload configuration.
 * This is the single source of truth for file upload rules across the entire application.
 */
export const UPLOAD_CONFIG = {
/**
    * Maximum allowed file size in bytes.
    * @default 50MB
    */
  MAX_FILE_SIZE: 50 * 1024 * 1024,

/**
    * Maximum allowed file size in MB for UI display.
    */
  MAX_FILE_SIZE_MB: 50,

/**
    * Presigned URL expiration time in seconds.
    * @default 15 minutes
    */
  PRESIGNED_URL_EXPIRATION: 15 * 60,

/**
    * Array of allowed upload MIME types.
    * **Auto-generated from MIME_TYPE_TO_EXTENSION to ensure consistency.**
    */
  ALLOWED_FILE_TYPES: Object.keys(
    MIME_TYPE_TO_EXTENSION,
  ) as (keyof typeof MIME_TYPE_TO_EXTENSION)[],
} as const;

/**
 * Check if file type is in allowed list.
 * @param contentType - File's MIME type.
 * @returns `true` if allowed, otherwise `false`.
 */
export function isFileTypeAllowed(contentType: string): boolean {
  return UPLOAD_CONFIG.ALLOWED_FILE_TYPES.includes(
    contentType as (typeof UPLOAD_CONFIG.ALLOWED_FILE_TYPES)[number],
  );
}

/**
 * Check if file size is within allowed range.
 * @param size - File's byte size.
 * @returns `true` if within limit, otherwise `false`.
 */
export function isFileSizeAllowed(size: number): boolean {
  return size <= UPLOAD_CONFIG.MAX_FILE_SIZE;
}

/**
 * Format file size for easy reading.
 * @param bytes - File's byte size.
 * @returns Formatted string (e.g., "1.23 MB").
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Get file extension from MIME type.
 * @param contentType - File's MIME type.
 * @returns Corresponding file extension, defaults to "bin" if not found.
 */
export function getFileExtension(contentType: string): string {
  if (contentType in MIME_TYPE_TO_EXTENSION) {
    return MIME_TYPE_TO_EXTENSION[
      contentType as keyof typeof MIME_TYPE_TO_EXTENSION
    ];
  }

  // Fallback for types like 'application/vnd.some-custom-format'
  const parts = contentType.split("/");
  const subtype = parts[1];
  if (subtype && !subtype.includes("*")) {
    const ext = subtype.split("+")[0];
    return ext.toLowerCase();
  }

  return "bin"; // Default fallback
}

// Zod schema for validating presigned URL request body
export const presignedUrlRequestSchema = z.object({
  fileName: z
    .string()
    .min(1, "File name cannot be empty.")
    .max(255, "File name is too long."),
  contentType: z.string().min(1, "Content type cannot be empty."),
  size: z.number().positive("File size must be positive."),
});
