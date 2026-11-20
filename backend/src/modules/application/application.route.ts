import { Router } from "express";
import { authLimiter } from "../../middlewares/rateLimiter.js";
import { authMiddleware } from "../../middlewares/authmiddleware.js";
import { Role } from "@prisma/client";
import { applyToJob, getJobApplications, getApplicationDetails, updateApplicationStatus, withdrawnApplication , getMyApllications } from "./application.controller.js";
import { validate } from "../../middlewares/validation.js";
import { changeApplicationStatusSchema } from "./validations/application.validation.js";
import { paginationQuerySchema } from "../../utils/pagination.js";

const applicationRouter = Router() ;

// student
applicationRouter.get('/my-applications' , authLimiter , authMiddleware([Role.student]) , validate(paginationQuerySchema , "query") , getMyApllications) ;
applicationRouter.get('/:applicationId' , authLimiter , authMiddleware([Role.student]) , getApplicationDetails) ;
applicationRouter.patch('/:applicationId/withdraw' , authLimiter , authMiddleware([Role.student]) , withdrawnApplication) ;

export default applicationRouter ;



