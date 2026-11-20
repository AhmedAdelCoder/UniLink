import { Router } from "express";
import { authLimiter } from "../../middlewares/rateLimiter.js";
import { authMiddleware } from "../../middlewares/authmiddleware.js";
import { validate } from "../../middlewares/validation.js";
import { Role } from "@prisma/client";
import { getJobApplications , updateApplicationStatus ,applyToJob } from "./application.controller.js";
import { applyToJobSchema, changeApplicationStatusSchema } from "./validations/application.validation.js";
import { paginationQuerySchema } from "../../utils/pagination.js";

const jobApplicationRouter = Router({mergeParams : true}) ;

// Recruiter
jobApplicationRouter.get('/' , authLimiter , authMiddleware([Role.recruiter]) , validate(paginationQuerySchema , "query") , getJobApplications) ;
jobApplicationRouter.patch('/:applicationId/status' , authLimiter , authMiddleware([Role.recruiter]) , validate(changeApplicationStatusSchema) ,  updateApplicationStatus);

// student
jobApplicationRouter.post('/' , authLimiter , authMiddleware([Role.student]) , validate(applyToJobSchema) , applyToJob) ;


export default jobApplicationRouter ;