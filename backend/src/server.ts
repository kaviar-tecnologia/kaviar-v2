import app from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { startOfferTimeoutJob } from './jobs/offer-timeout.job';
import { startStaleDriverCleanupJob } from './jobs/stale-driver-cleanup.job';
import { startScheduledDispatchJob } from './jobs/scheduled-dispatch.job';
import { startSumUpRechargeReconcileScheduler } from './services/wallet-v2/sumup-recharge-reconcile-scheduler';
import { startPayoutWorkerScheduler } from './services/finance/annual-incentive-payout/worker-scheduler';

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
    startScheduledDispatchJob();
    if (process.env.SUMUP_RECONCILE_SCHEDULER_ENABLED === 'true') {
      startSumUpRechargeReconcileScheduler();
    }
    startPayoutWorkerScheduler();

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
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
