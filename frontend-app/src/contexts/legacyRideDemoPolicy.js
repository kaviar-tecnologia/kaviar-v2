// Demonstration guard for the legacy web RideContext.
// Never enables simulated rides in a production build, even if the flag is present.
export const canRunLegacyRideDemo = (isDevelopment, featureFlag) =>
  isDevelopment === true && featureFlag === 'true';
