import { Request , Response } from "express";
import { applicationServices } from "./application.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApplicationStatus } from "@prisma/client";
import { ApplyToJobDTO } from "./validations/application.validation.js";
import { PaginationQuery } from "../../utils/pagination.js";


const applicationService = new applicationServices() ;

export const getJobApplications = asyncHandler(
    async(req : Request , res : Response) => {
        const recruiterId : string = req.user!.userId ;
        const jobId : string = String(req.params.jobId) ;
        const {limit , cursor} = req.validated!.query as PaginationQuery ;

        const result = await applicationService.getJobApplications(jobId , recruiterId , {limit , cursor}) ;

        res.status(200).json({
            success : true ,
            data : result
        });
    }
)

export const updateApplicationStatus = asyncHandler(
    async(req : Request , res : Response) => {
        const recruiterId : string = req.user!.userId ;
        const jobId : string = String(req.params.jobId) ;
        const applicationId : string = String(req.params.applicationId) ;
        const newStatus : ApplicationStatus = req.body.status ;

        await applicationService.updateApplicationStatus(jobId , recruiterId , applicationId , newStatus) ;

        res.status(200).json({
            success : true ,
            msg : "Update status succassfully"
        });
    }
)

// student
export const applyToJob = asyncHandler(
    async(req : Request , res : Response) =>{
        const studentId : string = req.user!.userId ;
        const jobId : string = String(req.params.jobId) ;
        const {cvUrl} = req.body as ApplyToJobDTO ;

        await applicationService.applyToJob(studentId , jobId , cvUrl) ;

        res.status(201).json({
            success : true ,
            msg : "aplly to job successfully"
        });
    }
)

export const getMyApllications = asyncHandler(
    async(req : Request , res : Response) =>{
        const studentId : string = req.user!.userId ;
        const {limit , cursor} = req.validated!.query as PaginationQuery ;

        const result = await applicationService.getMyApllications(studentId , {limit , cursor}) ;

        res.status(200).json({
            success : true ,
            data : result
        });
    }
)

export const getApplicationDetails = asyncHandler(
    async(req : Request , res : Response) =>{
        const applicationId : string = String(req.params.applicationId) ;
        const studentId : string = req.user!.userId ;

        const result = await applicationService.getApplicationDetails(studentId , applicationId) ;

        res.status(200).json({
            success : true ,
            data : result
        });
    }
)

export const withdrawnApplication = asyncHandler(
    async(req : Request , res : Response) =>{
        const studentId : string = req.user!.userId ;
        const applicationId : string = String(req.params.applicationId) ;

        const result = await applicationService.withdrawnApplication(studentId , applicationId) ;

        res.status(200).json({
            success : true ,
            msg : "withdrawn application successfully" ,
            data : result
        });
    }
)