/**
 * Public CARE passenger-request flags.
 *
 * Fail closed: the official CARE flow is not released to passengers until the
 * transactional booking, pricing, dispatcher and driver acceptance path is
 * explicitly approved.
 */
export const CARE_FLAGS = {
  publicRequestEnabled: false,
} as const;
