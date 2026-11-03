-- CreateEnum
CREATE TYPE "MasteryLevel" AS ENUM ('NOT_STARTED', 'INTRODUCED', 'PRACTICING', 'DEVELOPING', 'PROFICIENT', 'MASTERED');

-- CreateTable
CREATE TABLE "lesson_completions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "lesson_version_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_observations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "source_item" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_mastery" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "level" "MasteryLevel" NOT NULL,
    "observation_count" INTEGER NOT NULL,
    "recent_accuracy" DOUBLE PRECISION NOT NULL,
    "last_observed_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "skill_mastery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_completions_tenant_id_learner_id_lesson_id_idx" ON "lesson_completions"("tenant_id", "learner_id", "lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_completions_learner_id_lesson_version_id_key" ON "lesson_completions"("learner_id", "lesson_version_id");

-- CreateIndex
CREATE INDEX "skill_observations_tenant_id_learner_id_skill_id_observed_a_idx" ON "skill_observations"("tenant_id", "learner_id", "skill_id", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "skill_observations_source_item_skill_id_key" ON "skill_observations"("source_item", "skill_id");

-- CreateIndex
CREATE INDEX "skill_mastery_tenant_id_learner_id_idx" ON "skill_mastery"("tenant_id", "learner_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_mastery_learner_id_skill_id_key" ON "skill_mastery"("learner_id", "skill_id");

-- AddForeignKey
ALTER TABLE "lesson_completions" ADD CONSTRAINT "lesson_completions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_observations" ADD CONSTRAINT "skill_observations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Evidence is append-only (ADR-016). Mastery is a derived summary and may be rewritten.
CREATE FUNCTION "progress_evidence_is_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be changed or removed', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "lesson_completions_append_only"
  BEFORE UPDATE OR DELETE ON "lesson_completions"
  FOR EACH ROW EXECUTE FUNCTION "progress_evidence_is_append_only"();
CREATE TRIGGER "skill_observations_append_only"
  BEFORE UPDATE OR DELETE ON "skill_observations"
  FOR EACH ROW EXECUTE FUNCTION "progress_evidence_is_append_only"();

ALTER TABLE "skill_observations" ADD CONSTRAINT "skill_observations_score_range"
  CHECK (score >= 0 AND score <= 1);
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_accuracy_range"
  CHECK (recent_accuracy >= 0 AND recent_accuracy <= 1 AND observation_count >= 0);

ALTER TABLE "lesson_completions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lesson_completions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lesson_completions"
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "skill_observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "skill_observations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "skill_observations"
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE "skill_mastery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "skill_mastery" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "skill_mastery"
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

GRANT SELECT, INSERT ON "lesson_completions", "skill_observations" TO impulse_app, impulse_system;
GRANT SELECT, INSERT, UPDATE ON "skill_mastery" TO impulse_app, impulse_system;
