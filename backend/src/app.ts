import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import helmet from 'helmet';
import { config } from './config';
import { getUploadsPaths } from './config/uploads';
import { errorHandler, notFound } from './middlewares/error';
import { handleFeatureDisabledError, handleStatusTransitionError } from './middlewares/premium-tourism-flag';
import { prisma } from './lib/prisma';
import investorView from './middlewares/investorView';
import { requestIdMiddleware } from './middlewares/request-id';
import { structuredLogger } from './middlewares/structured-logger';

// Core routes (always enabled)
import { authRoutes } from './routes/auth';
import { passwordResetRoutes } from './routes/password-reset';
import adminEmailRoutes from './routes/admin-email';
import inboundEmailRoutes from './routes/inbound-email';
import adminInboundEmailsRoutes from './routes/admin-inbound-emails';
import adminInboundEmailAttachmentsRoutes from './routes/admin-inbound-email-attachments';
import { phoneAuthRoutes } from './routes/phone-auth';
import { adminRoutes } from './routes/admin';
import complianceRoutes from './routes/compliance';
import dashboardRoutes from './routes/dashboard';
import matchRoutes from './routes/match';

// Feature-based routes
import { integrationsRoutes } from './routes/integrations';
import { premiumTourismRoutes } from './routes/premium-tourism';
import geoRoutes from './routes/geo';
// v1 rides routes removed — all traffic uses /api/v2/rides
import { governanceRoutes } from './routes/governance';
import { passengerAuthRoutes } from './routes/passenger-auth';
import { driverAuthRoutes } from './routes/driver-auth';
import { guideAuthRoutes } from './routes/guide-auth';
import { adminApprovalRoutes } from './routes/admin-approval';
import { ratingsRoutes } from './routes/ratings';
import driversRoutes from './routes/drivers';
import adminDriversRoutes from './routes/admin-drivers';
import communityLeadersRoutes from './routes/community-leaders';
import localOperatorsRoutes from './routes/admin-local-operators';
import territorialPartnersRoutes from './routes/admin-territorial-partners';
import adminTerritoriesRoutes from './routes/admin-territories';
import adminMotoComplianceRoutes from './routes/admin-moto-compliance';
import adminPayoutsRoutes from './routes/admin-payouts';
import adminMyOperatorProfileRoutes from './routes/admin-my-operator-profile';
import adminOperatorReferralsRoutes from './routes/admin-operator-referrals';
import adminInvestorDocsRoutes from './routes/admin-investor-docs';
import partnerManagementRoutes from './routes/admin-partner-management';
import partnerPortalRoutes from './routes/partner-portal';
import privateRidesRoutes from './routes/private-rides';
import publicRegionRoutes from './routes/public-region';
import adminLocalBusinessesRoutes from './routes/admin-local-businesses';
import adminFinanceRoutes from './routes/admin-finance';
import adminAccountantReportRoutes from './routes/admin-accountant-report';
import feeCalculationRoutes from './routes/fee-calculation';
import driverDashboardRoutes from './routes/driver-dashboard';
import driverModalitiesRoutes from './routes/driver-modalities';
import adminModalitiesRoutes from './routes/admin-modalities';
import notificationsRoutes from './routes/notifications';
import passengerLocationsRoutes from './routes/passenger-locations';
import passengerFavoritesRoutes from './routes/passenger-favorites';
import passengerOnboardingRoutes from './routes/passenger-onboarding';
import driverOnboardingRoutes from './routes/driver-onboarding';
import neighborhoodStatsRoutes from './routes/neighborhood-stats';
import { rolloutRoutes } from './routes/rollout-temp';
import passengerProfileRoutes from './routes/passenger-profile';
import driverEarningsRoutes from './routes/driver-earnings';
import adminAuditRoutes from './routes/admin-audit';
import passengerRidesRoutes from './routes/passenger-rides';
import driverAvailabilityRoutes from './routes/driver-availability';
import adminDashboardMetricsRoutes from './routes/admin-dashboard-metrics';
import adminLabRoutes from './routes/admin-lab';
import neighborhoodsSmartRoutes from './routes/neighborhoods-smart';
import driverTerritoryRoutes from './routes/driver-territory';
import { publicRoutes } from './routes/public';
import adminPresignRoutes from './routes/admin-presign';
import consultantLeadsRoutes from './routes/consultant-leads';
import adminStaffRoutes from './routes/admin-staff';
import adminPetOperatorsRoutes from './routes/admin-pet-operators';
import adminPetHomologationsRoutes from './routes/admin-pet-homologations';
import petIntakeRoutes from './routes/pet-intake';
import adminWhatsappRoutes from './routes/admin-whatsapp';
import adminWhatsappInvitesRoutes, { twilioWhatsappStatusRouter } from './routes/admin-whatsapp-invites';
import adminOperationsRoutes from './routes/admin-operations';
import adminPricingRoutes from './routes/admin-pricing';
import adminTerritoryFloorsRoutes from './routes/admin-territory-floors';
import adminCreditPackagesRoutes from './routes/admin-credit-packages';
import adminRetornoFamiliarRoutes from './routes/admin-retorno-familiar';
import driverRetornoFamiliarRoutes from './routes/driver-retorno-familiar';
import passengerWomenPreferenceRoutes from './routes/passenger-women-preference';
import driverWomenPreferenceRoutes from './routes/driver-women-preference';
import adminWomenPreferenceRoutes from './routes/admin-women-preference';
import adminReferralRoutes from './routes/admin-referrals';
import adminLocalSupportRoutes from './routes/admin-local-support';
import adminManagerDraftsRoutes from './routes/admin-manager-drafts';
import adminManagerFinanceRoutes from './routes/admin-manager-finance';
import adminManagerReputationRoutes from './routes/admin-manager-reputation';
import adminManagerTerritoryFloorsRoutes from './routes/admin-manager-territory-floors';
import adminCrmRoutes from './routes/admin-crm';
import adminRegulatoryConsultationRoutes from './routes/admin-regulatory-consultation';
import adminRegulatoryCitiesRoutes from './routes/admin-regulatory-cities';
import adminMunicipalRoutes from './routes/admin-municipal';
import adminInsuranceCoveragesRoutes from './routes/admin-insurance-coverages';
import adminGroupsRoutes from './routes/admin-groups';
import groupInviteRoutes from './routes/group-invites';
import passengerGroupsRoutes from './routes/passenger-groups';
import driverGroupsRoutes from './routes/driver-groups';
import adminCommerceRoutes from './routes/admin-commerce';
import commerceAuthRoutes from './routes/commerce-auth';
import commercePortalRoutes from './routes/commerce-portal';
import commercePublicRoutes from './routes/commerce-public';
import publicTeamReferralRoutes from './routes/public-team-referral';
import publicCityLeadRoutes from './routes/public-city-lead';
import adminDriverCityLandingsRoutes from './routes/admin-driver-city-landings';
import ridesV2Routes from './routes/rides-v2';
import driversV2Routes from './routes/drivers-v2';
import driverMunicipalRoutes from './routes/driver-municipal';
import realtimeRoutes from './routes/realtime';
import driverFixedRoutesRoutes from './routes/driver-fixed-routes';
import fixedRouteInviteRoutes from './routes/fixed-route-invites';
import passengerFixedRouteReservationsRoutes from './routes/passenger-fixed-route-reservations';
import adminFixedRoutesRoutes from './routes/admin-fixed-routes';
import { driverFixedRouteMessagesRoutes, passengerFixedRouteMessagesRoutes } from './routes/fixed-route-messages';
import passengerNotificationsRoutes from './routes/passenger-notifications';
import driverNotificationsRoutes from './routes/driver-notifications';
import driverAnnualIncentiveRoutes from './routes/driver-annual-incentive';
import adminAnnualIncentiveRoutes from './routes/admin-annual-incentive';
import adminOutboundPaymentsRoutes from './routes/admin-outbound-payments';
import adminManagerCyclesRoutes from './routes/admin-manager-cycles';
import managerFinanceRoutes from './routes/manager-finance';
import { adminAccountingRoutes } from './routes/admin-accounting';
import { accountantAuthRoutes } from './routes/accountant-auth';
import { accountantPortalRoutes } from './routes/accountant-portal';
import { accountantDocumentRoutes } from './routes/accountant-documents';
import { accountantRepresentationRoutes } from './routes/accountant-representation';
import { accountantRidesReportRoutes } from './routes/accountant-rides-report';
import { accountantObligationsRoutes } from './routes/accountant-obligations';
import { accountantCompetenciesRoutes } from './routes/accountant-competencies';
import { accountantAutomationRoutes } from './routes/accountant-automation';
import { publicObligationsRoutes } from './routes/public-obligations';
import { startScheduler } from './services/accounting/accounting-scheduler.service';
import { adminDocumentTypesRoutes } from './routes/admin-document-types';
import { authenticateAccountant } from './middlewares/accountant-auth';
import webhooksAsaasRoutes from './routes/webhooks-asaas';

const app = express();

// ✅ Trust proxy (ALB)
app.set('trust proxy', 1);

// ✅ Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// ✅ Request ID (primeiro middleware)
app.use(requestIdMiddleware);

// ✅ Structured logging (segundo middleware)
app.use(structuredLogger);

// CORS
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;

  const allowedOrigins = new Set([
    'https://app.kaviar.com.br',
    'https://kaviar.com.br',
    'https://www.kaviar.com.br',
    'https://d29p7cirgjqbxl.cloudfront.net',
    ...(process.env.NODE_ENV !== 'production' ? [
      'http://localhost:5173',
      'http://localhost:4173',
      'http://localhost:4174',
    ] : []),
  ]);

  res.header('Vary', 'Origin');

  // Healthcheck ALB e requests server-to-server (sem Origin)
  if (!origin) {
    return next();
  }

  if (allowedOrigins.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    return res.status(403).json({ success: false, error: 'CORS origin not allowed' });
  }

  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.header('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  next();
});

// Body parsing middleware
app.use('/api/inbound/email/cloudflare', express.json({ limit: '2mb' }));
app.use('/api/inbound/email/cloudflare', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Payload inbound excede o limite de 2 MB.' });
  }
  return next(err);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting (in-memory, no Redis needed)
import rateLimit from 'express-rate-limit';
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, try again later' },
  skip: () => process.env.NODE_ENV === 'test',
});
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Too many requests' }, skip: () => process.env.NODE_ENV === 'test' });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: { error: 'Rate limit exceeded' }, skip: () => process.env.NODE_ENV === 'test' });
app.use('/api/admin/auth', authLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/public', publicLimiter);
app.use('/api', apiLimiter);

// Core health check (always available)
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'KAVIAR API' });
});

// Debug endpoint (DEV only) - force error for testing
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/_debug/error', (req, res, next) => {
    next(new Error('Test error from debug endpoint'));
  });
}

// LIVENESS: ALB + container health check (verifies DB connectivity)
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      message: 'KAVIAR Backend',
      version: process.env.GIT_COMMIT || 'unknown',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'unhealthy',
      message: 'Database unreachable',
      version: process.env.GIT_COMMIT || 'unknown',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
});

// READINESS: dependency checks (200 if ready, 503 if not)
app.get('/api/health/ready', async (req, res) => {
  const startTime = Date.now();
  const checks: any = { database: false, s3: false };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (e) {
    checks.database = false;
  }

  checks.s3 = !!process.env.AWS_S3_BUCKET;

  const responseTime = Date.now() - startTime;
  const healthy = checks.database && checks.s3;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'healthy' : 'degraded',
    message: 'KAVIAR Backend',
    version: process.env.GIT_COMMIT || 'unknown',
    uptime: process.uptime(),
    responseTime,
    checks,
    features: {
      twilio_whatsapp: config.integrations.enableTwilioWhatsapp,
      premium_tourism: config.premiumTourism.enablePremiumTourism,
    },
    timestamp: new Date().toISOString(),
  });
});

// Core routes (always enabled)
app.use('/api/admin/auth', authRoutes);
app.use('/api/admin/auth', passwordResetRoutes);
app.use('/api/admin/email', adminEmailRoutes);
app.use('/api/inbound/email', inboundEmailRoutes);
app.use('/api/admin/inbound-emails', adminInboundEmailsRoutes);
app.use('/api/admin/inbound-email-attachments', adminInboundEmailAttachmentsRoutes);

// Investor invites (SUPER_ADMIN only, before investorView middleware)
import investorInvitesRoutes from './routes/investor-invites-v2';
app.use('/api/admin/investors', investorInvitesRoutes);
app.use('/', investorInvitesRoutes); // public short invite links: /i/:code

// Demo Mode / Investor View Middleware (read-only)
app.use('/api', investorView);

app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/match', matchRoutes);
// Media proxy (antes do adminRoutes que tem auth global)
app.use('/api/admin/whatsapp', adminWhatsappRoutes);
app.use('/api/admin/whatsapp-invites', adminWhatsappInvitesRoutes);
app.use('/api/webhooks', twilioWhatsappStatusRouter);
app.use('/api/admin', adminApprovalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminDriversRoutes);
app.use('/api/admin', adminPresignRoutes);
app.use('/api/admin/dashboard', adminDashboardMetricsRoutes);
app.use('/api/admin/lab', adminLabRoutes);
app.use('/api/admin/community-leaders', communityLeadersRoutes);
app.use('/api/admin/local-operators', localOperatorsRoutes);
// Public receipt validation (no auth)
app.get('/api/public/receipt/:code', async (req, res) => {
  const { PrismaClient } = require('@prisma/client');
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const p = new PrismaClient();
  try {
    const payment = await p.partner_member_payments.findUnique({
      where: { receipt_code: req.params.code },
      select: { receipt_code: true, reference_month: true, amount_cents: true, payment_method: true, paid_at: true, partner_id: true, member: { select: { name: true, unit: true } }, partner: { select: { name: true, logo_url: true } } },
    });
    if (!payment) return res.json({ success: false, error: 'Comprovante não encontrado' });
    // Generate presigned logo URL
    let logo_presigned = null;
    if (payment.partner.logo_url) {
      try {
        const s3 = new S3Client({ region: 'us-east-2' });
        const list: any = await s3.send(new ListObjectsV2Command({ Bucket: 'kaviar-uploads-847895361928', Prefix: `partner-logos/${payment.partner_id}`, MaxKeys: 5 }));
        const key = list.Contents?.sort((a: any, b: any) => new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime())?.[0]?.Key;
        if (key) logo_presigned = await getSignedUrl(s3, new GetObjectCommand({ Bucket: 'kaviar-uploads-847895361928', Key: key }), { expiresIn: 3600 });
      } catch {}
    }
    res.json({ success: true, data: { ...payment, logo_presigned } });
  } catch { res.status(500).json({ success: false, error: 'Erro' }); }
  finally { await p.$disconnect(); }
});

// Public partner logo (no auth)
app.get('/api/partners/:id/logo', async (req, res) => {
  const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  try {
    const s3 = new S3Client({ region: 'us-east-2' });
    const bucket = 'kaviar-uploads-847895361928';
    const prefix = `partner-logos/${req.params.id}`;
    // Find the actual file (any extension)
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 5 }));
    const key = list.Contents?.sort((a: any, b: any) => b.LastModified - a.LastModified)?.[0]?.Key;
    if (!key) return res.status(404).end();
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    res.set('Content-Type', response.ContentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    (response.Body as any).pipe(res);
  } catch (e: any) {
    if (e?.name === 'NoSuchKey') return res.status(404).end();
    res.status(500).end();
  }
});

app.use('/api/admin/territorial-partners', territorialPartnersRoutes);
app.use('/api/admin/territories', adminTerritoriesRoutes);
app.use('/api/admin/territories', adminMotoComplianceRoutes);
app.use('/api/admin/territorial-payouts', adminPayoutsRoutes);
app.use('/api/admin/my-operator-profile', adminMyOperatorProfileRoutes);
app.use('/api/admin/operator/referrals', adminOperatorReferralsRoutes);
app.use('/api/admin/investor-docs', adminInvestorDocsRoutes);
app.use('/api/admin/territorial-partners', partnerManagementRoutes);
app.use('/api/admin/manager', adminManagerDraftsRoutes);
app.use('/api/admin/manager/finance', adminManagerFinanceRoutes);
app.use('/api/admin/manager/drivers/reputation', adminManagerReputationRoutes);
app.use('/api/admin/manager/territory-floors', adminManagerTerritoryFloorsRoutes);
import adminManagerWomenCoverageRoutes from './routes/admin-manager-women-coverage';
app.use('/api/admin/manager/women-coverage', adminManagerWomenCoverageRoutes);
app.use('/api', complianceRoutes);
app.use('/api/ratings', ratingsRoutes);
import adminRatingsRoutes from './routes/admin-ratings';
app.use('/api/admin/ratings', adminRatingsRoutes);
import adminShowcaseRoutes from './routes/admin-showcase';
app.use('/api/admin/showcase', adminShowcaseRoutes);
import adminCompensationRoutes from './routes/admin-compensations';
app.use('/api/admin/compensations', adminCompensationRoutes);
app.use('/api/drivers', driversRoutes);
app.use('/api/drivers', driverDashboardRoutes);
app.use('/api/drivers', driverTerritoryRoutes);
app.use('/api/drivers', driverModalitiesRoutes);
app.use('/api/admin', adminModalitiesRoutes);
app.use('/api/drivers', notificationsRoutes);
app.use('/api/drivers', driverEarningsRoutes);
app.use('/api/drivers', driverAvailabilityRoutes);
app.use('/api/drivers', driverGroupsRoutes);
app.use('/api/driver/fixed-routes', driverFixedRoutesRoutes);
app.use('/api/driver/fixed-routes', driverFixedRouteMessagesRoutes);
app.use('/api/fixed-routes', fixedRouteInviteRoutes);
app.use('/api/passenger/fixed-route-reservations', passengerFixedRouteReservationsRoutes);
app.use('/api/passenger/fixed-route-reservations', passengerFixedRouteMessagesRoutes);
app.use('/api/admin/fixed-routes', adminFixedRoutesRoutes);
app.use('/api/passenger/notifications', passengerNotificationsRoutes);
app.use('/api/driver/notifications', driverNotificationsRoutes);
app.use('/api/neighborhoods', neighborhoodsSmartRoutes);
app.use('/api/passengers', passengerLocationsRoutes);
app.use('/api/passengers', passengerProfileRoutes);
app.use('/api/passengers', passengerGroupsRoutes);
app.use('/api/passenger', passengerFavoritesRoutes);
app.use('/api/passenger/onboarding', passengerOnboardingRoutes);
app.use('/api/driver', driverOnboardingRoutes);
app.use('/api/trips', feeCalculationRoutes);
app.use('/api', neighborhoodStatsRoutes);
app.use('/api/rides', passengerRidesRoutes);
app.use('/api/admin', adminAuditRoutes);
app.use('/api/temp', rolloutRoutes);

// Feature-based routes

// Integrations (Twilio/WhatsApp) - Default ON
if (config.integrations.enableTwilioWhatsapp) {
  app.use('/webhooks', integrationsRoutes);
}

// Premium Tourism
if (config.premiumTourism.enablePremiumTourism) {
  app.use('/api', premiumTourismRoutes);
}

// Public + admin routes
app.use('/api/public', publicRoutes);
app.use('/api/partner', partnerPortalRoutes);
app.use('/api/public/private-rides', privateRidesRoutes);
app.use('/api/admin/private-rides', privateRidesRoutes);
app.use('/api/public/region', publicRegionRoutes);
app.use('/api/admin/finance/accountant-report', adminAccountantReportRoutes);
app.use('/api/admin/finance', adminFinanceRoutes);
app.use('/api/admin/finance/annual-incentive', adminAnnualIncentiveRoutes);
app.use('/api/admin/finance/outbound', adminOutboundPaymentsRoutes);
app.use('/api/admin/finance/manager-cycles', adminManagerCyclesRoutes);
app.use('/api/admin/accounting', adminAccountingRoutes);
app.use('/api/admin/accounting/document-types', adminDocumentTypesRoutes);
app.use('/api/accountant/auth', accountantAuthRoutes);
app.use('/api/accountant/portal', authenticateAccountant, accountantPortalRoutes);
app.use('/api/accountant/portal', authenticateAccountant, accountantDocumentRoutes);
app.use('/api/accountant/portal', authenticateAccountant, accountantRepresentationRoutes);
app.use('/api/accountant/portal', authenticateAccountant, accountantRidesReportRoutes);
app.use('/api/accountant/portal', authenticateAccountant, accountantObligationsRoutes);
app.use('/api/accountant/portal', authenticateAccountant, accountantCompetenciesRoutes);
app.use('/api/accountant/portal', authenticateAccountant, accountantAutomationRoutes);
app.use('/api/public/obligations', publicObligationsRoutes);
app.use('/api/manager/finance', managerFinanceRoutes);
app.use('/api/webhooks/asaas', webhooksAsaasRoutes);
app.use('/api/driver/annual-incentive', driverAnnualIncentiveRoutes);
app.use('/api/admin/local-businesses', adminLocalBusinessesRoutes);
app.use('/api/admin/crm', adminCrmRoutes);
app.use('/api/admin/regulatory-consultation', adminRegulatoryConsultationRoutes);
app.use('/api/admin', adminRegulatoryCitiesRoutes);
app.use('/api/admin', adminMunicipalRoutes);
app.use('/api/admin/insurance-coverages', adminInsuranceCoveragesRoutes);
app.use('/api/admin/groups', adminGroupsRoutes);
app.use('/api/groups', groupInviteRoutes);
app.use('/api/admin/commerce', adminCommerceRoutes);
app.use('/api/commerce/auth', commerceAuthRoutes);
app.use('/api/commerce', commercePortalRoutes);
app.use('/api/public/commerce', commercePublicRoutes);
app.use('/api/public', consultantLeadsRoutes);
app.use('/api/admin', consultantLeadsRoutes);
app.use('/api/admin/staff', adminStaffRoutes);
app.use('/api/admin/pet/operators', adminPetOperatorsRoutes);
app.use('/api/admin/pet/homologations', adminPetHomologationsRoutes);
app.use('/api/public/pet', petIntakeRoutes);
app.use('/api/admin/operations', adminOperationsRoutes);
app.use('/api/admin/pricing-profiles', adminPricingRoutes);
app.use('/api/admin/territory-floors', adminTerritoryFloorsRoutes);
app.use('/api/admin/credit-packages', adminCreditPackagesRoutes);
app.use('/api/admin/retorno-familiar', adminRetornoFamiliarRoutes);
app.use('/api/admin/women-preference', adminWomenPreferenceRoutes);
app.use('/api/v2/drivers/me/retorno-familiar', driverRetornoFamiliarRoutes);
app.use('/api/v2/passengers/me/women-preference', passengerWomenPreferenceRoutes);
app.use('/api/v2/drivers/me/women-preference', driverWomenPreferenceRoutes);
import driverWalletV2Routes from './routes/driver-wallet-v2';
app.use('/api/v2/drivers/me/wallet', driverWalletV2Routes);
import driverFamilyReturnRoutes from './routes/driver-family-return';
app.use('/api/v2/drivers/me/family-return', driverFamilyReturnRoutes);
import communityHealthRoutes from './routes/community-health';
app.use('/api/admin/communities', communityHealthRoutes);
app.use('/api/admin', adminReferralRoutes);
app.use('/api/admin/local-support', adminLocalSupportRoutes);
app.use('/api/public', adminReferralRoutes);
app.use('/api/public', publicTeamReferralRoutes);
app.use('/api/public', publicCityLeadRoutes);
app.use('/api/admin/driver-city-landings', adminDriverCityLandingsRoutes);
import adminEmergencyRoutes from './routes/admin-emergency';
import adminManagerEmergencyRoutes from './routes/admin-manager-emergency';
app.use('/api/admin/emergency-events', adminEmergencyRoutes);
app.use('/api/admin/manager-emergency', adminManagerEmergencyRoutes);
app.use('/api/geo', geoRoutes);
// v1 rides routes deleted — see rides-v2.ts
app.use('/api/governance', governanceRoutes);
app.use('/api/auth', passengerAuthRoutes);
app.use('/api/auth', driverAuthRoutes);
app.use('/api/auth', guideAuthRoutes);
app.use('/api/auth', passwordResetRoutes);
app.use('/api/auth', phoneAuthRoutes);

// V2 routes
app.use('/api/v2/rides', ridesV2Routes);
app.use('/api/v2/drivers', driversV2Routes);
app.use('/api/v2/driver', driverMunicipalRoutes);
import webhooksSumUpRoutes from './routes/webhooks-sumup';
app.use('/api/webhooks', webhooksSumUpRoutes);
import geoProxyRoutes from './routes/geo-proxy';
app.use('/api/geo-proxy', geoProxyRoutes);
app.use('/api/realtime', realtimeRoutes);
import rideTrackRoutes from './routes/ride-track';
app.use('/api/public/ride-track', rideTrackRoutes);

// Feature disabled handler
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks') && !config.integrations.enableTwilioWhatsapp) {
    return res.status(404).json({
      error: 'FEATURE_DISABLED',
      feature: 'TWILIO_WHATSAPP'
    });
  }
  
  next();
});

// Serve uploaded files (must be BEFORE 404 handler)
const { uploadsBaseDir } = getUploadsPaths();
app.use('/uploads', express.static(uploadsBaseDir));

// S3 presigned URL endpoint (fallback for files not found locally)
import { getPresignedUrl, extractS3Key } from './config/s3-upload';

app.get('/uploads/*', async (req, res, next) => {
  try {
    const key = req.path.replace('/uploads/', '');
    
    // Check if file exists in S3
    const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
    
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      }));
      
      // File exists in S3, generate presigned URL
      const presignedUrl = await getPresignedUrl(key);
      return res.redirect(presignedUrl);
    } catch (s3Error: any) {
      if (s3Error.name === 'NotFound') {
        // File not in S3, return 404 with helpful message
        return res.status(404).json({
          success: false,
          error: 'Arquivo não encontrado',
          message: 'Este documento foi enviado antes da migração para S3 e não está mais disponível. Por favor, solicite ao motorista que faça upload novamente.',
          key
        });
      }
      throw s3Error;
    }
  } catch (error) {
    next();
  }
});

// Error handling
app.use(notFound);
app.use(handleFeatureDisabledError);
app.use(handleStatusTransitionError);
app.use(errorHandler);

// Start daily automation scheduler
startScheduler();

export default app;

// ci: trigger backend deploy
