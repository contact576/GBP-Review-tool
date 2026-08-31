/**
 * Idempotent schema DDL — generated from lib/db/schema.ts via drizzle-kit,
 * transformed to IF NOT EXISTS so it can run safely on every setup attempt.
 * Regenerate after schema changes: npx drizzle-kit generate, then re-transform.
 */
export const SCHEMA_STATEMENTS: string[] = [
  "CREATE TABLE IF NOT EXISTS \"monitoring_run\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"window_key\" text NOT NULL,\n\t\"trigger\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"attempts\" integer DEFAULT 0 NOT NULL,\n\t\"summary\" jsonb,\n\t\"started_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL,\n\t\"completed_at\" text,\n\t\"last_error\" text\n);",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"monitoring_run_workspace_window_uq\" ON \"monitoring_run\" USING btree (\"workspace_id\",\"window_key\");",
  "CREATE TABLE IF NOT EXISTS \"content_publishing_job\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"suggestion_id\" text NOT NULL,\n\t\"asset_id\" text,\n\t\"idempotency_key\" text NOT NULL,\n\t\"kind\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"exact_payload\" jsonb NOT NULL,\n\t\"provider_response\" jsonb,\n\t\"provider_resource_name\" text,\n\t\"verified_value\" jsonb,\n\t\"attempts\" integer DEFAULT 0 NOT NULL,\n\t\"approved_at\" text NOT NULL,\n\t\"approved_by\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL,\n\t\"started_at\" text,\n\t\"published_at\" text,\n\t\"failed_at\" text,\n\t\"last_error\" text\n);",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"content_publishing_job_idempotency_uq\" ON \"content_publishing_job\" USING btree (\"idempotency_key\");",
  "CREATE TABLE IF NOT EXISTS \"ai_content_asset\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"suggestion_id\" text NOT NULL,\n\t\"kind\" text NOT NULL,\n\t\"mime_type\" text NOT NULL,\n\t\"base64_data\" text NOT NULL,\n\t\"prompt\" text NOT NULL,\n\t\"alt_text\" text NOT NULL,\n\t\"model\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL\n);",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"ai_content_asset_suggestion_uq\" ON \"ai_content_asset\" USING btree (\"workspace_id\",\"suggestion_id\");",
  "CREATE TABLE IF NOT EXISTS \"app_user\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"email\" text NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"role\" text NOT NULL,\n\t\"two_factor_enabled\" boolean NOT NULL,\n\t\"avatar_initials\" text NOT NULL,\n\t\"password_hash\" text,\n\t\"email_verified\" boolean DEFAULT false NOT NULL,\n\t\"google_sub\" text,\n\t\"created_at\" text\n);",
  "CREATE TABLE IF NOT EXISTS \"password_reset_token\" (\n\t\"token_hash\" text PRIMARY KEY NOT NULL,\n\t\"user_id\" text NOT NULL,\n\t\"expires_at\" text NOT NULL,\n\t\"used_at\" text,\n\t\"created_at\" text NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"audit_log\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"actor\" text NOT NULL,\n\t\"action\" text NOT NULL,\n\t\"target_type\" text NOT NULL,\n\t\"target_id\" text NOT NULL,\n\t\"at\" text NOT NULL,\n\t\"meta\" jsonb,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"campaign\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"type\" text NOT NULL,\n\t\"is_automation\" boolean NOT NULL,\n\t\"consent_basis\" text NOT NULL,\n\t\"channel\" text NOT NULL,\n\t\"subject\" text,\n\t\"body\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"scheduled_at\" text,\n\t\"audience_total\" integer NOT NULL,\n\t\"audience_consented\" integer NOT NULL,\n\t\"excluded\" jsonb NOT NULL,\n\t\"stats\" jsonb NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"customer\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"email\" text,\n\t\"phone\" text,\n\t\"created_at\" text NOT NULL,\n\t\"source\" text NOT NULL,\n\t\"staff_id\" text,\n\t\"visit_count\" integer NOT NULL,\n\t\"last_visit_at\" text,\n\t\"last_request_at\" text,\n\t\"services\" jsonb NOT NULL,\n\t\"sentiment\" text,\n\t\"lifecycle_stage\" text NOT NULL,\n\t\"suppressed_reason\" text,\n\t\"tags\" jsonb NOT NULL,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"customer_consent\" (\n\t\"customer_id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"service_consent\" boolean NOT NULL,\n\t\"service_consent_at\" text,\n\t\"marketing_consent\" boolean NOT NULL,\n\t\"marketing_consent_at\" text,\n\t\"consent_channel\" text NOT NULL,\n\t\"consent_source_text\" text NOT NULL,\n\t\"casl_captured\" boolean NOT NULL,\n\t\"withdrawn_at\" text\n);",
  "CREATE TABLE IF NOT EXISTS \"dataset_meta\" (\n\t\"workspace_id\" text PRIMARY KEY NOT NULL,\n\t\"metrics\" jsonb NOT NULL,\n\t\"competitors\" jsonb NOT NULL,\n\t\"aeo\" jsonb NOT NULL,\n\t\"rank_scans\" jsonb NOT NULL,\n\t\"qr_assets\" jsonb NOT NULL,\n\t\"widgets\" jsonb NOT NULL,\n\t\"milestones\" jsonb NOT NULL,\n\t\"suppression\" jsonb NOT NULL,\n\t\"integrations\" jsonb NOT NULL,\n\t\"feature_flags\" jsonb NOT NULL,\n\t\"invoices\" jsonb NOT NULL,\n\t\"reports\" jsonb NOT NULL,\n\t\"agency\" jsonb NOT NULL,\n\t\"platform\" jsonb NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"gbp_task\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"iso_week\" text NOT NULL,\n\t\"kind\" text NOT NULL,\n\t\"title\" text NOT NULL,\n\t\"rationale\" text NOT NULL,\n\t\"preview\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"impact\" text NOT NULL,\n\t\"effort_mins\" integer NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"location\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"category\" text NOT NULL,\n\t\"vertical\" text NOT NULL,\n\t\"address\" text NOT NULL,\n\t\"city\" text NOT NULL,\n\t\"region\" text NOT NULL,\n\t\"timezone\" text NOT NULL,\n\t\"google_place_id\" text,\n\t\"review_url\" text NOT NULL,\n\t\"rating\" double precision NOT NULL,\n\t\"review_count\" integer NOT NULL,\n\t\"joined_at\" text NOT NULL,\n\t\"gbp_connected\" boolean NOT NULL,\n\t\"profile_description\" text NOT NULL,\n\t\"profile_primary_category\" text NOT NULL,\n\t\"profile_secondary_categories\" jsonb NOT NULL,\n\t\"profile_photo_count\" integer NOT NULL,\n\t\"profile_post_count\" integer NOT NULL,\n\t\"profile_qna_count\" integer NOT NULL,\n\t\"profile_hours_set\" boolean NOT NULL,\n\t\"profile_holiday_hours_set\" boolean NOT NULL,\n\t\"profile_services_with_descriptions\" integer NOT NULL,\n\t\"profile_services_total\" integer NOT NULL,\n\t\"profile_response_rate\" double precision NOT NULL,\n\t\"profile_completeness\" double precision NOT NULL,\n\t\"gbp_snapshot\" jsonb,\n\t\"gbp_audit\" jsonb,\n\t\"suggestion_inbox\" jsonb\n);",
  "CREATE TABLE IF NOT EXISTS \"notification\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"kind\" text NOT NULL,\n\t\"title\" text NOT NULL,\n\t\"body\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"read\" boolean NOT NULL,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"organization\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"legal_name\" text NOT NULL,\n\t\"region\" text NOT NULL,\n\t\"org_type\" text NOT NULL,\n\t\"billing_email\" text NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"private_feedback\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"customer_name\" text NOT NULL,\n\t\"rating\" integer NOT NULL,\n\t\"text\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"resolved\" boolean NOT NULL,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"qr_asset\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"scope\" text NOT NULL,\n\t\"staff_id\" text,\n\t\"label\" text NOT NULL,\n\t\"slug\" text NOT NULL,\n\t\"target_url\" text NOT NULL,\n\t\"scans\" integer DEFAULT 0 NOT NULL,\n\t\"page_opens\" integer DEFAULT 0 NOT NULL,\n\t\"degraded\" boolean DEFAULT false NOT NULL,\n\t\"seq\" integer\n);",
  "CREATE TABLE IF NOT EXISTS \"review\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"author\" text NOT NULL,\n\t\"rating\" integer NOT NULL,\n\t\"text\" text NOT NULL,\n\t\"published_at\" text NOT NULL,\n\t\"source\" text NOT NULL,\n\t\"durability\" text NOT NULL,\n\t\"vanished_at\" text,\n\t\"matched_request_id\" text,\n\t\"match_confidence\" double precision,\n\t\"needs_reply\" boolean NOT NULL,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"review_draft\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text,\n\t\"request_id\" text,\n\t\"review_id\" text,\n\t\"kind\" text NOT NULL,\n\t\"variants\" jsonb NOT NULL,\n\t\"approved_variant_index\" integer,\n\t\"generated_by\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"review_reply\" (\n\t\"review_id\" text PRIMARY KEY NOT NULL,\n\t\"id\" text NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"text\" text NOT NULL,\n\t\"tone\" text NOT NULL,\n\t\"source\" text NOT NULL,\n\t\"posted_at\" text NOT NULL,\n\t\"approved_by\" text NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"review_request\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"customer_id\" text NOT NULL,\n\t\"customer_name\" text NOT NULL,\n\t\"staff_id\" text,\n\t\"channel\" text NOT NULL,\n\t\"token\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"is_test\" boolean NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"sent_at\" text,\n\t\"opened_at\" text,\n\t\"clicked_at\" text,\n\t\"rating\" integer,\n\t\"attributes\" jsonb NOT NULL,\n\t\"private_feedback\" text,\n\t\"suppressed_reason\" text,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"staff_invite\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"email\" text NOT NULL,\n\t\"role\" text NOT NULL,\n\t\"token\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"staff_member\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"display_name\" text NOT NULL,\n\t\"role\" text NOT NULL,\n\t\"qr_token\" text NOT NULL,\n\t\"active\" boolean NOT NULL,\n\t\"streak_days\" integer NOT NULL,\n\t\"captures\" integer NOT NULL,\n\t\"detected_reviews\" integer NOT NULL,\n\t\"last_active_at\" text,\n\t\"avatar_initials\" text NOT NULL,\n\t\"seq\" double precision NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"subscription\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"tier\" text NOT NULL,\n\t\"interval\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"trial_ends_at\" text,\n\t\"currency\" text NOT NULL,\n\t\"stripe_customer_id\" text,\n\t\"stripe_subscription_id\" text,\n\t\"stripe_price_id\" text,\n\t\"current_period_end\" text,\n\t\"cancel_at_period_end\" boolean,\n\t\"usage\" jsonb NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"workspace\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"organization_id\" text NOT NULL,\n\t\"name\" text NOT NULL,\n\t\"vertical\" text NOT NULL,\n\t\"region\" text NOT NULL,\n\t\"timezone\" text NOT NULL,\n\t\"plan\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"white_label\" jsonb,\n\t\"industry_config\" jsonb,\n\t\"settings\" jsonb,\n\t\"is_demo\" boolean DEFAULT false NOT NULL,\n\t\"referred_by_workspace_id\" text,\n\t\"referral_reward_status\" text,\n\t\"referral_reward_applied_at\" text\n);",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"qr_asset_slug_uq\" ON \"qr_asset\" USING btree (\"slug\");",
  "CREATE TABLE IF NOT EXISTS \"google_credential\" (\n\t\"workspace_id\" text PRIMARY KEY NOT NULL,\n\t\"encrypted_refresh_token\" text NOT NULL,\n\t\"google_account\" text,\n\t\"scopes\" text NOT NULL,\n\t\"connected_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"email_credential\" (\n\t\"workspace_id\" text PRIMARY KEY NOT NULL,\n\t\"provider\" text NOT NULL,\n\t\"encrypted_secret\" text NOT NULL,\n\t\"from_email\" text NOT NULL,\n\t\"from_name\" text,\n\t\"reply_to\" text,\n\t\"smtp_host\" text,\n\t\"smtp_port\" integer,\n\t\"smtp_user\" text,\n\t\"smtp_secure\" boolean,\n\t\"verified_at\" text,\n\t\"last_error\" text,\n\t\"created_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"instagram_credential\" (\n\t\"workspace_id\" text PRIMARY KEY NOT NULL,\n\t\"encrypted_access_token\" text NOT NULL,\n\t\"account_id\" text NOT NULL,\n\t\"username\" text,\n\t\"scopes\" text NOT NULL,\n\t\"expires_at\" text,\n\t\"connected_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"profile_mutation_job\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"suggestion_id\" text NOT NULL,\n\t\"idempotency_key\" text NOT NULL,\n\t\"target\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"update_mask\" jsonb NOT NULL,\n\t\"before_value\" jsonb,\n\t\"proposed_value\" jsonb NOT NULL,\n\t\"provider_response\" jsonb,\n\t\"verified_value\" jsonb,\n\t\"rollback_value\" jsonb,\n\t\"attempts\" integer DEFAULT 0 NOT NULL,\n\t\"approved_at\" text NOT NULL,\n\t\"approved_by\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL,\n\t\"started_at\" text,\n\t\"applied_at\" text,\n\t\"failed_at\" text,\n\t\"last_error\" text\n);",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"profile_mutation_job_idempotency_uq\" ON \"profile_mutation_job\" USING btree (\"idempotency_key\");"
];

/**
 * Additive statements that must run even on databases initialized by an earlier
 * schema (the fast-path in ensureSchema() skips the full list once core tables
 * exist). All are IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to run every
 * cold start. New additive migrations go here so existing tenants self-heal.
 */
export const ADDITIVE_STATEMENTS: string[] = [
  "CREATE TABLE IF NOT EXISTS \"monitoring_run\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"window_key\" text NOT NULL,\n\t\"trigger\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"attempts\" integer DEFAULT 0 NOT NULL,\n\t\"summary\" jsonb,\n\t\"started_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL,\n\t\"completed_at\" text,\n\t\"last_error\" text\n);",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"monitoring_run_workspace_window_uq\" ON \"monitoring_run\" USING btree (\"workspace_id\",\"window_key\");",
  "CREATE TABLE IF NOT EXISTS \"content_publishing_job\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"suggestion_id\" text NOT NULL,\n\t\"asset_id\" text,\n\t\"idempotency_key\" text NOT NULL,\n\t\"kind\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"exact_payload\" jsonb NOT NULL,\n\t\"provider_response\" jsonb,\n\t\"provider_resource_name\" text,\n\t\"verified_value\" jsonb,\n\t\"attempts\" integer DEFAULT 0 NOT NULL,\n\t\"approved_at\" text NOT NULL,\n\t\"approved_by\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL,\n\t\"started_at\" text,\n\t\"published_at\" text,\n\t\"failed_at\" text,\n\t\"last_error\" text\n);",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"content_publishing_job_idempotency_uq\" ON \"content_publishing_job\" USING btree (\"idempotency_key\");",
  "CREATE TABLE IF NOT EXISTS \"ai_content_asset\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"suggestion_id\" text NOT NULL,\n\t\"kind\" text NOT NULL,\n\t\"mime_type\" text NOT NULL,\n\t\"base64_data\" text NOT NULL,\n\t\"prompt\" text NOT NULL,\n\t\"alt_text\" text NOT NULL,\n\t\"model\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL\n);",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"ai_content_asset_suggestion_uq\" ON \"ai_content_asset\" USING btree (\"workspace_id\",\"suggestion_id\");",
  "CREATE TABLE IF NOT EXISTS \"google_credential\" (\n\t\"workspace_id\" text PRIMARY KEY NOT NULL,\n\t\"encrypted_refresh_token\" text NOT NULL,\n\t\"google_account\" text,\n\t\"scopes\" text NOT NULL,\n\t\"connected_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"email_credential\" (\n\t\"workspace_id\" text PRIMARY KEY NOT NULL,\n\t\"provider\" text NOT NULL,\n\t\"encrypted_secret\" text NOT NULL,\n\t\"from_email\" text NOT NULL,\n\t\"from_name\" text,\n\t\"reply_to\" text,\n\t\"smtp_host\" text,\n\t\"smtp_port\" integer,\n\t\"smtp_user\" text,\n\t\"smtp_secure\" boolean,\n\t\"verified_at\" text,\n\t\"last_error\" text,\n\t\"created_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"instagram_credential\" (\n\t\"workspace_id\" text PRIMARY KEY NOT NULL,\n\t\"encrypted_access_token\" text NOT NULL,\n\t\"account_id\" text NOT NULL,\n\t\"username\" text,\n\t\"scopes\" text NOT NULL,\n\t\"expires_at\" text,\n\t\"connected_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS \"password_reset_token\" (\n\t\"token_hash\" text PRIMARY KEY NOT NULL,\n\t\"user_id\" text NOT NULL,\n\t\"expires_at\" text NOT NULL,\n\t\"used_at\" text,\n\t\"created_at\" text NOT NULL\n);",
  "ALTER TABLE \"app_user\" ADD COLUMN IF NOT EXISTS \"session_version\" integer DEFAULT 0 NOT NULL;",
  // Duplicate-account prevention was application-only, so two concurrent
  // registrations for the same address could both pass the pre-insert check and
  // create two authenticatable accounts. This enforces it in the database.
  //
  // PARTIAL and on lower(email), to match findUserRowByEmail exactly: adding a
  // second location under one organization legitimately inserts another app_user
  // row with the owner's email and NULL credentials, and those rows are excluded
  // from every auth lookup — so they must stay excluded here too.
  "CREATE UNIQUE INDEX IF NOT EXISTS \"app_user_credentialed_email_uq\" ON \"app_user\" (lower(\"email\")) WHERE \"password_hash\" IS NOT NULL OR \"google_sub\" IS NOT NULL;",
  "ALTER TABLE \"subscription\" ADD COLUMN IF NOT EXISTS \"stripe_customer_id\" text;",
  "ALTER TABLE \"subscription\" ADD COLUMN IF NOT EXISTS \"stripe_subscription_id\" text;",
  "ALTER TABLE \"subscription\" ADD COLUMN IF NOT EXISTS \"stripe_price_id\" text;",
  "ALTER TABLE \"subscription\" ADD COLUMN IF NOT EXISTS \"current_period_end\" text;",
  "ALTER TABLE \"subscription\" ADD COLUMN IF NOT EXISTS \"cancel_at_period_end\" boolean;",
  "ALTER TABLE \"workspace\" ADD COLUMN IF NOT EXISTS \"referred_by_workspace_id\" text;",
  "ALTER TABLE \"workspace\" ADD COLUMN IF NOT EXISTS \"referral_reward_status\" text;",
  "ALTER TABLE \"workspace\" ADD COLUMN IF NOT EXISTS \"referral_reward_applied_at\" text;",
  "ALTER TABLE \"location\" ADD COLUMN IF NOT EXISTS \"gbp_snapshot\" jsonb;",
  "ALTER TABLE \"location\" ADD COLUMN IF NOT EXISTS \"gbp_audit\" jsonb;",
  "ALTER TABLE \"location\" ADD COLUMN IF NOT EXISTS \"suggestion_inbox\" jsonb;",
  "ALTER TABLE \"location\" ADD COLUMN IF NOT EXISTS \"website\" text;",
  "ALTER TABLE \"location\" ADD COLUMN IF NOT EXISTS \"owner_description\" text;",
  "CREATE TABLE IF NOT EXISTS \"profile_mutation_job\" (\n\t\"id\" text PRIMARY KEY NOT NULL,\n\t\"workspace_id\" text NOT NULL,\n\t\"location_id\" text NOT NULL,\n\t\"suggestion_id\" text NOT NULL,\n\t\"idempotency_key\" text NOT NULL,\n\t\"target\" text NOT NULL,\n\t\"status\" text NOT NULL,\n\t\"update_mask\" jsonb NOT NULL,\n\t\"before_value\" jsonb,\n\t\"proposed_value\" jsonb NOT NULL,\n\t\"provider_response\" jsonb,\n\t\"verified_value\" jsonb,\n\t\"rollback_value\" jsonb,\n\t\"attempts\" integer DEFAULT 0 NOT NULL,\n\t\"approved_at\" text NOT NULL,\n\t\"approved_by\" text NOT NULL,\n\t\"created_at\" text NOT NULL,\n\t\"updated_at\" text NOT NULL,\n\t\"started_at\" text,\n\t\"applied_at\" text,\n\t\"failed_at\" text,\n\t\"last_error\" text\n);",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"profile_mutation_job_idempotency_uq\" ON \"profile_mutation_job\" USING btree (\"idempotency_key\");",

  // Tenant-scoping indexes. Every one of the ~21 queries getData() fans out
  // filters on workspace_id and most then sort by seq — with no index that is a
  // sequential scan plus a sort, per table, per page load. Harmless today at low
  // row counts, but it degrades linearly with total customers and review/
  // audit_log are the first to hurt. Composite (workspace_id, seq) so the sort
  // is satisfied by the index too.
  //
  // Deliberately NOT `CONCURRENTLY`: these run inside ensureSchema's batched
  // transaction, and CREATE INDEX CONCURRENTLY cannot run in a transaction
  // block. On a fresh/small table the exclusive lock is momentary; on a large
  // existing table, create them by hand with CONCURRENTLY first — the
  // IF NOT EXISTS here then becomes a no-op.
  "CREATE INDEX IF NOT EXISTS \"review_ws_seq_idx\" ON \"review\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"review_request_ws_seq_idx\" ON \"review_request\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"customer_ws_seq_idx\" ON \"customer\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"audit_log_ws_seq_idx\" ON \"audit_log\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"notification_ws_seq_idx\" ON \"notification\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"staff_member_ws_seq_idx\" ON \"staff_member\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"review_draft_ws_seq_idx\" ON \"review_draft\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"gbp_task_ws_seq_idx\" ON \"gbp_task\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"campaign_ws_seq_idx\" ON \"campaign\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"private_feedback_ws_seq_idx\" ON \"private_feedback\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"qr_asset_ws_seq_idx\" ON \"qr_asset\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"staff_invite_ws_seq_idx\" ON \"staff_invite\" (\"workspace_id\",\"seq\");",
  "CREATE INDEX IF NOT EXISTS \"location_ws_idx\" ON \"location\" (\"workspace_id\");",
  "CREATE INDEX IF NOT EXISTS \"subscription_ws_idx\" ON \"subscription\" (\"workspace_id\");",
  "CREATE INDEX IF NOT EXISTS \"dataset_meta_ws_idx\" ON \"dataset_meta\" (\"workspace_id\");",
  "CREATE INDEX IF NOT EXISTS \"customer_consent_ws_idx\" ON \"customer_consent\" (\"workspace_id\");",
  "CREATE INDEX IF NOT EXISTS \"review_reply_ws_idx\" ON \"review_reply\" (\"workspace_id\");",
  "CREATE INDEX IF NOT EXISTS \"app_user_ws_role_idx\" ON \"app_user\" (\"workspace_id\",\"role\");",
  "CREATE INDEX IF NOT EXISTS \"workspace_org_idx\" ON \"workspace\" (\"organization_id\");",
];

// ───────────────────────────────────────────────────────────────────────────
// Row Level Security (tenant isolation)
// ───────────────────────────────────────────────────────────────────────────

/**
 * DATABASE-ENFORCED TENANT ISOLATION — DESIGN NOTES
 *
 * Today multi-tenant isolation is enforced *only* by application code
 * remembering to add `WHERE workspace_id = ...`. One forgotten predicate leaks
 * another tenant's customer list. These statements add a second, independent
 * line of defence inside Postgres itself.
 *
 * ── The predicate ──────────────────────────────────────────────────────────
 * Each tenant-scoped table gets a policy allowing only rows whose tenant key is
 * a member of the per-connection GUC `app.workspace_ids` (a comma-separated
 * list, so agency users legitimately holding several workspaces still work):
 *
 *   <tenant_col> = ANY (string_to_array(current_setting('app.workspace_ids', true), ','))
 *
 * It FAILS CLOSED by construction:
 *   - GUC unset  -> current_setting(..., true) returns NULL
 *                -> string_to_array(NULL, ',') is NULL
 *                -> `x = ANY(NULL)` is NULL, which is not TRUE, so no row passes.
 *   - GUC empty  -> string_to_array('', ',') is {''} which matches no real id.
 * A caller that forgets to set the scope therefore sees ZERO rows, never
 * another tenant's rows. That is the whole point: the failure mode is a loud,
 * obvious empty result rather than a silent cross-tenant leak.
 *
 * The list is split on a bare comma with no whitespace tolerance. lib/db/rls.ts
 * is responsible for normalising and validating ids before they reach the GUC
 * (it rejects any id containing a comma or whitespace), which keeps the
 * per-row policy expression cheap.
 *
 * ── The two bypass paths (both deliberate, one removable) ──────────────────
 * 1. ROLE BYPASS (strong, permanent, for migrations/DDL).
 *    Postgres does not apply RLS to a table's OWNER, nor to any role with the
 *    BYPASSRLS attribute, UNLESS the table is also marked FORCE ROW LEVEL
 *    SECURITY. On Neon the app usually connects as `neondb_owner`, which *is*
 *    the table owner. This is the single most important fact about this
 *    rollout, and it is what makes it safe:
 *
 *      => Applying RLS_POLICY_STATEMENTS alone is INERT for the table owner.
 *         Policies exist and are inspectable, but nothing is enforced yet.
 *      => RLS_FORCE_STATEMENTS is the actual switch that begins enforcement.
 *
 *    Run migrations and platform-admin work as the table owner (or a BYPASSRLS
 *    role) and they keep working with FORCE on... no: FORCE applies to the
 *    owner too. A BYPASSRLS role still bypasses. See ROLLOUT step 5.
 *
 * 2. GUC BYPASS (weak, temporary, REMOVABLE — this is the escape hatch).
 *    A second permissive policy `foundly_admin_bypass` passes any row when the
 *    connection sets `app.bypass_rls = 'on'`. Permissive policies are OR'd, so
 *    this re-opens the table for a connection that opts in. It exists so the
 *    rollout can be reversed instantly without DDL, and so cross-tenant code
 *    paths (login by email, public token lookups, cron sweeps) can be migrated
 *    one at a time instead of all at once. It is NOT a security boundary:
 *    anyone who can run SQL can set the GUC. RLS_DROP_BYPASS_STATEMENTS
 *    removes it, and doing so is the final step of the rollout.
 *
 * ── ROLLOUT ORDER (do not skip a verify) ──────────────────────────────────
 *   1. APPLY POLICIES.  Run RLS_POLICY_STATEMENTS. Enables RLS + creates both
 *      policies. Inert while the app connects as the table owner. Behaviour is
 *      unchanged. Safe to re-run.
 *   2. VERIFY INERT.    Run RLS_STATUS_QUERY: every tenant table should show
 *      rls_enabled = true, rls_forced = false, policy_count = 2. Run
 *      RLS_CURRENT_ROLE_QUERY and confirm the app role owns the tables (or has
 *      BYPASSRLS). Confirm the live app still behaves identically.
 *   3. TEACH CALLERS.   Set FOUNDLY_ENABLE_RLS=1 so lib/db/rls.ts starts
 *      wrapping units of work in a scoped transaction (see rls.ts — this
 *      requires callers to route through runInWorkspaceScope; a plain
 *      `getDb()` query CANNOT carry the GUC, see the driver note in rls.ts).
 *      Still inert at the DB, so a mistake here cannot leak or blank data.
 *   4. ENFORCE.         Run RLS_FORCE_STATEMENTS on a STAGING database first.
 *      Verify isolation: with `app.workspace_ids` set to tenant A, a
 *      `SELECT * FROM customer` must return only A's rows and zero rows for B.
 *      Verify with the GUC unset it returns zero rows, not all rows. Only then
 *      apply to production, ideally table-by-table rather than all at once.
 *      RLS_UNFORCE_STATEMENTS is the instant rollback and needs no data change.
 *   5. REMOVE THE BYPASS. Once every cross-tenant code path has been migrated
 *      to an explicit scoped unit of work, run RLS_DROP_BYPASS_STATEMENTS to
 *      delete `foundly_admin_bypass`. After this only role-based bypass (the
 *      migration role) remains. Migrations must then run as a BYPASSRLS role,
 *      because FORCE ROW LEVEL SECURITY applies to the table owner too.
 *
 * RLS_DISABLE_STATEMENTS is the full panic rollback to today's behaviour.
 *
 * ── WHAT THIS DOES NOT COVER ──────────────────────────────────────────────
 * See UNSCOPED_TABLES below. `password_reset_token` has no tenant column at
 * all and is therefore NOT protected by any of this.
 */

/** A table protected by tenant RLS, plus the column carrying its tenant key. */
export interface TenantScopedTable {
  readonly table: string;
  readonly tenantColumn: string;
}

/**
 * Every table that carries a tenant key, generated from lib/db/schema.ts.
 *
 * NOTE the special case: `workspace` is the tenant root, so its own primary key
 * `id` *is* the tenant key — it has no `workspace_id` column. Every other table
 * below carries a denormalized `workspace_id`.
 *
 * When a new tenant-scoped table is added to schema.ts it MUST be added here,
 * otherwise it silently gets no database-level isolation. The Vitest suite in
 * lib/db/__tests__/rls.test.ts cross-checks this list against the CREATE TABLE
 * statements above and fails if the two drift apart.
 */
export const TENANT_SCOPED_TABLES: readonly TenantScopedTable[] = [
  { table: "ai_content_asset", tenantColumn: "workspace_id" },
  { table: "app_user", tenantColumn: "workspace_id" },
  { table: "audit_log", tenantColumn: "workspace_id" },
  { table: "campaign", tenantColumn: "workspace_id" },
  { table: "content_publishing_job", tenantColumn: "workspace_id" },
  { table: "customer", tenantColumn: "workspace_id" },
  { table: "customer_consent", tenantColumn: "workspace_id" },
  { table: "dataset_meta", tenantColumn: "workspace_id" },
  // Holds each workspace's encrypted Resend key / SMTP password. Cross-tenant
  // reads here would expose sending credentials, so it is scoped like any
  // other credential table.
  { table: "email_credential", tenantColumn: "workspace_id" },
  { table: "gbp_task", tenantColumn: "workspace_id" },
  { table: "google_credential", tenantColumn: "workspace_id" },
  { table: "instagram_credential", tenantColumn: "workspace_id" },
  { table: "location", tenantColumn: "workspace_id" },
  { table: "monitoring_run", tenantColumn: "workspace_id" },
  { table: "notification", tenantColumn: "workspace_id" },
  { table: "organization", tenantColumn: "workspace_id" },
  { table: "private_feedback", tenantColumn: "workspace_id" },
  { table: "profile_mutation_job", tenantColumn: "workspace_id" },
  { table: "qr_asset", tenantColumn: "workspace_id" },
  { table: "review", tenantColumn: "workspace_id" },
  { table: "review_draft", tenantColumn: "workspace_id" },
  { table: "review_reply", tenantColumn: "workspace_id" },
  { table: "review_request", tenantColumn: "workspace_id" },
  { table: "staff_invite", tenantColumn: "workspace_id" },
  { table: "staff_member", tenantColumn: "workspace_id" },
  { table: "subscription", tenantColumn: "workspace_id" },
  // Tenant root: its primary key IS the tenant key.
  { table: "workspace", tenantColumn: "id" },
];

/**
 * Tables deliberately left OUT of tenant RLS, with the reason. Anything listed
 * here is still protected by application code alone — be explicit about it
 * rather than letting it hide.
 *
 * `password_reset_token` genuinely has no tenant column: a reset is looked up
 * by `token_hash` before any workspace is known, and the row only references
 * `user_id`. Giving it real isolation requires an additive `workspace_id`
 * column plus a backfill, which is out of scope for this additive-only change.
 * Until then it is protected by the unguessability of the hashed token.
 */
export const UNSCOPED_TABLES: readonly { table: string; reason: string }[] = [
  {
    table: "password_reset_token",
    reason:
      "No workspace_id column; looked up by token_hash before the tenant is " +
      "known. Needs an additive workspace_id + backfill before it can be " +
      "covered. Currently protected only by token unguessability.",
  },
];

/** Session GUC holding the comma-separated workspace ids visible to a unit of work. */
export const RLS_SCOPE_GUC = "app.workspace_ids";

/** Session GUC that, when set to 'on', activates the removable bypass policy. */
export const RLS_BYPASS_GUC = "app.bypass_rls";

/** Name of the real tenant-isolation policy. */
export const RLS_TENANT_POLICY = "foundly_tenant_isolation";

/** Name of the removable platform-admin/migration bypass policy. */
export const RLS_BYPASS_POLICY = "foundly_admin_bypass";

/**
 * The row-visibility expression, as it appears in the policy. Exported so tests
 * and operators can assert on the exact predicate rather than a paraphrase.
 */
export function rlsTenantPredicate(tenantColumn: string): string {
  return (
    `"${tenantColumn}" = ANY (string_to_array(` +
    `current_setting('${RLS_SCOPE_GUC}', true), ','))`
  );
}

/** The bypass-policy expression. See design notes: NOT a security boundary. */
export const RLS_BYPASS_PREDICATE = `current_setting('${RLS_BYPASS_GUC}', true) = 'on'`;

/**
 * Wraps DDL in a plpgsql DO block that no-ops when the table is absent.
 *
 * A DO block is a single statement, so the DROP POLICY / CREATE POLICY pair
 * inside it is atomic — there is never an instant where RLS is enabled but the
 * policy is missing (which would blank the table for every reader). This is
 * what makes the statements safe to re-run against a live database.
 */
function guardedDo(table: string, body: string): string {
  return [
    "DO $foundly_rls$",
    "BEGIN",
    `  IF to_regclass('public."${table}"') IS NULL THEN`,
    `    RAISE NOTICE 'foundly-rls: table % is absent, skipping', '${table}';`,
    "    RETURN;",
    "  END IF;",
    body,
    "END",
    "$foundly_rls$;",
  ].join("\n");
}

/**
 * STAGE 1 — enable RLS and (re)create both policies on every tenant table.
 *
 * Idempotent: ENABLE ROW LEVEL SECURITY is a no-op when already set, and each
 * policy is dropped-then-created atomically inside a DO block, so re-running
 * also repairs a policy whose definition has drifted.
 *
 * SAFE TO APPLY TO PRODUCTION AHEAD OF ENFORCEMENT: while the connecting role
 * owns the tables (the Neon default) and FORCE is not set, these policies are
 * not applied to any query. Nothing changes until RLS_FORCE_STATEMENTS runs.
 */
export const RLS_POLICY_STATEMENTS: readonly string[] = TENANT_SCOPED_TABLES.map(
  ({ table, tenantColumn }) => {
    const tenant = rlsTenantPredicate(tenantColumn);
    return guardedDo(
      table,
      [
        "",
        `  ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`,
        "",
        `  DROP POLICY IF EXISTS "${RLS_TENANT_POLICY}" ON public."${table}";`,
        `  CREATE POLICY "${RLS_TENANT_POLICY}" ON public."${table}"`,
        "    FOR ALL",
        "    TO PUBLIC",
        `    USING (${tenant})`,
        `    WITH CHECK (${tenant});`,
        "",
        `  DROP POLICY IF EXISTS "${RLS_BYPASS_POLICY}" ON public."${table}";`,
        `  CREATE POLICY "${RLS_BYPASS_POLICY}" ON public."${table}"`,
        "    FOR ALL",
        "    TO PUBLIC",
        `    USING (${RLS_BYPASS_PREDICATE})`,
        `    WITH CHECK (${RLS_BYPASS_PREDICATE});`,
      ].join("\n"),
    );
  },
);

/**
 * STAGE 2 — THE SWITCH. Makes the policies apply to the table owner too.
 *
 * Until this runs, the app (connecting as the Neon table owner) is exempt and
 * nothing above has any effect. After it runs, every query on these tables must
 * carry a workspace scope or it returns zero rows.
 *
 * Apply to staging first, then production table-by-table. Idempotent.
 */
export const RLS_FORCE_STATEMENTS: readonly string[] = TENANT_SCOPED_TABLES.map(
  ({ table }) =>
    guardedDo(table, `  ALTER TABLE public."${table}" FORCE ROW LEVEL SECURITY;`),
);

/**
 * ROLLBACK for stage 2 — stop enforcing without dropping anything. This is the
 * fast, no-data-change "undo" if enforcement misbehaves in production. Policies
 * survive so the rollout can be retried.
 */
export const RLS_UNFORCE_STATEMENTS: readonly string[] = TENANT_SCOPED_TABLES.map(
  ({ table }) =>
    guardedDo(table, `  ALTER TABLE public."${table}" NO FORCE ROW LEVEL SECURITY;`),
);

/**
 * STAGE 5 — remove the removable bypass, once every cross-tenant code path has
 * been migrated. After this, only a BYPASSRLS role can read across tenants.
 * Run this LAST, and make sure migrations run as a BYPASSRLS role first.
 */
export const RLS_DROP_BYPASS_STATEMENTS: readonly string[] =
  TENANT_SCOPED_TABLES.map(({ table }) =>
    guardedDo(
      table,
      `  DROP POLICY IF EXISTS "${RLS_BYPASS_POLICY}" ON public."${table}";`,
    ),
  );

/**
 * FULL PANIC ROLLBACK — return to today's behaviour (application-only
 * isolation). Disables RLS and drops both policies on every tenant table.
 */
export const RLS_DISABLE_STATEMENTS: readonly string[] = TENANT_SCOPED_TABLES.map(
  ({ table }) =>
    guardedDo(
      table,
      [
        "",
        `  ALTER TABLE public."${table}" NO FORCE ROW LEVEL SECURITY;`,
        `  ALTER TABLE public."${table}" DISABLE ROW LEVEL SECURITY;`,
        `  DROP POLICY IF EXISTS "${RLS_TENANT_POLICY}" ON public."${table}";`,
        `  DROP POLICY IF EXISTS "${RLS_BYPASS_POLICY}" ON public."${table}";`,
      ].join("\n"),
    ),
);

/**
 * VERIFY query (read-only). Per public table: is RLS enabled, is it FORCEd,
 * who owns it, and how many of our policies exist.
 *
 * Expected after stage 1: rls_enabled = true, rls_forced = false, policy_count = 2.
 * Expected after stage 4: rls_forced = true.
 * Expected after stage 5: bypass_policy_count = 0.
 */
export const RLS_STATUS_QUERY = `
SELECT c.relname                        AS table_name,
       c.relrowsecurity                 AS rls_enabled,
       c.relforcerowsecurity            AS rls_forced,
       pg_get_userbyid(c.relowner)      AS table_owner,
       (SELECT count(*) FROM pg_policy p
         WHERE p.polrelid = c.oid
           AND p.polname IN ('${RLS_TENANT_POLICY}', '${RLS_BYPASS_POLICY}')) AS policy_count,
       (SELECT count(*) FROM pg_policy p
         WHERE p.polrelid = c.oid
           AND p.polname = '${RLS_BYPASS_POLICY}') AS bypass_policy_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
 ORDER BY c.relname`.trim();

/**
 * VERIFY query (read-only). Does the connecting role bypass RLS today?
 *
 * If `bypasses_rls` or `is_superuser` is true, or the role owns the tables and
 * FORCE is not set, then the policies are INERT for this connection. Confirm
 * this BEFORE stage 1 (it is why stage 1 is safe) and re-confirm it is no
 * longer the case after stage 4 (or enforcement is not really on).
 */
export const RLS_CURRENT_ROLE_QUERY = `
SELECT current_user      AS role_name,
       r.rolsuper        AS is_superuser,
       r.rolbypassrls    AS bypasses_rls
  FROM pg_roles r
 WHERE r.rolname = current_user`.trim();
