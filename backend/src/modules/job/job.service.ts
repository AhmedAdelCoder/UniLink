import { JobStatus, Role } from "@prisma/client";
import prisma from "../../config/postgres.js";
import { AppError } from "../../utils/AppError.js";
import { CreateJobInput, UpdateJobDTO } from "./validations/job.validation.js";
import { buildpage, PaginationQuery } from "../../utils/pagination.js";

const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
    draft: [JobStatus.open, JobStatus.closed],
    open: [JobStatus.closed],
    closed: [JobStatus.open],
};

export class jobServices {

    // recruiter
    async createJob(data : CreateJobInput , recruiterId : string) {

        const { deadline , ...jobFields } = data;

        return await prisma.job.create({
            data : {
                recruiterId : recruiterId ,
                ...jobFields ,
                ...( (deadline !== undefined ) ? {deadline : new Date(deadline)} : {} )
            }
        });
    }

    async getMyJobs(recruiterId : string , pagination : PaginationQuery) {

        const  {limit , cursor} = pagination ;

        if(cursor) {
            const cursorJob = await prisma.job.findFirst({
                where : {
                    id : cursor ,
                    recruiterId : recruiterId
                } ,
                select : {
                    id : true
                }
            });

            if(!cursorJob) {
                throw new AppError("Invalid cursor" , 400) ;
            }
        }


        const rows = await prisma.job.findMany({
            where : {
                recruiterId : recruiterId
            } ,
            take : limit + 1 ,
            ...(cursor && { cursor : { id : cursor} , skip : 1 }) ,

            orderBy: [
                { createdAt : "desc"} ,
                { id : "desc"}
            ]
        });

        return buildpage(rows , limit) ;
    }

    // recruiter & student
    async getJobDetails(jobId : string , userId : string , role : Role ) {
        const job = await prisma.job.findUnique({
            where : {
                id : jobId
            }
        });

        if(!job) {
            throw new AppError("Job Not found" , 404) ;
        }

        const isOwner = job.recruiterId === userId ;

        if(role === Role.recruiter && !isOwner) {
            if(job.status !== JobStatus.open || (job.deadline !== null && job.deadline <= new Date())) {
                throw new AppError("job not found" , 404);
            }
        }

        if(role === Role.student) {
            if(job.status !== JobStatus.open || (job.deadline !== null && job.deadline <= new Date())) {
                throw new AppError("job not found" , 404);
            }
        }

        return job ;
    }

    async updateJob(jobId : string , recruiterId : string , data : UpdateJobDTO) {
        const job = await prisma.job.findFirst({
            where : {
                id : jobId ,
                recruiterId : recruiterId
            }
        });

        if(!job) {
            throw new AppError("Job Not found" , 404) ;
        }

        const { deadline, ...jobFields } = data;

        return await prisma.job.update({
            where : {
                id : jobId ,
                recruiterId : recruiterId
            } ,
            data : {
                ...jobFields ,
                ...((deadline !== undefined ) ? {deadline : new Date(deadline)} : {} )
            }
        });
    }

    async changeJobStatus(jobId : string , recruiterId : string , newStatus : JobStatus) {
        const job = await prisma.job.findFirst({
            where : {
                id : jobId ,
                recruiterId : recruiterId
            }
        });

        if(!job) {
            throw new AppError("Job Not found" , 404) ;
        }

        if(job.status === newStatus){
            return job ;
        }

        if(!JOB_TRANSITIONS[job.status].includes(newStatus)) {
            throw new AppError(`Cannot change job status from ${job.status} to ${newStatus}` , 409) ;
        }

        const result = await prisma.job.updateMany({
            where : {
                id : jobId ,
                recruiterId : recruiterId ,
                status : job.status
            } ,
            data : {
                status : newStatus
            }
        });

        if (result.count === 0) {
            throw new AppError("Job status was changed by someone else, please try again", 409);
        }

        return await prisma.job.findUnique({
            where : {
                id : jobId
            }
        });
    }

    async deleteJob(jobId : string , recruiterId : string) {
        const job = await prisma.job.findFirst({
            where : {
                id : jobId ,
                recruiterId : recruiterId
            }
        });

        if(!job) {
            throw new AppError("Job Not found" , 404) ;
        }

        await prisma.job.delete({
            where : {
                id : jobId ,
                recruiterId : recruiterId
            }
        });
    }

    // student
    async getAllJobs(pagination : PaginationQuery){

        const {limit , cursor} = pagination ;

        const where =  {
                status : JobStatus.open ,
                OR : [
                    { deadline : null} ,
                    { deadline : { gt :  new Date() }}
                ]
            } ;

        if(cursor) {
            const cursorJob = await prisma.job.findFirst({
                where : {
                    id : cursor ,
                    ...where
                } ,
                select : {
                    id : true
                }
            });

            if(!cursorJob) {
                throw new AppError("Invalid cursor" , 400);
            }
        }

        const rows =  await prisma.job.findMany({
            where ,
            take : limit + 1 ,
            ...(cursor && { cursor : { id : cursor} , skip : 1}) ,
            orderBy : [
                {createdAt : "desc"} ,
                { id : "desc"}
            ]
        });

        return buildpage(rows , limit) ;
    }
}