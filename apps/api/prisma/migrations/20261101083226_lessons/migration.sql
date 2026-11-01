-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "subject_id" UUID NOT NULL,
    "grade_level_id" UUID,
    "created_by" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "lesson_id" UUID NOT NULL,
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

    CONSTRAINT "lesson_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lessons_tenant_id_subject_id_idx" ON "lessons"("tenant_id", "subject_id");

-- CreateIndex
CREATE INDEX "lesson_versions_tenant_id_state_idx" ON "lesson_versions"("tenant_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_versions_lesson_id_number_key" ON "lesson_versions"("lesson_id", "number");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same guarantees as question versions (ADR-013): one published and one in-progress version per
-- lesson, and content frozen once it leaves DRAFT.
CREATE UNIQUE INDEX "lesson_versions_one_published"
  ON "lesson_versions" ("lesson_id") WHERE state = 'PUBLISHED';
CREATE UNIQUE INDEX "lesson_versions_one_open"
  ON "lesson_versions" ("lesson_id") WHERE state IN ('DRAFT', 'IN_REVIEW', 'APPROVED');

CREATE FUNCTION "lesson_version_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id
     OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'lesson version identity cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state <> 'DRAFT' AND NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'lesson version % is % and cannot be edited', OLD.id, OLD.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.state = 'ARCHIVED' AND NEW.state <> 'ARCHIVED')
     OR (OLD.state = 'PUBLISHED' AND NEW.state NOT IN ('PUBLISHED', 'ARCHIVED')) THEN
    RAISE EXCEPTION 'lesson version % cannot move from % to %', OLD.id, OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "lesson_versions_guard"
  BEFORE UPDATE ON "lesson_versions"
  FOR EACH ROW EXECUTE FUNCTION "lesson_version_guard"();

-- Global plus tenant content.
ALTER TABLE "lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lessons" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "lessons" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "lessons" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_update ON "lessons" FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "lesson_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "lesson_versions" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "lesson_versions" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_update ON "lesson_versions" FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE ON "lessons", "lesson_versions" TO impulse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lessons", "lesson_versions" TO impulse_system;
