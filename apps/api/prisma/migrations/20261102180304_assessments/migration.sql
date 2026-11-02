-- CreateEnum
CREATE TYPE "AttemptState" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "ResponseOutcome" AS ENUM ('CORRECT', 'PARTIAL', 'INCORRECT', 'UNANSWERED', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "subject_id" UUID NOT NULL,
    "grade_level_id" UUID,
    "created_by" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "assessment_id" UUID NOT NULL,
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

    CONSTRAINT "assessment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_attempts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "assessment_version_id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "state" "AttemptState" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),
    "score" DOUBLE PRECISION,
    "earned_points" DOUBLE PRECISION,
    "max_points" INTEGER,
    "passed" BOOLEAN,
    "pending_review" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_responses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "item_id" TEXT NOT NULL,
    "question_version_id" UUID NOT NULL,
    "response" JSONB,
    "outcome" "ResponseOutcome",
    "score" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assessment_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessments_tenant_id_subject_id_idx" ON "assessments"("tenant_id", "subject_id");

-- CreateIndex
CREATE INDEX "assessment_versions_tenant_id_state_idx" ON "assessment_versions"("tenant_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_versions_assessment_id_number_key" ON "assessment_versions"("assessment_id", "number");

-- CreateIndex
CREATE INDEX "assessment_attempts_tenant_id_learner_id_assessment_id_idx" ON "assessment_attempts"("tenant_id", "learner_id", "assessment_id");

-- CreateIndex
CREATE INDEX "assessment_attempts_assessment_version_id_idx" ON "assessment_attempts"("assessment_version_id");

-- CreateIndex
CREATE INDEX "assessment_responses_tenant_id_idx" ON "assessment_responses"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_responses_attempt_id_item_id_key" ON "assessment_responses"("attempt_id", "item_id");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_grade_level_id_fkey" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessment_version_id_fkey" FOREIGN KEY ("assessment_version_id") REFERENCES "assessment_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assessment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same guarantees as lesson versions (ADR-013): one published and one in-progress version per
-- assessment, and content frozen once it leaves DRAFT.
CREATE UNIQUE INDEX "assessment_versions_one_published"
  ON "assessment_versions" ("assessment_id") WHERE state = 'PUBLISHED';
CREATE UNIQUE INDEX "assessment_versions_one_open"
  ON "assessment_versions" ("assessment_id") WHERE state IN ('DRAFT', 'IN_REVIEW', 'APPROVED');

CREATE FUNCTION "assessment_version_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
     OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'assessment version identity cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state <> 'DRAFT' AND NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'assessment version % is % and cannot be edited', OLD.id, OLD.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.state = 'ARCHIVED' AND NEW.state <> 'ARCHIVED')
     OR (OLD.state = 'PUBLISHED' AND NEW.state NOT IN ('PUBLISHED', 'ARCHIVED')) THEN
    RAISE EXCEPTION 'assessment version % cannot move from % to %', OLD.id, OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "assessment_versions_guard"
  BEFORE UPDATE ON "assessment_versions"
  FOR EACH ROW EXECUTE FUNCTION "assessment_version_guard"();

-- A learner has at most one open attempt per assessment, so a double tap cannot start two.
CREATE UNIQUE INDEX "assessment_attempts_one_open"
  ON "assessment_attempts" ("learner_id", "assessment_id") WHERE state = 'IN_PROGRESS';

-- An attempt keeps the version it started on, and a submitted attempt never changes (ADR-015).
CREATE FUNCTION "assessment_attempt_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM assessment_versions v
      WHERE v.id = NEW.assessment_version_id AND v.assessment_id = NEW.assessment_id
    ) THEN
      RAISE EXCEPTION 'attempt version does not belong to its assessment'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state = 'SUBMITTED' THEN
    RAISE EXCEPTION 'assessment attempt % is submitted and cannot change', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
     OR NEW.assessment_version_id IS DISTINCT FROM OLD.assessment_version_id
     OR NEW.learner_id IS DISTINCT FROM OLD.learner_id
     OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'assessment attempt identity cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "assessment_attempts_guard"
  BEFORE INSERT OR UPDATE ON "assessment_attempts"
  FOR EACH ROW EXECUTE FUNCTION "assessment_attempt_guard"();

-- Responses are written only while their attempt is open, and keep their question version.
CREATE FUNCTION "assessment_response_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
    OR NEW.item_id IS DISTINCT FROM OLD.item_id
    OR NEW.question_version_id IS DISTINCT FROM OLD.question_version_id
  ) THEN
    RAISE EXCEPTION 'assessment response identity cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM assessment_attempts a WHERE a.id = NEW.attempt_id AND a.state = 'SUBMITTED'
  ) THEN
    RAISE EXCEPTION 'assessment attempt % is submitted and its responses cannot change',
      NEW.attempt_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "assessment_responses_guard"
  BEFORE INSERT OR UPDATE ON "assessment_responses"
  FOR EACH ROW EXECUTE FUNCTION "assessment_response_guard"();

-- Global plus tenant content.
ALTER TABLE "assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessments" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "assessments" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "assessments" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_update ON "assessments" FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "assessment_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_read ON "assessment_versions" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
CREATE POLICY content_insert ON "assessment_versions" FOR INSERT
  WITH CHECK (tenant_id = app_current_tenant());
CREATE POLICY content_update ON "assessment_versions" FOR UPDATE
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

-- Attempts and responses are tenant data. Which learner may see which attempt is a domain
-- policy in the service, since teachers will read their classes' attempts in Stage 8.
ALTER TABLE "assessment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assessment_attempts"
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "assessment_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_responses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "assessment_responses"
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

GRANT SELECT, INSERT, UPDATE
  ON "assessments", "assessment_versions", "assessment_attempts", "assessment_responses"
  TO impulse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "assessments", "assessment_versions" TO impulse_system;
-- The system role crosses tenants for imports, but it cannot delete learners' results.
GRANT SELECT, INSERT, UPDATE ON "assessment_attempts", "assessment_responses" TO impulse_system;
