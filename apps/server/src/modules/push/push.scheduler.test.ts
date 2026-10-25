import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { startPushScheduler } from './push.scheduler';
import type { PushService } from './push.service';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fake = (notifyDue: () => Promise<number>) => ({ notifyDue }) as unknown as PushService;

let errors: ReturnType<typeof spyOn>;
beforeEach(() => {
  errors = spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errors.mockRestore());

describe('push scheduler', () => {
  test('runs at once, then every interval', async () => {
    let calls = 0;
    const scheduler = startPushScheduler(
      fake(async () => {
        calls++;
        return 0;
      }),
      20,
    );
    expect(calls).toBe(1);
    await wait(120);
    await scheduler.stop();
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  test('runs never overlap, even when a run is longer than the interval', async () => {
    let active = 0;
    let max = 0;
    let calls = 0;
    const scheduler = startPushScheduler(
      fake(async () => {
        calls++;
        max = Math.max(max, ++active);
        await wait(30);
        active--;
        return 0;
      }),
      5,
    );
    await wait(150);
    await scheduler.stop();
    expect(calls).toBeGreaterThan(1);
    expect(max).toBe(1);
  });

  test('keeps going after a failing run, and logs its name and code, never its message', async () => {
    let calls = 0;
    const scheduler = startPushScheduler(
      fake(async () => {
        if (++calls === 1) {
          // A failed query: its message holds the parameters.
          throw new Error('Failed query: select … params: someone@example.com', {
            cause: { code: '57P01' },
          });
        }
        return 0;
      }),
      10,
    );
    await wait(80);
    await scheduler.stop();
    expect(calls).toBeGreaterThan(1);
    expect(errors).toHaveBeenCalledWith('Push scheduler run failed: Error 57P01');
    expect(JSON.stringify(errors.mock.calls)).not.toContain('example.com');
  });

  test('stop waits for the current run and nothing runs afterwards', async () => {
    let finished = false;
    let calls = 0;
    const scheduler = startPushScheduler(
      fake(async () => {
        calls++;
        await wait(40);
        finished = true;
        return 0;
      }),
      5,
    );
    await scheduler.stop();
    expect(finished).toBe(true);
    await wait(50);
    expect(calls).toBe(1);
  });

  test('stop before the next tick cancels it', async () => {
    let calls = 0;
    const scheduler = startPushScheduler(
      fake(async () => {
        calls++;
        return 0;
      }),
      30,
    );
    await wait(10);
    await scheduler.stop();
    await wait(80);
    expect(calls).toBe(1);
  });

  test('a full batch of 50 loops again at once, a smaller one waits for the interval', async () => {
    const answers = [50, 50, 3];
    let calls = 0;
    const scheduler = startPushScheduler(
      fake(async () => answers[calls++] ?? 0),
      10_000,
    );
    await wait(50);
    expect(calls).toBe(3);
    await scheduler.stop();
    expect(calls).toBe(3);
  });

  test('stop interrupts a long chain of full batches', async () => {
    let calls = 0;
    const scheduler = startPushScheduler(
      fake(async () => {
        calls++;
        await wait(5);
        return 50;
      }),
      10_000,
    );
    await wait(30);
    await scheduler.stop();
    const after = calls;
    await wait(30);
    expect(calls).toBe(after);
  });
});
