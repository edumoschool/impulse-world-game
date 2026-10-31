-- Prisma cannot represent a NULLS NOT DISTINCT index, so it would have dropped the original in the
-- next generated migration. Uniqueness is now split into two indexes it can track or ignores.

DROP INDEX "user_roles_unique_grant";
DROP INDEX "user_roles_user_id_tenant_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_tenant_id_key" ON "user_roles"("user_id", "role_id", "tenant_id");

-- The index above treats NULLs as distinct, so platform grants (null tenant) need their own.
-- Prisma leaves partial indexes alone, so this one survives future diffs.
CREATE UNIQUE INDEX "user_roles_unique_platform_grant" ON "user_roles" ("user_id", "role_id") WHERE tenant_id IS NULL;
