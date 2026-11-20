import { z } from "zod";

export const paginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().uuid().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema> ;

export const buildpage = <T extends {id : string}>(rows: T[] , limit: number) => {
    const hasMore = rows.length > limit ;
    const items = hasMore ? rows.slice(0 , limit) : rows ;

    return {
        items ,
        nextCursor : hasMore ? items[items.length - 1].id : null ,
    }
}