-- Add KAVIAR-owned local representation/support point to AR place types.
ALTER TYPE "ar_place_type" ADD VALUE IF NOT EXISTS 'KAVIAR_POINT';
