-- Per-weekday schedule, enrollment and audit log.
--
-- The activities table used to carry one shared start time for every weekday
-- (days_of_week / start_time / duration_minutes). Those columns are replaced by
-- activity_slots, where each weekday has its own time — so Mon/Wed can run at
-- 13:00 while Fri runs at 16:00.
--
-- The old columns are backfilled into the new table before being dropped, so
-- existing activities keep their schedule.

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "district" VARCHAR(120),
ADD COLUMN     "mahalla" VARCHAR(120),
ADD COLUMN     "serial_number" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "activity_slots" (
    "id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "activity_id" UUID NOT NULL,

    CONSTRAINT "activity_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_enrollments" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activity_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "added_by_id" UUID,

    CONSTRAINT "activity_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "entity_type" VARCHAR(60),
    "entity_id" VARCHAR(64),
    "summary" VARCHAR(500),
    "status_code" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "actor_username" VARCHAR(60),
    "actor_role" "Role",
    "branch_id" UUID,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_slots_weekday_idx" ON "activity_slots"("weekday");

-- CreateIndex
CREATE UNIQUE INDEX "activity_slots_activity_id_weekday_key" ON "activity_slots"("activity_id", "weekday");

-- CreateIndex
CREATE INDEX "activity_enrollments_participant_id_idx" ON "activity_enrollments"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_enrollments_activity_id_participant_id_key" ON "activity_enrollments"("activity_id", "participant_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_branch_id_idx" ON "audit_logs"("branch_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "participants_serial_number_key" ON "participants"("serial_number");

-- AddForeignKey
ALTER TABLE "activity_slots" ADD CONSTRAINT "activity_slots_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_enrollments" ADD CONSTRAINT "activity_enrollments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_enrollments" ADD CONSTRAINT "activity_enrollments_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_enrollments" ADD CONSTRAINT "activity_enrollments_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one slot per weekday of every existing activity, carrying over the
-- single time those activities used to share. Runs before the old columns go.
INSERT INTO "activity_slots" ("id", "weekday", "start_time", "duration_minutes", "activity_id")
SELECT
    gen_random_uuid(),
    weekday,
    a."start_time",
    a."duration_minutes",
    a."id"
FROM "activities" a
CROSS JOIN LATERAL unnest(a."days_of_week") AS weekday;

-- DropColumn: superseded by activity_slots
ALTER TABLE "activities" DROP COLUMN "days_of_week",
DROP COLUMN "duration_minutes",
DROP COLUMN "start_time";
