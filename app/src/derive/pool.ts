/**
 * The derivation worker pool (E-53): a few workers – the device's cores but one, at most four –
 * run the jobs of `jobs.ts`. A job goes to the worker with the fewest running; results come back
 * transferred. A worker that breaks rejects its running jobs and is replaced. No shared memory,
 * no WebAssembly: plain module workers, which the content policy allows (`worker-src 'self'`).
 * Shared by the DM window and the TV (E-61), so it lives outside `app/`.
 */
import type { JobInput, JobKind, JobOutput, JobRequest, JobResponse } from './jobs';

/** What the pool needs of a worker (a real `Worker`, or a stand-in in tests). */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: { message: string }) => void) | null;
  terminate(): void;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

interface Slot {
  worker: WorkerLike;
  running: Map<number, Pending>;
}

export class WorkerPool {
  private readonly slots: Slot[] = [];
  private nextId = 1;
  private terminated = false;

  constructor(
    private readonly make: () => WorkerLike,
    size: number,
  ) {
    for (let i = 0; i < Math.max(1, size); i++) this.slots.push(this.slot());
  }

  private slot(): Slot {
    const s: Slot = { worker: this.make(), running: new Map() };
    s.worker.onmessage = (e) => {
      const r = e.data as JobResponse;
      const p = s.running.get(r.id);
      if (!p) return;
      s.running.delete(r.id);
      if (r.ok) p.resolve(r.output);
      else p.reject(new Error(r.error));
    };
    s.worker.onerror = (e) => this.replace(s, new Error(`derivation worker failed: ${e.message}`));
    return s;
  }

  private replace(s: Slot, error: Error): void {
    s.worker.terminate();
    for (const p of s.running.values()) p.reject(error);
    s.running.clear();
    const i = this.slots.indexOf(s);
    if (i >= 0 && !this.terminated) this.slots[i] = this.slot();
  }

  /** Runs `kind` on `input` (copied into the worker) and resolves with its result. */
  run<K extends JobKind>(kind: K, input: JobInput<K>): Promise<JobOutput<K>> {
    if (this.terminated) return Promise.reject(new Error('the derivation pool is terminated'));
    const s = this.slots.reduce((a, b) => (b.running.size < a.running.size ? b : a));
    const id = this.nextId++;
    return new Promise<JobOutput<K>>((resolve, reject) => {
      s.running.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const req: JobRequest<K> = { id, kind, input };
      s.worker.postMessage(req);
    });
  }

  terminate(): void {
    this.terminated = true;
    for (const s of this.slots) this.replace(s, new Error('the derivation pool is terminated'));
  }
}

let shared: WorkerPool | null = null;

/** The window's pool, made on first use. */
export function derivationPool(): WorkerPool {
  shared ??= new WorkerPool(
    () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
    Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)),
  );
  return shared;
}
