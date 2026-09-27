/**
 * PR #406: PREVIEW ONLY. No endpoint for finalizing a closing, locking an
 * account, changing a ledger status or uploading an external statement.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import { loadMonthlyClosePreview } from '../services/finance/monthly-close-preview.service';
import {
  CloseReviewError, prepareMonthlyCloseReview, submitMonthlyCloseReview,
  approveInternalMonthlyCloseReview, reopenMonthlyCloseReview, listMonthlyCloseReviews,
} from '../services/finance/monthly-close-review.service';
import { auditCtx } from '../utils/audit';
import {
  EvidenceError, evidenceRequirements, listEvidence, recordSyntheticEvidence,
} from '../services/finance/statement-evidence.service';
import { StatementPreviewError } from '../services/finance/reconciliation-preview.service';
import multer from 'multer';
import {
  OfficialArchiveError,archiveUserDeclaredStatement,listOfficialArchives,checkOfficialArchiveMalware,
} from '../services/finance/official-statement-archive.service';
import { loadArchiveRecovery } from '../services/finance/official-archive-recovery.service';

const router = Router();
router.use(authenticateAdmin, allowFinanceAccess);

const querySchema = z.object({
  legal_entity_id: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
}).strict();

router.get('/preview', async (req: Request, res: Response) => {
  const role = (req as any).admin?.role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') {
    return res.status(403).json({ success: false, error: 'FORBIDDEN' });
  }
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'INVALID_MONTHLY_CLOSE_QUERY' });
  }
  try {
    const { legal_entity_id, year, month } = parsed.data;
    const preview = await loadMonthlyClosePreview(legal_entity_id, year, month);
    if (!preview) {
      return res.status(404).json({ success: false, error: 'LEGAL_ENTITY_NOT_FOUND' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: preview });
  } catch {
    return res.status(500).json({ success: false, error: 'MONTHLY_CLOSE_PREVIEW_UNAVAILABLE' });
  }
});


/**
 * PR #407: these endpoints approve INTERNAL REVIEW ONLY. There is deliberately
 * no final-close, no bank statement certification, no ledger lock or payout.
 * The Portal do Contador's COMPLETED status is a separate process.
 */
const reviewParams = z.object({ id: z.string().uuid() }).strict();
const reopenBody = z.object({ reason: z.string().trim().min(10).max(500) }).strict();

function actorFrom(req: Request) {
  const role = (req as any).admin?.role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') throw new CloseReviewError(403, 'FORBIDDEN');
  const id = (req as any).admin?.id;
  if (!id) throw new CloseReviewError(401, 'ADMIN_ID_REQUIRED');
  const ctx = auditCtx(req);
  return {
    adminId: String(id), adminEmail: ctx.adminEmail ?? null,
    ipAddress: ctx.ip ?? null, userAgent: ctx.ua ?? null,
    role,
  };
}
function handleReviewError(res: Response, err: unknown) {
  if (err instanceof CloseReviewError) return res.status(err.status).json({ success: false, error: err.code });
  if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: 'INVALID_MONTHLY_CLOSE_INPUT' });
  if ((err as any)?.code === 'P2002') return res.status(409).json({ success: false, error: 'CONCURRENT_REVIEW_CONFLICT' });
  console.error('[FINANCE_CLOSE_REVIEW]', err);
  return res.status(500).json({ success: false, error: 'MONTHLY_CLOSE_REVIEW_UNAVAILABLE' });
}

router.get('/reviews', async (req: Request, res: Response) => {
  try {
    actorFrom(req);
    const query = querySchema.parse(req.query);
    const rows = await listMonthlyCloseReviews(query.legal_entity_id, query.year, query.month);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: rows });
  } catch (err) { return handleReviewError(res, err); }
});
router.post('/reviews/prepare', async (req: Request, res: Response) => {
  try {
    const actor = actorFrom(req);
    const query = querySchema.parse(req.body);
    const result = await prepareMonthlyCloseReview(query.legal_entity_id, query.year, query.month, actor);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ success: true, data: result });
  } catch (err) { return handleReviewError(res, err); }
});
router.post('/reviews/:id/submit', async (req: Request, res: Response) => {
  try {
    const actor = actorFrom(req);
    const params = reviewParams.parse(req.params);
    const result = await submitMonthlyCloseReview(params.id, actor);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: result });
  } catch (err) { return handleReviewError(res, err); }
});
router.post('/reviews/:id/approve-internal', async (req: Request, res: Response) => {
  try {
    const actor = actorFrom(req);
    if (actor.role !== 'SUPER_ADMIN') throw new CloseReviewError(403, 'SUPER_ADMIN_REQUIRED');
    const params = reviewParams.parse(req.params);
    const result = await approveInternalMonthlyCloseReview(params.id, actor);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: result });
  } catch (err) { return handleReviewError(res, err); }
});
router.post('/reviews/:id/reopen', async (req: Request, res: Response) => {
  try {
    const actor = actorFrom(req);
    if (actor.role !== 'SUPER_ADMIN') throw new CloseReviewError(403, 'SUPER_ADMIN_REQUIRED');
    const params = reviewParams.parse(req.params);
    const body = reopenBody.parse(req.body);
    const result = await reopenMonthlyCloseReview(params.id, body.reason, actor);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: result });
  } catch (err) { return handleReviewError(res, err); }
});


/**
 * PR #408. No real statement upload here. SYNTHETIC registration is physically
 * blocked outside NODE_ENV=test; reads NEVER assert official verification.
 */
const evidenceBody = z.object({
  legal_entity_id: z.string().uuid(),
  account_id: z.string().uuid(),
  provider: z.enum(['SUMUP','ASAAS']),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  content_base64: z.string().min(8).max(88_000),
}).strict();
function evidenceError(res: Response, err: unknown) {
  if (err instanceof EvidenceError)
    return res.status(err.status).json({ success: false, error: err.code });
  if (err instanceof StatementPreviewError)
    return res.status(400).json({ success: false, error: err.code });
  if (err instanceof z.ZodError)
    return res.status(400).json({ success: false, error: 'INVALID_EVIDENCE_INPUT' });
  if ((err as any)?.code === 'P2002')
    return res.status(409).json({ success: false, error: 'DUPLICATE_EVIDENCE_MANIFEST' });
  console.error('[FINANCE_EVIDENCE]', err instanceof Error ? err.name : 'error');
  return res.status(500).json({ success: false, error: 'EVIDENCE_UNAVAILABLE' });
}
router.get('/evidence/requirements', async (req: Request, res: Response) => {
  try {
    actorFrom(req);
    const q = querySchema.parse(req.query);
    res.setHeader('Cache-Control','no-store');
    return res.json({ success: true, data: await evidenceRequirements(q.legal_entity_id, q.year, q.month) });
  } catch (err) { return evidenceError(res, err); }
});
router.get('/evidence', async (req: Request, res: Response) => {
  try {
    actorFrom(req);
    const q = querySchema.parse(req.query);
    res.setHeader('Cache-Control','no-store');
    return res.json({ success: true, data: await listEvidence(q.legal_entity_id, q.year, q.month) });
  } catch (err) { return evidenceError(res, err); }
});
router.post('/evidence/synthetic', async (req: Request, res: Response) => {
  // Fail BEFORE reading or touching the database in production.
  if (process.env.NODE_ENV !== 'test')
    return res.status(404).json({ success: false, error: 'SYNTHETIC_ONLY' });
  try {
    const actor = actorFrom(req);
    const body = evidenceBody.parse(req.body);
    const result = await recordSyntheticEvidence({
      legalEntityId: body.legal_entity_id, accountId: body.account_id,
      provider: body.provider, year: body.year, month: body.month,
      contentBase64: body.content_base64,
    }, actor);
    res.setHeader('Cache-Control','no-store');
    return res.status(201).json({ success: true, data: result });
  } catch (err) { return evidenceError(res, err); }
});


/**
 * PR #409: document archive, NOT provider source verification.
 * Disabled by default; SUPER_ADMIN only; no public download URL.
 */
const officialArchiveFields = z.object({
  legal_entity_id:z.string().uuid(), account_id:z.string().uuid(),
  provider:z.enum(['SUMUP','ASAAS']),
  year:z.coerce.number().int().min(2000).max(2100),
  month:z.coerce.number().int().min(1).max(12),
  declared_source_channel:z.enum(['PROVIDER_PORTAL_DECLARED','EMAIL_ATTACHMENT_DECLARED']),
}).strict();
const archiveUpload=multer({storage:multer.memoryStorage(),limits:{
  fileSize:5*1024*1024,files:1,fields:6,parts:7,
}});
function archiveError(res:Response,error:unknown) {
  if(error instanceof OfficialArchiveError)
    return res.status(error.status).json({success:false,error:error.code});
  if(error instanceof z.ZodError)
    return res.status(400).json({success:false,error:'INVALID_OFFICIAL_ARCHIVE_INPUT'});
  if((error as any)?.code==='P2002')
    return res.status(409).json({success:false,error:'DUPLICATE_ARCHIVE_HASH'});
  console.error('[FINANCE_ARCHIVE]',error instanceof Error?error.name:'error');
  return res.status(500).json({success:false,error:'ARCHIVE_UNAVAILABLE'});
}
router.get('/evidence/official-archive',async(req:Request,res:Response)=>{
  if(process.env.FINANCE_OFFICIAL_ARCHIVE_ENABLED!=='true')
    return res.status(404).json({success:false,error:'OFFICIAL_ARCHIVE_DISABLED'});
  try {
    if(actorFrom(req).role!=='SUPER_ADMIN')
      throw new OfficialArchiveError(403,'SUPER_ADMIN_REQUIRED');
    const q=querySchema.parse(req.query);
    res.setHeader('Cache-Control','no-store');
    return res.json({success:true,data:await listOfficialArchives(q.legal_entity_id,q.year,q.month)});
  } catch(error) {return archiveError(res,error);}
});
router.post('/evidence/official-archive',
  (req:Request,res:Response,next)=>{
    if(process.env.FINANCE_OFFICIAL_ARCHIVE_ENABLED!=='true')
      return res.status(404).json({success:false,error:'OFFICIAL_ARCHIVE_DISABLED'});
    try {
      if(actorFrom(req).role!=='SUPER_ADMIN')
        return res.status(403).json({success:false,error:'SUPER_ADMIN_REQUIRED'});
      return next();
    } catch(error) {return archiveError(res,error);}
  },
  (req:Request,res:Response,next)=>archiveUpload.single('file')(req,res,error=>{
    if(error instanceof multer.MulterError)
      return res.status(error.code==='LIMIT_FILE_SIZE'?413:400)
        .json({success:false,error:'ARCHIVE_MULTIPART_LIMIT'});
    if(error) return res.status(400).json({success:false,error:'ARCHIVE_MULTIPART_INVALID'});
    return next();
  }),
  async(req:Request,res:Response)=>{
    try {
      const actor=actorFrom(req);
      if(actor.role!=='SUPER_ADMIN') throw new OfficialArchiveError(403,'SUPER_ADMIN_REQUIRED');
      const p=officialArchiveFields.parse(req.body);
      if(!req.file) throw new OfficialArchiveError(400,'ARCHIVE_FILE_REQUIRED');
      const result=await archiveUserDeclaredStatement({
        legalEntityId:p.legal_entity_id,accountId:p.account_id,provider:p.provider,
        year:p.year,month:p.month,declaredSourceChannel:p.declared_source_channel,
        filename:req.file.originalname,content:req.file.buffer,
      },{...actor,role:'SUPER_ADMIN'});
      res.setHeader('Cache-Control','no-store');
      return res.status(201).json({success:true,data:result});
    } catch(error) {return archiveError(res,error);}
  },
);


/** Manual scan check; SUPER_ADMIN only, no caller-controlled S3 identity. */
router.post('/evidence/official-archive/:id/check-malware',async(req:Request,res:Response)=>{
  if(process.env.FINANCE_OFFICIAL_ARCHIVE_ENABLED!=='true')
    return res.status(404).json({success:false,error:'OFFICIAL_ARCHIVE_DISABLED'});
  try {
    const actor=actorFrom(req);
    if(actor.role!=='SUPER_ADMIN') throw new OfficialArchiveError(403,'SUPER_ADMIN_REQUIRED');
    const id=z.string().uuid().parse(req.params.id);
    const result=await checkOfficialArchiveMalware(id,{...actor,role:'SUPER_ADMIN'});
    res.setHeader('Cache-Control','no-store');
    return res.json({success:true,data:result});
  } catch(error) {return archiveError(res,error);}
});

/**
 * PR #410: strictly read-only inventory, not a provider validation or S3 retry.
 * The feature stays disabled until the separate archive infrastructure is approved.
 */
router.get('/evidence/official-archive/recovery',async(req:Request,res:Response)=>{
  if(process.env.FINANCE_OFFICIAL_ARCHIVE_ENABLED!=='true')
    return res.status(404).json({success:false,error:'OFFICIAL_ARCHIVE_DISABLED'});
  try {
    if(actorFrom(req).role!=='SUPER_ADMIN')
      throw new OfficialArchiveError(403,'SUPER_ADMIN_REQUIRED');
    const q=querySchema.parse(req.query);
    const report=await loadArchiveRecovery(q.legal_entity_id,q.year,q.month);
    res.setHeader('Cache-Control','no-store');
    return res.json({success:true,data:report});
  } catch(error) {return archiveError(res,error);}
});

export default router;
