import app from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { startOfferTimeoutJob } from './jobs/offer-timeout.job';
import { startStaleDriverCleanupJob } from './jobs/stale-driver-cleanup.job';
import { startScheduledDispatchJob } from './jobs/scheduled-dispatch.job';
import { startExcellenceSealScheduler } from './jobs/excellence-seal.job';
import { startSumUpRechargeReconcileScheduler } from './services/wallet-v2/sumup-recharge-reconcile-scheduler';
import { startPayoutWorkerScheduler, stopPayoutWorkerScheduler } from './services/finance/annual-incentive-payout/worker-scheduler';
import { shouldStartLegacyWorker } from './services/finance/annual-incentive-payout/engine-selection';
import { startOutboundPaymentWorkerScheduler, stopOutboundPaymentWorkerScheduler } from './services/finance/outbound-payments/worker-scheduler';
import { startEventWorkerScheduler, stopEventWorkerScheduler } from './services/finance/outbound-payments/event-worker-scheduler';
import {
  startDevelopmentAgentWorkerScheduler,
  stopDevelopmentAgentWorkerScheduler,
} from './services/ai/kaviar-ai.development-worker-scheduler';

async function startServer() {
  try {
    const PORT = Number(process.env.PORT || 3003);

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`KAVIAR Backend running on port ${PORT} [${config.nodeEnv}] commit=${process.env.GIT_COMMIT || 'unknown'}`);
    });

    // Start offer timeout job (SPEC_RIDE_FLOW_V1)
    startOfferTimeoutJob();
    startStaleDriverCleanupJob();
    startExcellenceSealScheduler();
    startScheduledDispatchJob();
    if (process.env.SUMUP_RECONCILE_SCHEDULER_ENABLED === 'true') {
      startSumUpRechargeReconcileScheduler();
    }
    // Annual incentive payout: engine selection prevents dual execution
    if (shouldStartLegacyWorker()) {
      startPayoutWorkerScheduler();
    }
    startOutboundPaymentWorkerScheduler();
    startEventWorkerScheduler();
    startDevelopmentAgentWorkerScheduler();

    // Test database connection (non-blocking startup)
    try {
      await Promise.race([
        prisma.$connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('DB connection timeout')), 10000)
        )
      ]);
      console.log('✅ Database connected successfully');
    } catch (dbError) {
      console.error('⚠️  Database connection failed (server still running):', dbError);
      // Não faz exit - deixa server rodar para health check responder
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
let shuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (shuttingDown) return; // idempotent
  shuttingDown = true;
  console.log(`\n🛑 Shutting down server (${signal})...`);
  await stopPayoutWorkerScheduler();
  await stopOutboundPaymentWorkerScheduler();
  await stopEventWorkerScheduler();
  await stopDevelopmentAgentWorkerScheduler();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();
