-- CreateTable
CREATE TABLE "user_mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_mfa_recovery_codes_code_hash_key" ON "user_mfa_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "user_mfa_recovery_codes_user_id_idx" ON "user_mfa_recovery_codes"("user_id");

-- AddForeignKey
ALTER TABLE "user_mfa_recovery_codes" ADD CONSTRAINT "user_mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Platform-global identity data, like user_mfa_factors: no tenant, so no row-level security.
-- The runtime role may delete here, because turning MFA off or issuing a new set removes codes.
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_mfa_recovery_codes" TO impulse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_mfa_recovery_codes" TO impulse_system;

-- Turning MFA off removes the factor, so the runtime role needs DELETE on it too.
GRANT DELETE ON "user_mfa_factors" TO impulse_app;
