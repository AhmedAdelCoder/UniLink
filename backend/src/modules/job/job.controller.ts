import { Request , Response } from "express";
import { jobServices } from "./job.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { JobStatus, Role } from "@prisma/client";
import { CreateJobInput, UpdateJobDTO } from "./validations/job.validation.js";
import { PaginationQuery } from "../../utils/pagination.js";

const jobService = new jobServices() ;

// recruiter
export const createJob = asyncHandler(
    async(req : Request , res : Response) =>{
        const recruiterId : string = req.user!.userId ;
        const data : CreateJobInput = req.body ;

        const result = await jobService.createJob(data , recruiterId) ;

        res.status(201).json({
            success : true ,
            msg : "create job successfully" ,
            data : result
        });
    }
)

export const getMyJobs = asyncHandler(
    async(req : Request , res : Response) =>{
        const recruiterId : string = req.user!.userId ;
        const { limit , cursor} = req.validated!.query as PaginationQuery ;

        const result = await jobService.getMyJobs(recruiterId , {limit , cursor}) ;

        res.status(200).json({
            success : true ,
            data : result
        })
    }
)

export const getJobDetails = asyncHandler(
    async(req : Request , res : Response) =>{
        const jobId : string = String(req.params.jobId) ;
        const userId : string = req.user!.userId ;
        const role : Role = req.user!.role ;

        const result = await jobService.getJobDetails(jobId , userId , role) ;

        res.status(200).json({
            success : true ,
            data : result
        });
    }
)

export const updateJob = asyncHandler(
    async(req : Request , res : Response) =>{
        const jobId : string = String(req.params.jobId) ;
        const recruiterId : string = req.user!.userId ;
        const data : UpdateJobDTO = req.body ;

        const result = await jobService.updateJob(jobId , recruiterId , data) ;

        res.status(200).json({
            success : true ,
            msg : "Update Successfully" ,
            data : result
        });
    }
)

export const changeJobStatus = asyncHandler(
    async(req : Request , res : Response) =>{
        const jobId : string = String(req.params.jobId) ;
        const recruiterId : string = req.user!.userId ;
        const newStatus : JobStatus = req.body.status ;

        const result = await jobService.changeJobStatus(jobId , recruiterId , newStatus) ;

        res.status(200).json({
            success : true ,
            msg : "change status successfully" ,
            data : result
        });
    }
)

export const deleteJob = asyncHandler(
    async(req : Request , res : Response) =>{
        const jobId : string = String(req.params.jobId);
        const recruiterId : string = req.user!.userId ;

        await jobService.deleteJob(jobId , recruiterId) ;

        res.status(200).json({
            success : true ,
            msg : "delete job successfully"
        });
    }
)

// recruiter & student
export const getAllJobs = asyncHandler(
    async(req : Request , res : Response) =>{
        const {limit , cursor} = req.validated!.query as PaginationQuery ;

        const result = await jobService.getAllJobs({limit , cursor}) ;

        res.status(200).json({
            success : true ,
            data : result
        });
    }
)