import dotenv from 'dotenv';

dotenv.config();

const defaultDevCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:4173',
  'http://localhost:4174',
];

const frontendOriginsFromEnv = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    url: process.env.DATABASE_URL!,
  },
  
  jwtSecret: process.env.JWT_SECRET!,
  jwtResetSecret: process.env.JWT_RESET_SECRET || process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  
  admin: {
    defaultEmail: process.env.ADMIN_DEFAULT_EMAIL || 'admin@kaviar.com',
    defaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ADMIN_DEFAULT_PASSWORD must be set in production');
      }
      console.warn('⚠️  WARNING: Using default admin password in development. Set ADMIN_DEFAULT_PASSWORD env var.');
      return 'CHANGE_ME_IN_PRODUCTION';
    })(),
  },

  rateLimit: {
    adminLogin: parseInt(process.env.ADMIN_LOGIN_RATE_LIMIT || '10'),
    adminLoginPerEmail: parseInt(process.env.ADMIN_LOGIN_RATE_LIMIT_PER_EMAIL || '5'),
  },

  driverGovernance: {
    enableApprovalGates: process.env.ENABLE_DRIVER_APPROVAL_GATES === 'true',
  },

  geofence: {
    enableGeofence: process.env.ENABLE_GEOFENCE === 'true',
    fallbackWaitSeconds: parseInt(process.env.FALLBACK_WAIT_SECONDS || '0'),
    locationValidityMinutes: parseInt(process.env.GEOFENCE_LOCATION_VALIDITY || '5'),
  },

  driverEnforcement: {
    enableEnforcementGates: process.env.ENABLE_DRIVER_ENFORCEMENT_GATES === 'true',
    municipalRegulatoryGateEnabled: process.env.ENABLE_MUNICIPAL_REGULATORY_GATE === 'true',
  },

  diamond: {
    enableDiamond: process.env.ENABLE_DIAMOND === 'true',
    bonusFixed: parseFloat(process.env.DIAMOND_BONUS_FIXED || '5.00'),
    dailyCap: parseFloat(process.env.DIAMOND_BONUS_DAILY_CAP || '25.00'),
    timezone: 'America/Sao_Paulo'
  },

  rating: {
    enableRatingSystem: process.env.ENABLE_RATING_SYSTEM === 'true',
    windowDays: parseInt(process.env.RATING_WINDOW_DAYS || '7'),
    commentMaxLength: parseInt(process.env.RATING_COMMENT_MAX_LENGTH || '200')
  },

  premiumTourism: {
    enablePremiumTourism: process.env.ENABLE_PREMIUM_TOURISM === 'true',
    minRatingPremium: parseFloat(process.env.MIN_RATING_PREMIUM || '4.7'),
    minRatingsCountPremium: parseInt(process.env.MIN_RATINGS_COUNT_PREMIUM || '20')
  },

  integrations: {
    enableTwilioWhatsapp: process.env.ENABLE_TWILIO_WHATSAPP !== 'false', // Default true
  },

  wait: {
    enabled: process.env.WAIT_FEATURE_ENABLED === 'true',
    ratePerMin: parseFloat(process.env.WAIT_RATE_PER_MIN || '0.50'),
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  devCorsOrigins: Array.from(new Set([...defaultDevCorsOrigins, ...frontendOriginsFromEnv])),
};

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
