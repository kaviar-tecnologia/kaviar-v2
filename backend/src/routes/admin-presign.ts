import { Router } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticateAdmin, requireRole } from '../middlewares/auth';

const router = Router();

const FEATURE_ENABLED = process.env.FEATURE_ADMIN_PRESIGN === 'true';
const BUCKET = process.env.S3_UPLOADS_BUCKET || 'kaviar-uploads-847895361928';
const REGION = 'us-east-2';

router.use(authenticateAdmin);
router.use(requireRole(['SUPER_ADMIN', 'TERRITORIAL_OPERATOR', 'TERRITORIAL_MANAGER']));

router.get('/presign', async (req, res) => {
  if (!FEATURE_ENABLED) {
    return res.status(404).json({ success: false, error: 'Feature disabled' });
  }

  const key = req.query.key as string;

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing key parameter' });
  }

  if (!key.startsWith('certidoes/')) {
    return res.status(400).json({ success: false, error: 'Invalid key: must start with certidoes/' });
  }

  if (key.includes('..')) {
    return res.status(400).json({ success: false, error: 'Invalid key: path traversal detected' });
  }

  try {
    const s3 = new S3Client({ region: REGION });
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 });

    res.json({ success: true, url });
  } catch (error) {
    console.error('[admin-presign] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate presigned URL' });
  }
});

export default router;
