-- DropForeignKey
ALTER TABLE "applications" DROP CONSTRAINT "applications_job_id_fkey";

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
