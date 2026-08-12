-- Reports are built from participants, activities and their attendance rows.
-- Deleting a participant or an activity used to cascade the attendances away,
-- which silently rewrote past reports. From here on a delete only stamps
-- `deleted_at`: the row stays, the reports stay whole, and removing the data
-- for real is a manual DELETE in the database.

-- AlterTable
ALTER TABLE "participants" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" UUID;

-- AlterTable
ALTER TABLE "activities" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" UUID;

-- CreateIndex
CREATE INDEX "participants_deleted_at_idx" ON "participants"("deleted_at");

-- CreateIndex
CREATE INDEX "activities_deleted_at_idx" ON "activities"("deleted_at");

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
