import {
  createTimerSession,
  getTimerSnapshot,
  pauseTimerSession,
  resumeTimerSession,
} from "./timerEngine";

describe("timerEngine", () => {
  it("creates a running session with default counters", () => {
    const session = createTimerSession(1_000, 5_000, 3);

    expect(session).toEqual({
      startedAtMs: 1_000,
      intervalMs: 5_000,
      repeatCount: 3,
      currentCycleIndex: 0,
      lastAlarmedCycleCount: 0,
      pausedRemainingMs: null,
    });
  });

  it("computes remaining time from an anchored start timestamp", () => {
    const session = createTimerSession(1_000, 5_000, 3);

    const snapshot = getTimerSnapshot(session, 3_000);

    expect(snapshot.currentCycleIndex).toBe(0);
    expect(snapshot.remainingMs).toBe(3_000);
    expect(snapshot.currentCycleEndMs).toBe(6_000);
    expect(snapshot.isComplete).toBe(false);
  });

  it("reports interval and total progress while running", () => {
    const session = createTimerSession(0, 8_000, 4);

    const snapshot = getTimerSnapshot(session, 2_000);

    expect(snapshot.intervalProgress).toBeCloseTo(0.25);
    expect(snapshot.totalProgress).toBeCloseTo(0.0625);
  });

  it("moves to the next cycle exactly at an interval boundary", () => {
    const session = createTimerSession(0, 5_000, 3);

    const snapshot = getTimerSnapshot(session, 5_000);

    expect(snapshot.completedCycleCount).toBe(1);
    expect(snapshot.currentCycleIndex).toBe(1);
    expect(snapshot.currentCycleEndMs).toBe(10_000);
    expect(snapshot.remainingMs).toBe(5_000);
    expect(snapshot.intervalProgress).toBe(0);
    expect(snapshot.totalProgress).toBeCloseTo(1 / 3);
    expect(snapshot.isComplete).toBe(false);
  });

  it("does not drift future repeat boundaries after a late wake-up", () => {
    const session = createTimerSession(10_000, 5_000, 4);

    const snapshot = getTimerSnapshot(session, 16_700);

    expect(snapshot.completedCycleCount).toBe(1);
    expect(snapshot.currentCycleIndex).toBe(1);
    expect(snapshot.currentCycleEndMs).toBe(20_000);
    expect(snapshot.remainingMs).toBe(3_300);
  });

  it("catches up across multiple missed cycles", () => {
    const session = createTimerSession(0, 3_000, 5);

    const snapshot = getTimerSnapshot(session, 10_100);

    expect(snapshot.completedCycleCount).toBe(3);
    expect(snapshot.currentCycleIndex).toBe(3);
    expect(snapshot.currentCycleEndMs).toBe(12_000);
    expect(snapshot.remainingMs).toBe(1_900);
  });

  it("marks the session complete at the final repeat boundary", () => {
    const session = createTimerSession(0, 3_000, 5);

    const snapshot = getTimerSnapshot(session, 15_000);

    expect(snapshot.completedCycleCount).toBe(5);
    expect(snapshot.currentCycleIndex).toBe(4);
    expect(snapshot.remainingMs).toBe(0);
    expect(snapshot.intervalProgress).toBe(1);
    expect(snapshot.totalProgress).toBe(1);
    expect(snapshot.isComplete).toBe(true);
  });

  it("clamps progress after overshooting the final boundary", () => {
    const session = createTimerSession(0, 3_000, 5);

    const snapshot = getTimerSnapshot(session, 30_000);

    expect(snapshot.completedCycleCount).toBe(5);
    expect(snapshot.currentCycleIndex).toBe(4);
    expect(snapshot.remainingMs).toBe(0);
    expect(snapshot.intervalProgress).toBe(1);
    expect(snapshot.totalProgress).toBe(1);
    expect(snapshot.isComplete).toBe(true);
  });

  it.each([
    { intervalMs: 0, repeatCount: 3 },
    { intervalMs: -1, repeatCount: 3 },
    { intervalMs: 5_000, repeatCount: 0 },
    { intervalMs: 5_000, repeatCount: -1 },
  ])("treats invalid sessions as complete: %p", ({ intervalMs, repeatCount }) => {
    const session = createTimerSession(10_000, intervalMs, repeatCount);

    const snapshot = getTimerSnapshot(session, 12_000);

    expect(snapshot).toEqual({
      completedCycleCount: 0,
      currentCycleIndex: 0,
      currentCycleEndMs: 10_000,
      remainingMs: 0,
      intervalProgress: 1,
      totalProgress: 1,
      isComplete: true,
    });
  });

  it("preserves remaining time while paused and resumes without counting paused time", () => {
    const running = createTimerSession(0, 10_000, 2);
    const paused = pauseTimerSession(running, 4_000);
    const resumed = resumeTimerSession(paused, 20_000);

    expect(paused.currentCycleIndex).toBe(0);
    expect(paused.pausedRemainingMs).toBe(6_000);
    expect(resumed.startedAtMs).toBe(16_000);
    expect(resumed.pausedRemainingMs).toBeNull();

    const snapshot = getTimerSnapshot(resumed, 23_000);

    expect(snapshot.remainingMs).toBe(3_000);
    expect(snapshot.currentCycleEndMs).toBe(26_000);
  });

  it("pauses on the next cycle when paused exactly at a boundary", () => {
    const running = createTimerSession(0, 5_000, 3);

    const paused = pauseTimerSession(running, 5_000);

    expect(paused.currentCycleIndex).toBe(1);
    expect(paused.pausedRemainingMs).toBe(5_000);
  });

  it("returns the same session when resuming a session that is not paused", () => {
    const running = createTimerSession(0, 10_000, 2);

    const resumed = resumeTimerSession(running, 20_000);

    expect(resumed).toBe(running);
  });
});
