import { describe, it, expect } from 'vitest';
import { wireRequestAbort } from '../src/services/territory/http-abort';

// EventEmitter-like fake para req/res com writableEnded controlável.
function fakeEmitter(initial: { writableEnded?: boolean } = {}) {
  const listeners: Record<string, Array<(...a: any[]) => void>> = {};
  return {
    writableEnded: initial.writableEnded ?? false,
    on(ev: string, fn: any) { (listeners[ev] ??= []).push(fn); return this; },
    off(ev: string, fn: any) { listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn); return this; },
    emit(ev: string, ...args: any[]) { for (const f of listeners[ev] ?? []) f(...args); },
    listenerCount(ev: string) { return (listeners[ev] ?? []).length; },
  };
}

describe('FASE 3B — wireRequestAbort (detecção de desconexão do cliente)', () => {
  it('request abortada (req "aborted") → signal abortado', () => {
    const req = fakeEmitter();
    const res = fakeEmitter();
    const { signal } = wireRequestAbort(req as any, res as any);
    expect(signal.aborted).toBe(false);
    req.emit('aborted');
    expect(signal.aborted).toBe(true);
  });

  it('response encerrada prematuramente (res "close" com !writableEnded) → signal abortado', () => {
    const req = fakeEmitter();
    const res = fakeEmitter({ writableEnded: false });
    const { signal } = wireRequestAbort(req as any, res as any);
    res.emit('close');
    expect(signal.aborted).toBe(true);
  });

  it('response concluída normalmente (res "close" com writableEnded) → NÃO aborta', () => {
    const req = fakeEmitter();
    const res = fakeEmitter({ writableEnded: false });
    const { signal } = wireRequestAbort(req as any, res as any);
    res.writableEnded = true; // resposta terminou antes do close
    res.emit('close');
    expect(signal.aborted).toBe(false);
  });

  it('cleanup remove TODOS os listeners (nenhum pendurado)', () => {
    const req = fakeEmitter();
    const res = fakeEmitter();
    const { cleanup } = wireRequestAbort(req as any, res as any);
    expect(req.listenerCount('aborted')).toBe(1);
    expect(res.listenerCount('close')).toBe(1);
    cleanup();
    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });
});
