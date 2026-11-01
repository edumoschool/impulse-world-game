-- CreateEnum
CREATE TYPE "ContentState" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'MULTIPLE_SELECT', 'TRUE_FALSE', 'MATCHING', 'ORDERING', 'DRAG_AND_DROP', 'FILL_IN_BLANK', 'SHORT_TEXT', 'AUDIO_RESPONSE', 'IMAGE_HOTSPOT', 'INTERACTIVE_SCENARIO');

-- CreateTable
CREATE TABLE "question_banks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "subject_id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "bank_id" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "question_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "state" "ContentState" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "author_id" UUID NOT NULL,
    "reviewed_by" UUID,
    "review_note" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "question_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_skills" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "question_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,

    CONSTRAINT "question_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_type" TEXT NOT NULL,
    "version_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "from_state" TEXT NOT NULL,
    "to_state" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_banks_tenant_id_subject_id_idx" ON "question_banks"("tenant_id", "subject_id");

-- CreateIndex
CREATE INDEX "questions_bank_id_idx" ON "questions"("bank_id");

-- CreateIndex
CREATE INDEX "question_versions_tenant_id_state_idx" ON "question_versions"("tenant_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "question_versions_question_id_number_key" ON "question_versions"("question_id", "number");

-- CreateIndex
CREATE INDEX "question_skills_skill_id_idx" ON "question_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_skills_question_id_skill_id_key" ON "question_skills"("question_id", "skill_id");

-- CreateIndex
CREATE INDEX "content_reviews_tenant_id_version_id_idx" ON "content_reviews"("tenant_id", "version_id");

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "question_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_skills" ADD CONSTRAINT "question_skills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_skills" ADD CONSTRAINT "question_skills_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_skills" ADD CONSTRAINT "question_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity that must hold whatever the application does (ADR-013).
-- ---------------------------------------------------------------------------

-- At most one published version per question, and at most one in progress. Prisma leaves
-- partial indexes alone, so these survive future diffs.
CREATE UNIQUE INDEX "question_versions_one_published"
  ON "question_versions" ("question_id") WHERE state = 'PUBLISHED';
CREATE UNIQUE INDEX "question_versions_one_open"
  ON "question_versions" ("question_id") WHERE state IN ('DRAFT', 'IN_REVIEW', 'APPROVED');

-- A version's content is frozen once it leaves DRAFT, and published or archived versions never
-- go back. This is the database's own guarantee that published content is not silently changed.
CREATE FUNCTION "question_version_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.question_id IS DISTINCT FROM OLD.question_id
     OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'question version identity cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state <> 'DRAFT' AND NEW.definition IS DISTINCT FROM OLD.definition THEN
    RAISE EXCEPTION 'question version % is % and cannot be edited', OLD.id, OLD.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.state = 'ARCHIVED' AND NEW.state <> 'ARCHIVED')
     OR (OLD.state = 'PUBLISHED' AND NEW.state NOT IN ('PUBLISHED', 'ARCHIVED')) THEN
    RAISE EXCEPTION 'question version % cannot move from % to %', OLD.id, OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "question_versions_guard"
  BEFORE UPDATE ON "question_versions"
  FOR EACH ROW EXECUTE FUNCTION "question_version_guard"();

-- ---------------------------------------------------------------------------
-- Global plus tenant content: global rows are readable by all and writable by none here.
-- ---------------------------------------------------------------------------

ALTER TABLE "question_banks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_banks" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "question_banks" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "question_banks" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_update ON "question_banks" FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "questions" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "questions" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "questions" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "question_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "question_versions" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "question_versions" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_update ON "question_versions" FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "question_skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_skills" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "question_skills" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "question_skills" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_delete ON "question_skills" FOR DELETE
  USING (tenant_id = app_current_tenant());

-- Review history is strictly tenant data, and append-only.
ALTER TABLE "content_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "content_reviews"
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE ON "question_banks", "question_versions" TO impulse_app;
GRANT SELECT, INSERT ON "questions" TO impulse_app;
GRANT SELECT, INSERT, DELETE ON "question_skills" TO impulse_app;
GRANT SELECT, INSERT ON "content_reviews" TO impulse_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON "question_banks", "questions", "question_versions", "question_skills" TO impulse_system;
-- The system role crosses tenants, but it still cannot rewrite review history.
GRANT SELECT, INSERT ON "content_reviews" TO impulse_system;
