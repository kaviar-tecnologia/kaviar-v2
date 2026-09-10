import { Router, Request, Response } from 'express';
import { arPlacePlaceIdParamSchema, localeInputSchema } from '../services/ar-places/ar-places-validation';
import { getApprovedPublicArPlaceByPlaceId } from '../services/ar-places/ar-places.service';
import { serializePublicArPlace } from '../services/ar-places/ar-places-serializers';

const router = Router();

router.get('/by-place-id/:placeId', async (req: Request, res: Response) => {
  const parsedParams = arPlacePlaceIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: parsedParams.error.issues[0]?.message || 'placeId inválido' });
  }

  const parsedLocale = localeInputSchema.safeParse(req.query.locale || 'pt-BR');
  if (!parsedLocale.success) {
    return res.status(400).json({ success: false, error: 'locale inválido' });
  }

  try {
    const record = await getApprovedPublicArPlaceByPlaceId(parsedParams.data.placeId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Local AR não encontrado' });
    }

    return res.json({
      success: true,
      data: serializePublicArPlace(record, parsedLocale.data),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao carregar local AR' });
  }
});

export default router;
