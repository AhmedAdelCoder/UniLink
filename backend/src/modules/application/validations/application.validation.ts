import { ApplicationStatus } from "@prisma/client";
import { z } from "zod";

export const changeApplicationStatusSchema = z.object({
  status: z.enum([ApplicationStatus.accepted , ApplicationStatus.rejected , ApplicationStatus.reviewed]),
}).strict();

export type ChangeApplicationStatusDTO = z.infer<typeof changeApplicationStatusSchema>;

export const applyToJobSchema = z.object({
    cvUrl: z.string().url("cvUrl must be a valid URL")
}).strict();

export type ApplyToJobDTO = z.infer<typeof applyToJobSchema>;