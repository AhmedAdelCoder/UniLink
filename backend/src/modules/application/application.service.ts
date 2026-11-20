import { ApplicationStatus, JobStatus, Prisma } from "@prisma/client";
import prisma from "../../config/postgres.js";
import { AppError } from "../../utils/AppError.js";
import { buildpage, PaginationQuery } from "../../utils/pagination.js";

const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
    pending: ["reviewed", "accepted", "rejected"],
    reviewed: ["accepted", "rejected"],
    accepted: [],
    rejected: [],
    withdrawn: [],
};

const WITHDRAWABLE_STATUSES: ApplicationStatus[] = [
    ApplicationStatus.pending,
    ApplicationStatus.reviewed,
];

export class applicationServices {

    // recruiter
    async getJobApplications(jobId : string , recruiterId : string , pagination : PaginationQuery) {

        const {limit , cursor} = pagination ;

        const job = await prisma.job.findFirst({
            where : {
                id  : jobId ,
                recruiterId : recruiterId
            }
        });

        if(!job) {
            throw new AppError("job not found" , 404) ;
        }

        if(cursor) {
            const cursorApllication = await prisma.application.findFirst({
                where : {
                    id : cursor ,
                    jobId : jobId
                } ,
                select : {
                    id : true
                }
            });

            if(!cursorApllication) {
                throw new AppError("Invalid cursor" , 400);
            }
        }

        const rows = await prisma.application.findMany({
            where : {
                jobId : jobId ,
            },
            include : {
                student : {
                    select : {
                        id: true,
                        fullName: true,
                        email: true,
                        photoUrl: true,
                        bio: true,
                        skills: true,
                        githubUrl: true,
                        websiteUrl: true,
                    }
                }
            } ,
            take : limit + 1 ,
            ...(cursor && { cursor : {id : cursor} , skip : 1}) ,
            orderBy : [
                {createdAt : "desc"} ,
                { id : "desc"}
            ]
        });

        return buildpage(rows , limit) ;
    }

    async updateApplicationStatus(jobId : string , recruiterId : string , applicationId : string , newStatus : ApplicationStatus){
        const job = await prisma.job.findFirst({
            where : {
                id  : jobId ,
                recruiterId : recruiterId
            }
        });

        if(!job) {
            throw new AppError("job not found" , 404) ;
        }

        const application = await prisma.application.findFirst({
            where : {
                id : applicationId ,
                jobId : jobId
            }
        });

        if(!application) {
            throw new AppError("Application not found" , 404) ;
        }

        if(!ALLOWED_TRANSITIONS[application.status].includes(newStatus)) {
            throw new AppError(`Cannot change application status from ${application.status} to ${newStatus}` , 409) ;
        }

        const result = await prisma.application.updateMany({
            where : {
                id : applicationId ,
                status : application.status
            } ,
            data : {
                status : newStatus
            }
        });

        if(result.count === 0) {
            throw new AppError("Application status was changed by someone else, please try again" , 409) ;
        }
    }

    // student
    async applyToJob(studentId : string , jobId : string , cvUrl : string){

        try {
            await prisma.$transaction(async(tx) =>{
                const rows = await tx.$queryRaw<{ status: JobStatus; deadline: Date | null }[]>`
                    SELECT "status", "deadline"
                    FROM "jobs"
                    WHERE "id" = ${jobId}::uuid
                    FOR SHARE
                `;

                const job = rows[0] ;

                if(!job) {
                    throw new AppError("job not found" , 404);
                }

                if(job.status !== JobStatus.open || (job.deadline !== null && job.deadline <= new Date())) {
                    throw new AppError("job is not available" , 400) ;
                }

                await tx.application.create({
                    data : {
                        jobId : jobId ,
                        studentId : studentId ,
                        cvUrl : cvUrl
                    }
                });
            });
        }
        catch(err : unknown) {
            if(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
                throw new AppError("You have already applied to this job" , 409) ;
            }
            throw err ;
        }
    }

    async getMyApllications(studentId : string  , pagination : PaginationQuery){

        const {limit , cursor} = pagination ;

        if(cursor) {
            const cursorApllication = await prisma.application.findFirst({
                where : {
                    id : cursor ,
                    studentId : studentId
                } ,
                select : {
                    id : true
                }
            });

            if(!cursorApllication) {
                throw new AppError("Invalid cursor" , 400);
            }
        }

        const rows = await prisma.application.findMany({
            where : {
                studentId : studentId
            } ,
            include : {
                job : true
            } ,
            take : limit + 1 ,
            ...(cursor && { cursor : {id : cursor} , skip : 1}) ,
            orderBy : [
                {createdAt : "desc"} ,
                { id : "desc"}
            ]
        });

        return buildpage(rows , limit) ;
    }

    async getApplicationDetails(studentId : string , applicationId : string){
        const application = await prisma.application.findUnique({
            where : {
                id : applicationId ,
                studentId : studentId
            }
        });

        if(!application) {
            throw new AppError("Application not found" , 404) ;
        }

        return application ;
    }

    async withdrawnApplication(studentId : string , applicationId : string) {
        const application = await prisma.application.findFirst({
            where : {
                id : applicationId ,
                studentId : studentId
            }
        });

        if(!application) {
            throw new AppError("Application not found" , 404);
        }

        if(!WITHDRAWABLE_STATUSES.includes(application.status)) {
            throw new AppError(`Cannot withdraw an application that is ${application.status}` , 409) ;
        }

        const result =  await prisma.application.updateMany({
            where : {
                id : applicationId ,
                studentId : studentId ,
                status : application.status
            } ,
            data : {
                status : ApplicationStatus.withdrawn
            }
        });

        if(result.count === 0) {
            throw new AppError("Application status was changed, please refresh and try again", 409);
        }
    }
}