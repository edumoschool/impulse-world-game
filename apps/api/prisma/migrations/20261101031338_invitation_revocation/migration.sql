-- AlterTable
ALTER TABLE "organization_invitations" ADD COLUMN     "revoked_at" TIMESTAMPTZ(6);

-- Expand only: a nullable column with no default, safe while older code is still running.
-- The table keeps its existing RLS policy and grants, which already include UPDATE.
