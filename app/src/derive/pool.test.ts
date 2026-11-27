import { describe, expect, it } from 'vitest';
import { emptyPatch, newBlock, patchPoints, pointAt, withPoints } from '../core/build/terrain/block';
import { handle, previewPixels, type JobRequest } from './jobs';
import { WorkerPool, type WorkerLike } from './pool';

/** A worker in this thread: answers with the same `handle` as the real one, one tick later. */
class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  terminated = false;
  received = 0;
  postMessage(msg: unknown): void {
    this.received++;
    const { message } = handle(structuredClone(msg) as JobRequest);
    setTimeout(() => this.onmessage?.({ data: message }), 0);
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('jobs (E-53)', () => {
  it('a block with the patches of its active layers laid over it', () => {
    const base = withPoints(newBlock(), 'step', [[0, 0, 2]]);
    const patch = patchPoints(emptyPatch(), 'water', [[0, 0, 255]]);
    const { message, transfer } = handle({ id: 1, kind: 'composeBlock', input: { base, patches: [patch] } });
    expect(message.ok).toBe(true);
    const out = (message as { output: typeof base }).output;
    expect([pointAt(out, 'step', 0, 0), pointAt(out, 'water', 0, 0)]).toEqual([2, 255]);
    // Every plane goes back transferred, each buffer once.
    expect(new Set(transfer).size).toBe(transfer.length);
    expect(transfer.length).toBeGreaterThan(0);
  });

  it('an unknown job or a failing one answers with an error, never throws', () => {
    expect(handle({ id: 2, kind: 'nope' as never, input: {} as never }).message).toEqual({ id: 2, ok: false, error: 'unknown job nope' });
    const bad = handle({ id: 3, kind: 'composeBlock', input: { base: null, patches: [] } as never }).message;
    expect(bad.ok).toBe(false);
  });

  it('pictures are painted on an OffscreenCanvas; without one the job answers with an error', () => {
    const r = handle({ id: 4, kind: 'blockPreviewBitmap', input: { block: newBlock() } }).message;
    expect(r).toEqual({ id: 4, ok: false, error: 'no OffscreenCanvas: painting needs a browser or a worker' });
  });

  it('a block preview: rock dark, water blue, ground lighter the higher it lies', () => {
    let b = withPoints(newBlock(), 'solid', [[0, 0, 255]]);
    b = withPoints(b, 'water', [[4, 0, 255]]);
    b = withPoints(b, 'step', [[8, 0, 3]]);
    const px = previewPixels(b);
    const at = (x: number) => Array.from(px.slice(x * 4, x * 4 + 4));
    expect(px.length).toBe(32 * 32 * 4);
    expect(at(0)[0]).toBeLessThan(60);
    expect(at(1)[2]).toBeGreaterThan(at(1)[0]!);
    expect(at(2)[0]).toBeGreaterThan(at(3)[0]!);
  });
});

describe('the worker pool', () => {
  it('runs jobs on the least busy worker and answers each with its own result', async () => {
    const workers: FakeWorker[] = [];
    const pool = new WorkerPool(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    }, 2);
    const base = (v: number) => withPoints(newBlock(), 'step', [[1, 1, v]]);
    const results = await Promise.all([1, 2, 3, 4].map((v) => pool.run('composeBlock', { base: base(v), patches: [] })));
    expect(results.map((r) => pointAt(r, 'step', 1, 1))).toEqual([1, 2, 3, 4]);
    expect(workers.map((w) => w.received)).toEqual([2, 2]);
    pool.terminate();
    expect(workers.every((w) => w.terminated)).toBe(true);
    await expect(pool.run('composeBlock', { base: base(1), patches: [] })).rejects.toThrow(/terminated/);
  });

  it('a job that fails rejects; a worker that breaks rejects what it had and is replaced', async () => {
    const workers: FakeWorker[] = [];
    const pool = new WorkerPool(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    }, 1);
    await expect(pool.run('composeBlock', { base: null, patches: [] } as never)).rejects.toThrow();
    const pending = pool.run('composeBlock', { base: newBlock(), patches: [] });
    workers[0]!.onmessage = null;
    workers[0]!.onerror?.({ message: 'crashed' });
    await expect(pending).rejects.toThrow(/crashed/);
    expect(workers).toHaveLength(2);
    expect(workers[0]!.terminated).toBe(true);
    await expect(pool.run('composeBlock', { base: newBlock(), patches: [] })).resolves.toBeDefined();
    pool.terminate();
  });
});
