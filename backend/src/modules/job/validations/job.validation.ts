import { JobStatus } from "@prisma/client";
import { z } from "zod";

export const createJobSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Job title must be at least 3 characters")
    .max(150, "Job title cannot exceed 150 characters"),

  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters"),

  skills: z
    .array(z.string().trim().min(1))
    .min(1, "At least one skill is required"),

  jobType: z.enum([
    "full_time",
    "part_time",
    "internship",
    "contract",
  ]),

  workMode: z.enum([
    "remote",
    "onsite",
    "hybrid",
  ]),

  salaryRange: z
    .string()
    .trim()
    .max(50)
    .optional(),

  location: z
    .string()
    .trim()
    .max(150)
    .optional(),

  formUrl: z
    .string()
    .url("Invalid application form URL")
    .optional(),

  deadline: z
    .string()
    .datetime({ message: "Invalid deadline format" })
    .optional(),

    status : z.enum([JobStatus.open , JobStatus.draft , JobStatus.closed] , "please this input must be match jobStatus")

}).strict() ;

export type CreateJobInput = z.infer<typeof createJobSchema>;


export const updateJobSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(150, "Title must not exceed 150 characters")
      .optional(),

    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters")
      .optional(),

    skills: z
      .array(z.string().trim().min(1, "Skill cannot be empty"))
      .min(1, "At least one skill is required")
      .optional(),

    jobType: z
      .enum(["full_time", "part_time", "internship", "contract"])
      .optional(),

    workMode: z
      .enum(["remote", "onsite", "hybrid"])
      .optional(),

    salaryRange: z
      .string()
      .trim()
      .max(50, "Salary range must not exceed 50 characters")
      .optional(),

    location: z
      .string()
      .trim()
      .max(150, "Location must not exceed 150 characters")
      .optional(),

    formUrl: z
      .string()
      .url("Invalid form URL")
      .optional()
      .or(z.literal("")),

    deadline: z
      .string()
      .datetime({ message: "Invalid deadline format" })
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateJobDTO = z.infer<typeof updateJobSchema>;

export const changeJobStatusSchema = z
  .object({
    status: z.enum(["open", "closed", "draft"], {
      message: "Invalid job status",
    }),
  })
  .strict();

export type ChangeJobStatusDTO = z.infer<typeof changeJobStatusSchema>;