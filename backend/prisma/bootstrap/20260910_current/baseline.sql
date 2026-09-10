-- CreateEnum
CREATE TYPE "financial_recognition_subject" AS ENUM ('RIDE_REVENUE', 'PREPAID_DRIVER_CREDITS', 'MANAGER_PAYMENTS', 'COMMERCIAL_PAYMENTS', 'OTHER');

-- CreateEnum
CREATE TYPE "financial_recognition_scope_type" AS ENUM ('GLOBAL', 'TERRITORY', 'CITY', 'COST_CENTER');

-- CreateEnum
CREATE TYPE "financial_recognition_policy" AS ENUM ('UNCLASSIFIED', 'GROSS_PRINCIPAL', 'NET_AGENT');

-- CreateEnum
CREATE TYPE "financial_recognition_policy_status" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "financial_account_type" AS ENUM ('BANK', 'CASH', 'PIX_WALLET', 'RECEIVABLE', 'PAYABLE', 'TAX', 'CLEARING', 'THIRD_PARTY', 'INTERNAL', 'ESCROW');

-- CreateEnum
CREATE TYPE "accounting_nature_type" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "financial_category_kind" AS ENUM ('REVENUE', 'EXPENSE', 'CONTRIBUTION', 'WITHDRAWAL', 'TRANSFER', 'LIABILITY', 'CLEARING', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "financial_cost_center_type" AS ENUM ('COMPANY', 'DEPARTMENT', 'TERRITORY', 'CITY', 'PROJECT', 'OTHER');

-- CreateEnum
CREATE TYPE "financial_direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "financial_transaction_type" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'RECEIVABLE', 'PAYABLE', 'ADJUSTMENT', 'REVERSAL', 'REFUND', 'RECONCILIATION', 'ACCRUAL', 'SETTLEMENT', 'WITHDRAWAL', 'DEPOSIT', 'TAX', 'FEE', 'COMPENSATION');

-- CreateEnum
CREATE TYPE "financial_transaction_status" AS ENUM ('DRAFT', 'PENDING', 'POSTED', 'CANCELED', 'REVERSED', 'BLOCKED', 'RECONCILED', 'CLOSED');

-- CreateEnum
CREATE TYPE "financial_payment_method" AS ENUM ('PIX', 'ASAAS', 'SUMUP', 'BANK_TRANSFER', 'TED', 'DOC', 'CASH', 'CARD', 'BOLETO', 'INTERNAL', 'NONE');

-- CreateEnum
CREATE TYPE "financial_source_type" AS ENUM ('RIDE', 'DRIVER_WALLET', 'CREDIT_SALE', 'TERRITORIAL_PAYOUT', 'COMMERCIAL_ORDER', 'MANUAL', 'BANK_IMPORT', 'BANK_WEBHOOK', 'PAYMENT_PROVIDER', 'NFSE', 'ACCOUNTING', 'REFUND', 'TAX', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "financial_origin_type" AS ENUM ('OPERATIONAL', 'COMMERCIAL', 'BANK', 'PROVIDER', 'MANUAL', 'ACCOUNTING', 'TAX', 'INTERNAL');

-- CreateEnum
CREATE TYPE "financial_transaction_allocation_type" AS ENUM ('SIMPLE', 'ALLOCATED', 'ADJUSTMENT', 'RECLASSIFICATION');

-- CreateEnum
CREATE TYPE "financial_transaction_link_type" AS ENUM ('SETTLEMENT', 'TRANSFER_PAIR', 'REVERSAL', 'DOCUMENT_LINK', 'RECONCILIATION', 'COMPETENCE', 'RATEIO', 'ACCOUNTANT_REVIEW');

-- CreateEnum
CREATE TYPE "ar_place_type" AS ENUM ('HOTEL', 'COMMERCE', 'TOURISM', 'CARE', 'PET', 'AIRPORT');

-- CreateEnum
CREATE TYPE "ar_place_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ar_place_locale" AS ENUM ('PT_BR', 'EN', 'ES', 'FR');

-- CreateEnum
CREATE TYPE "TourBookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TourPackageType" AS ENUM ('TOUR', 'AIRPORT_TRANSFER');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('scheduled', 'requested', 'offered', 'pending_adjustment', 'accepted', 'arrived', 'started', 'in_progress', 'completed', 'canceled_by_passenger', 'canceled_by_driver', 'no_driver');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'canceled');

-- CreateEnum
CREATE TYPE "DriverAvailability" AS ENUM ('offline', 'online', 'busy');

-- CreateEnum
CREATE TYPE "MunicipalServiceModality" AS ENUM ('CAR', 'MOTO_PASSENGER', 'MOTO_DELIVERY', 'TAXI', 'VAN');

-- CreateEnum
CREATE TYPE "MunicipalRegulationStatus" AS ENUM ('REGULATED', 'NOT_REGULATED', 'UNKNOWN', 'REQUIRES_CONFIRMATION');

-- CreateEnum
CREATE TYPE "DriverMunicipalAuthorizationStatus" AS ENUM ('NOT_STARTED', 'DOCUMENTS_PENDING', 'IN_REVIEW_BY_KAVIAR', 'READY_FOR_CITY_HALL', 'SUBMITTED_TO_CITY_HALL', 'WAITING_CITY_HALL_REVIEW', 'APPROVED_BY_CITY_HALL', 'REJECTED_BY_CITY_HALL', 'NEEDS_COMPLEMENT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MunicipalPackageAuditAction" AS ENUM ('GENERATED', 'DOWNLOADED', 'SUBMITTED', 'STATUS_CHANGED', 'PROTOCOL_UPDATED');

-- CreateEnum
CREATE TYPE "legal_entity_type" AS ENUM ('MATRIZ', 'FILIAL');

-- CreateEnum
CREATE TYPE "accounting_firm_document_type" AS ENUM ('CNPJ', 'CPF');

-- CreateEnum
CREATE TYPE "accountant_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'REVOKED');

-- CreateEnum
CREATE TYPE "accountant_invite_status" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "accountant_link_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "accountant_link_scope" AS ENUM ('FISCAL', 'CONTABIL', 'FOLHA', 'SOCIETARIO', 'FINANCEIRO', 'MUNICIPAL', 'COMPLETO');

-- CreateEnum
CREATE TYPE "accountant_session_status" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED', 'COMPROMISED');

-- CreateEnum
CREATE TYPE "accountant_reset_status" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "accounting_document_category" AS ENUM ('SOCIETARIO', 'FISCAL', 'TRABALHISTA', 'CERTIFICADO', 'PROCURACAO', 'LICENCA', 'INSCRICAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "accounting_document_status" AS ENUM ('DRAFT', 'SENT', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'REJECTED', 'REPLACED', 'REVOKED');

-- CreateEnum
CREATE TYPE "accounting_document_scan_status" AS ENUM ('NOT_SCANNED', 'PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "accounting_certificate_type" AS ENUM ('E_CNPJ_A1', 'E_CNPJ_A3', 'E_CPF_A1', 'E_CPF_A3', 'NF_E', 'OTHER');

-- CreateEnum
CREATE TYPE "accounting_certificate_status" AS ENUM ('ACTIVE', 'REVOKED', 'REPLACED');

-- CreateEnum
CREATE TYPE "accounting_certificate_mode" AS ENUM ('EXTERNAL', 'METADATA_ONLY', 'KAVIAR_MANAGED');

-- CreateEnum
CREATE TYPE "accounting_power_of_attorney_status" AS ENUM ('ACTIVE', 'REVOKED', 'REPLACED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "accounting_power_of_attorney_scope" AS ENUM ('ECAC', 'PREFEITURA', 'SEFAZ', 'JUNTA_COMERCIAL', 'INSS', 'FGTS', 'OUTRO');

-- CreateEnum
CREATE TYPE "accounting_obligation_status" AS ENUM ('DRAFT', 'SENT_TO_COMPANY', 'VIEWED', 'SCHEDULED', 'PAID', 'PROOF_UPLOADED', 'UNDER_VERIFICATION', 'VERIFIED', 'RECONCILED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "accounting_obligation_type" AS ENUM ('HONORARIOS', 'DAS_SIMPLES', 'GUIA_IMPOSTO', 'FGTS', 'INSS', 'TAXA_MUNICIPAL', 'BOLETO_FORNECEDOR', 'OUTRO');

-- CreateEnum
CREATE TYPE "accounting_obligation_action_owner" AS ENUM ('ACCOUNTANT', 'COMPANY');

-- CreateEnum
CREATE TYPE "accounting_competency_status" AS ENUM ('OPEN', 'WAITING_DOCUMENTS', 'UNDER_REVIEW', 'PENDING_CORRECTION', 'COMPLETED', 'REOPENED', 'CANCELED');

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMP(3),
    "marketing_followup_sent_at" TIMESTAMP(3),
    "lead_regions" TEXT,
    "invite_code" TEXT,
    "invite_code_expires_at" TIMESTAMP(3),
    "sms_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify_new_drivers" BOOLEAN NOT NULL DEFAULT true,
    "notify_new_passengers" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "center_lat" DECIMAL(10,8),
    "center_lng" DECIMAL(11,8),
    "radius_meters" INTEGER,
    "geofence" TEXT,
    "min_active_drivers" INTEGER NOT NULL DEFAULT 3,
    "deactivation_threshold" INTEGER NOT NULL DEFAULT 1,
    "auto_activation" BOOLEAN NOT NULL DEFAULT false,
    "last_evaluated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_geofences" (
    "id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "center_lat" DECIMAL(10,8) NOT NULL,
    "center_lng" DECIMAL(11,8) NOT NULL,
    "min_lat" DECIMAL(10,8),
    "min_lng" DECIMAL(11,8),
    "max_lat" DECIMAL(10,8),
    "max_lng" DECIMAL(11,8),
    "geojson" TEXT,
    "source" TEXT NOT NULL,
    "source_ref" TEXT,
    "confidence" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "geom" geometry,

    CONSTRAINT "community_geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_status_history" (
    "id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "from_is_active" BOOLEAN,
    "to_is_active" BOOLEAN,
    "driver_count" INTEGER,
    "changed_by" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" TEXT,
    "type" TEXT NOT NULL,
    "consent_type" TEXT,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "accepted_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diamond_audit_logs" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "bonus_amount" DECIMAL(10,2),
    "diamond_state_from" TEXT,
    "diamond_state_to" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diamond_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_documents" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "document_url" TEXT NOT NULL DEFAULT '',
    "file_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "verified_by_admin_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejected_by_admin_id" TEXT,
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_enforcement_history" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_enforcement_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_verifications" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "community_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by_admin_id" TEXT,
    "eligibility_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "suspension_reason" TEXT,
    "suspended_at" TIMESTAMP(3),
    "suspended_by" TEXT,
    "last_active_at" TIMESTAMP(3),
    "neighborhood_id" TEXT,
    "community_id" TEXT,
    "document_cpf" TEXT,
    "document_rg" TEXT,
    "document_cnh" TEXT,
    "vehicle_plate" TEXT,
    "vehicle_model" TEXT,
    "vehicle_color" TEXT,
    "vehicle_type" TEXT NOT NULL DEFAULT 'CAR',
    "banned_at" TIMESTAMP(3),
    "banned_reason" TEXT,
    "banned_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "last_location_updated_at" TIMESTAMP(3),
    "last_lat" DECIMAL(10,8),
    "last_lng" DECIMAL(11,8),
    "virtual_fence_center_lat" DECIMAL(10,8),
    "virtual_fence_center_lng" DECIMAL(11,8),
    "secondary_base_lat" DECIMAL(10,8),
    "secondary_base_lng" DECIMAL(11,8),
    "secondary_base_label" TEXT,
    "secondary_base_enabled" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN DEFAULT true,
    "available_updated_at" TIMESTAMP(3),
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "premium_override" BOOLEAN,
    "certidao_nada_consta_url" TEXT,
    "pix_key" TEXT,
    "pix_key_type" TEXT,
    "family_bonus_accepted" BOOLEAN DEFAULT false,
    "family_bonus_profile" TEXT DEFAULT 'individual',
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "rejected_reason" TEXT,
    "pending_reason" TEXT,
    "pending_reason_updated_at" TIMESTAMP(3),
    "territory_type" TEXT,
    "territory_verified_at" TIMESTAMP(3),
    "territory_verification_method" TEXT,
    "active_since" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "active_session_id" TEXT,
    "device_id" TEXT,
    "device_model" TEXT,
    "phone_verified_at" TIMESTAMP(3),
    "last_reactivation_sent_at" TIMESTAMP(3),
    "photo_url" TEXT,
    "expo_push_token" VARCHAR(100),
    "fcm_push_token" VARCHAR(200),
    "push_token_updated_at" TIMESTAMP(3),
    "premium_tourism_status" TEXT NOT NULL DEFAULT 'standard',
    "premium_tourism_promoted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "territorial_partner_id" TEXT,
    "territorial_partner_linked_at" TIMESTAMP(3),
    "women_matching_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "women_matching_opted_in_at" TIMESTAMPTZ,
    "women_matching_opted_out_at" TIMESTAMPTZ,
    "women_matching_consent_version" TEXT,
    "women_preference_eligible" BOOLEAN NOT NULL DEFAULT false,
    "women_preference_eligible_at" TIMESTAMPTZ,
    "women_preference_eligibility_source" TEXT,
    "women_preference_eligibility_revoked_at" TIMESTAMPTZ,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elderly_contracts" (
    "id" TEXT NOT NULL,
    "elderly_profile_id" TEXT NOT NULL,
    "responsible_id" TEXT,
    "community_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "service_type" TEXT NOT NULL DEFAULT 'ACOMPANHAMENTO_ATIVO',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elderly_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elderly_profiles" (
    "id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "emergency_contact" TEXT,
    "emergency_phone" TEXT,
    "medical_notes" TEXT,
    "careLevel" TEXT NOT NULL DEFAULT 'basic',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elderly_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neighborhood_geofences" (
    "id" TEXT NOT NULL,
    "neighborhood_id" TEXT NOT NULL,
    "geofence_type" TEXT NOT NULL,
    "coordinates" JSONB NOT NULL,
    "source" TEXT,
    "source_url" TEXT,
    "area" DECIMAL(15,6),
    "perimeter" DECIMAL(15,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "geom" geometry,

    CONSTRAINT "neighborhood_geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neighborhoods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Rio de Janeiro',
    "description" TEXT,
    "zone" TEXT,
    "administrative_region" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "center_lat" DECIMAL(10,8),
    "center_lng" DECIMAL(11,8),
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "area_type" VARCHAR(50) DEFAULT 'BAIRRO_OFICIAL',
    "parent_neighborhood_id" TEXT,
    "population" INTEGER,
    "area_km2" DECIMAL(10,2),
    "territory_id" TEXT,

    CONSTRAINT "neighborhoods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_leaders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "neighborhood_id" TEXT,
    "community_id" TEXT,
    "leader_type" TEXT NOT NULL,
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "verification_notes" TEXT,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_leaders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passengers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "phone" TEXT,
    "document_cpf" TEXT,
    "neighborhood_id" TEXT,
    "community_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "password_changed_at" TIMESTAMP(3),
    "phone_verified_at" TIMESTAMP(3),
    "last_lat" DECIMAL(10,8),
    "last_lng" DECIMAL(11,8),
    "last_location_updated_at" TIMESTAMP(3),
    "expo_push_token" VARCHAR(100),
    "fcm_push_token" VARCHAR(200),
    "push_token_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "women_matching_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "prefer_woman_driver_default" BOOLEAN NOT NULL DEFAULT false,
    "women_matching_opted_in_at" TIMESTAMPTZ,
    "women_matching_opted_out_at" TIMESTAMPTZ,
    "women_matching_consent_version" TEXT,
    "women_preference_eligible" BOOLEAN NOT NULL DEFAULT false,
    "women_preference_eligible_at" TIMESTAMPTZ,
    "women_preference_eligibility_source" TEXT,
    "women_preference_eligibility_revoked_at" TIMESTAMPTZ,

    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passenger_favorite_locations" (
    "id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "lat" DECIMAL(10,8) NOT NULL,
    "lng" DECIMAL(11,8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passenger_favorite_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(20) NOT NULL,
    "user_type" VARCHAR(20) NOT NULL,
    "user_id" VARCHAR(255),
    "purpose" VARCHAR(30) NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percentage" INTEGER NOT NULL DEFAULT 0,
    "updated_by_admin_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flag_allowlist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_allowlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beta_monitor_checkpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feature_key" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "checkpoint_label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "metrics_json" JSONB,
    "config_json" JSONB,
    "determinism_json" JSONB,
    "alerts_json" JSONB,
    "notes" TEXT,

    CONSTRAINT "beta_monitor_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_stats" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_id" TEXT,
    "average_rating" DECIMAL(3,2) NOT NULL,
    "total_ratings" INTEGER NOT NULL,
    "rating_sum" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ride_id" TEXT,
    "rated_id" TEXT,
    "rater_id" TEXT,
    "rater_type" TEXT,
    "rating" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "tags" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_admin_actions" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_confirmations" (
    "id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "confirmation_token" TEXT NOT NULL,
    "ride_data" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "used_at" TIMESTAMP(3),
    "created_ride_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_status_history" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT,
    "passenger_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "price" DECIMAL(10,2) NOT NULL,
    "platform_fee" DECIMAL(10,2),
    "platform_fee_percentage" DECIMAL(5,2),
    "driver_amount" DECIMAL(10,2),
    "match_type" TEXT,
    "pickup_neighborhood_id" TEXT,
    "dropoff_neighborhood_id" TEXT,
    "distance_km" DECIMAL(10,2),
    "duration_minutes" INTEGER,
    "payment_method" TEXT DEFAULT 'credit_card',
    "cancel_reason" TEXT,
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "forced_completed_by" TEXT,
    "forced_completed_at" TIMESTAMP(3),
    "fallback_out_of_fence" BOOLEAN DEFAULT false,
    "fallback_reason" TEXT,
    "drivers_in_fence_count" INTEGER,
    "passenger_confirmed_at" TIMESTAMP(3),
    "is_diamond_eligible" BOOLEAN DEFAULT false,
    "diamond_state" TEXT,
    "diamond_candidate_driver_id" TEXT,
    "diamond_lost_at" TIMESTAMP(3),
    "diamond_lost_reason" TEXT,
    "bonus_amount" DECIMAL(10,2),
    "bonus_applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_bookings" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "passenger_id" TEXT,
    "status" "TourBookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "scheduled_date" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),
    "pickup_location" TEXT,
    "dropoff_location" TEXT,
    "passenger_name" TEXT,
    "passenger_email" TEXT,
    "passenger_phone" TEXT,
    "passenger_count" INTEGER NOT NULL DEFAULT 1,
    "special_requests" TEXT,
    "emergency_contact" TEXT,
    "emergency_phone" TEXT,
    "total_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ride_id" TEXT,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_packages" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "TourPackageType" NOT NULL,
    "partner_name" TEXT NOT NULL,
    "base_price" DECIMAL(10,2) NOT NULL,
    "locations" TEXT[],
    "estimated_duration_minutes" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_settings" (
    "id" TEXT NOT NULL,
    "support_whatsapp" TEXT,
    "default_partner_id" TEXT,
    "terms_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tour_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tourist_guides" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "community_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "is_bilingual" BOOLEAN NOT NULL DEFAULT false,
    "languages" TEXT[],
    "also_driver" BOOLEAN NOT NULL DEFAULT false,
    "driver_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tourist_guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consents" (
    "id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "consent_type" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "accepted_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_consents" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "terms_accepted_at" TIMESTAMP(3) NOT NULL,
    "privacy_accepted_at" TIMESTAMP(3) NOT NULL,
    "terms_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_modalities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" TEXT NOT NULL,
    "modality" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW',
    "vehicle_plate" VARCHAR(10),
    "vehicle_model" VARCHAR(100),
    "vehicle_color" VARCHAR(30),
    "vehicle_year" INTEGER,
    "vehicle_brand" VARCHAR(50),
    "has_extra_helmet" BOOLEAN DEFAULT false,
    "cnh_category" VARCHAR(5),
    "reviewed_at" TIMESTAMPTZ,
    "reviewed_by" TEXT,
    "review_notes" TEXT,
    "rejected_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_modalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_compliance_documents" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'criminal_record',
    "file_url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "emission_date" DATE,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "lgpd_consent_accepted" BOOLEAN NOT NULL DEFAULT false,
    "lgpd_consent_ip" TEXT,
    "lgpd_consent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_compliance_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_logs" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "trip_id" TEXT,
    "ride_id" TEXT,
    "driver_id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "match_type" VARCHAR(20) NOT NULL,
    "driver_base_lat" DECIMAL(10,8),
    "driver_base_lng" DECIMAL(11,8),
    "pickup_lat" DECIMAL(10,8),
    "pickup_lng" DECIMAL(11,8),
    "neighborhood_id" TEXT,
    "platform_percent" DECIMAL(5,2),
    "platform_fee_brl" DECIMAL(10,2),
    "trip_value_brl" DECIMAL(10,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_badges" (
    "id" SERIAL NOT NULL,
    "driver_id" TEXT NOT NULL,
    "badge_type" VARCHAR(50) NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "progress" DECIMAL NOT NULL DEFAULT 100,

    CONSTRAINT "driver_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_territory_stats" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "total_trips" INTEGER NOT NULL DEFAULT 0,
    "inside_territory_trips" INTEGER NOT NULL DEFAULT 0,
    "adjacent_territory_trips" INTEGER NOT NULL DEFAULT 0,
    "outside_territory_trips" INTEGER NOT NULL DEFAULT 0,
    "avg_fee_percentage" DECIMAL(5,2),
    "potential_savings_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_territory_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides_v2" (
    "id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "status" "RideStatus" NOT NULL DEFAULT 'requested',
    "origin_lat" DECIMAL(10,8) NOT NULL,
    "origin_lng" DECIMAL(11,8) NOT NULL,
    "origin_text" TEXT,
    "origin_neighborhood_id" TEXT,
    "origin_community_id" TEXT,
    "dest_lat" DECIMAL(10,8) NOT NULL,
    "dest_lng" DECIMAL(11,8) NOT NULL,
    "destination_text" TEXT,
    "dest_neighborhood_id" TEXT,
    "ride_type" TEXT NOT NULL DEFAULT 'normal',
    "service_category" TEXT NOT NULL DEFAULT 'CAR_NORMAL',
    "is_homebound" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT,
    "trip_details" JSONB,
    "scheduled_for" TIMESTAMP(3),
    "pricing_profile_id" UUID,
    "quoted_price" DECIMAL(8,2),
    "locked_price" DECIMAL(8,2),
    "final_price" DECIMAL(8,2),
    "platform_fee" DECIMAL(8,2),
    "driver_earnings" DECIMAL(8,2),
    "territory_match" TEXT,
    "driver_adjustment" DECIMAL(8,2),
    "adjusted_price" DECIMAL(8,2),
    "passenger_app_version" TEXT,
    "wait_requested" BOOLEAN NOT NULL DEFAULT false,
    "wait_estimated_min" INTEGER,
    "wait_started_at" TIMESTAMP(3),
    "wait_ended_at" TIMESTAMP(3),
    "prefer_woman_driver" BOOLEAN NOT NULL DEFAULT false,
    "share_token" TEXT,
    "share_expires_at" TIMESTAMP(3),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offered_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "boarding_code" TEXT,
    "arrived_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rides_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_messages" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "sender_type" VARCHAR(20) NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_type" VARCHAR(20) NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "message_code" VARCHAR(40) NOT NULL,
    "message_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "ride_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_offers" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'pending',
    "territory_tier" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "rank_score" DECIMAL(10,2),
    "driver_adjustment" DECIMAL(8,2),
    "adjustment_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_status" (
    "driver_id" TEXT NOT NULL,
    "availability" "DriverAvailability" NOT NULL DEFAULT 'offline',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_status_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "consultant_leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'whatsapp',
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT,
    "assigned_to" TEXT,
    "assigned_at" TIMESTAMP(3),
    "region" TEXT,
    "last_contact_at" TIMESTAMP(3),
    "referral_agent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultant_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "pix_key" TEXT,
    "pix_key_type" TEXT,
    "referral_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "terms_accepted_at" TIMESTAMP(3),
    "terms_accepted_ip" TEXT,
    "welcome_sent_at" TIMESTAMP(3),
    "welcome_sent_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "driver_phone" TEXT NOT NULL,
    "lead_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reward_amount" DECIMAL(10,2) NOT NULL DEFAULT 20.00,
    "qualified_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'pending_pix',
    "payment_approved_at" TIMESTAMP(3),
    "payment_approved_by" TEXT,
    "payment_paid_at" TIMESTAMP(3),
    "payment_paid_by" TEXT,
    "payment_ref" TEXT,
    "payment_canceled_at" TIMESTAMP(3),
    "payment_cancel_reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'admin_manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_locations" (
    "driver_id" TEXT NOT NULL,
    "lat" DECIMAL(10,8) NOT NULL,
    "lng" DECIMAL(11,8) NOT NULL,
    "heading" DECIMAL(5,2),
    "speed" DECIMAL(5,2),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "pricing_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_fare" DECIMAL(8,2) NOT NULL,
    "per_km" DECIMAL(8,2) NOT NULL,
    "per_minute" DECIMAL(8,2) NOT NULL,
    "minimum_fare" DECIMAL(8,2) NOT NULL,
    "fee_local" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "fee_adjacent" DECIMAL(5,2) NOT NULL DEFAULT 12,
    "fee_external" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "fee_homebound" DECIMAL(5,2),
    "credit_cost_local" INTEGER NOT NULL DEFAULT 1,
    "credit_cost_external" INTEGER NOT NULL DEFAULT 2,
    "max_dispatch_km" DECIMAL(6,2) NOT NULL DEFAULT 12,
    "center_lat" DECIMAL(10,8),
    "center_lng" DECIMAL(11,8),
    "radius_km" DECIMAL(8,2),
    "vehicle_category" TEXT NOT NULL DEFAULT 'CAR',
    "service_category" TEXT NOT NULL DEFAULT 'CAR_NORMAL',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" TEXT NOT NULL,
    "pricing_profile_id" UUID NOT NULL,
    "pricing_profile_slug" TEXT NOT NULL,
    "origin_neighborhood_id" TEXT,
    "origin_neighborhood" TEXT,
    "dest_neighborhood_id" TEXT,
    "dest_neighborhood" TEXT,
    "driver_neighborhood_id" TEXT,
    "driver_neighborhood" TEXT,
    "route_territory" TEXT NOT NULL,
    "driver_territory" TEXT,
    "settlement_territory" TEXT,
    "distance_km" DECIMAL(8,2) NOT NULL,
    "duration_min" DECIMAL(8,2),
    "base_fare_used" DECIMAL(8,2) NOT NULL,
    "per_km_used" DECIMAL(8,2) NOT NULL,
    "per_minute_used" DECIMAL(8,2) NOT NULL,
    "minimum_fare_used" DECIMAL(8,2) NOT NULL,
    "quoted_price" DECIMAL(8,2) NOT NULL,
    "locked_price" DECIMAL(8,2) NOT NULL,
    "final_price" DECIMAL(8,2),
    "fee_percent" DECIMAL(5,2) NOT NULL,
    "fee_amount" DECIMAL(8,2) NOT NULL,
    "driver_earnings" DECIMAL(8,2) NOT NULL,
    "credit_cost" INTEGER,
    "credit_match_type" TEXT,
    "quoted_at" TIMESTAMP(3) NOT NULL,
    "locked_at" TIMESTAMP(3),
    "refined_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" VARCHAR(20) NOT NULL,
    "contact_name" VARCHAR(255),
    "whatsapp_name" VARCHAR(255),
    "contact_type" VARCHAR(30) NOT NULL DEFAULT 'unknown',
    "linked_entity_type" VARCHAR(30),
    "linked_entity_id" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "priority" VARCHAR(10) NOT NULL DEFAULT 'normal',
    "assignee_id" UUID,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" VARCHAR(200),
    "last_inbound_at" TIMESTAMP(3),
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "body" TEXT NOT NULL,
    "twilio_sid" VARCHAR(50),
    "media_url" TEXT,
    "media_type" VARCHAR(50),
    "sent_by_admin_id" UUID,
    "sent_by_admin_name" VARCHAR(255),
    "delivery_status" VARCHAR(20) DEFAULT 'sent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_invite_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" TEXT NOT NULL,
    "admin_name" VARCHAR(255),
    "admin_email" VARCHAR(255),
    "admin_role" VARCHAR(50) NOT NULL,
    "territory_id" TEXT,
    "target_phone_normalized" VARCHAR(20) NOT NULL,
    "target_name" VARCHAR(255),
    "invite_type" VARCHAR(30) NOT NULL,
    "channel" VARCHAR(30) NOT NULL DEFAULT 'twilio_whatsapp',
    "template_key" VARCHAR(80) NOT NULL,
    "twilio_message_sid" VARCHAR(80),
    "twilio_status" VARCHAR(30),
    "twilio_error_code" VARCHAR(30),
    "twilio_error_message" TEXT,
    "duplicate_of_log_id" UUID,
    "source_screen" VARCHAR(80) NOT NULL DEFAULT 'whatsapp_central',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),

    CONSTRAINT "whatsapp_invite_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_regulatory_consultation_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" TEXT NOT NULL,
    "admin_name" VARCHAR(255),
    "admin_email" VARCHAR(255),
    "admin_role" VARCHAR(50) NOT NULL,
    "territory_id" TEXT,
    "destination_phone" VARCHAR(20) NOT NULL,
    "recipient_name" VARCHAR(255),
    "organization_name" VARCHAR(255) NOT NULL,
    "municipality_name" VARCHAR(120),
    "document_version" VARCHAR(30) NOT NULL DEFAULT 'v1.0',
    "protocol_code" VARCHAR(60),
    "observation" TEXT,
    "template_key" VARCHAR(80) NOT NULL DEFAULT 'kaviar_regulatory_consultation_v1',
    "twilio_message_sid" VARCHAR(80),
    "twilio_status" VARCHAR(30),
    "twilio_error_code" VARCHAR(30),
    "twilio_error_message" TEXT,
    "source_screen" VARCHAR(80) NOT NULL DEFAULT 'crm_regulatory_consultation',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),

    CONSTRAINT "municipal_regulatory_consultation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_regulatory_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
    "department_name" VARCHAR(255),
    "contact_name" VARCHAR(255),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(40),
    "last_sent_at" TIMESTAMP(3),
    "last_response_at" TIMESTAMP(3),
    "next_follow_up_at" TIMESTAMP(3),
    "next_action" TEXT,
    "notes" TEXT,
    "created_by_admin_id" UUID,
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipal_regulatory_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_regulatory_checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(120),
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipal_regulatory_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_regulatory_driver_protocols" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "driver_id" TEXT,
    "cycle_number" INTEGER NOT NULL DEFAULT 1,
    "renewal_of_protocol_id" UUID,
    "service_modality" "MunicipalServiceModality",
    "driver_name" TEXT NOT NULL,
    "cpf_last4" VARCHAR(4),
    "vehicle_plate" VARCHAR(16),
    "vehicle_type" VARCHAR(60),
    "protocol_number" VARCHAR(120),
    "status" VARCHAR(32) NOT NULL DEFAULT 'PREPARING',
    "next_action" TEXT,
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "next_follow_up_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipal_regulatory_driver_protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_send_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admin_id" TEXT NOT NULL,
    "admin_email" VARCHAR(255),
    "from_email" VARCHAR(255) NOT NULL,
    "from_name" VARCHAR(255),
    "to_email" VARCHAR(255) NOT NULL,
    "cc_email" VARCHAR(255),
    "bcc_email" TEXT,
    "subject" VARCHAR(180) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "error_message" TEXT,
    "attachment_count" INTEGER NOT NULL DEFAULT 0,
    "attachments_metadata" JSONB,
    "provider_message_id" VARCHAR(255),
    "reply_to_inbound_email_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_send_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_email_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from_email" VARCHAR(255) NOT NULL,
    "from_name" VARCHAR(255),
    "to_email" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255),
    "text_body" TEXT,
    "html_body" TEXT,
    "normalized_body" TEXT,
    "message_id" VARCHAR(255),
    "in_reply_to" VARCHAR(255),
    "references_header" TEXT,
    "provider" VARCHAR(64) NOT NULL DEFAULT 'CLOUDFLARE_EMAIL_WORKER',
    "status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "has_attachments" BOOLEAN NOT NULL DEFAULT false,
    "attachment_count" INTEGER NOT NULL DEFAULT 0,
    "attachments_metadata" JSONB,
    "raw_headers" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_email_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inbound_email_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(255) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_email_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_regulations" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "municipality_code" TEXT,
    "service_modality" "MunicipalServiceModality" NOT NULL,
    "regulation_status" "MunicipalRegulationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "law_number" TEXT,
    "law_date" DATE,
    "law_document_url" TEXT,
    "requires_city_approval" BOOLEAN NOT NULL DEFAULT false,
    "requires_protocol" BOOLEAN NOT NULL DEFAULT false,
    "max_vehicle_age_years" INTEGER,
    "vehicle_age_basis" TEXT,
    "authorization_validity_months" INTEGER,
    "responsible_agency" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipal_regulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_regulation_requirements" (
    "id" TEXT NOT NULL,
    "regulation_id" TEXT NOT NULL,
    "requirement_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "document_type" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "applies_when" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipal_regulation_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_authorizations" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "regulation_id" TEXT NOT NULL,
    "source_driver_protocol_id" UUID,
    "city" TEXT NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "service_modality" "MunicipalServiceModality" NOT NULL,
    "status" "DriverMunicipalAuthorizationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "protocol_number" TEXT,
    "protocol_date" DATE,
    "protocol_agency" TEXT,
    "protocol_responsible_name" TEXT,
    "protocol_receipt_url" TEXT,
    "city_hall_notes" TEXT,
    "authorization_number" TEXT,
    "authorization_document_url" TEXT,
    "authorization_valid_until" DATE,
    "municipal_package_url" TEXT,
    "submitted_by_admin_id" TEXT,
    "submitted_by_manager_id" TEXT,
    "approved_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipal_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipal_package_audit_logs" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "authorization_id" TEXT NOT NULL,
    "action" "MunicipalPackageAuditAction" NOT NULL,
    "actor_admin_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipal_package_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_emergency_events" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "triggered_by_type" TEXT NOT NULL,
    "triggered_by_id" TEXT NOT NULL,
    "trigger_source" TEXT NOT NULL DEFAULT 'emergency_button',
    "status" TEXT NOT NULL DEFAULT 'active',
    "snapshot" JSONB NOT NULL,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_emergency_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_location_trail" (
    "id" TEXT NOT NULL,
    "emergency_event_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lat" DECIMAL(10,8) NOT NULL,
    "lng" DECIMAL(11,8) NOT NULL,
    "speed" DECIMAL(5,2),
    "heading" DECIMAL(5,2),
    "captured_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_location_trail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_balance" (
    "driver_id" TEXT NOT NULL,
    "balance" DECIMAL NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_balance_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "driver_credit_ledger" (
    "id" SERIAL NOT NULL,
    "driver_id" TEXT NOT NULL,
    "delta" DECIMAL NOT NULL,
    "balance_after" DECIMAL NOT NULL,
    "reason" TEXT NOT NULL,
    "admin_user_id" TEXT,
    "idempotency_key" VARCHAR(255),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_packages" (
    "id" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "price" DECIMAL NOT NULL,
    "active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_credit_purchases" (
    "id" UUID NOT NULL,
    "driver_id" TEXT NOT NULL,
    "package_id" TEXT,
    "billing_type" TEXT DEFAULT 'PIX',
    "status" TEXT DEFAULT 'pending',
    "amount_cents" INTEGER NOT NULL,
    "credits_amount" INTEGER NOT NULL,
    "external_reference" TEXT,
    "pix_qr_code" TEXT,
    "pix_copy_paste" TEXT,
    "pix_expires_at" TIMESTAMPTZ,
    "paid_at" TIMESTAMPTZ,
    "raw_payload" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '🏪',
    "type" TEXT NOT NULL DEFAULT 'commerce',
    "community_id" TEXT,
    "neighborhood_id" TEXT,
    "cta_label" TEXT NOT NULL,
    "cta_url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "exposure_quota" INTEGER,
    "exposure_used" INTEGER NOT NULL DEFAULT 0,
    "clicks_count" INTEGER NOT NULL DEFAULT 0,
    "last_shown_at" TIMESTAMP(3),

    CONSTRAINT "showcase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase_events" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "ride_id" TEXT,
    "event_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "showcase_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_compensations" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL DEFAULT 500,
    "credits_amount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "external_reference" TEXT,
    "pix_qr_code" TEXT,
    "pix_copy_paste" TEXT,
    "pix_expires_at" TIMESTAMP(3),
    "invoice_url" TEXT,
    "paid_at" TIMESTAMP(3),
    "waived_at" TIMESTAMP(3),
    "waived_by" TEXT,
    "waived_reason" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_support_drivers" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "community_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'interested',
    "primary_area" TEXT,
    "coverage_areas" JSONB,
    "preferred_windows" JSONB NOT NULL DEFAULT '{}',
    "pilot_start_date" TIMESTAMP(3),
    "operational_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_support_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_support_invites" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "community_id" TEXT,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "region" TEXT,
    "demand_type" TEXT NOT NULL DEFAULT 'normal',
    "responded" BOOLEAN NOT NULL DEFAULT false,
    "response_time_minutes" INTEGER,
    "informed_availability" BOOLEAN NOT NULL DEFAULT false,
    "attended_ride" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "invited_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "local_support_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_operators" (
    "id" TEXT NOT NULL,
    "organization_name" TEXT NOT NULL,
    "responsible_name" TEXT NOT NULL,
    "responsible_role" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "website" TEXT,
    "community" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "source" TEXT NOT NULL DEFAULT 'site',
    "status" TEXT NOT NULL DEFAULT 'researching',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "next_followup_at" TIMESTAMP(3),
    "drivers_referred" INTEGER NOT NULL DEFAULT 0,
    "drivers_approved" INTEGER NOT NULL DEFAULT 0,
    "first_contact_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territorial_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partner_type" TEXT NOT NULL DEFAULT 'association',
    "address" TEXT,
    "responsible_name" TEXT NOT NULL,
    "responsible_role" TEXT NOT NULL DEFAULT 'presidente',
    "responsible_phone" TEXT,
    "responsible_email" TEXT,
    "commission_percent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "monthly_fee_cents" INTEGER,
    "billing_due_day" INTEGER,
    "billing_status" TEXT NOT NULL DEFAULT 'current',
    "last_payment_at" TIMESTAMP(3),
    "referral_code" TEXT,
    "public_token" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'basic',
    "logo_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "contract_status" TEXT NOT NULL DEFAULT 'pending',
    "contract_url" TEXT,
    "contract_signed_at" TIMESTAMP(3),
    "contract_notes" TEXT,
    "territory_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "territorial_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_commissions" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "ride_final_price" DECIMAL(8,2) NOT NULL,
    "commission_percent" DECIMAL(5,2) NOT NULL,
    "commission_amount" DECIMAL(8,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "paid_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_payments" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reference_month" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "receipt_url" TEXT,
    "notes" TEXT,
    "registered_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_link_requests" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'referral_code',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_link_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_members" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_member_payments" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "reference_month" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'pix',
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receipt_code" TEXT NOT NULL,
    "notes" TEXT,
    "registered_by" TEXT NOT NULL,
    "whatsapp_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_member_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_transactions" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'outro',
    "reference_month" TEXT,
    "member_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_users" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_password_resets" (
    "id" TEXT NOT NULL,
    "partner_user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "partner_password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_ride_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "service_type" TEXT NOT NULL DEFAULT 'outro',
    "scheduled_date" TEXT NOT NULL,
    "scheduled_time" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "round_trip" BOOLEAN NOT NULL DEFAULT false,
    "wait_at_destination" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "assigned_driver" TEXT,
    "admin_notes" TEXT,
    "partner_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "private_ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'outro',
    "description" TEXT,
    "whatsapp" TEXT,
    "address" TEXT,
    "logo_url" TEXT,
    "region_slug" TEXT NOT NULL,
    "territory_id" UUID,
    "partner_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "local_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_territories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "parent_id" TEXT,
    "uf" TEXT,
    "city_name" TEXT,
    "center_lat" DECIMAL(10,8),
    "center_lng" DECIMAL(11,8),
    "notes" TEXT,
    "regulatory_status" TEXT NOT NULL DEFAULT 'not_evaluated',
    "regulatory_notes" TEXT,
    "regulatory_checked_at" TIMESTAMP(3),
    "regulatory_checked_by" TEXT,
    "coverage_status" TEXT NOT NULL DEFAULT 'NOT_LOADED',
    "coverage_reviewed_at" TIMESTAMP(3),
    "coverage_reviewed_by" TEXT,
    "coverage_notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "moto_express_enabled" BOOLEAN NOT NULL DEFAULT false,
    "moto_passenger_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_territories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_recognition_policies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "subject" "financial_recognition_subject" NOT NULL,
    "scope_type" "financial_recognition_scope_type" NOT NULL,
    "territory_id" TEXT,
    "cost_center_id" TEXT,
    "city" TEXT,
    "state" TEXT,
    "policy" "financial_recognition_policy" NOT NULL,
    "status" "financial_recognition_policy_status" NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_until" TIMESTAMP(3),
    "approved_by_admin_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_admin_id" TEXT,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_recognition_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "financial_account_type" NOT NULL,
    "institution_name" TEXT,
    "bank_code" TEXT,
    "agency_encrypted" TEXT,
    "account_number_encrypted" TEXT,
    "account_digit_encrypted" TEXT,
    "pix_key_encrypted" TEXT,
    "document_encrypted" TEXT,
    "account_fingerprint" TEXT,
    "account_last4" TEXT,
    "pix_key_last4" TEXT,
    "encryption_key_version" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "opening_balance_cents" BIGINT NOT NULL DEFAULT 0,
    "opening_balance_date" TIMESTAMP(3),
    "allows_negative_balance" BOOLEAN NOT NULL DEFAULT false,
    "is_cash_equivalent" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by_admin_id" TEXT,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "financial_category_kind" NOT NULL,
    "parent_id" TEXT,
    "default_direction" "financial_direction",
    "requires_document" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_postable" BOOLEAN NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "accounting_code" TEXT,
    "accounting_nature" "accounting_nature_type",
    "dre_group" TEXT,
    "balance_sheet_group" TEXT,
    "fiscal_classification" TEXT,
    "deductible" BOOLEAN,
    "export_code" TEXT,
    "accountant_notes" TEXT,
    "created_by_admin_id" TEXT,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_cost_centers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "financial_cost_center_type" NOT NULL,
    "parent_id" TEXT,
    "territory_id" TEXT,
    "city" TEXT,
    "state" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_admin_id" TEXT,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "external_reference" TEXT,
    "provider" TEXT,
    "provider_event_id" TEXT,
    "source_type" "financial_source_type" NOT NULL,
    "source_id" TEXT,
    "origin_type" "financial_origin_type" NOT NULL,
    "origin_id" TEXT,
    "account_id" TEXT NOT NULL,
    "counterparty_account_id" TEXT,
    "category_id" TEXT,
    "cost_center_id" TEXT,
    "transfer_group_id" TEXT,
    "direction" "financial_direction" NOT NULL,
    "transaction_type" "financial_transaction_type" NOT NULL,
    "status" "financial_transaction_status" NOT NULL DEFAULT 'DRAFT',
    "payment_method" "financial_payment_method",
    "recognition_policy" "financial_recognition_policy",
    "competence_date" TIMESTAMP(3) NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "settlement_date" TIMESTAMP(3),
    "gross_amount_cents" BIGINT NOT NULL,
    "fee_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "discount_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "retention_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "net_amount_cents" BIGINT NOT NULL,
    "transfer_amount_cents" BIGINT,
    "reversal_of_id" TEXT,
    "canceled_reason" TEXT,
    "canceled_at" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "memo" TEXT,
    "metadata" JSONB,
    "idempotency_key" TEXT,
    "created_by_admin_id" TEXT,
    "approved_by_admin_id" TEXT,
    "responsible_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transaction_allocations" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "cost_center_id" TEXT,
    "amount_cents" BIGINT NOT NULL,
    "allocation_type" "financial_transaction_allocation_type" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_transaction_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transaction_links" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "linked_transaction_id" TEXT NOT NULL,
    "link_type" "financial_transaction_link_type" NOT NULL,
    "amount_cents" BIGINT,
    "metadata" JSONB,
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_transaction_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_insurance_coverages" (
    "id" TEXT NOT NULL,
    "territory_id" TEXT,
    "modality" VARCHAR(30) NOT NULL,
    "provider_name" VARCHAR(200) NOT NULL,
    "policy_number" VARCHAR(120) NOT NULL,
    "coverage_type" VARCHAR(30) NOT NULL,
    "coverage_description" TEXT,
    "coverage_amount_death" DECIMAL(12,2),
    "coverage_amount_disability" DECIMAL(12,2),
    "coverage_amount_medical" DECIMAL(12,2),
    "valid_from" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "document_url" TEXT,
    "notes" TEXT,
    "created_by_admin_id" TEXT,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_insurance_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moto_passenger_compliance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "territory_id" TEXT NOT NULL,
    "municipality_name" VARCHAR(200),
    "consultation_date" DATE,
    "consulted_by_admin_id" TEXT,
    "prefecture_notes" TEXT,
    "protocol_number" VARCHAR(100),
    "document_url" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "approved_by_admin_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moto_passenger_compliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_territory_access" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "territory_id" TEXT NOT NULL,
    "access_level" TEXT NOT NULL DEFAULT 'full',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_territory_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territory_finance_rules" (
    "id" TEXT NOT NULL,
    "territory_id" TEXT NOT NULL,
    "matrix_share_percent" DECIMAL(5,2) NOT NULL DEFAULT 60,
    "regional_share_percent" DECIMAL(5,2) NOT NULL DEFAULT 40,
    "partner_commission_percent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "min_monthly_fee_cents" INTEGER,
    "revenue_threshold_cents" INTEGER,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "territory_finance_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_profiles" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "territory_id" TEXT NOT NULL,
    "recipient_type" TEXT NOT NULL DEFAULT 'individual',
    "relationship_type" TEXT NOT NULL DEFAULT 'territorial_operator',
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "pix_key" TEXT,
    "pix_key_type" TEXT,
    "bank_name" TEXT,
    "full_name" TEXT,
    "document_cpf" TEXT,
    "document_rg" TEXT,
    "company_name" TEXT,
    "trade_name" TEXT,
    "document_cnpj" TEXT,
    "legal_representative_name" TEXT,
    "legal_representative_cpf" TEXT,
    "document_status" TEXT NOT NULL DEFAULT 'pending',
    "contract_status" TEXT NOT NULL DEFAULT 'pending',
    "terms_accepted_at" TIMESTAMP(3),
    "responsibility_terms_accepted_at" TIMESTAMP(3),
    "confidentiality_terms_accepted_at" TIMESTAMP(3),
    "terms_version" VARCHAR(20),
    "terms_accepted_by" TEXT,
    "contract_url" TEXT,
    "contract_signed_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "contract_template_url" TEXT,
    "contract_reviewed_by" TEXT,
    "contract_reviewed_at" TIMESTAMPTZ,
    "contract_rejection_reason" TEXT,

    CONSTRAINT "operator_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "operator_profile_id" TEXT NOT NULL,
    "submitted_by_admin_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signer_name" TEXT,
    "signer_email" TEXT,
    "signer_document" TEXT,
    "signer_ip" TEXT,
    "signer_user_agent" TEXT,
    "document_hash" TEXT,
    "contract_version" VARCHAR(20) DEFAULT 'v1.0',
    "submitted_at" TIMESTAMPTZ,

    CONSTRAINT "contract_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territory_payouts" (
    "id" TEXT NOT NULL,
    "territory_id" TEXT NOT NULL,
    "operator_profile_id" TEXT NOT NULL,
    "reference_month" TEXT NOT NULL,
    "calculated_amount" DECIMAL(10,2) NOT NULL,
    "approved_amount" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'calculated',
    "calculation_details" JSONB,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "paid_by" TEXT,
    "paid_at" TIMESTAMP(3),
    "payment_method" TEXT,
    "payment_ref" TEXT,
    "receipt_url" TEXT,
    "fiscal_document_required" BOOLEAN NOT NULL DEFAULT false,
    "fiscal_document_type" TEXT NOT NULL DEFAULT 'none',
    "fiscal_document_url" TEXT,
    "fiscal_document_ref" TEXT,
    "fiscal_notes" TEXT,
    "cancel_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "territory_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_homologations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255),
    "region" VARCHAR(100),
    "vehicle_model" VARCHAR(100),
    "vehicle_year" VARCHAR(10),
    "four_doors" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(30) NOT NULL DEFAULT 'NOVO',
    "driver_id" VARCHAR(255),
    "operator_id" UUID,
    "assigned_at" TIMESTAMP(3),
    "assigned_by" UUID,
    "videos_sent_at" TIMESTAMP(3),
    "quiz_sent_at" TIMESTAMP(3),
    "quiz_score" INTEGER,
    "quiz_passed" BOOLEAN,
    "photos_sent_at" TIMESTAMP(3),
    "photos_approved" BOOLEAN,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "source" VARCHAR(30) NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_homologations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_homologation_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "homologation_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "admin_id" UUID,
    "admin_name" VARCHAR(255),
    "old_status" VARCHAR(30),
    "new_status" VARCHAR(30),
    "old_operator_id" UUID,
    "new_operator_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_homologation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_homologation_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "homologation_id" UUID NOT NULL,
    "wa_message_id" UUID,
    "original_media_url" TEXT,
    "s3_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255),
    "mime_type" VARCHAR(50),
    "document_type" VARCHAR(50) NOT NULL DEFAULT 'outro',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_by_admin_id" UUID,
    "created_by_admin_name" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_admin_id" UUID,
    "approved_at" TIMESTAMP(3),
    "rejected_by_admin_id" UUID,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "retention_until" TIMESTAMP(3),
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "hidden_at" TIMESTAMP(3),
    "hidden_by_admin_id" UUID,
    "hide_reason" TEXT,

    CONSTRAINT "pet_homologation_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_maturity_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "neighborhood_id" TEXT NOT NULL,
    "territory_id" TEXT,
    "period_days" INTEGER NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "maturity_score" INTEGER NOT NULL,
    "maturity_status" TEXT NOT NULL,
    "methodology_version" TEXT NOT NULL DEFAULT 'v1',
    "components" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_maturity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "business_name" VARCHAR(255),
    "phone" VARCHAR(30),
    "email" VARCHAR(255),
    "lead_type" VARCHAR(50) NOT NULL DEFAULT 'OTHER',
    "status" VARCHAR(30) NOT NULL DEFAULT 'NEW',
    "source" VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
    "business_category" VARCHAR(50),
    "business_address" TEXT,
    "contact_person" VARCHAR(255),
    "wants_showcase" BOOLEAN,
    "wants_delivery_support" BOOLEAN,
    "wants_partnership" BOOLEAN,
    "wants_ads" BOOLEAN,
    "commercial_notes" TEXT,
    "territory_id" UUID,
    "neighborhood_id" TEXT,
    "assigned_admin_id" TEXT,
    "related_driver_id" TEXT,
    "related_passenger_id" TEXT,
    "related_partner_id" UUID,
    "related_private_ride_id" UUID,
    "related_pet_homologation_id" UUID,
    "related_showcase_item_id" UUID,
    "priority" VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "next_action" VARCHAR(500),
    "next_action_at" TIMESTAMP(3),
    "last_contact_at" TIMESTAMP(3),
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "captured_by_member_id" UUID,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_interactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "old_status" VARCHAR(30),
    "new_status" VARCHAR(30),
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "crm_lead_id" UUID,
    "slug" VARCHAR(100),
    "name" VARCHAR(255) NOT NULL,
    "trade_name" VARCHAR(255),
    "category" VARCHAR(50) NOT NULL DEFAULT 'outro',
    "document_cnpj" VARCHAR(20),
    "document_cpf" VARCHAR(14),
    "phone" VARCHAR(30),
    "email" VARCHAR(255),
    "address" TEXT,
    "neighborhood_id" TEXT,
    "territory_id" UUID,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "commission_percent" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "payout_pix_key_type" VARCHAR(20),
    "payout_pix_key" VARCHAR(100),
    "payout_receiver_name" VARCHAR(255),

    CONSTRAINT "commerce_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commerce_account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'owner',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commerce_account_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50),
    "price_cents" INTEGER NOT NULL,
    "image_url" TEXT,
    "image_key" TEXT,
    "image_mime_type" VARCHAR(50),
    "image_size_bytes" INTEGER,
    "image_updated_at" TIMESTAMPTZ,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_restricted" BOOLEAN NOT NULL DEFAULT false,
    "stock_quantity" INTEGER,
    "min_stock_alert" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "commerce_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commerce_account_id" UUID NOT NULL,
    "customer_name" VARCHAR(255) NOT NULL,
    "customer_phone" VARCHAR(30) NOT NULL,
    "customer_address" TEXT,
    "delivery_type" VARCHAR(20) NOT NULL DEFAULT 'pickup',
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "subtotal_cents" INTEGER NOT NULL,
    "delivery_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "kaviar_commission_cents" INTEGER NOT NULL,
    "commerce_net_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "payment_method" VARCHAR(20),
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "pix_qr_code" TEXT,
    "pix_copy_paste" TEXT,
    "pix_expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "order_code" VARCHAR(10),
    "delivery_code" VARCHAR(6),
    "delivery_status" VARCHAR(20) NOT NULL DEFAULT 'none',
    "delivery_requested_at" TIMESTAMP(3),
    "driver_id" TEXT,
    "driver_name" VARCHAR(100),
    "dispatched_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "notes" TEXT,
    "accepted_at" TIMESTAMP(3),
    "prepared_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "notes" VARCHAR(255),

    CONSTRAINT "commerce_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commerce_account_id" UUID NOT NULL,
    "available_balance_cents" INTEGER NOT NULL DEFAULT 0,
    "pending_balance_cents" INTEGER NOT NULL DEFAULT 0,
    "total_received_cents" INTEGER NOT NULL DEFAULT 0,
    "total_withdrawn_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_wallet_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commerce_account_id" UUID NOT NULL,
    "order_id" UUID,
    "withdrawal_id" UUID,
    "type" VARCHAR(30) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "balance_after_cents" INTEGER NOT NULL,
    "description" VARCHAR(500),
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_withdrawal_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commerce_account_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    "pix_key_type" VARCHAR(20),
    "pix_key" VARCHAR(100),
    "receiver_name" VARCHAR(255),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_admin_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "paid_by_admin_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commerce_withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_places" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "place_id" VARCHAR(120) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "ar_place_type" NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "status" "ar_place_status" NOT NULL DEFAULT 'DRAFT',
    "territory_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ar_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_place_contents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ar_place_id" UUID NOT NULL,
    "locale" "ar_place_locale" NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "learn_more" TEXT,
    "useful_info" TEXT,
    "grounding_rule" TEXT,
    "boundary_rule" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ar_place_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_team_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "manager_admin_id" TEXT NOT NULL,
    "territory_id" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30),
    "role_type" VARCHAR(30) NOT NULL DEFAULT 'outro',
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "cpf" VARCHAR(14),
    "address" TEXT,
    "city" VARCHAR(100),
    "state" VARCHAR(2),
    "zipcode" VARCHAR(10),
    "pix_key" VARCHAR(100),
    "pix_key_type" VARCHAR(20),
    "contract_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "contract_signed_at" TIMESTAMP(3),
    "contract_version" VARCHAR(30),
    "contract_notes" TEXT,
    "public_referral_code" VARCHAR(30),
    "referral_code_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manager_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_team_commissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "manager_admin_id" TEXT NOT NULL,
    "member_id" UUID NOT NULL,
    "territory_id" TEXT,
    "description" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reference_month" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manager_team_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "women_matching_consent_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "consent_version" TEXT,
    "source" TEXT NOT NULL DEFAULT 'api',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "women_matching_consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_fee_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platform_fee_percent" DECIMAL(5,2) NOT NULL,
    "effective_from" TIMESTAMPTZ NOT NULL,
    "effective_to" TIMESTAMPTZ,
    "approval_status" TEXT NOT NULL DEFAULT 'pending',
    "change_reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMPTZ,
    "rejected_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_fee_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territory_manager_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "territory_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "operator_profile_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "end_reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "territory_manager_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_shadow_results" (
    "id" BIGSERIAL NOT NULL,
    "ride_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "calculation_version" INTEGER NOT NULL DEFAULT 1,
    "calculation_status" TEXT NOT NULL DEFAULT 'success',
    "final_price_cents" INTEGER,
    "wait_charge_cents" INTEGER,
    "fee_config_id" UUID,
    "fee_percent" DECIMAL(5,2),
    "fee_amount_cents" INTEGER,
    "matrix_share_percent" DECIMAL(5,2),
    "matrix_share_cents" INTEGER,
    "manager_share_percent" DECIMAL(5,2),
    "manager_share_cents" INTEGER,
    "driver_earnings_cents" INTEGER,
    "territory_id" TEXT,
    "assignment_id" UUID,
    "assignment_status" TEXT,
    "allocation_reason" TEXT,
    "legacy_credit_cost" INTEGER,
    "legacy_nominal_value_cents" INTEGER,
    "divergence_cents" INTEGER,
    "reference_month" DATE,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_shadow_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_wallets" (
    "driver_id" TEXT NOT NULL,
    "balance_cents" BIGINT NOT NULL DEFAULT 0,
    "reserved_cents" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_wallets_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "wallet_ledger" (
    "id" BIGSERIAL NOT NULL,
    "driver_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "balance_delta_cents" BIGINT NOT NULL DEFAULT 0,
    "reserved_delta_cents" BIGINT NOT NULL DEFAULT 0,
    "balance_after_cents" BIGINT NOT NULL,
    "reserved_after_cents" BIGINT NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "actor_type" TEXT,
    "actor_id" TEXT,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_recharges" (
    "id" UUID NOT NULL,
    "driver_id" TEXT NOT NULL,
    "package_id" TEXT,
    "amount_cents" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_provider" TEXT NOT NULL DEFAULT 'sumup',
    "external_id" TEXT,
    "pix_qr_code" TEXT,
    "pix_copy_paste" TEXT,
    "pix_expires_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_recharges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recharge_packages" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recharge_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_debits" (
    "id" BIGSERIAL NOT NULL,
    "ride_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "final_price_cents" BIGINT NOT NULL,
    "fee_percent_snapshot" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "fee_amount_cents" BIGINT NOT NULL,
    "fee_collected_cents" BIGINT NOT NULL DEFAULT 0,
    "fee_pending_cents" BIGINT NOT NULL,
    "reserved_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT 'platform_fee',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "pending_debits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_fee_splits" (
    "id" BIGSERIAL NOT NULL,
    "ride_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "final_price_cents" BIGINT NOT NULL,
    "fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "fee_amount_cents" BIGINT NOT NULL,
    "fee_collected_cents" BIGINT NOT NULL DEFAULT 0,
    "fee_pending_cents" BIGINT NOT NULL DEFAULT 0,
    "matrix_share_percent" DECIMAL(5,2) NOT NULL DEFAULT 60.00,
    "matrix_share_cents" BIGINT NOT NULL,
    "manager_share_percent" DECIMAL(5,2) NOT NULL DEFAULT 40.00,
    "manager_share_cents" BIGINT NOT NULL,
    "territory_id" TEXT,
    "manager_id" TEXT,
    "manager_assignment_id" TEXT,
    "reference_month" TEXT NOT NULL,
    "collection_status" TEXT NOT NULL DEFAULT 'collected',
    "recognized_at" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    "recognized_at_source" TEXT NOT NULL DEFAULT 'DB_SETTLEMENT_CLOCK',
    "platform_fee_rate_bps" INTEGER NOT NULL DEFAULT 1800,
    "manager_commission_rate_bps" INTEGER NOT NULL DEFAULT 4000,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_fee_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_referral_rewards" (
    "id" BIGSERIAL NOT NULL,
    "driver_id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referrer_type" TEXT NOT NULL,
    "first_valid_ride_id" TEXT NOT NULL,
    "total_reward_cents" BIGINT NOT NULL DEFAULT 2000,
    "matrix_cost_cents" BIGINT NOT NULL DEFAULT 1000,
    "manager_cost_cents" BIGINT NOT NULL DEFAULT 1000,
    "territory_id" TEXT,
    "manager_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'eligible',
    "approved_at" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_reward_payouts" (
    "id" BIGSERIAL NOT NULL,
    "reward_id" BIGINT NOT NULL,
    "referrer_type" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL DEFAULT 2000,
    "matrix_cost_cents" BIGINT NOT NULL DEFAULT 1000,
    "manager_cost_cents" BIGINT NOT NULL DEFAULT 1000,
    "territory_id" TEXT,
    "manager_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_method" TEXT,
    "paid_at" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_reward_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territory_ledger" (
    "id" BIGSERIAL NOT NULL,
    "territory_id" TEXT NOT NULL,
    "manager_id" TEXT,
    "manager_assignment_id" TEXT,
    "reference_month" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "description" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "territory_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_return_accruals" (
    "id" BIGSERIAL NOT NULL,
    "driver_id" TEXT NOT NULL,
    "recharge_id" UUID NOT NULL,
    "source_amount_cents" BIGINT NOT NULL,
    "accrued_amount_cents" BIGINT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "status" TEXT NOT NULL DEFAULT 'accrued',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_return_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_fixed_routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(800),
    "origin_label" VARCHAR(160) NOT NULL,
    "destination_label" VARCHAR(160) NOT NULL,
    "trip_type" VARCHAR(30) NOT NULL DEFAULT 'round_trip',
    "departure_time" VARCHAR(5),
    "return_time" VARCHAR(5),
    "days_of_week" JSONB NOT NULL,
    "seats_total" INTEGER NOT NULL,
    "price_per_passenger_cents" INTEGER NOT NULL,
    "suggested_price_cents" INTEGER,
    "min_price_cents" INTEGER,
    "max_price_cents" INTEGER,
    "kaviar_fee_percent" DECIMAL(5,2) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'active',
    "invite_code" VARCHAR(40) NOT NULL,
    "territory_id" TEXT,
    "neighborhood_id" TEXT,
    "paused_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_fixed_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_fixed_route_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" UUID NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'confirmed',
    "seats_reserved" INTEGER NOT NULL DEFAULT 1,
    "price_cents" INTEGER NOT NULL,
    "kaviar_fee_percent" DECIMAL(5,2) NOT NULL,
    "kaviar_fee_cents" INTEGER NOT NULL,
    "driver_net_cents" INTEGER NOT NULL,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_fixed_route_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_route_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" UUID NOT NULL,
    "reservation_id" UUID,
    "sender_type" VARCHAR(30) NOT NULL,
    "sender_driver_id" TEXT,
    "sender_passenger_id" TEXT,
    "sender_admin_id" TEXT,
    "recipient_type" VARCHAR(40) NOT NULL,
    "recipient_driver_id" TEXT,
    "recipient_passenger_id" TEXT,
    "message_code" VARCHAR(60),
    "message_text" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "fixed_route_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_fixed_route_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_id" UUID NOT NULL,
    "reservation_id" UUID,
    "actor_type" VARCHAR(30) NOT NULL,
    "actor_id" TEXT,
    "action" VARCHAR(80) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_fixed_route_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kaviar_groups" (
    "id" TEXT NOT NULL,
    "public_name" VARCHAR(120) NOT NULL,
    "internal_name" VARCHAR(160),
    "type" VARCHAR(40) NOT NULL DEFAULT 'private_group',
    "responsible_name" VARCHAR(160),
    "responsible_phone" VARCHAR(30),
    "responsible_email" VARCHAR(255),
    "description" VARCHAR(500),
    "rules" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "community_id" TEXT,
    "neighborhood_id" TEXT,
    "territory_id" TEXT,
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kaviar_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kaviar_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_type" VARCHAR(20) NOT NULL,
    "passenger_id" TEXT,
    "driver_id" TEXT,
    "name" VARCHAR(160),
    "phone" VARCHAR(30),
    "role" VARCHAR(30) NOT NULL DEFAULT 'member',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "invite_id" TEXT,
    "invite_source" VARCHAR(40),
    "consented_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kaviar_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kaviar_group_invites" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "token_hash" VARCHAR(128),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by_admin_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kaviar_group_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kaviar_group_responsible_invites" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'active',
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "invited_by_admin_id" TEXT,
    "accepted_by_member_id" TEXT,
    "accepted_by_passenger_id" TEXT,
    "consent_text_version" VARCHAR(50),
    "consent_given_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kaviar_group_responsible_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kaviar_group_posts" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "author_type" VARCHAR(30) NOT NULL,
    "author_admin_id" TEXT,
    "author_member_id" TEXT,
    "author_display_name_snapshot" VARCHAR(160),
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "category" VARCHAR(40) NOT NULL DEFAULT 'general',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(30) NOT NULL DEFAULT 'published',
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kaviar_group_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kaviar_group_post_reads" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kaviar_group_post_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_notifications" (
    "id" TEXT NOT NULL,
    "recipient_type" VARCHAR(30) NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500) NOT NULL DEFAULT '',
    "type" VARCHAR(60) NOT NULL DEFAULT 'system',
    "source_type" VARCHAR(60),
    "source_id" TEXT,
    "route_id" TEXT,
    "reservation_id" TEXT,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_incentive_ledger" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "driver_id" TEXT NOT NULL,
    "program_year" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "base_amount_cents" BIGINT,
    "rate_basis_points" INTEGER,
    "policy_version" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "source_event_id" TEXT,
    "request_id" TEXT,
    "correlation_id" TEXT,
    "reversal_of_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_incentive_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_payout_destinations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "driver_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'pix',
    "method" TEXT NOT NULL DEFAULT 'CPF',
    "pix_key_type" TEXT NOT NULL,
    "pix_key_encrypted" TEXT NOT NULL,
    "pix_key_hash" TEXT NOT NULL,
    "pix_key_masked" TEXT NOT NULL,
    "owner_document_hash" TEXT NOT NULL,
    "encryption_key_version" TEXT NOT NULL DEFAULT '1',
    "status" TEXT NOT NULL DEFAULT 'active',
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ,

    CONSTRAINT "driver_payout_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_incentive_requests" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "driver_id" TEXT NOT NULL,
    "requested_amount_cents" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "destination_snapshot_encrypted" TEXT NOT NULL,
    "destination_hash" TEXT NOT NULL,
    "destination_masked" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL,
    "reserved_at" TIMESTAMPTZ,
    "eligibility_checked_at" TIMESTAMPTZ,
    "queued_at" TIMESTAMPTZ,
    "paid_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "released_at" TIMESTAMPTZ,
    "deadline_at" TIMESTAMPTZ NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "failure_code" TEXT,
    "failure_message_safe" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_incentive_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_incentive_request_allocations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "request_id" TEXT NOT NULL,
    "program_year" INTEGER NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_incentive_request_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_incentive_payouts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "request_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "provider_payout_id" TEXT,
    "external_reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider_status" TEXT,
    "provider_response_safe" JSONB,
    "submitted_at" TIMESTAMPTZ,
    "confirmed_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_incentive_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_incentive_payout_attempts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "payout_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "error_safe" TEXT,
    "provider_response_safe" JSONB,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "next_retry_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_incentive_payout_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_incentive_payout_outbox" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "request_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ,
    "locked_by" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_incentive_payout_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_incentive_webhook_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "provider_name" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payout_id" TEXT,
    "payload_safe" JSONB NOT NULL DEFAULT '{}',
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_incentive_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payees" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "payee_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "legal_name_encrypted" TEXT NOT NULL,
    "cpf_cnpj_encrypted" TEXT NOT NULL,
    "cpf_cnpj_hmac" TEXT NOT NULL,
    "cpf_cnpj_masked" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "risk_status" TEXT NOT NULL DEFAULT 'NORMAL',
    "encryption_key_version" TEXT NOT NULL DEFAULT '1',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ,

    CONSTRAINT "financial_payees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payee_destinations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "payee_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "key_type" TEXT,
    "key_encrypted" TEXT NOT NULL,
    "key_hmac" TEXT NOT NULL,
    "key_masked" TEXT NOT NULL,
    "encryption_key_version" TEXT NOT NULL DEFAULT '1',
    "status" TEXT NOT NULL DEFAULT 'active',
    "verified_at" TIMESTAMPTZ,
    "cooldown_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ,

    CONSTRAINT "financial_payee_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_obligations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "payee_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "description_safe" TEXT NOT NULL,
    "gross_amount_cents" BIGINT NOT NULL,
    "discount_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "net_amount_cents" BIGINT NOT NULL,
    "due_date" DATE,
    "competence_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "recurring_schedule_id" TEXT,
    "document_reference" TEXT,
    "destination_snapshot_encrypted" TEXT,
    "destination_hmac" TEXT,
    "destination_masked" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "created_by_system" BOOLEAN NOT NULL DEFAULT false,
    "created_by_admin_id" TEXT,
    "approved_by_admin_id" TEXT,
    "approved_at" TIMESTAMPTZ,
    "failure_code" TEXT,
    "failure_message_safe" TEXT,
    "deadline_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_obligation_allocations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "obligation_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_obligation_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payouts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "obligation_id" TEXT NOT NULL,
    "payee_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "instrument" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "provider_payout_id" TEXT,
    "external_reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider_status" TEXT,
    "provider_response_safe" JSONB,
    "fee_cents" BIGINT,
    "submitted_at" TIMESTAMPTZ,
    "confirmed_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payout_attempts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "payout_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "error_safe" TEXT,
    "provider_response_safe" JSONB,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "next_retry_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_payout_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payout_outbox" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "obligation_id" TEXT NOT NULL,
    "payee_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMPTZ,
    "locked_by" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_payout_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_provider_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "provider_name" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_category" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payout_id" TEXT,
    "payload_safe" JSONB NOT NULL DEFAULT '{}',
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMPTZ,
    "processing_status" TEXT NOT NULL DEFAULT 'PENDING',
    "processing_attempts" INTEGER NOT NULL DEFAULT 0,
    "next_processing_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_error_safe" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_recurring_obligations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "payee_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "description_safe" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "expected_amount_cents" BIGINT NOT NULL,
    "amount_tolerance_cents" BIGINT NOT NULL DEFAULT 0,
    "due_day" INTEGER,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requires_document" BOOLEAN NOT NULL DEFAULT true,
    "automatic_approval_allowed" BOOLEAN NOT NULL DEFAULT false,
    "last_generated_competence" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_recurring_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payment_audit" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "admin_id" TEXT,
    "system_actor" TEXT,
    "details_safe" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_payment_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territory_payout_cycles" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "territory_id" TEXT NOT NULL,
    "manager_id" TEXT,
    "reference_month" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "commission_rate_basis_points" INTEGER NOT NULL DEFAULT 4000,
    "platform_fee_rate_basis_points" INTEGER NOT NULL DEFAULT 1800,
    "competence_timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "cycle_type" TEXT NOT NULL DEFAULT 'REGULAR',
    "parent_cycle_id" TEXT,
    "sequence_number" INTEGER NOT NULL DEFAULT 1,
    "gross_platform_fee_cents" BIGINT NOT NULL DEFAULT 0,
    "gross_manager_commission_cents" BIGINT NOT NULL DEFAULT 0,
    "approved_adjustments_cents" BIGINT NOT NULL DEFAULT 0,
    "approved_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "fiscal_document_required" BOOLEAN NOT NULL DEFAULT false,
    "fiscal_document_type" TEXT,
    "fiscal_document_status" TEXT DEFAULT 'NOT_REQUIRED',
    "fiscal_document_reference" TEXT,
    "fiscal_document_url" TEXT,
    "calculated_at" TIMESTAMPTZ,
    "recognized_at" TIMESTAMPTZ,
    "submitted_for_review_at" TIMESTAMPTZ,
    "approved_at" TIMESTAMPTZ,
    "approved_by" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT NOT NULL,

    CONSTRAINT "territory_payout_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territory_cycle_allocations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "cycle_id" TEXT NOT NULL,
    "ledger_entry_id" BIGINT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "manager_assignment_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "territory_cycle_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_entities" (
    "id" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "nome_fantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "entity_type" "legal_entity_type" NOT NULL,
    "parent_entity_id" TEXT,
    "uf" VARCHAR(2),
    "municipio" TEXT,
    "endereco" TEXT,
    "codigo_interno" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "data_abertura" DATE,
    "situacao_cadastral" VARCHAR(20),
    "data_situacao_cadastral" DATE,
    "porte" VARCHAR(10),
    "natureza_juridica" TEXT,
    "capital_social_cents" BIGINT,
    "email_institucional" TEXT,
    "telefone_institucional" TEXT,
    "whatsapp_institucional" TEXT,
    "site" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cep" VARCHAR(10),
    "cnae_principal" TEXT,
    "cnaes_secundarios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_entity_persons" (
    "id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "funcao" TEXT NOT NULL,
    "funcao_origem" TEXT NOT NULL DEFAULT 'INTERNAL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_entity_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_firms" (
    "id" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "nome_fantasia" TEXT,
    "document_type" "accounting_firm_document_type" NOT NULL,
    "document_number" TEXT NOT NULL,
    "crc" TEXT,
    "crc_uf" VARCHAR(2),
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountants" (
    "id" TEXT NOT NULL,
    "accounting_firm_id" TEXT NOT NULL,
    "nome_completo" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT,
    "crc" TEXT,
    "crc_uf" VARCHAR(2),
    "job_title" TEXT,
    "department" TEXT,
    "is_responsible_accountant" BOOLEAN NOT NULL DEFAULT false,
    "status" "accountant_status" NOT NULL DEFAULT 'INVITED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" TEXT,
    "password_changed_at" TIMESTAMP(3),
    "password_version" INTEGER NOT NULL DEFAULT 1,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "terms_accepted_at" TIMESTAMP(3),
    "invited_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accountants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_invites" (
    "id" TEXT NOT NULL,
    "accountant_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "accountant_invite_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_admin_id" TEXT NOT NULL,
    "resent_count" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMP(3),
    "revoked_by_admin_id" TEXT,
    "accepted_ip" TEXT,
    "accepted_user_agent" TEXT,
    "last_email_sent_at" TIMESTAMP(3),
    "last_email_status" TEXT,
    "last_email_error" TEXT,
    "last_email_log_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accountant_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_entity_links" (
    "id" TEXT NOT NULL,
    "accountant_id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "scope" "accountant_link_scope" NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT true,
    "can_upload" BOOLEAN NOT NULL DEFAULT false,
    "can_download" BOOLEAN NOT NULL DEFAULT true,
    "can_request_correction" BOOLEAN NOT NULL DEFAULT false,
    "can_mark_processed" BOOLEAN NOT NULL DEFAULT false,
    "can_close_period" BOOLEAN NOT NULL DEFAULT false,
    "inherits_children" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "status" "accountant_link_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by_admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accountant_entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_sessions" (
    "id" TEXT NOT NULL,
    "accountant_id" TEXT NOT NULL,
    "token_family_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "parent_session_id" TEXT,
    "replaced_by_id" TEXT,
    "status" "accountant_session_status" NOT NULL DEFAULT 'ACTIVE',
    "scope" TEXT NOT NULL DEFAULT 'WEB',
    "device_name" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_ip" TEXT,
    "last_activity_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "rotated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,
    "reuse_detected_at" TIMESTAMP(3),

    CONSTRAINT "accountant_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_password_resets" (
    "id" TEXT NOT NULL,
    "accountant_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "accountant_reset_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "requested_ip" TEXT,
    "requested_user_agent" TEXT,
    "used_at" TIMESTAMP(3),
    "used_ip" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accountant_password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_document_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "accounting_document_category" NOT NULL,
    "requires_validity" BOOLEAN NOT NULL DEFAULT false,
    "renewal_alert_days" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_company_documents" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "document_type_id" TEXT NOT NULL,
    "status" "accounting_document_status" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMP(3),
    "valid_from" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "reference_number" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_by_type" VARCHAR(20),
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_company_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_company_document_files" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "original_filename" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "uploaded_by_admin_id" TEXT,
    "uploaded_by_accountant_id" TEXT,
    "scan_status" "accounting_document_scan_status" NOT NULL DEFAULT 'NOT_SCANNED',
    "replacement_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_company_document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_certificates" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "certificate_type" "accounting_certificate_type" NOT NULL,
    "mode" "accounting_certificate_mode" NOT NULL DEFAULT 'METADATA_ONLY',
    "status" "accounting_certificate_status" NOT NULL DEFAULT 'ACTIVE',
    "holder_name" TEXT NOT NULL,
    "holder_document" TEXT,
    "serial_number" TEXT,
    "issuer" TEXT,
    "issued_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "storage_location" TEXT,
    "notes" TEXT,
    "responsible_accountant_id" TEXT,
    "replaced_by_id" TEXT,
    "created_by_id" TEXT,
    "created_by_type" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_powers_of_attorney" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "scope" "accounting_power_of_attorney_scope" NOT NULL,
    "scope_detail" TEXT,
    "status" "accounting_power_of_attorney_status" NOT NULL DEFAULT 'ACTIVE',
    "grantor_name" TEXT NOT NULL,
    "grantor_document" TEXT,
    "grantee_name" TEXT NOT NULL,
    "grantee_document" TEXT,
    "issued_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "protocol_number" TEXT,
    "notes" TEXT,
    "responsible_accountant_id" TEXT,
    "document_file_id" TEXT,
    "replaced_by_id" TEXT,
    "created_by_id" TEXT,
    "created_by_type" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_powers_of_attorney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_fiscal_health_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rule_type" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "severity" TEXT NOT NULL DEFAULT 'CRITICAL',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_fiscal_health_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_payment_obligations" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "obligation_type" "accounting_obligation_type" NOT NULL,
    "status" "accounting_obligation_status" NOT NULL DEFAULT 'DRAFT',
    "action_owner" "accounting_obligation_action_owner" NOT NULL DEFAULT 'ACCOUNTANT',
    "description" TEXT NOT NULL,
    "beneficiary" TEXT,
    "reference_number" TEXT,
    "competence_month" INTEGER,
    "competence_year" INTEGER,
    "amount_cents" INTEGER NOT NULL,
    "issued_at" DATE,
    "due_date" DATE NOT NULL,
    "barcode" TEXT,
    "pix_key" TEXT,
    "notes" TEXT,
    "boleto_storage_key" TEXT,
    "boleto_filename" TEXT,
    "boleto_mime_type" TEXT,
    "boleto_size_bytes" INTEGER,
    "proof_storage_key" TEXT,
    "proof_filename" TEXT,
    "proof_mime_type" TEXT,
    "proof_size_bytes" INTEGER,
    "sent_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "proof_uploaded_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "reconciled_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_by_accountant_id" TEXT,
    "verified_by_accountant_id" TEXT,
    "competency_id" TEXT,
    "invoice_pdf_storage_key" TEXT,
    "invoice_pdf_filename" TEXT,
    "invoice_pdf_mime_type" TEXT,
    "invoice_pdf_size_bytes" INTEGER,
    "invoice_xml_storage_key" TEXT,
    "invoice_xml_filename" TEXT,
    "invoice_xml_mime_type" TEXT,
    "invoice_xml_size_bytes" INTEGER,
    "invoice_number" TEXT,
    "invoice_series" TEXT,
    "invoice_access_key" TEXT,
    "invoice_verification_code" TEXT,
    "invoice_issued_at" DATE,
    "invoice_uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_payment_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_obligation_access_tokens" (
    "id" TEXT NOT NULL,
    "obligation_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_accountant_id" TEXT NOT NULL,
    "accessed_count" INTEGER NOT NULL DEFAULT 0,
    "last_accessed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_obligation_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_obligation_audit" (
    "id" TEXT NOT NULL,
    "obligation_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_obligation_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_competencies" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "accounting_competency_status" NOT NULL DEFAULT 'OPEN',
    "action_owner" TEXT NOT NULL DEFAULT 'ACCOUNTANT',
    "expected_deadline" DATE,
    "completed_at" TIMESTAMP(3),
    "completed_by_accountant_id" TEXT,
    "reopened_at" TIMESTAMP(3),
    "reopen_reason" TEXT,
    "responsible_accountant_id" TEXT,
    "notes" TEXT,
    "created_by_accountant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_competency_documents" (
    "id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_by_accountant_id" TEXT,

    CONSTRAINT "accounting_competency_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_recurring_templates" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "obligation_type" "accounting_obligation_type" NOT NULL,
    "description" TEXT NOT NULL,
    "beneficiary" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "day_of_month_due" INTEGER NOT NULL,
    "days_before_due_to_create" INTEGER NOT NULL DEFAULT 15,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_by_accountant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_recurring_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_automation_config" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "auto_create_competency" BOOLEAN NOT NULL DEFAULT false,
    "competency_deadline_day" INTEGER DEFAULT 20,
    "auto_create_obligations" BOOLEAN NOT NULL DEFAULT false,
    "send_reminder_d7" BOOLEAN NOT NULL DEFAULT true,
    "send_reminder_d1" BOOLEAN NOT NULL DEFAULT true,
    "send_reminder_due" BOOLEAN NOT NULL DEFAULT true,
    "send_reminder_overdue" BOOLEAN NOT NULL DEFAULT true,
    "notify_accountant_proof" BOOLEAN NOT NULL DEFAULT true,
    "notify_company_pending" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_automation_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_automation_log" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_automation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_city_landings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "public_status" VARCHAR(32) NOT NULL,
    "landing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_number" VARCHAR(20),
    "created_by_admin_id" UUID,
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_city_landings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content_md" TEXT NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "knowledge_scope" VARCHAR(20) NOT NULL DEFAULT 'CURRENT',
    "allowed_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approved_by" TEXT,
    "approved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_badge_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "driver_id" TEXT NOT NULL,
    "badge_code" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(30) NOT NULL,
    "reason" TEXT,
    "criteria_snapshot" JSONB,
    "admin_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_badge_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_jobs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_SCOPE',
    "allowed_paths" JSONB,
    "scope_rationale" TEXT,
    "scope_resolved_at" TIMESTAMPTZ,
    "requested_by_admin_id" TEXT NOT NULL,
    "confirmed_by_admin_id" TEXT,
    "confirmed_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "locked_at" TIMESTAMPTZ,
    "locked_by" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result_changed_paths" JSONB,
    "result_summary" TEXT,
    "result_branch" TEXT,
    "result_commit_sha" TEXT,
    "error_message" TEXT,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "development_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territorial_dataset_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city" TEXT NOT NULL,
    "uf" VARCHAR(2) NOT NULL,
    "territory_id" TEXT,
    "provider_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "method" TEXT,
    "collected_at" TIMESTAMPTZ NOT NULL,
    "is_official" BOOLEAN NOT NULL DEFAULT false,
    "source_verified" BOOLEAN NOT NULL DEFAULT false,
    "s3_raw_key" TEXT,
    "s3_normalized_key" TEXT,
    "feature_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "out_of_bbox_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ,
    "notes" TEXT,
    "checksum" TEXT,

    CONSTRAINT "territorial_dataset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admins_invite_code_key" ON "admins"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "community_geofences_community_id_key" ON "community_geofences"("community_id");

-- CreateIndex
CREATE INDEX "community_geofences_geom_gist" ON "community_geofences" USING GIST ("geom");

-- CreateIndex
CREATE UNIQUE INDEX "consent_subject_type_subject_id_type_key" ON "consents"("subject_type", "subject_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "consent_user_id_type_key" ON "consents"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "driver_documents_driver_type_uniq" ON "driver_documents"("driver_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "driver_verifications_driver_id_key" ON "driver_verifications"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_email_key" ON "drivers"("email");

-- CreateIndex
CREATE INDEX "drivers_territory_type_idx" ON "drivers"("territory_type");

-- CreateIndex
CREATE INDEX "drivers_neighborhood_id_territory_type_idx" ON "drivers"("neighborhood_id", "territory_type");

-- CreateIndex
CREATE INDEX "drivers_status_idx" ON "drivers"("status");

-- CreateIndex
CREATE INDEX "drivers_last_location_updated_at_idx" ON "drivers"("last_location_updated_at");

-- CreateIndex
CREATE INDEX "drivers_active_since_idx" ON "drivers"("active_since");

-- CreateIndex
CREATE INDEX "drivers_premium_tourism_status_idx" ON "drivers"("premium_tourism_status");

-- CreateIndex
CREATE INDEX "drivers_territorial_partner_id_idx" ON "drivers"("territorial_partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "elderly_profiles_passenger_id_key" ON "elderly_profiles"("passenger_id");

-- CreateIndex
CREATE UNIQUE INDEX "neighborhood_geofences_neighborhood_id_key" ON "neighborhood_geofences"("neighborhood_id");

-- CreateIndex
CREATE INDEX "idx_neighborhood_geofences_geom" ON "neighborhood_geofences" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "neighborhoods_city_idx" ON "neighborhoods"("city");

-- CreateIndex
CREATE INDEX "idx_neighborhoods_area_type" ON "neighborhoods"("area_type");

-- CreateIndex
CREATE INDEX "idx_neighborhoods_city_type" ON "neighborhoods"("city", "area_type");

-- CreateIndex
CREATE INDEX "idx_neighborhoods_parent" ON "neighborhoods"("parent_neighborhood_id");

-- CreateIndex
CREATE INDEX "idx_neighborhoods_territory" ON "neighborhoods"("territory_id");

-- CreateIndex
CREATE UNIQUE INDEX "neighborhoods_name_city_key" ON "neighborhoods"("name", "city");

-- CreateIndex
CREATE UNIQUE INDEX "community_leaders_email_key" ON "community_leaders"("email");

-- CreateIndex
CREATE INDEX "community_leaders_neighborhood_id_idx" ON "community_leaders"("neighborhood_id");

-- CreateIndex
CREATE INDEX "community_leaders_community_id_idx" ON "community_leaders"("community_id");

-- CreateIndex
CREATE INDEX "community_leaders_verification_status_idx" ON "community_leaders"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "passengers_email_key" ON "passengers"("email");

-- CreateIndex
CREATE INDEX "passenger_favorite_locations_passenger_id_idx" ON "passenger_favorite_locations"("passenger_id");

-- CreateIndex
CREATE INDEX "idx_phone_challenges_lookup" ON "phone_challenges"("phone", "purpose", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_phone_challenges_user" ON "phone_challenges"("user_id", "user_type");

-- CreateIndex
CREATE INDEX "idx_feature_flag_allowlist_key_passenger" ON "feature_flag_allowlist"("key", "passenger_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_allowlist_key_passenger_id_key" ON "feature_flag_allowlist"("key", "passenger_id");

-- CreateIndex
CREATE INDEX "idx_beta_monitor_feature_created" ON "beta_monitor_checkpoints"("feature_key", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_beta_monitor_phase_created" ON "beta_monitor_checkpoints"("phase", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rating_stats_user_id_key" ON "rating_stats"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rating_stats_entity_type_entity_id_key" ON "rating_stats"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "rating_ride_id_user_id_key" ON "ratings"("ride_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ride_confirmations_confirmation_token_key" ON "ride_confirmations"("confirmation_token");

-- CreateIndex
CREATE INDEX "rides_driver_id_created_at_idx" ON "rides"("driver_id", "created_at");

-- CreateIndex
CREATE INDEX "rides_status_idx" ON "rides"("status");

-- CreateIndex
CREATE INDEX "rides_pickup_neighborhood_id_idx" ON "rides"("pickup_neighborhood_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tourist_guides_email_key" ON "tourist_guides"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_consents_passenger_id_consent_type_key" ON "user_consents"("passenger_id", "consent_type");

-- CreateIndex
CREATE UNIQUE INDEX "driver_consents_driver_id_key" ON "driver_consents"("driver_id");

-- CreateIndex
CREATE INDEX "idx_driver_modalities_driver" ON "driver_modalities"("driver_id");

-- CreateIndex
CREATE INDEX "idx_driver_modalities_status" ON "driver_modalities"("status");

-- CreateIndex
CREATE INDEX "idx_driver_modalities_modality_status" ON "driver_modalities"("modality", "status");

-- CreateIndex
CREATE UNIQUE INDEX "driver_modalities_driver_id_modality_key" ON "driver_modalities"("driver_id", "modality");

-- CreateIndex
CREATE INDEX "driver_compliance_documents_driver_id_idx" ON "driver_compliance_documents"("driver_id");

-- CreateIndex
CREATE INDEX "driver_compliance_documents_status_idx" ON "driver_compliance_documents"("status");

-- CreateIndex
CREATE INDEX "driver_compliance_documents_is_current_idx" ON "driver_compliance_documents"("is_current");

-- CreateIndex
CREATE INDEX "driver_compliance_documents_valid_until_idx" ON "driver_compliance_documents"("valid_until");

-- CreateIndex
CREATE INDEX "idx_match_logs_created" ON "match_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_match_logs_driver" ON "match_logs"("driver_id");

-- CreateIndex
CREATE INDEX "idx_match_logs_ride" ON "match_logs"("ride_id");

-- CreateIndex
CREATE INDEX "idx_match_logs_trip" ON "match_logs"("trip_id");

-- CreateIndex
CREATE INDEX "idx_match_logs_type" ON "match_logs"("match_type");

-- CreateIndex
CREATE INDEX "driver_badges_driver_id_unlocked_at_idx" ON "driver_badges"("driver_id", "unlocked_at" DESC);

-- CreateIndex
CREATE INDEX "driver_badges_badge_type_idx" ON "driver_badges"("badge_type");

-- CreateIndex
CREATE UNIQUE INDEX "driver_badges_driver_id_badge_type_key" ON "driver_badges"("driver_id", "badge_type");

-- CreateIndex
CREATE INDEX "driver_territory_stats_driver_id_period_start_idx" ON "driver_territory_stats"("driver_id", "period_start" DESC);

-- CreateIndex
CREATE INDEX "driver_territory_stats_period_start_period_end_idx" ON "driver_territory_stats"("period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "driver_territory_stats_driver_id_period_start_period_end_key" ON "driver_territory_stats"("driver_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "rides_v2_share_token_key" ON "rides_v2"("share_token");

-- CreateIndex
CREATE INDEX "rides_v2_status_idx" ON "rides_v2"("status");

-- CreateIndex
CREATE INDEX "rides_v2_passenger_id_idx" ON "rides_v2"("passenger_id");

-- CreateIndex
CREATE INDEX "rides_v2_driver_id_idx" ON "rides_v2"("driver_id");

-- CreateIndex
CREATE INDEX "rides_v2_idempotency_key_idx" ON "rides_v2"("idempotency_key");

-- CreateIndex
CREATE INDEX "rides_v2_created_at_idx" ON "rides_v2"("created_at" DESC);

-- CreateIndex
CREATE INDEX "ride_messages_ride_id_created_at_idx" ON "ride_messages"("ride_id", "created_at");

-- CreateIndex
CREATE INDEX "ride_messages_recipient_type_recipient_id_read_at_idx" ON "ride_messages"("recipient_type", "recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "ride_offers_ride_id_idx" ON "ride_offers"("ride_id");

-- CreateIndex
CREATE INDEX "ride_offers_driver_id_idx" ON "ride_offers"("driver_id");

-- CreateIndex
CREATE INDEX "ride_offers_status_idx" ON "ride_offers"("status");

-- CreateIndex
CREATE INDEX "ride_offers_expires_at_idx" ON "ride_offers"("expires_at");

-- CreateIndex
CREATE INDEX "consultant_leads_status_idx" ON "consultant_leads"("status");

-- CreateIndex
CREATE INDEX "consultant_leads_created_at_idx" ON "consultant_leads"("created_at" DESC);

-- CreateIndex
CREATE INDEX "consultant_leads_assigned_to_idx" ON "consultant_leads"("assigned_to");

-- CreateIndex
CREATE INDEX "consultant_leads_region_idx" ON "consultant_leads"("region");

-- CreateIndex
CREATE UNIQUE INDEX "referral_agents_phone_key" ON "referral_agents"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "referral_agents_referral_code_key" ON "referral_agents"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_driver_phone_key" ON "referrals"("driver_phone");

-- CreateIndex
CREATE INDEX "referrals_agent_id_idx" ON "referrals"("agent_id");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE INDEX "referrals_payment_status_idx" ON "referrals"("payment_status");

-- CreateIndex
CREATE INDEX "referrals_driver_id_idx" ON "referrals"("driver_id");

-- CreateIndex
CREATE INDEX "driver_locations_updated_at_idx" ON "driver_locations"("updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_profiles_slug_key" ON "pricing_profiles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ride_settlements_ride_id_key" ON "ride_settlements"("ride_id");

-- CreateIndex
CREATE INDEX "ride_settlements_pricing_profile_id_idx" ON "ride_settlements"("pricing_profile_id");

-- CreateIndex
CREATE INDEX "ride_settlements_settled_at_idx" ON "ride_settlements"("settled_at");

-- CreateIndex
CREATE UNIQUE INDEX "wa_conversations_phone_key" ON "wa_conversations"("phone");

-- CreateIndex
CREATE INDEX "wa_conversations_status_idx" ON "wa_conversations"("status");

-- CreateIndex
CREATE INDEX "wa_conversations_contact_type_idx" ON "wa_conversations"("contact_type");

-- CreateIndex
CREATE INDEX "wa_conversations_last_message_at_idx" ON "wa_conversations"("last_message_at" DESC);

-- CreateIndex
CREATE INDEX "wa_messages_conversation_id_created_at_idx" ON "wa_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_invite_logs_twilio_message_sid_key" ON "whatsapp_invite_logs"("twilio_message_sid");

-- CreateIndex
CREATE INDEX "whatsapp_invite_logs_target_phone_normalized_invite_type_cr_idx" ON "whatsapp_invite_logs"("target_phone_normalized", "invite_type", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_invite_logs_admin_id_created_at_idx" ON "whatsapp_invite_logs"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_invite_logs_territory_id_created_at_idx" ON "whatsapp_invite_logs"("territory_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_regulatory_consultation_logs_twilio_message_sid_key" ON "municipal_regulatory_consultation_logs"("twilio_message_sid");

-- CreateIndex
CREATE INDEX "municipal_regulatory_consultation_logs_admin_id_created_at_idx" ON "municipal_regulatory_consultation_logs"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "municipal_regulatory_consultation_logs_territory_id_created_idx" ON "municipal_regulatory_consultation_logs"("territory_id", "created_at");

-- CreateIndex
CREATE INDEX "municipal_regulatory_consultation_logs_destination_phone_cr_idx" ON "municipal_regulatory_consultation_logs"("destination_phone", "created_at");

-- CreateIndex
CREATE INDEX "municipal_regulatory_consultation_logs_protocol_code_idx" ON "municipal_regulatory_consultation_logs"("protocol_code");

-- CreateIndex
CREATE INDEX "municipal_regulatory_cases_status_updated_at_idx" ON "municipal_regulatory_cases"("status", "updated_at");

-- CreateIndex
CREATE INDEX "municipal_regulatory_cases_state_city_idx" ON "municipal_regulatory_cases"("state", "city");

-- CreateIndex
CREATE INDEX "municipal_regulatory_cases_next_follow_up_at_idx" ON "municipal_regulatory_cases"("next_follow_up_at");

-- CreateIndex
CREATE INDEX "municipal_regulatory_cases_created_at_idx" ON "municipal_regulatory_cases"("created_at");

-- CreateIndex
CREATE INDEX "municipal_regulatory_checklist_items_case_id_sort_order_idx" ON "municipal_regulatory_checklist_items"("case_id", "sort_order");

-- CreateIndex
CREATE INDEX "municipal_regulatory_checklist_items_case_id_status_idx" ON "municipal_regulatory_checklist_items"("case_id", "status");

-- CreateIndex
CREATE INDEX "municipal_regulatory_checklist_items_due_date_idx" ON "municipal_regulatory_checklist_items"("due_date");

-- CreateIndex
CREATE INDEX "municipal_regulatory_driver_protocols_case_id_status_idx" ON "municipal_regulatory_driver_protocols"("case_id", "status");

-- CreateIndex
CREATE INDEX "municipal_regulatory_driver_protocols_case_id_created_at_idx" ON "municipal_regulatory_driver_protocols"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "municipal_regulatory_driver_protocols_case_id_driver_id_idx" ON "municipal_regulatory_driver_protocols"("case_id", "driver_id");

-- CreateIndex
CREATE INDEX "municipal_regulatory_driver_protocols_case_id_service_modal_idx" ON "municipal_regulatory_driver_protocols"("case_id", "service_modality");

-- CreateIndex
CREATE INDEX "municipal_regulatory_driver_protocols_renewal_of_protocol_i_idx" ON "municipal_regulatory_driver_protocols"("renewal_of_protocol_id");

-- CreateIndex
CREATE INDEX "municipal_regulatory_driver_protocols_case_id_driver_id_ser_idx" ON "municipal_regulatory_driver_protocols"("case_id", "driver_id", "service_modality");

-- CreateIndex
CREATE INDEX "municipal_regulatory_driver_protocols_next_follow_up_at_idx" ON "municipal_regulatory_driver_protocols"("next_follow_up_at");

-- CreateIndex
CREATE INDEX "municipal_regulatory_driver_protocols_protocol_number_idx" ON "municipal_regulatory_driver_protocols"("protocol_number");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_regulatory_driver_protocols_case_id_driver_id_ser_key" ON "municipal_regulatory_driver_protocols"("case_id", "driver_id", "service_modality", "cycle_number");

-- CreateIndex
CREATE INDEX "email_send_logs_created_at_idx" ON "email_send_logs"("created_at");

-- CreateIndex
CREATE INDEX "email_send_logs_status_created_at_idx" ON "email_send_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "email_send_logs_to_email_created_at_idx" ON "email_send_logs"("to_email", "created_at");

-- CreateIndex
CREATE INDEX "email_send_logs_from_email_created_at_idx" ON "email_send_logs"("from_email", "created_at");

-- CreateIndex
CREATE INDEX "email_send_logs_admin_id_created_at_idx" ON "email_send_logs"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "email_send_logs_reply_to_inbound_email_id_idx" ON "email_send_logs"("reply_to_inbound_email_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_email_messages_message_id_key" ON "inbound_email_messages"("message_id");

-- CreateIndex
CREATE INDEX "inbound_email_messages_received_at_idx" ON "inbound_email_messages"("received_at");

-- CreateIndex
CREATE INDEX "inbound_email_messages_status_received_at_idx" ON "inbound_email_messages"("status", "received_at");

-- CreateIndex
CREATE INDEX "inbound_email_messages_to_email_received_at_idx" ON "inbound_email_messages"("to_email", "received_at");

-- CreateIndex
CREATE INDEX "inbound_email_messages_from_email_received_at_idx" ON "inbound_email_messages"("from_email", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_email_attachments_storage_key_key" ON "inbound_email_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "inbound_email_attachments_inbound_email_id_idx" ON "inbound_email_attachments"("inbound_email_id");

-- CreateIndex
CREATE INDEX "inbound_email_attachments_inbound_email_id_status_idx" ON "inbound_email_attachments"("inbound_email_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_email_attachments_inbound_sha256_filename_key" ON "inbound_email_attachments"("inbound_email_id", "sha256", "filename");

-- CreateIndex
CREATE INDEX "municipal_regulations_city_state_idx" ON "municipal_regulations"("city", "state");

-- CreateIndex
CREATE INDEX "municipal_regulations_service_modality_is_active_idx" ON "municipal_regulations"("service_modality", "is_active");

-- CreateIndex
CREATE INDEX "municipal_regulation_requirements_regulation_id_sort_order_idx" ON "municipal_regulation_requirements"("regulation_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_regulation_requirements_regulation_id_requirement_key" ON "municipal_regulation_requirements"("regulation_id", "requirement_key");

-- CreateIndex
CREATE UNIQUE INDEX "municipal_authorizations_source_driver_protocol_id_key" ON "municipal_authorizations"("source_driver_protocol_id");

-- CreateIndex
CREATE INDEX "municipal_authorizations_driver_id_status_idx" ON "municipal_authorizations"("driver_id", "status");

-- CreateIndex
CREATE INDEX "municipal_authorizations_driver_id_city_state_service_modal_idx" ON "municipal_authorizations"("driver_id", "city", "state", "service_modality");

-- CreateIndex
CREATE INDEX "municipal_authorizations_city_state_service_modality_idx" ON "municipal_authorizations"("city", "state", "service_modality");

-- CreateIndex
CREATE INDEX "municipal_package_audit_logs_driver_id_created_at_idx" ON "municipal_package_audit_logs"("driver_id", "created_at");

-- CreateIndex
CREATE INDEX "municipal_package_audit_logs_authorization_id_created_at_idx" ON "municipal_package_audit_logs"("authorization_id", "created_at");

-- CreateIndex
CREATE INDEX "ride_emergency_events_ride_id_idx" ON "ride_emergency_events"("ride_id");

-- CreateIndex
CREATE INDEX "ride_emergency_events_status_idx" ON "ride_emergency_events"("status");

-- CreateIndex
CREATE INDEX "ride_emergency_events_created_at_idx" ON "ride_emergency_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "emergency_location_trail_emergency_event_id_captured_at_idx" ON "emergency_location_trail"("emergency_event_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_location_trail_emergency_event_id_captured_at_key" ON "emergency_location_trail"("emergency_event_id", "captured_at");

-- CreateIndex
CREATE UNIQUE INDEX "driver_credit_ledger_idempotency_key_key" ON "driver_credit_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "driver_credit_ledger_driver_id_created_at_idx" ON "driver_credit_ledger"("driver_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "driver_credit_purchases_external_reference_key" ON "driver_credit_purchases"("external_reference");

-- CreateIndex
CREATE INDEX "driver_credit_purchases_driver_id_idx" ON "driver_credit_purchases"("driver_id");

-- CreateIndex
CREATE INDEX "driver_credit_purchases_status_idx" ON "driver_credit_purchases"("status");

-- CreateIndex
CREATE INDEX "showcase_items_is_active_community_id_idx" ON "showcase_items"("is_active", "community_id");

-- CreateIndex
CREATE INDEX "showcase_items_is_active_neighborhood_id_idx" ON "showcase_items"("is_active", "neighborhood_id");

-- CreateIndex
CREATE INDEX "showcase_events_item_id_event_type_idx" ON "showcase_events"("item_id", "event_type");

-- CreateIndex
CREATE INDEX "showcase_events_item_id_created_at_idx" ON "showcase_events"("item_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_events_item_id_passenger_id_ride_id_event_type_key" ON "showcase_events"("item_id", "passenger_id", "ride_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "ride_compensations_ride_id_key" ON "ride_compensations"("ride_id");

-- CreateIndex
CREATE UNIQUE INDEX "ride_compensations_external_reference_key" ON "ride_compensations"("external_reference");

-- CreateIndex
CREATE INDEX "ride_compensations_status_idx" ON "ride_compensations"("status");

-- CreateIndex
CREATE INDEX "ride_compensations_driver_id_idx" ON "ride_compensations"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "local_support_drivers_driver_id_key" ON "local_support_drivers"("driver_id");

-- CreateIndex
CREATE INDEX "local_support_drivers_community_id_idx" ON "local_support_drivers"("community_id");

-- CreateIndex
CREATE INDEX "local_support_drivers_status_idx" ON "local_support_drivers"("status");

-- CreateIndex
CREATE INDEX "local_support_invites_driver_id_invited_at_idx" ON "local_support_invites"("driver_id", "invited_at" DESC);

-- CreateIndex
CREATE INDEX "local_support_invites_community_id_invited_at_idx" ON "local_support_invites"("community_id", "invited_at" DESC);

-- CreateIndex
CREATE INDEX "local_operators_status_idx" ON "local_operators"("status");

-- CreateIndex
CREATE INDEX "local_operators_city_idx" ON "local_operators"("city");

-- CreateIndex
CREATE UNIQUE INDEX "territorial_partners_referral_code_key" ON "territorial_partners"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "territorial_partners_public_token_key" ON "territorial_partners"("public_token");

-- CreateIndex
CREATE INDEX "territorial_partners_status_idx" ON "territorial_partners"("status");

-- CreateIndex
CREATE INDEX "territorial_partners_partner_type_idx" ON "territorial_partners"("partner_type");

-- CreateIndex
CREATE INDEX "territorial_partners_billing_status_idx" ON "territorial_partners"("billing_status");

-- CreateIndex
CREATE INDEX "idx_territorial_partners_territory" ON "territorial_partners"("territory_id");

-- CreateIndex
CREATE INDEX "partner_commissions_partner_id_status_idx" ON "partner_commissions"("partner_id", "status");

-- CreateIndex
CREATE INDEX "partner_commissions_driver_id_idx" ON "partner_commissions"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_commissions_ride_id_partner_id_key" ON "partner_commissions"("ride_id", "partner_id");

-- CreateIndex
CREATE INDEX "partner_payments_partner_id_paid_at_idx" ON "partner_payments"("partner_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "partner_link_requests_partner_id_status_idx" ON "partner_link_requests"("partner_id", "status");

-- CreateIndex
CREATE INDEX "partner_link_requests_status_idx" ON "partner_link_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_link_requests_partner_id_driver_id_key" ON "partner_link_requests"("partner_id", "driver_id");

-- CreateIndex
CREATE INDEX "partner_members_partner_id_status_idx" ON "partner_members"("partner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_member_payments_receipt_code_key" ON "partner_member_payments"("receipt_code");

-- CreateIndex
CREATE INDEX "partner_member_payments_partner_id_reference_month_idx" ON "partner_member_payments"("partner_id", "reference_month");

-- CreateIndex
CREATE INDEX "partner_member_payments_member_id_idx" ON "partner_member_payments"("member_id");

-- CreateIndex
CREATE INDEX "partner_transactions_partner_id_reference_month_idx" ON "partner_transactions"("partner_id", "reference_month");

-- CreateIndex
CREATE INDEX "partner_transactions_partner_id_type_idx" ON "partner_transactions"("partner_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "partner_users_email_key" ON "partner_users"("email");

-- CreateIndex
CREATE INDEX "partner_users_partner_id_idx" ON "partner_users"("partner_id");

-- CreateIndex
CREATE INDEX "partner_password_resets_partner_user_id_idx" ON "partner_password_resets"("partner_user_id");

-- CreateIndex
CREATE INDEX "partner_password_resets_expires_at_idx" ON "partner_password_resets"("expires_at");

-- CreateIndex
CREATE INDEX "private_ride_requests_status_idx" ON "private_ride_requests"("status");

-- CreateIndex
CREATE INDEX "private_ride_requests_scheduled_date_idx" ON "private_ride_requests"("scheduled_date");

-- CreateIndex
CREATE INDEX "private_ride_requests_partner_id_idx" ON "private_ride_requests"("partner_id");

-- CreateIndex
CREATE INDEX "local_businesses_region_slug_is_active_idx" ON "local_businesses"("region_slug", "is_active");

-- CreateIndex
CREATE INDEX "local_businesses_territory_id_is_active_idx" ON "local_businesses"("territory_id", "is_active");

-- CreateIndex
CREATE INDEX "operational_territories_level_idx" ON "operational_territories"("level");

-- CreateIndex
CREATE INDEX "operational_territories_status_idx" ON "operational_territories"("status");

-- CreateIndex
CREATE INDEX "operational_territories_parent_id_idx" ON "operational_territories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "operational_territories_name_level_parent_id_key" ON "operational_territories"("name", "level", "parent_id");

-- CreateIndex
CREATE INDEX "financial_recognition_policies_subject_scope_status_idx" ON "financial_recognition_policies"("subject", "scope_type", "status");

-- CreateIndex
CREATE INDEX "financial_recognition_policies_territory_id_idx" ON "financial_recognition_policies"("territory_id");

-- CreateIndex
CREATE INDEX "financial_recognition_policies_cost_center_id_idx" ON "financial_recognition_policies"("cost_center_id");

-- CreateIndex
CREATE INDEX "financial_recognition_policies_effective_from_effective_until_i" ON "financial_recognition_policies"("effective_from", "effective_until");

-- CreateIndex
CREATE UNIQUE INDEX "financial_recognition_policies_code_key" ON "financial_recognition_policies"("code");

-- CreateIndex
CREATE INDEX "financial_accounts_type_is_active_idx" ON "financial_accounts"("type", "is_active");

-- CreateIndex
CREATE INDEX "financial_accounts_currency_idx" ON "financial_accounts"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_code_key" ON "financial_accounts"("code");

-- CreateIndex
CREATE INDEX "financial_categories_kind_is_active_idx" ON "financial_categories"("kind", "is_active");

-- CreateIndex
CREATE INDEX "financial_categories_parent_id_idx" ON "financial_categories"("parent_id");

-- CreateIndex
CREATE INDEX "financial_categories_sort_order_idx" ON "financial_categories"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "financial_categories_code_key" ON "financial_categories"("code");

-- CreateIndex
CREATE INDEX "financial_cost_centers_type_is_active_idx" ON "financial_cost_centers"("type", "is_active");

-- CreateIndex
CREATE INDEX "financial_cost_centers_parent_id_idx" ON "financial_cost_centers"("parent_id");

-- CreateIndex
CREATE INDEX "financial_cost_centers_territory_id_idx" ON "financial_cost_centers"("territory_id");

-- CreateIndex
CREATE INDEX "financial_cost_centers_city_state_idx" ON "financial_cost_centers"("city", "state");

-- CreateIndex
CREATE UNIQUE INDEX "financial_cost_centers_code_key" ON "financial_cost_centers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transactions_idempotency_key_key" ON "financial_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "financial_transactions_account_id_transaction_date_idx" ON "financial_transactions"("account_id", "transaction_date");

-- CreateIndex
CREATE INDEX "financial_transactions_counterparty_account_id_idx" ON "financial_transactions"("counterparty_account_id");

-- CreateIndex
CREATE INDEX "financial_transactions_category_id_competence_date_idx" ON "financial_transactions"("category_id", "competence_date");

-- CreateIndex
CREATE INDEX "financial_transactions_cost_center_id_competence_date_idx" ON "financial_transactions"("cost_center_id", "competence_date");

-- CreateIndex
CREATE INDEX "financial_transactions_status_direction_idx" ON "financial_transactions"("status", "direction");

-- CreateIndex
CREATE INDEX "financial_transactions_source_type_source_id_idx" ON "financial_transactions"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "financial_transactions_provider_provider_event_id_idx" ON "financial_transactions"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "financial_transactions_origin_type_origin_id_idx" ON "financial_transactions"("origin_type", "origin_id");

-- CreateIndex
CREATE INDEX "financial_transactions_transfer_group_id_idx" ON "financial_transactions"("transfer_group_id");

-- CreateIndex
CREATE INDEX "financial_transactions_reversal_of_id_idx" ON "financial_transactions"("reversal_of_id");

-- CreateIndex
CREATE INDEX "financial_transactions_created_by_admin_id_idx" ON "financial_transactions"("created_by_admin_id");

-- CreateIndex
CREATE INDEX "financial_transactions_approved_by_admin_id_idx" ON "financial_transactions"("approved_by_admin_id");

-- CreateIndex
CREATE INDEX "financial_transactions_responsible_admin_id_idx" ON "financial_transactions"("responsible_admin_id");

-- CreateIndex
CREATE INDEX "financial_transaction_allocations_transaction_id_idx" ON "financial_transaction_allocations"("transaction_id");

-- CreateIndex
CREATE INDEX "financial_transaction_allocations_category_id_idx" ON "financial_transaction_allocations"("category_id");

-- CreateIndex
CREATE INDEX "financial_transaction_allocations_cost_center_id_idx" ON "financial_transaction_allocations"("cost_center_id");

-- CreateIndex
CREATE INDEX "financial_transaction_allocations_allocation_type_idx" ON "financial_transaction_allocations"("allocation_type");

-- CreateIndex
CREATE INDEX "financial_transaction_allocations_created_by_admin_id_idx" ON "financial_transaction_allocations"("created_by_admin_id");

-- CreateIndex
CREATE INDEX "financial_transaction_links_link_type_idx" ON "financial_transaction_links"("link_type");

-- CreateIndex
CREATE INDEX "financial_transaction_links_linked_transaction_id_idx" ON "financial_transaction_links"("linked_transaction_id");

-- CreateIndex
CREATE INDEX "financial_transaction_links_created_by_admin_id_idx" ON "financial_transaction_links"("created_by_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transaction_links_transaction_id_linked_transacti_key" ON "financial_transaction_links"("transaction_id", "linked_transaction_id", "link_type");

-- CreateIndex
CREATE INDEX "operational_insurance_coverages_territory_id_idx" ON "operational_insurance_coverages"("territory_id");

-- CreateIndex
CREATE INDEX "operational_insurance_coverages_modality_idx" ON "operational_insurance_coverages"("modality");

-- CreateIndex
CREATE INDEX "operational_insurance_coverages_status_idx" ON "operational_insurance_coverages"("status");

-- CreateIndex
CREATE INDEX "operational_insurance_coverages_valid_until_idx" ON "operational_insurance_coverages"("valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "moto_passenger_compliance_territory_id_key" ON "moto_passenger_compliance"("territory_id");

-- CreateIndex
CREATE INDEX "admin_territory_access_admin_id_idx" ON "admin_territory_access"("admin_id");

-- CreateIndex
CREATE INDEX "admin_territory_access_territory_id_idx" ON "admin_territory_access"("territory_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_territory_access_admin_id_territory_id_key" ON "admin_territory_access"("admin_id", "territory_id");

-- CreateIndex
CREATE INDEX "territory_finance_rules_territory_id_idx" ON "territory_finance_rules"("territory_id");

-- CreateIndex
CREATE INDEX "territory_finance_rules_is_active_idx" ON "territory_finance_rules"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "operator_profiles_admin_id_key" ON "operator_profiles"("admin_id");

-- CreateIndex
CREATE INDEX "operator_profiles_territory_id_idx" ON "operator_profiles"("territory_id");

-- CreateIndex
CREATE INDEX "operator_profiles_is_active_idx" ON "operator_profiles"("is_active");

-- CreateIndex
CREATE INDEX "contract_submissions_operator_profile_id_idx" ON "contract_submissions"("operator_profile_id");

-- CreateIndex
CREATE INDEX "contract_submissions_status_idx" ON "contract_submissions"("status");

-- CreateIndex
CREATE INDEX "contract_submissions_created_at_idx" ON "contract_submissions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "contract_submissions_document_hash_idx" ON "contract_submissions"("document_hash");

-- CreateIndex
CREATE INDEX "territory_payouts_status_idx" ON "territory_payouts"("status");

-- CreateIndex
CREATE INDEX "territory_payouts_operator_profile_id_idx" ON "territory_payouts"("operator_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "territory_payouts_territory_id_reference_month_key" ON "territory_payouts"("territory_id", "reference_month");

-- CreateIndex
CREATE INDEX "pet_homologations_status_idx" ON "pet_homologations"("status");

-- CreateIndex
CREATE INDEX "pet_homologations_operator_id_idx" ON "pet_homologations"("operator_id");

-- CreateIndex
CREATE INDEX "pet_homologations_driver_id_idx" ON "pet_homologations"("driver_id");

-- CreateIndex
CREATE INDEX "pet_homologation_logs_homologation_id_idx" ON "pet_homologation_logs"("homologation_id");

-- CreateIndex
CREATE INDEX "pet_homologation_logs_admin_id_idx" ON "pet_homologation_logs"("admin_id");

-- CreateIndex
CREATE INDEX "pet_homologation_documents_homologation_id_idx" ON "pet_homologation_documents"("homologation_id");

-- CreateIndex
CREATE INDEX "pet_homologation_documents_status_idx" ON "pet_homologation_documents"("status");

-- CreateIndex
CREATE INDEX "lab_maturity_snapshots_neighborhood_id_snapshot_date_idx" ON "lab_maturity_snapshots"("neighborhood_id", "snapshot_date" DESC);

-- CreateIndex
CREATE INDEX "lab_maturity_snapshots_snapshot_date_idx" ON "lab_maturity_snapshots"("snapshot_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "lab_maturity_snapshots_neighborhood_id_period_days_snapshot_key" ON "lab_maturity_snapshots"("neighborhood_id", "period_days", "snapshot_date");

-- CreateIndex
CREATE INDEX "idx_crm_leads_status" ON "crm_leads"("status");

-- CreateIndex
CREATE INDEX "idx_crm_leads_lead_type" ON "crm_leads"("lead_type");

-- CreateIndex
CREATE INDEX "idx_crm_leads_territory" ON "crm_leads"("territory_id");

-- CreateIndex
CREATE INDEX "idx_crm_leads_assigned" ON "crm_leads"("assigned_admin_id");

-- CreateIndex
CREATE INDEX "idx_crm_leads_next_action" ON "crm_leads"("next_action_at");

-- CreateIndex
CREATE INDEX "idx_crm_leads_priority" ON "crm_leads"("priority");

-- CreateIndex
CREATE INDEX "idx_crm_leads_captured_by" ON "crm_leads"("captured_by_member_id");

-- CreateIndex
CREATE INDEX "idx_crm_interactions_lead" ON "crm_interactions"("lead_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_crm_interactions_admin" ON "crm_interactions"("created_by_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_accounts_slug_key" ON "commerce_accounts"("slug");

-- CreateIndex
CREATE INDEX "idx_commerce_accounts_status" ON "commerce_accounts"("status");

-- CreateIndex
CREATE INDEX "idx_commerce_accounts_territory" ON "commerce_accounts"("territory_id");

-- CreateIndex
CREATE INDEX "idx_commerce_accounts_crm_lead" ON "commerce_accounts"("crm_lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_users_email_key" ON "commerce_users"("email");

-- CreateIndex
CREATE INDEX "idx_commerce_users_account" ON "commerce_users"("commerce_account_id");

-- CreateIndex
CREATE INDEX "idx_commerce_products_account" ON "commerce_products"("commerce_account_id");

-- CreateIndex
CREATE INDEX "idx_commerce_products_available" ON "commerce_products"("commerce_account_id", "is_available");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_orders_order_code_key" ON "commerce_orders"("order_code");

-- CreateIndex
CREATE INDEX "idx_commerce_orders_account_status" ON "commerce_orders"("commerce_account_id", "status");

-- CreateIndex
CREATE INDEX "idx_commerce_orders_status" ON "commerce_orders"("status");

-- CreateIndex
CREATE INDEX "idx_commerce_orders_created" ON "commerce_orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_commerce_order_items_order" ON "commerce_order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_wallets_commerce_account_id_key" ON "commerce_wallets"("commerce_account_id");

-- CreateIndex
CREATE INDEX "idx_commerce_wallet_tx_account" ON "commerce_wallet_transactions"("commerce_account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_commerce_withdrawals_account" ON "commerce_withdrawal_requests"("commerce_account_id", "status");

-- CreateIndex
CREATE INDEX "idx_commerce_withdrawals_status" ON "commerce_withdrawal_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ar_places_place_id_key" ON "ar_places"("place_id");

-- CreateIndex
CREATE INDEX "idx_ar_places_type" ON "ar_places"("type");

-- CreateIndex
CREATE INDEX "idx_ar_places_status" ON "ar_places"("status");

-- CreateIndex
CREATE INDEX "idx_ar_places_territory" ON "ar_places"("territory_id");

-- CreateIndex
CREATE INDEX "idx_ar_places_city_state" ON "ar_places"("city", "state");

-- CreateIndex
CREATE INDEX "idx_ar_place_contents_locale" ON "ar_place_contents"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ar_place_contents_place_locale" ON "ar_place_contents"("ar_place_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "manager_team_members_public_referral_code_key" ON "manager_team_members"("public_referral_code");

-- CreateIndex
CREATE INDEX "idx_manager_team_members_admin" ON "manager_team_members"("manager_admin_id");

-- CreateIndex
CREATE INDEX "idx_manager_team_commissions_admin" ON "manager_team_commissions"("manager_admin_id");

-- CreateIndex
CREATE INDEX "idx_manager_team_commissions_member" ON "manager_team_commissions"("member_id");

-- CreateIndex
CREATE INDEX "women_matching_consent_events_actor_type_actor_id_created_a_idx" ON "women_matching_consent_events"("actor_type", "actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "territory_manager_assignments_territory_id_idx" ON "territory_manager_assignments"("territory_id");

-- CreateIndex
CREATE INDEX "territory_manager_assignments_admin_id_idx" ON "territory_manager_assignments"("admin_id");

-- CreateIndex
CREATE INDEX "wallet_shadow_results_reference_month_idx" ON "wallet_shadow_results"("reference_month");

-- CreateIndex
CREATE INDEX "wallet_shadow_results_driver_id_idx" ON "wallet_shadow_results"("driver_id");

-- CreateIndex
CREATE INDEX "wallet_shadow_results_calculation_status_idx" ON "wallet_shadow_results"("calculation_status");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_shadow_results_ride_id_calculation_version_key" ON "wallet_shadow_results"("ride_id", "calculation_version");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledger_idempotency_key_key" ON "wallet_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_ledger_driver_id_created_at_idx" ON "wallet_ledger"("driver_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "wallet_ledger_reference_type_reference_id_idx" ON "wallet_ledger"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "wallet_recharges_driver_id_created_at_idx" ON "wallet_recharges"("driver_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_recharges_payment_provider_external_id_key" ON "wallet_recharges"("payment_provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_debits_ride_id_key" ON "pending_debits"("ride_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_debits_idempotency_key_key" ON "pending_debits"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ride_fee_splits_ride_id_key" ON "ride_fee_splits"("ride_id");

-- CreateIndex
CREATE UNIQUE INDEX "ride_fee_splits_idempotency_key_key" ON "ride_fee_splits"("idempotency_key");

-- CreateIndex
CREATE INDEX "ride_fee_splits_territory_id_reference_month_idx" ON "ride_fee_splits"("territory_id", "reference_month");

-- CreateIndex
CREATE UNIQUE INDEX "driver_referral_rewards_driver_id_key" ON "driver_referral_rewards"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_referral_rewards_idempotency_key_key" ON "driver_referral_rewards"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "referral_reward_payouts_idempotency_key_key" ON "referral_reward_payouts"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "territory_ledger_idempotency_key_key" ON "territory_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "territory_ledger_territory_id_reference_month_idx" ON "territory_ledger"("territory_id", "reference_month");

-- CreateIndex
CREATE INDEX "territory_ledger_entry_type_reference_month_idx" ON "territory_ledger"("entry_type", "reference_month");

-- CreateIndex
CREATE UNIQUE INDEX "family_return_accruals_idempotency_key_key" ON "family_return_accruals"("idempotency_key");

-- CreateIndex
CREATE INDEX "family_return_accruals_driver_id_created_at_idx" ON "family_return_accruals"("driver_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "family_return_accruals_status_idx" ON "family_return_accruals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "driver_fixed_routes_invite_code_key" ON "driver_fixed_routes"("invite_code");

-- CreateIndex
CREATE INDEX "driver_fixed_routes_driver_id_status_idx" ON "driver_fixed_routes"("driver_id", "status");

-- CreateIndex
CREATE INDEX "driver_fixed_routes_invite_code_idx" ON "driver_fixed_routes"("invite_code");

-- CreateIndex
CREATE INDEX "driver_fixed_routes_territory_id_idx" ON "driver_fixed_routes"("territory_id");

-- CreateIndex
CREATE INDEX "driver_fixed_routes_neighborhood_id_idx" ON "driver_fixed_routes"("neighborhood_id");

-- CreateIndex
CREATE INDEX "driver_fixed_routes_created_at_idx" ON "driver_fixed_routes"("created_at" DESC);

-- CreateIndex
CREATE INDEX "driver_fixed_route_reservations_route_id_status_idx" ON "driver_fixed_route_reservations"("route_id", "status");

-- CreateIndex
CREATE INDEX "driver_fixed_route_reservations_passenger_id_status_idx" ON "driver_fixed_route_reservations"("passenger_id", "status");

-- CreateIndex
CREATE INDEX "driver_fixed_route_reservations_created_at_idx" ON "driver_fixed_route_reservations"("created_at" DESC);

-- CreateIndex
CREATE INDEX "fixed_route_messages_route_id_created_at_idx" ON "fixed_route_messages"("route_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "fixed_route_messages_reservation_id_created_at_idx" ON "fixed_route_messages"("reservation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "fixed_route_messages_recipient_driver_id_read_at_idx" ON "fixed_route_messages"("recipient_driver_id", "read_at");

-- CreateIndex
CREATE INDEX "fixed_route_messages_recipient_passenger_id_read_at_idx" ON "fixed_route_messages"("recipient_passenger_id", "read_at");

-- CreateIndex
CREATE INDEX "driver_fixed_route_events_route_id_created_at_idx" ON "driver_fixed_route_events"("route_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "driver_fixed_route_events_reservation_id_idx" ON "driver_fixed_route_events"("reservation_id");

-- CreateIndex
CREATE INDEX "driver_fixed_route_events_actor_type_actor_id_idx" ON "driver_fixed_route_events"("actor_type", "actor_id");

-- CreateIndex
CREATE INDEX "driver_fixed_route_events_action_idx" ON "driver_fixed_route_events"("action");

-- CreateIndex
CREATE INDEX "kaviar_groups_status_idx" ON "kaviar_groups"("status");

-- CreateIndex
CREATE INDEX "kaviar_groups_type_idx" ON "kaviar_groups"("type");

-- CreateIndex
CREATE INDEX "kaviar_groups_community_id_idx" ON "kaviar_groups"("community_id");

-- CreateIndex
CREATE INDEX "kaviar_groups_neighborhood_id_idx" ON "kaviar_groups"("neighborhood_id");

-- CreateIndex
CREATE INDEX "kaviar_groups_territory_id_idx" ON "kaviar_groups"("territory_id");

-- CreateIndex
CREATE INDEX "kaviar_group_members_group_id_status_idx" ON "kaviar_group_members"("group_id", "status");

-- CreateIndex
CREATE INDEX "kaviar_group_members_passenger_id_idx" ON "kaviar_group_members"("passenger_id");

-- CreateIndex
CREATE INDEX "kaviar_group_members_driver_id_idx" ON "kaviar_group_members"("driver_id");

-- CreateIndex
CREATE INDEX "kaviar_group_members_invite_id_idx" ON "kaviar_group_members"("invite_id");

-- CreateIndex
CREATE UNIQUE INDEX "kaviar_group_invites_code_key" ON "kaviar_group_invites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "kaviar_group_invites_token_hash_key" ON "kaviar_group_invites"("token_hash");

-- CreateIndex
CREATE INDEX "kaviar_group_invites_group_id_status_idx" ON "kaviar_group_invites"("group_id", "status");

-- CreateIndex
CREATE INDEX "kaviar_group_invites_expires_at_idx" ON "kaviar_group_invites"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "kaviar_group_responsible_invites_code_key" ON "kaviar_group_responsible_invites"("code");

-- CreateIndex
CREATE INDEX "kaviar_group_responsible_invites_group_id_status_idx" ON "kaviar_group_responsible_invites"("group_id", "status");

-- CreateIndex
CREATE INDEX "kaviar_group_responsible_invites_expires_at_idx" ON "kaviar_group_responsible_invites"("expires_at");

-- CreateIndex
CREATE INDEX "kaviar_group_responsible_invites_invited_by_admin_id_idx" ON "kaviar_group_responsible_invites"("invited_by_admin_id");

-- CreateIndex
CREATE INDEX "kaviar_group_posts_group_id_status_is_pinned_published_at_idx" ON "kaviar_group_posts"("group_id", "status", "is_pinned", "published_at");

-- CreateIndex
CREATE INDEX "kaviar_group_posts_group_id_status_expires_at_idx" ON "kaviar_group_posts"("group_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "kaviar_group_posts_author_admin_id_idx" ON "kaviar_group_posts"("author_admin_id");

-- CreateIndex
CREATE INDEX "kaviar_group_posts_author_member_id_idx" ON "kaviar_group_posts"("author_member_id");

-- CreateIndex
CREATE INDEX "kaviar_group_post_reads_post_id_idx" ON "kaviar_group_post_reads"("post_id");

-- CreateIndex
CREATE INDEX "kaviar_group_post_reads_member_id_idx" ON "kaviar_group_post_reads"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "kaviar_group_post_reads_post_id_member_id_key" ON "kaviar_group_post_reads"("post_id", "member_id");

-- CreateIndex
CREATE INDEX "app_notifications_recipient_type_recipient_id_created_at_idx" ON "app_notifications"("recipient_type", "recipient_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "app_notifications_recipient_type_recipient_id_read_at_idx" ON "app_notifications"("recipient_type", "recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "app_notifications_route_id_idx" ON "app_notifications"("route_id");

-- CreateIndex
CREATE INDEX "app_notifications_reservation_id_idx" ON "app_notifications"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "annual_incentive_ledger_idempotency_key_key" ON "annual_incentive_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "annual_incentive_ledger_driver_id_program_year_idx" ON "annual_incentive_ledger"("driver_id", "program_year");

-- CreateIndex
CREATE INDEX "annual_incentive_ledger_driver_id_occurred_at_idx" ON "annual_incentive_ledger"("driver_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "annual_incentive_ledger_event_type_idx" ON "annual_incentive_ledger"("event_type");

-- CreateIndex
CREATE INDEX "annual_incentive_ledger_source_type_source_id_idx" ON "annual_incentive_ledger"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "annual_incentive_ledger_request_id_idx" ON "annual_incentive_ledger"("request_id");

-- CreateIndex
CREATE INDEX "annual_incentive_ledger_correlation_id_idx" ON "annual_incentive_ledger"("correlation_id");

-- CreateIndex
CREATE INDEX "annual_incentive_ledger_reversal_of_id_idx" ON "annual_incentive_ledger"("reversal_of_id");

-- CreateIndex
CREATE INDEX "annual_incentive_ledger_created_at_idx" ON "annual_incentive_ledger"("created_at" DESC);

-- CreateIndex
CREATE INDEX "driver_payout_destinations_driver_id_idx" ON "driver_payout_destinations"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "annual_incentive_requests_idempotency_key_key" ON "annual_incentive_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "annual_incentive_requests_driver_id_idx" ON "annual_incentive_requests"("driver_id");

-- CreateIndex
CREATE INDEX "annual_incentive_requests_status_idx" ON "annual_incentive_requests"("status");

-- CreateIndex
CREATE INDEX "annual_incentive_requests_deadline_at_idx" ON "annual_incentive_requests"("deadline_at");

-- CreateIndex
CREATE INDEX "annual_incentive_request_allocations_request_id_idx" ON "annual_incentive_request_allocations"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "annual_incentive_request_allocations_request_id_program_yea_key" ON "annual_incentive_request_allocations"("request_id", "program_year");

-- CreateIndex
CREATE UNIQUE INDEX "annual_incentive_payouts_external_reference_key" ON "annual_incentive_payouts"("external_reference");

-- CreateIndex
CREATE INDEX "annual_incentive_payouts_request_id_idx" ON "annual_incentive_payouts"("request_id");

-- CreateIndex
CREATE INDEX "annual_incentive_payouts_status_idx" ON "annual_incentive_payouts"("status");

-- CreateIndex
CREATE INDEX "annual_incentive_payout_attempts_payout_id_idx" ON "annual_incentive_payout_attempts"("payout_id");

-- CreateIndex
CREATE UNIQUE INDEX "annual_incentive_payout_outbox_request_id_key" ON "annual_incentive_payout_outbox"("request_id");

-- CreateIndex
CREATE INDEX "annual_incentive_payout_outbox_status_next_at_idx" ON "annual_incentive_payout_outbox"("status", "next_at");

-- CreateIndex
CREATE INDEX "annual_incentive_webhook_events_payout_id_idx" ON "annual_incentive_webhook_events"("payout_id");

-- CreateIndex
CREATE UNIQUE INDEX "annual_incentive_webhook_events_provider_name_provider_even_key" ON "annual_incentive_webhook_events"("provider_name", "provider_event_id");

-- CreateIndex
CREATE INDEX "financial_payees_payee_type_idx" ON "financial_payees"("payee_type");

-- CreateIndex
CREATE INDEX "financial_payees_status_idx" ON "financial_payees"("status");

-- CreateIndex
CREATE INDEX "financial_payees_cpf_cnpj_hmac_idx" ON "financial_payees"("cpf_cnpj_hmac");

-- CreateIndex
CREATE INDEX "financial_payees_reference_id_idx" ON "financial_payees"("reference_id");

-- CreateIndex
CREATE INDEX "financial_payee_destinations_payee_id_idx" ON "financial_payee_destinations"("payee_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_obligations_idempotency_key_key" ON "financial_obligations"("idempotency_key");

-- CreateIndex
CREATE INDEX "financial_obligations_payee_id_idx" ON "financial_obligations"("payee_id");

-- CreateIndex
CREATE INDEX "financial_obligations_purpose_idx" ON "financial_obligations"("purpose");

-- CreateIndex
CREATE INDEX "financial_obligations_status_idx" ON "financial_obligations"("status");

-- CreateIndex
CREATE INDEX "financial_obligations_due_date_idx" ON "financial_obligations"("due_date");

-- CreateIndex
CREATE INDEX "financial_obligations_source_type_source_id_idx" ON "financial_obligations"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "financial_obligation_allocations_obligation_id_idx" ON "financial_obligation_allocations"("obligation_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_payouts_external_reference_key" ON "financial_payouts"("external_reference");

-- CreateIndex
CREATE INDEX "financial_payouts_obligation_id_idx" ON "financial_payouts"("obligation_id");

-- CreateIndex
CREATE INDEX "financial_payouts_status_idx" ON "financial_payouts"("status");

-- CreateIndex
CREATE INDEX "financial_payout_attempts_payout_id_idx" ON "financial_payout_attempts"("payout_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_payout_outbox_obligation_id_key" ON "financial_payout_outbox"("obligation_id");

-- CreateIndex
CREATE INDEX "financial_payout_outbox_status_next_at_idx" ON "financial_payout_outbox"("status", "next_at");

-- CreateIndex
CREATE INDEX "financial_provider_events_payout_id_idx" ON "financial_provider_events"("payout_id");

-- CreateIndex
CREATE INDEX "financial_provider_events_processing_status_next_processing_idx" ON "financial_provider_events"("processing_status", "next_processing_at");

-- CreateIndex
CREATE UNIQUE INDEX "financial_provider_events_provider_name_provider_event_id_key" ON "financial_provider_events"("provider_name", "provider_event_id");

-- CreateIndex
CREATE INDEX "financial_recurring_obligations_payee_id_idx" ON "financial_recurring_obligations"("payee_id");

-- CreateIndex
CREATE INDEX "financial_recurring_obligations_active_idx" ON "financial_recurring_obligations"("active");

-- CreateIndex
CREATE INDEX "financial_payment_audit_entity_type_entity_id_idx" ON "financial_payment_audit"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "financial_payment_audit_admin_id_idx" ON "financial_payment_audit"("admin_id");

-- CreateIndex
CREATE INDEX "financial_payment_audit_created_at_idx" ON "financial_payment_audit"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "territory_payout_cycles_idempotency_key_key" ON "territory_payout_cycles"("idempotency_key");

-- CreateIndex
CREATE INDEX "territory_payout_cycles_territory_id_idx" ON "territory_payout_cycles"("territory_id");

-- CreateIndex
CREATE INDEX "territory_payout_cycles_manager_id_idx" ON "territory_payout_cycles"("manager_id");

-- CreateIndex
CREATE INDEX "territory_payout_cycles_status_idx" ON "territory_payout_cycles"("status");

-- CreateIndex
CREATE INDEX "territory_payout_cycles_reference_month_idx" ON "territory_payout_cycles"("reference_month");

-- CreateIndex
CREATE INDEX "territory_cycle_allocations_cycle_id_idx" ON "territory_cycle_allocations"("cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "territory_cycle_allocations_ledger_entry_id_key" ON "territory_cycle_allocations"("ledger_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entities_cnpj_key" ON "legal_entities"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entities_codigo_interno_key" ON "legal_entities"("codigo_interno");

-- CreateIndex
CREATE INDEX "legal_entities_parent_entity_id_idx" ON "legal_entities"("parent_entity_id");

-- CreateIndex
CREATE INDEX "legal_entities_entity_type_idx" ON "legal_entities"("entity_type");

-- CreateIndex
CREATE INDEX "legal_entities_is_active_idx" ON "legal_entities"("is_active");

-- CreateIndex
CREATE INDEX "legal_entity_persons_entity_id_is_active_idx" ON "legal_entity_persons"("entity_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entity_persons_entity_id_nome_funcao_key" ON "legal_entity_persons"("entity_id", "nome", "funcao");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_firms_document_number_key" ON "accounting_firms"("document_number");

-- CreateIndex
CREATE INDEX "accounting_firms_is_active_idx" ON "accounting_firms"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "accountants_email_key" ON "accountants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accountants_cpf_key" ON "accountants"("cpf");

-- CreateIndex
CREATE INDEX "accountants_accounting_firm_id_idx" ON "accountants"("accounting_firm_id");

-- CreateIndex
CREATE INDEX "accountants_status_idx" ON "accountants"("status");

-- CreateIndex
CREATE INDEX "accountants_is_active_idx" ON "accountants"("is_active");

-- CreateIndex
CREATE INDEX "accountant_invites_accountant_id_idx" ON "accountant_invites"("accountant_id");

-- CreateIndex
CREATE INDEX "accountant_invites_status_idx" ON "accountant_invites"("status");

-- CreateIndex
CREATE INDEX "accountant_entity_links_accountant_id_idx" ON "accountant_entity_links"("accountant_id");

-- CreateIndex
CREATE INDEX "accountant_entity_links_legal_entity_id_idx" ON "accountant_entity_links"("legal_entity_id");

-- CreateIndex
CREATE INDEX "accountant_entity_links_status_idx" ON "accountant_entity_links"("status");

-- CreateIndex
CREATE INDEX "accountant_entity_links_starts_at_ends_at_idx" ON "accountant_entity_links"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "accountant_sessions_accountant_id_status_idx" ON "accountant_sessions"("accountant_id", "status");

-- CreateIndex
CREATE INDEX "accountant_sessions_token_family_id_status_idx" ON "accountant_sessions"("token_family_id", "status");

-- CreateIndex
CREATE INDEX "accountant_sessions_refresh_token_hash_idx" ON "accountant_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "accountant_password_resets_accountant_id_status_idx" ON "accountant_password_resets"("accountant_id", "status");

-- CreateIndex
CREATE INDEX "accountant_password_resets_token_hash_idx" ON "accountant_password_resets"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_document_types_code_key" ON "accounting_document_types"("code");

-- CreateIndex
CREATE INDEX "accounting_document_types_category_idx" ON "accounting_document_types"("category");

-- CreateIndex
CREATE INDEX "accounting_document_types_is_active_sort_order_idx" ON "accounting_document_types"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "accounting_company_documents_legal_entity_id_idx" ON "accounting_company_documents"("legal_entity_id");

-- CreateIndex
CREATE INDEX "accounting_company_documents_document_type_id_idx" ON "accounting_company_documents"("document_type_id");

-- CreateIndex
CREATE INDEX "accounting_company_documents_legal_entity_id_document_type__idx" ON "accounting_company_documents"("legal_entity_id", "document_type_id");

-- CreateIndex
CREATE INDEX "accounting_company_documents_status_idx" ON "accounting_company_documents"("status");

-- CreateIndex
CREATE INDEX "accounting_company_documents_expires_at_idx" ON "accounting_company_documents"("expires_at");

-- CreateIndex
CREATE INDEX "accounting_company_documents_legal_entity_id_status_idx" ON "accounting_company_documents"("legal_entity_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_company_document_files_storage_key_key" ON "accounting_company_document_files"("storage_key");

-- CreateIndex
CREATE INDEX "accounting_company_document_files_document_id_idx" ON "accounting_company_document_files"("document_id");

-- CreateIndex
CREATE INDEX "accounting_company_document_files_sha256_idx" ON "accounting_company_document_files"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_company_document_files_document_id_version_numbe_key" ON "accounting_company_document_files"("document_id", "version_number");

-- CreateIndex
CREATE INDEX "accounting_certificates_legal_entity_id_idx" ON "accounting_certificates"("legal_entity_id");

-- CreateIndex
CREATE INDEX "accounting_certificates_legal_entity_id_status_idx" ON "accounting_certificates"("legal_entity_id", "status");

-- CreateIndex
CREATE INDEX "accounting_certificates_expires_at_idx" ON "accounting_certificates"("expires_at");

-- CreateIndex
CREATE INDEX "accounting_certificates_responsible_accountant_id_idx" ON "accounting_certificates"("responsible_accountant_id");

-- CreateIndex
CREATE INDEX "accounting_certificates_certificate_type_status_idx" ON "accounting_certificates"("certificate_type", "status");

-- CreateIndex
CREATE INDEX "accounting_powers_of_attorney_legal_entity_id_idx" ON "accounting_powers_of_attorney"("legal_entity_id");

-- CreateIndex
CREATE INDEX "accounting_powers_of_attorney_legal_entity_id_scope_idx" ON "accounting_powers_of_attorney"("legal_entity_id", "scope");

-- CreateIndex
CREATE INDEX "accounting_powers_of_attorney_legal_entity_id_status_idx" ON "accounting_powers_of_attorney"("legal_entity_id", "status");

-- CreateIndex
CREATE INDEX "accounting_powers_of_attorney_expires_at_idx" ON "accounting_powers_of_attorney"("expires_at");

-- CreateIndex
CREATE INDEX "accounting_powers_of_attorney_responsible_accountant_id_idx" ON "accounting_powers_of_attorney"("responsible_accountant_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_fiscal_health_rules_code_key" ON "accounting_fiscal_health_rules"("code");

-- CreateIndex
CREATE INDEX "accounting_payment_obligations_legal_entity_id_idx" ON "accounting_payment_obligations"("legal_entity_id");

-- CreateIndex
CREATE INDEX "accounting_payment_obligations_legal_entity_id_status_idx" ON "accounting_payment_obligations"("legal_entity_id", "status");

-- CreateIndex
CREATE INDEX "accounting_payment_obligations_due_date_idx" ON "accounting_payment_obligations"("due_date");

-- CreateIndex
CREATE INDEX "accounting_payment_obligations_action_owner_status_idx" ON "accounting_payment_obligations"("action_owner", "status");

-- CreateIndex
CREATE INDEX "accounting_payment_obligations_created_by_accountant_id_idx" ON "accounting_payment_obligations"("created_by_accountant_id");

-- CreateIndex
CREATE INDEX "accounting_payment_obligations_legal_entity_id_competence_y_idx" ON "accounting_payment_obligations"("legal_entity_id", "competence_year", "competence_month");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_obligation_access_tokens_token_hash_key" ON "accounting_obligation_access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "accounting_obligation_access_tokens_obligation_id_idx" ON "accounting_obligation_access_tokens"("obligation_id");

-- CreateIndex
CREATE INDEX "accounting_obligation_access_tokens_is_active_expires_at_idx" ON "accounting_obligation_access_tokens"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "accounting_obligation_audit_obligation_id_created_at_idx" ON "accounting_obligation_audit"("obligation_id", "created_at");

-- CreateIndex
CREATE INDEX "accounting_obligation_audit_action_created_at_idx" ON "accounting_obligation_audit"("action", "created_at");

-- CreateIndex
CREATE INDEX "accounting_competencies_legal_entity_id_idx" ON "accounting_competencies"("legal_entity_id");

-- CreateIndex
CREATE INDEX "accounting_competencies_legal_entity_id_status_idx" ON "accounting_competencies"("legal_entity_id", "status");

-- CreateIndex
CREATE INDEX "accounting_competencies_year_month_idx" ON "accounting_competencies"("year", "month");

-- CreateIndex
CREATE INDEX "accounting_competencies_expected_deadline_idx" ON "accounting_competencies"("expected_deadline");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_competencies_legal_entity_id_year_month_key" ON "accounting_competencies"("legal_entity_id", "year", "month");

-- CreateIndex
CREATE INDEX "accounting_competency_documents_competency_id_idx" ON "accounting_competency_documents"("competency_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_competency_documents_competency_id_document_id_key" ON "accounting_competency_documents"("competency_id", "document_id");

-- CreateIndex
CREATE INDEX "accounting_recurring_templates_legal_entity_id_idx" ON "accounting_recurring_templates"("legal_entity_id");

-- CreateIndex
CREATE INDEX "accounting_recurring_templates_is_active_idx" ON "accounting_recurring_templates"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_automation_config_legal_entity_id_key" ON "accounting_automation_config"("legal_entity_id");

-- CreateIndex
CREATE INDEX "accounting_automation_log_legal_entity_id_action_created_at_idx" ON "accounting_automation_log"("legal_entity_id", "action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "driver_city_landings_slug_key" ON "driver_city_landings"("slug");

-- CreateIndex
CREATE INDEX "idx_driver_city_landings_slug" ON "driver_city_landings"("slug");

-- CreateIndex
CREATE INDEX "idx_driver_city_landings_enabled" ON "driver_city_landings"("landing_enabled");

-- CreateIndex
CREATE INDEX "idx_driver_city_landings_status" ON "driver_city_landings"("public_status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_slug_key" ON "knowledge_articles"("slug");

-- CreateIndex
CREATE INDEX "knowledge_articles_status_knowledge_scope_idx" ON "knowledge_articles"("status", "knowledge_scope");

-- CreateIndex
CREATE INDEX "knowledge_articles_category_idx" ON "knowledge_articles"("category");

-- CreateIndex
CREATE INDEX "driver_badge_events_driver_id_badge_code_created_at_idx" ON "driver_badge_events"("driver_id", "badge_code", "created_at" DESC);

-- CreateIndex
CREATE INDEX "driver_badge_events_badge_code_event_type_idx" ON "driver_badge_events"("badge_code", "event_type");

-- CreateIndex
CREATE INDEX "development_jobs_status_created_at_idx" ON "development_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "development_jobs_status_locked_at_idx" ON "development_jobs"("status", "locked_at");

-- CreateIndex
CREATE INDEX "development_jobs_requested_by_admin_id_idx" ON "development_jobs"("requested_by_admin_id");

-- CreateIndex
CREATE INDEX "development_jobs_confirmed_by_admin_id_idx" ON "development_jobs"("confirmed_by_admin_id");

-- CreateIndex
CREATE INDEX "territorial_dataset_versions_city_uf_idx" ON "territorial_dataset_versions"("city", "uf");

-- CreateIndex
CREATE INDEX "territorial_dataset_versions_status_idx" ON "territorial_dataset_versions"("status");

-- CreateIndex
CREATE INDEX "territorial_dataset_versions_provider_id_idx" ON "territorial_dataset_versions"("provider_id");

-- CreateIndex
CREATE INDEX "territorial_dataset_versions_territory_id_idx" ON "territorial_dataset_versions"("territory_id");

-- CreateIndex
CREATE INDEX "territorial_dataset_versions_uf_city_created_at_idx" ON "territorial_dataset_versions"("uf", "city", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "community_geofences" ADD CONSTRAINT "community_geofences_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_status_history" ADD CONSTRAINT "community_status_history_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_territorial_partner_id_fkey" FOREIGN KEY ("territorial_partner_id") REFERENCES "territorial_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elderly_contracts" ADD CONSTRAINT "elderly_contracts_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elderly_contracts" ADD CONSTRAINT "elderly_contracts_elderly_profile_id_fkey" FOREIGN KEY ("elderly_profile_id") REFERENCES "elderly_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elderly_contracts" ADD CONSTRAINT "elderly_contracts_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "passengers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elderly_profiles" ADD CONSTRAINT "elderly_profiles_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neighborhood_geofences" ADD CONSTRAINT "neighborhood_geofences_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_leaders" ADD CONSTRAINT "community_leaders_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_leaders" ADD CONSTRAINT "community_leaders_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_leaders" ADD CONSTRAINT "community_leaders_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passenger_favorite_locations" ADD CONSTRAINT "passenger_favorite_locations_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_admin_actions" ADD CONSTRAINT "ride_admin_actions_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_confirmations" ADD CONSTRAINT "ride_confirmations_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_status_history" ADD CONSTRAINT "ride_status_history_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_pickup_neighborhood_id_fkey" FOREIGN KEY ("pickup_neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_dropoff_neighborhood_id_fkey" FOREIGN KEY ("dropoff_neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_bookings" ADD CONSTRAINT "tour_bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "tour_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_bookings" ADD CONSTRAINT "tour_bookings_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tourist_guides" ADD CONSTRAINT "tourist_guides_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_consents" ADD CONSTRAINT "driver_consents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_modalities" ADD CONSTRAINT "driver_modalities_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_compliance_documents" ADD CONSTRAINT "driver_compliance_documents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "match_logs" ADD CONSTRAINT "match_logs_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_badges" ADD CONSTRAINT "driver_badges_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_territory_stats" ADD CONSTRAINT "driver_territory_stats_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides_v2" ADD CONSTRAINT "rides_v2_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides_v2" ADD CONSTRAINT "rides_v2_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides_v2" ADD CONSTRAINT "rides_v2_origin_neighborhood_id_fkey" FOREIGN KEY ("origin_neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides_v2" ADD CONSTRAINT "rides_v2_dest_neighborhood_id_fkey" FOREIGN KEY ("dest_neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_messages" ADD CONSTRAINT "ride_messages_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides_v2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides_v2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_status" ADD CONSTRAINT "driver_status_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultant_leads" ADD CONSTRAINT "consultant_leads_referral_agent_id_fkey" FOREIGN KEY ("referral_agent_id") REFERENCES "referral_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "referral_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_settlements" ADD CONSTRAINT "ride_settlements_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides_v2"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_settlements" ADD CONSTRAINT "ride_settlements_pricing_profile_id_fkey" FOREIGN KEY ("pricing_profile_id") REFERENCES "pricing_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "wa_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_regulatory_checklist_items" ADD CONSTRAINT "municipal_regulatory_checklist_items_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "municipal_regulatory_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_regulatory_driver_protocols" ADD CONSTRAINT "municipal_regulatory_driver_protocols_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "municipal_regulatory_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_regulatory_driver_protocols" ADD CONSTRAINT "municipal_regulatory_driver_protocols_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_regulatory_driver_protocols" ADD CONSTRAINT "municipal_regulatory_driver_protocols_renewal_of_protocol__fkey" FOREIGN KEY ("renewal_of_protocol_id") REFERENCES "municipal_regulatory_driver_protocols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_logs" ADD CONSTRAINT "email_send_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send_logs" ADD CONSTRAINT "email_send_logs_reply_to_inbound_email_id_fkey" FOREIGN KEY ("reply_to_inbound_email_id") REFERENCES "inbound_email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_email_attachments" ADD CONSTRAINT "inbound_email_attachments_inbound_email_id_fkey" FOREIGN KEY ("inbound_email_id") REFERENCES "inbound_email_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_regulation_requirements" ADD CONSTRAINT "municipal_regulation_requirements_regulation_id_fkey" FOREIGN KEY ("regulation_id") REFERENCES "municipal_regulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_authorizations" ADD CONSTRAINT "municipal_authorizations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_authorizations" ADD CONSTRAINT "municipal_authorizations_regulation_id_fkey" FOREIGN KEY ("regulation_id") REFERENCES "municipal_regulations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_authorizations" ADD CONSTRAINT "municipal_authorizations_source_driver_protocol_id_fkey" FOREIGN KEY ("source_driver_protocol_id") REFERENCES "municipal_regulatory_driver_protocols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_authorizations" ADD CONSTRAINT "municipal_authorizations_submitted_by_admin_id_fkey" FOREIGN KEY ("submitted_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_authorizations" ADD CONSTRAINT "municipal_authorizations_submitted_by_manager_id_fkey" FOREIGN KEY ("submitted_by_manager_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_authorizations" ADD CONSTRAINT "municipal_authorizations_approved_by_admin_id_fkey" FOREIGN KEY ("approved_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_package_audit_logs" ADD CONSTRAINT "municipal_package_audit_logs_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_package_audit_logs" ADD CONSTRAINT "municipal_package_audit_logs_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "municipal_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "municipal_package_audit_logs" ADD CONSTRAINT "municipal_package_audit_logs_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_emergency_events" ADD CONSTRAINT "ride_emergency_events_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides_v2"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_location_trail" ADD CONSTRAINT "emergency_location_trail_emergency_event_id_fkey" FOREIGN KEY ("emergency_event_id") REFERENCES "ride_emergency_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_credit_purchases" ADD CONSTRAINT "driver_credit_purchases_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_support_drivers" ADD CONSTRAINT "local_support_drivers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_support_drivers" ADD CONSTRAINT "local_support_drivers_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_support_invites" ADD CONSTRAINT "local_support_invites_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "local_support_drivers"("driver_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_support_invites" ADD CONSTRAINT "local_support_invites_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorial_partners" ADD CONSTRAINT "territorial_partners_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "territorial_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_payments" ADD CONSTRAINT "partner_payments_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "territorial_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_link_requests" ADD CONSTRAINT "partner_link_requests_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "territorial_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_members" ADD CONSTRAINT "partner_members_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "territorial_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_member_payments" ADD CONSTRAINT "partner_member_payments_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "territorial_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_member_payments" ADD CONSTRAINT "partner_member_payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "partner_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_transactions" ADD CONSTRAINT "partner_transactions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "territorial_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_users" ADD CONSTRAINT "partner_users_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "territorial_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_password_resets" ADD CONSTRAINT "partner_password_resets_partner_user_id_fkey" FOREIGN KEY ("partner_user_id") REFERENCES "partner_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_territories" ADD CONSTRAINT "operational_territories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "operational_territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recognition_policies" ADD CONSTRAINT "financial_recognition_policies_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recognition_policies" ADD CONSTRAINT "financial_recognition_policies_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "financial_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recognition_policies" ADD CONSTRAINT "financial_recognition_policies_approved_by_admin_id_fkey" FOREIGN KEY ("approved_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recognition_policies" ADD CONSTRAINT "financial_recognition_policies_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recognition_policies" ADD CONSTRAINT "financial_recognition_policies_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_cost_centers" ADD CONSTRAINT "financial_cost_centers_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "financial_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_cost_centers" ADD CONSTRAINT "financial_cost_centers_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_cost_centers" ADD CONSTRAINT "financial_cost_centers_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_cost_centers" ADD CONSTRAINT "financial_cost_centers_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_counterparty_account_id_fkey" FOREIGN KEY ("counterparty_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "financial_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_approved_by_admin_id_fkey" FOREIGN KEY ("approved_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_responsible_admin_id_fkey" FOREIGN KEY ("responsible_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transaction_allocations" ADD CONSTRAINT "financial_transaction_allocations_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transaction_allocations" ADD CONSTRAINT "financial_transaction_allocations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transaction_allocations" ADD CONSTRAINT "financial_transaction_allocations_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "financial_cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transaction_allocations" ADD CONSTRAINT "financial_transaction_allocations_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transaction_links" ADD CONSTRAINT "financial_transaction_links_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transaction_links" ADD CONSTRAINT "financial_transaction_links_linked_transaction_id_fkey" FOREIGN KEY ("linked_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transaction_links" ADD CONSTRAINT "financial_transaction_links_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_insurance_coverages" ADD CONSTRAINT "operational_insurance_coverages_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_insurance_coverages" ADD CONSTRAINT "operational_insurance_coverages_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_insurance_coverages" ADD CONSTRAINT "operational_insurance_coverages_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moto_passenger_compliance" ADD CONSTRAINT "moto_passenger_compliance_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_territory_access" ADD CONSTRAINT "admin_territory_access_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_territory_access" ADD CONSTRAINT "admin_territory_access_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_finance_rules" ADD CONSTRAINT "territory_finance_rules_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_profiles" ADD CONSTRAINT "operator_profiles_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_profiles" ADD CONSTRAINT "operator_profiles_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_profiles" ADD CONSTRAINT "operator_profiles_contract_reviewed_by_fkey" FOREIGN KEY ("contract_reviewed_by") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_submissions" ADD CONSTRAINT "contract_submissions_operator_profile_id_fkey" FOREIGN KEY ("operator_profile_id") REFERENCES "operator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_submissions" ADD CONSTRAINT "contract_submissions_submitted_by_admin_id_fkey" FOREIGN KEY ("submitted_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_submissions" ADD CONSTRAINT "contract_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_payouts" ADD CONSTRAINT "territory_payouts_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_payouts" ADD CONSTRAINT "territory_payouts_operator_profile_id_fkey" FOREIGN KEY ("operator_profile_id") REFERENCES "operator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_homologation_logs" ADD CONSTRAINT "pet_homologation_logs_homologation_id_fkey" FOREIGN KEY ("homologation_id") REFERENCES "pet_homologations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_maturity_snapshots" ADD CONSTRAINT "lab_maturity_snapshots_neighborhood_id_fkey" FOREIGN KEY ("neighborhood_id") REFERENCES "neighborhoods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_captured_by_member_id_fkey" FOREIGN KEY ("captured_by_member_id") REFERENCES "manager_team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_users" ADD CONSTRAINT "commerce_users_commerce_account_id_fkey" FOREIGN KEY ("commerce_account_id") REFERENCES "commerce_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_products" ADD CONSTRAINT "commerce_products_commerce_account_id_fkey" FOREIGN KEY ("commerce_account_id") REFERENCES "commerce_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_commerce_account_id_fkey" FOREIGN KEY ("commerce_account_id") REFERENCES "commerce_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_order_items" ADD CONSTRAINT "commerce_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_wallets" ADD CONSTRAINT "commerce_wallets_commerce_account_id_fkey" FOREIGN KEY ("commerce_account_id") REFERENCES "commerce_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_places" ADD CONSTRAINT "ar_places_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_place_contents" ADD CONSTRAINT "ar_place_contents_ar_place_id_fkey" FOREIGN KEY ("ar_place_id") REFERENCES "ar_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_team_commissions" ADD CONSTRAINT "manager_team_commissions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "manager_team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_fee_configs" ADD CONSTRAINT "platform_fee_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_fee_configs" ADD CONSTRAINT "platform_fee_configs_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_manager_assignments" ADD CONSTRAINT "territory_manager_assignments_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_manager_assignments" ADD CONSTRAINT "territory_manager_assignments_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_manager_assignments" ADD CONSTRAINT "territory_manager_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_shadow_results" ADD CONSTRAINT "wallet_shadow_results_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides_v2"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_shadow_results" ADD CONSTRAINT "wallet_shadow_results_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_shadow_results" ADD CONSTRAINT "wallet_shadow_results_fee_config_id_fkey" FOREIGN KEY ("fee_config_id") REFERENCES "platform_fee_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_shadow_results" ADD CONSTRAINT "wallet_shadow_results_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_shadow_results" ADD CONSTRAINT "wallet_shadow_results_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "territory_manager_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_wallets" ADD CONSTRAINT "driver_wallets_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_recharges" ADD CONSTRAINT "wallet_recharges_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_debits" ADD CONSTRAINT "pending_debits_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_referral_rewards" ADD CONSTRAINT "driver_referral_rewards_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_reward_payouts" ADD CONSTRAINT "referral_reward_payouts_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "driver_referral_rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_fixed_routes" ADD CONSTRAINT "driver_fixed_routes_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_fixed_route_reservations" ADD CONSTRAINT "driver_fixed_route_reservations_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "driver_fixed_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_fixed_route_reservations" ADD CONSTRAINT "driver_fixed_route_reservations_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_route_messages" ADD CONSTRAINT "fixed_route_messages_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "driver_fixed_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_route_messages" ADD CONSTRAINT "fixed_route_messages_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "driver_fixed_route_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_fixed_route_events" ADD CONSTRAINT "driver_fixed_route_events_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "driver_fixed_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_fixed_route_events" ADD CONSTRAINT "driver_fixed_route_events_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "driver_fixed_route_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaviar_group_members" ADD CONSTRAINT "kaviar_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "kaviar_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaviar_group_members" ADD CONSTRAINT "kaviar_group_members_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "kaviar_group_invites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaviar_group_invites" ADD CONSTRAINT "kaviar_group_invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "kaviar_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaviar_group_responsible_invites" ADD CONSTRAINT "kaviar_group_responsible_invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "kaviar_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaviar_group_posts" ADD CONSTRAINT "kaviar_group_posts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "kaviar_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaviar_group_posts" ADD CONSTRAINT "kaviar_group_posts_author_admin_id_fkey" FOREIGN KEY ("author_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaviar_group_posts" ADD CONSTRAINT "kaviar_group_posts_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "kaviar_group_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaviar_group_post_reads" ADD CONSTRAINT "kaviar_group_post_reads_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "kaviar_group_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaviar_group_post_reads" ADD CONSTRAINT "kaviar_group_post_reads_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "kaviar_group_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_incentive_ledger" ADD CONSTRAINT "annual_incentive_ledger_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_incentive_ledger" ADD CONSTRAINT "annual_incentive_ledger_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "annual_incentive_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_payout_destinations" ADD CONSTRAINT "driver_payout_destinations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_incentive_requests" ADD CONSTRAINT "annual_incentive_requests_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_incentive_request_allocations" ADD CONSTRAINT "annual_incentive_request_allocations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "annual_incentive_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_incentive_payouts" ADD CONSTRAINT "annual_incentive_payouts_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "annual_incentive_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_incentive_payouts" ADD CONSTRAINT "annual_incentive_payouts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_incentive_payout_attempts" ADD CONSTRAINT "annual_incentive_payout_attempts_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "annual_incentive_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_incentive_payout_outbox" ADD CONSTRAINT "annual_incentive_payout_outbox_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "annual_incentive_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_payee_destinations" ADD CONSTRAINT "financial_payee_destinations_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "financial_payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_obligations" ADD CONSTRAINT "financial_obligations_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "financial_payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_obligation_allocations" ADD CONSTRAINT "financial_obligation_allocations_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "financial_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_payouts" ADD CONSTRAINT "financial_payouts_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "financial_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_payouts" ADD CONSTRAINT "financial_payouts_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "financial_payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_payout_attempts" ADD CONSTRAINT "financial_payout_attempts_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "financial_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_payout_outbox" ADD CONSTRAINT "financial_payout_outbox_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "financial_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurring_obligations" ADD CONSTRAINT "financial_recurring_obligations_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "financial_payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_payout_cycles" ADD CONSTRAINT "territory_payout_cycles_parent_cycle_id_fkey" FOREIGN KEY ("parent_cycle_id") REFERENCES "territory_payout_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_cycle_allocations" ADD CONSTRAINT "territory_cycle_allocations_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "territory_payout_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_cycle_allocations" ADD CONSTRAINT "territory_cycle_allocations_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "territory_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_parent_entity_id_fkey" FOREIGN KEY ("parent_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_entity_persons" ADD CONSTRAINT "legal_entity_persons_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountants" ADD CONSTRAINT "accountants_accounting_firm_id_fkey" FOREIGN KEY ("accounting_firm_id") REFERENCES "accounting_firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_invites" ADD CONSTRAINT "accountant_invites_accountant_id_fkey" FOREIGN KEY ("accountant_id") REFERENCES "accountants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_invites" ADD CONSTRAINT "accountant_invites_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_invites" ADD CONSTRAINT "accountant_invites_revoked_by_admin_id_fkey" FOREIGN KEY ("revoked_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_entity_links" ADD CONSTRAINT "accountant_entity_links_accountant_id_fkey" FOREIGN KEY ("accountant_id") REFERENCES "accountants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_entity_links" ADD CONSTRAINT "accountant_entity_links_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_entity_links" ADD CONSTRAINT "accountant_entity_links_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_sessions" ADD CONSTRAINT "accountant_sessions_accountant_id_fkey" FOREIGN KEY ("accountant_id") REFERENCES "accountants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_password_resets" ADD CONSTRAINT "accountant_password_resets_accountant_id_fkey" FOREIGN KEY ("accountant_id") REFERENCES "accountants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_company_documents" ADD CONSTRAINT "accounting_company_documents_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_company_documents" ADD CONSTRAINT "accounting_company_documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "accounting_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_company_document_files" ADD CONSTRAINT "accounting_company_document_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "accounting_company_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_company_document_files" ADD CONSTRAINT "accounting_company_document_files_uploaded_by_admin_id_fkey" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_company_document_files" ADD CONSTRAINT "accounting_company_document_files_uploaded_by_accountant_i_fkey" FOREIGN KEY ("uploaded_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_certificates" ADD CONSTRAINT "accounting_certificates_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_certificates" ADD CONSTRAINT "accounting_certificates_responsible_accountant_id_fkey" FOREIGN KEY ("responsible_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_certificates" ADD CONSTRAINT "accounting_certificates_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "accounting_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_powers_of_attorney" ADD CONSTRAINT "accounting_powers_of_attorney_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_powers_of_attorney" ADD CONSTRAINT "accounting_powers_of_attorney_responsible_accountant_id_fkey" FOREIGN KEY ("responsible_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_powers_of_attorney" ADD CONSTRAINT "accounting_powers_of_attorney_document_file_id_fkey" FOREIGN KEY ("document_file_id") REFERENCES "accounting_company_document_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_powers_of_attorney" ADD CONSTRAINT "accounting_powers_of_attorney_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "accounting_powers_of_attorney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_payment_obligations" ADD CONSTRAINT "accounting_payment_obligations_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_payment_obligations" ADD CONSTRAINT "accounting_payment_obligations_created_by_accountant_id_fkey" FOREIGN KEY ("created_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_payment_obligations" ADD CONSTRAINT "accounting_payment_obligations_verified_by_accountant_id_fkey" FOREIGN KEY ("verified_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_payment_obligations" ADD CONSTRAINT "accounting_payment_obligations_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "accounting_competencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_obligation_access_tokens" ADD CONSTRAINT "accounting_obligation_access_tokens_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "accounting_payment_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_obligation_access_tokens" ADD CONSTRAINT "accounting_obligation_access_tokens_created_by_accountant__fkey" FOREIGN KEY ("created_by_accountant_id") REFERENCES "accountants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_obligation_audit" ADD CONSTRAINT "accounting_obligation_audit_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "accounting_payment_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_competencies" ADD CONSTRAINT "accounting_competencies_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_competencies" ADD CONSTRAINT "accounting_competencies_responsible_accountant_id_fkey" FOREIGN KEY ("responsible_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_competencies" ADD CONSTRAINT "accounting_competencies_completed_by_accountant_id_fkey" FOREIGN KEY ("completed_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_competencies" ADD CONSTRAINT "accounting_competencies_created_by_accountant_id_fkey" FOREIGN KEY ("created_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_competency_documents" ADD CONSTRAINT "accounting_competency_documents_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "accounting_competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_competency_documents" ADD CONSTRAINT "accounting_competency_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "accounting_company_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_competency_documents" ADD CONSTRAINT "accounting_competency_documents_linked_by_accountant_id_fkey" FOREIGN KEY ("linked_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_recurring_templates" ADD CONSTRAINT "accounting_recurring_templates_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_recurring_templates" ADD CONSTRAINT "accounting_recurring_templates_created_by_accountant_id_fkey" FOREIGN KEY ("created_by_accountant_id") REFERENCES "accountants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_automation_config" ADD CONSTRAINT "accounting_automation_config_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_automation_log" ADD CONSTRAINT "accounting_automation_log_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_badge_events" ADD CONSTRAINT "driver_badge_events_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_jobs" ADD CONSTRAINT "development_jobs_requested_by_admin_id_fkey" FOREIGN KEY ("requested_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_jobs" ADD CONSTRAINT "development_jobs_confirmed_by_admin_id_fkey" FOREIGN KEY ("confirmed_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territorial_dataset_versions" ADD CONSTRAINT "territorial_dataset_versions_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "operational_territories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

