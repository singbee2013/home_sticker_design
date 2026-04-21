/**
 * Lightweight async concurrency limiter + exponential-backoff retry.
 *
 * Used to throttle outgoing requests to rate-limited third-party APIs
 * (Silicon Flow, Qwen-VL) without requiring an external queue library.
 *
 * Usage:
 *   const result = await siliconFlowQueue.add(() => callSiliconFlow(params));
 */

type Task<T> = () => Promise<T>;

/** Simple FIFO concurrency limiter */
export class ConcurrencyQueue {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  async add<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        this.running++;
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this.next();
        }
      };

      if (this.running < this.concurrency) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }

  private next() {
    const next = this.queue.shift();
    if (next) next();
  }

  get size() {
    return this.queue.length;
  }

  get pending() {
    return this.running;
  }
}

/**
 * Retry with exponential backoff.
 *
 * @param fn        - async function to retry
 * @param maxTries  - total attempts (default 3)
 * @param baseMs    - initial delay in ms (doubles each retry, default 2000 ms)
 * @param retryIf   - optional predicate; return true to retry on this error
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxTries = 3,
    baseMs = 2000,
    retryIf = (_err: unknown) => true,
  }: {
    maxTries?: number;
    baseMs?: number;
    retryIf?: (err: unknown) => boolean;
  } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isRetryable = retryIf(err);
      const isLastAttempt = attempt === maxTries;

      if (!isRetryable || isLastAttempt) {
        throw err;
      }

      const delay = baseMs * Math.pow(2, attempt - 1);
      // logger import avoided here to prevent circular deps — use console.warn as fallback
      process.stdout.write(
        JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: `[Retry] Attempt ${attempt}/${maxTries} failed. Retrying in ${delay}ms.`, detail: (err as Error).message?.slice(0, 120) }) + "\n"
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** Singleton queue for Silicon Flow API (max 2 concurrent requests) */
export const siliconFlowQueue = new ConcurrencyQueue(2);
