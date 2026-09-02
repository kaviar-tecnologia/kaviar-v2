/**
 * Liga um AbortController à semântica real de desconexão de cliente no
 * Node/Express, de forma testável:
 *   - `req` emite 'aborted' quando o cliente aborta a requisição em andamento;
 *   - `res` emite 'close' quando a conexão encerra — mas isso SÓ é cancelamento
 *     se a resposta ainda NÃO terminou (`!res.writableEnded`). Uma resposta
 *     concluída normalmente fecha o socket e NÃO deve ser tratada como abort.
 *
 * Retorna o `signal` e um `cleanup()` que remove TODOS os listeners (chamar no
 * finally do handler — não deixar listener pendurado).
 */
export interface ReqLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
}
export interface ResLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
  writableEnded?: boolean;
}

export interface WiredAbort {
  signal: AbortSignal;
  cleanup: () => void;
  /** Exposto para teste/uso interno. */
  controller: AbortController;
}

export function wireRequestAbort(req: ReqLike, res: ResLike): WiredAbort {
  const controller = new AbortController();
  const onReqAborted = () => controller.abort();
  const onResClose = () => { if (!res.writableEnded) controller.abort(); };
  req.on('aborted', onReqAborted);
  res.on('close', onResClose);
  const cleanup = () => {
    req.off('aborted', onReqAborted);
    res.off('close', onResClose);
  };
  return { signal: controller.signal, cleanup, controller };
}
