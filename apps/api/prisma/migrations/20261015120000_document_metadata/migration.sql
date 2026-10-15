-- Add accurate file metadata to documents (MIME type and byte size)
ALTER TABLE "Document" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "Document" ADD COLUMN "size" INTEGER;
