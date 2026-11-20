import { Router } from "express";
import { authLimiter } from "../../middlewares/rateLimiter.js";
import { authMiddleware } from "../../middlewares/authmiddleware.js";
import { Role } from "@prisma/client";
import { changeJobStatus, createJob, deleteJob, getAllJobs, getJobDetails, getMyJobs, updateJob } from "./job.controller.js";
import { validate } from "../../middlewares/validation.js";
import { changeJobStatusSchema, createJobSchema, updateJobSchema } from "./validations/job.validation.js";
import { paginationQuerySchema } from "../../utils/pagination.js";

const jobRouter = Router() ;

// recruiter
jobRouter.post('/' , authLimiter , authMiddleware([Role.recruiter]) , validate(createJobSchema), createJob) ;
jobRouter.get('/my-jobs' , authLimiter , authMiddleware([Role.recruiter]) , validate(paginationQuerySchema , "query") , getMyJobs) ;
jobRouter.patch('/:jobId' , authLimiter , authMiddleware([Role.recruiter]) , validate(updateJobSchema) , updateJob) ;
jobRouter.patch('/:jobId/status' , authLimiter , authMiddleware([Role.recruiter]) , validate(changeJobStatusSchema) , changeJobStatus);
jobRouter.delete('/:jobId' , authLimiter , authMiddleware([Role.recruiter]) , deleteJob);

//student
jobRouter.get('/:jobId' , authLimiter , authMiddleware([Role.student , Role.recruiter]) , getJobDetails) ;
jobRouter.get('/', authLimiter , authMiddleware([Role.student])  , validate(paginationQuerySchema , "query"), getAllJobs);

export default jobRouter ;