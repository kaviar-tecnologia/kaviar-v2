-- CARE-02 smoke test. Execute ONLY against disposable CI database.
-- A successful test rolls back all synthetic fixture rows.
BEGIN;

INSERT INTO "drivers" ("id") VALUES ('care02-synthetic-driver');
INSERT INTO "rides_v2" ("id") VALUES ('care02-synthetic-ride');

INSERT INTO "care_driver_qualifications" ("id", "driver_id")
VALUES ('care02-qualification', 'care02-synthetic-driver');
INSERT INTO "care_vehicle_capabilities" ("id", "driver_id")
VALUES ('care02-vehicle', 'care02-synthetic-driver');
INSERT INTO "care_trip_requirements" ("id", "ride_id", "mode")
VALUES ('care02-requirements', 'care02-synthetic-ride', 'ASSISTED');

DO $care$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM care_trip_requirements
    WHERE id='care02-requirements' AND status='DRAFT'
  ) THEN RAISE EXCEPTION 'CARE trip must default to DRAFT'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM care_driver_qualifications
    WHERE id='care02-qualification' AND status='PENDING'
  ) THEN RAISE EXCEPTION 'CARE driver must default to PENDING'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM care_vehicle_capabilities
    WHERE id='care02-vehicle' AND status='PENDING'
  ) THEN RAISE EXCEPTION 'CARE vehicle must default to PENDING'; END IF;
END
$care$;

DO $care$
BEGIN
  BEGIN
    UPDATE care_trip_requirements SET status='READY' WHERE id='care02-requirements';
    RAISE EXCEPTION 'READY without review was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE care_trip_requirements
      SET mode='FOLDING_WHEELCHAIR', folding_wheelchair=true, can_self_transfer=NULL
      WHERE id='care02-requirements';
    RAISE EXCEPTION 'folding chair without self-transfer was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE care_trip_requirements
      SET mode='ADAPTED_WHEELCHAIR', remain_in_wheelchair=false
      WHERE id='care02-requirements';
    RAISE EXCEPTION 'adapted trip without wheelchair seat was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE care_driver_qualifications SET status='VERIFIED'
    WHERE id='care02-qualification';
    RAISE EXCEPTION 'unverified driver was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE care_vehicle_capabilities SET status='VERIFIED'
    WHERE id='care02-vehicle';
    RAISE EXCEPTION 'unreviewed vehicle was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$care$;

UPDATE care_vehicle_capabilities
SET status='VERIFIED',
    plate_snapshot='TEST0000',
    inspection_valid_until=now()+interval '30 days',
    verified_at=now(),
    verified_by_admin_id='synthetic-ci-reviewer',
    wheelchair_capacity=0
WHERE id='care02-vehicle';

DO $care$
BEGIN
  BEGIN
    UPDATE care_vehicle_capabilities
    SET wheelchair_capacity=1 WHERE id='care02-vehicle';
    RAISE EXCEPTION 'adapted capacity without equipment was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$care$;

UPDATE care_vehicle_capabilities
SET wheelchair_capacity=1,
    ramp_or_lift_verified=true,
    wheelchair_restraint_verified=true,
    occupant_restraint_verified=true,
    adaptation_document_verified=true
WHERE id='care02-vehicle';

UPDATE care_driver_qualifications
SET status='VERIFIED',
    assisted_training_verified=true,
    valid_until=now()+interval '30 days',
    verified_at=now(),
    verified_by_admin_id='synthetic-ci-reviewer'
WHERE id='care02-qualification';

UPDATE care_trip_requirements
SET status='READY',reviewed_at=now(),reviewed_by_admin_id='synthetic-ci-reviewer'
WHERE id='care02-requirements';

DO $care$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM care_trip_requirements WHERE id='care02-requirements' AND status='READY')
  THEN RAISE EXCEPTION 'reviewed CARE trip not ready'; END IF;
  IF NOT EXISTS (SELECT 1 FROM care_driver_qualifications WHERE id='care02-qualification' AND status='VERIFIED')
  THEN RAISE EXCEPTION 'reviewed driver not verified'; END IF;
  IF NOT EXISTS (SELECT 1 FROM care_vehicle_capabilities WHERE id='care02-vehicle' AND status='VERIFIED' AND wheelchair_capacity=1)
  THEN RAISE EXCEPTION 'verified adapted vehicle not persisted'; END IF;
END
$care$;
ROLLBACK;
