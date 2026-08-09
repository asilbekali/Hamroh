-- Announcements are internal panel notices; no email is ever dispatched.
-- Rename the "sent" wording to "published" (renames preserve existing data).

-- AlterEnum
ALTER TYPE "AnnouncementStatus" RENAME VALUE 'SENT' TO 'PUBLISHED';

-- AlterTable
ALTER TABLE "announcements" RENAME COLUMN "sent_at" TO "published_at";
