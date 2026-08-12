import { Router, Request, Response } from 'express';
import {
  authenticateAdmin,
  allowFinanceAccess,
} from '../middlewares/auth';
import { askKaviarAi } from '../services/ai/kaviar-ai.service';
import { createOpenAiProviderIfConfigured } from '../services/ai/kaviar-ai.openai-provider';

const router = Router();

router.use(authenticateAdmin);
router.use(allowFinanceAccess);

const MAX_QUESTION_LENGTH = 1000;

// Provider instanciado uma vez na inicialização da rota.
// Retorna undefined se OPENAI_API_KEY não estiver definida.
const modelProvider = createOpenAiProviderIfConfigured();

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;

    const question =
      typeof req.body?.question === 'string'
        ? req.body.question.trim()
        : '';

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Pergunta obrigatória.',
      });
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Pergunta deve ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`,
      });
    }

    const result = await askKaviarAi({
      userId: admin.id,
      question,
    }, modelProvider);

    return res.json({
      success: true,
      answer: result.answer,
      toolsUsed: result.toolsUsed,
    });
  } catch (error) {
    console.error('[KAVIAR_AI] Erro ao processar pergunta');

    return res.status(500).json({
      success: false,
      error: 'Não foi possível processar a pergunta.',
    });
  }
});

export default router;