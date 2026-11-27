/**
 * A derivation worker (E-53): answers each job request with `handle`, its result's buffers
 * transferred. No DOM here – painting uses OffscreenCanvas.
 */
import { handle, type JobRequest } from './jobs';

self.onmessage = (e: MessageEvent<JobRequest>) => {
  const { message, transfer } = handle(e.data);
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(message, transfer);
};
