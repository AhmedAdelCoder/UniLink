-- Prevent users from connecting to themselves
ALTER TABLE "connections"
ADD CONSTRAINT "connections_users_different"
CHECK ("requester_id" <> "receiver_id");

-- Prevent duplicate active connections regardless of direction
CREATE UNIQUE INDEX "connections_pair_idx"
ON "connections" (
    LEAST("requester_id", "receiver_id"),
    GREATEST("requester_id", "receiver_id")
)
WHERE "status" <> 'rejected'
  AND "status" <> 'removed';