-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "code" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_levels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "code" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "rank" INTEGER NOT NULL,
    "min_age" INTEGER NOT NULL,
    "max_age" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "subject_id" UUID NOT NULL,
    "grade_level_id" UUID,
    "code" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_dependencies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "skill_id" UUID NOT NULL,
    "prerequisite_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_code_key" ON "subjects"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "grade_levels_tenant_id_code_key" ON "grade_levels"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "skills_subject_id_idx" ON "skills"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_tenant_id_code_key" ON "skills"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "skill_dependencies_prerequisite_id_idx" ON "skill_dependencies"("prerequisite_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_dependencies_skill_id_prerequisite_id_key" ON "skill_dependencies"("skill_id", "prerequisite_id");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_dependencies" ADD CONSTRAINT "skill_dependencies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_dependencies" ADD CONSTRAINT "skill_dependencies_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_dependencies" ADD CONSTRAINT "skill_dependencies_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Global plus tenant content (ADR-013, docs/architecture/tenancy.md).
-- A null tenant_id is platform content: every tenant reads it, and the request role cannot
-- create, change or remove it. Only the reviewed seed writes it, through the system role.
-- ---------------------------------------------------------------------------

-- The (tenant_id, code) indexes treat NULLs as distinct, so global codes need their own.
-- Prisma leaves partial indexes alone, so these survive future diffs.
CREATE UNIQUE INDEX "subjects_global_code_key" ON "subjects" ("code") WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX "grade_levels_global_code_key" ON "grade_levels" ("code") WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX "skills_global_code_key" ON "skills" ("code") WHERE tenant_id IS NULL;

ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "subjects" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "subjects" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_update ON "subjects" FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "grade_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_levels" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "grade_levels" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());

ALTER TABLE "skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "skills" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "skills" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "skills" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_update ON "skills" FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "skill_dependencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "skill_dependencies" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "skill_dependencies" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "skill_dependencies" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_delete ON "skill_dependencies" FOR DELETE
  USING (tenant_id = app_current_tenant());

-- Grade levels are reference data from the seed, so the request role only reads them.
GRANT SELECT ON "grade_levels" TO impulse_app;
GRANT SELECT, INSERT, UPDATE ON "subjects", "skills" TO impulse_app;
GRANT SELECT, INSERT, DELETE ON "skill_dependencies" TO impulse_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON "subjects", "grade_levels", "skills", "skill_dependencies" TO impulse_system;
