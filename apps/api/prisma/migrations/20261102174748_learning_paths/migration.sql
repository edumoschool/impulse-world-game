-- CreateTable
CREATE TABLE "learning_paths" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "subject_id" UUID NOT NULL,
    "grade_level_id" UUID,
    "created_by" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_paths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_path_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "learning_path_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "state" "ContentState" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "author_id" UUID NOT NULL,
    "reviewed_by" UUID,
    "review_note" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "learning_path_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_paths_tenant_id_subject_id_idx" ON "learning_paths"("tenant_id", "subject_id");

-- CreateIndex
CREATE INDEX "learning_path_versions_tenant_id_state_idx" ON "learning_path_versions"("tenant_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "learning_path_versions_learning_path_id_number_key" ON "learning_path_versions"("learning_path_id", "number");

-- AddForeignKey
ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_path_versions" ADD CONSTRAINT "learning_path_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_path_versions" ADD CONSTRAINT "learning_path_versions_learning_path_id_fkey" FOREIGN KEY ("learning_path_id") REFERENCES "learning_paths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same guarantees as lesson versions (ADR-013, ADR-014): one published and one in-progress
-- version per path, and content frozen once it leaves DRAFT.
CREATE UNIQUE INDEX "learning_path_versions_one_published"
  ON "learning_path_versions" ("learning_path_id") WHERE state = 'PUBLISHED';
CREATE UNIQUE INDEX "learning_path_versions_one_open"
  ON "learning_path_versions" ("learning_path_id") WHERE state IN ('DRAFT', 'IN_REVIEW', 'APPROVED');

CREATE FUNCTION "learning_path_version_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.learning_path_id IS DISTINCT FROM OLD.learning_path_id
     OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'learning path version identity cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state <> 'DRAFT' AND NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'learning path version % is % and cannot be edited', OLD.id, OLD.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.state = 'ARCHIVED' AND NEW.state <> 'ARCHIVED')
     OR (OLD.state = 'PUBLISHED' AND NEW.state NOT IN ('PUBLISHED', 'ARCHIVED')) THEN
    RAISE EXCEPTION 'learning path version % cannot move from % to %', OLD.id, OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "learning_path_versions_guard"
  BEFORE UPDATE ON "learning_path_versions"
  FOR EACH ROW EXECUTE FUNCTION "learning_path_version_guard"();

-- Global plus tenant content.
ALTER TABLE "learning_paths" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_paths" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "learning_paths" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "learning_paths" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_update ON "learning_paths" FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "learning_path_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_path_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "learning_path_versions" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "learning_path_versions" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_update ON "learning_path_versions" FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE ON "learning_paths", "learning_path_versions" TO impulse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "learning_paths", "learning_path_versions" TO impulse_system;
