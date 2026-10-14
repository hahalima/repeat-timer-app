export type TimerSession = {
  startedAtMs: number;
  intervalMs: number;
  repeatCount: number;
  currentCycleIndex: number;
  lastAlarmedCycleCount: number;
  pausedRemainingMs: number | null;
};

export type TimerSnapshot = {
  completedCycleCount: number;
  currentCycleIndex: number;
  currentCycleEndMs: number;
  remainingMs: number;
  intervalProgress: number;
  totalProgress: number;
  isComplete: boolean;
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

export const createTimerSession = (
  startedAtMs: number,
  intervalMs: number,
  repeatCount: number
): TimerSession => ({
  startedAtMs,
  intervalMs,
  repeatCount,
  currentCycleIndex: 0,
  lastAlarmedCycleCount: 0,
  pausedRemainingMs: null,
});

export const getTimerSnapshot = (session: TimerSession, nowMs: number): TimerSnapshot => {
  if (session.intervalMs <= 0 || session.repeatCount <= 0) {
    return {
      completedCycleCount: 0,
      currentCycleIndex: 0,
      currentCycleEndMs: session.startedAtMs,
      remainingMs: 0,
      intervalProgress: 1,
      totalProgress: 1,
      isComplete: true,
    };
  }

  const elapsedMs = Math.max(0, nowMs - session.startedAtMs);
  const rawCompletedCycleCount = Math.floor(elapsedMs / session.intervalMs);
  const completedCycleCount = Math.min(rawCompletedCycleCount, session.repeatCount);
  const isComplete = rawCompletedCycleCount >= session.repeatCount;
  const currentCycleIndex = isComplete
    ? Math.max(0, session.repeatCount - 1)
    : Math.min(rawCompletedCycleCount, session.repeatCount - 1);
  const currentCycleEndMs = session.startedAtMs + (currentCycleIndex + 1) * session.intervalMs;
  const remainingMs = isComplete ? 0 : Math.max(0, currentCycleEndMs - nowMs);
  const totalDurationMs = session.intervalMs * session.repeatCount;
  const currentCycleElapsedMs = isComplete
    ? session.intervalMs
    : clamp(session.intervalMs - remainingMs, 0, session.intervalMs);

  return {
    completedCycleCount,
    currentCycleIndex,
    currentCycleEndMs,
    remainingMs,
    intervalProgress: currentCycleElapsedMs / session.intervalMs,
    totalProgress: clamp(elapsedMs / totalDurationMs, 0, 1),
    isComplete,
  };
};

export const pauseTimerSession = (session: TimerSession, nowMs: number): TimerSession => {
  const snapshot = getTimerSnapshot(session, nowMs);

  return {
    ...session,
    currentCycleIndex: snapshot.currentCycleIndex,
    pausedRemainingMs: snapshot.isComplete ? 0 : snapshot.remainingMs,
  };
};

export const resumeTimerSession = (session: TimerSession, nowMs: number): TimerSession => {
  if (typeof session.pausedRemainingMs !== "number") {
    return session;
  }

  const currentCycleEndMs = nowMs + session.pausedRemainingMs;

  return {
    ...session,
    startedAtMs: currentCycleEndMs - (session.currentCycleIndex + 1) * session.intervalMs,
    pausedRemainingMs: null,
  };
};
