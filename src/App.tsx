import React, { useCallback, useEffect, useRef, useState } from "react";
import "./index.css";
import {
  FaCheck,
  FaEdit,
  FaPause,
  FaPlay,
  FaStop,
  FaTimes,
  FaTrashAlt,
} from "react-icons/fa";
import {
  createTimerSession,
  getTimerSnapshot,
  pauseTimerSession,
  resumeTimerSession,
  TimerSession,
} from "./timerEngine";

const PlayIcon = FaPlay as React.ElementType;
const PauseIcon = FaPause as React.ElementType;
const StopIcon = FaStop as React.ElementType;
const EditIcon = FaEdit as React.ElementType;
const CheckIcon = FaCheck as React.ElementType;
const CancelIcon = FaTimes as React.ElementType;
const ClearIcon = FaTrashAlt as React.ElementType;

const soundMap: Record<string, string> = {
  "Wood Knock": "/sounds/wood-door-knock.mp3",
  "Guitar Alert": "/sounds/guitar-alert.mp3",
  "Gaming Lock": "/sounds/gaming-lock.mp3",
  "Correct Tone": "/sounds/correct-tone.mp3",
  "Magic Ring": "/sounds/magic-ring.mp3",
  "Church Bell": "/sounds/church-bell.mp3",
  "Done Voice": "/sounds/done-woman-voice.mp3",
};

const SETTINGS_KEY = "repeatTimerSettings";
const CUSTOM_PRESETS_KEY = "repeatTimerCustomPresets";
const SESSION_HISTORY_KEY = "repeatTimerSessionHistory";
const DONE_SOUND_PATH = "/sounds/done-woman-voice.mp3";
const MAX_CUSTOM_PRESETS = 12;
const MAX_SESSION_HISTORY = 10;

type WakeLockSentinel = EventTarget & {
  released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
};

type TimerSettings = {
  initialTime: number;
  repeat: boolean;
  repeatCount: number;
  selectedSound: string;
  volume: number;
  keepAwake: boolean;
};

type CustomPreset = {
  id: string;
  label: string;
  seconds: number;
};

type SessionHistoryItem = {
  id: string;
  completedAtMs: number;
  startedAt: string;
  scheduledEnd: string;
  completedAt: string;
  intervalSeconds: number;
  totalSeconds: number;
  repeatCount: number;
  selectedSound: string;
  caughtUpIntervals: number;
};

const defaultSettings: TimerSettings = {
  initialTime: 0,
  repeat: false,
  repeatCount: 1,
  selectedSound: "Wood Knock",
  volume: 0.5,
  keepAwake: false,
};

const clampNumber = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const createStoredId = () => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const formatPresetLabel = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds < 60) return `${safeSeconds} sec`;

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours === 0 && remainingSeconds === 0) return `${minutes} min`;
  if (hours > 0 && minutes === 0 && remainingSeconds === 0) return `${hours} hr`;

  return formatTime(safeSeconds);
};

const normalizePresetLabel = (label: string) => label.trim().replace(/\s+/g, " ").slice(0, 24);

const loadTimerSettings = (): TimerSettings => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return defaultSettings;

    const parsed = JSON.parse(saved) as Partial<TimerSettings>;
    const initialTime = Number(parsed.initialTime);
    const repeatCount = Number(parsed.repeatCount);
    const volume = Number(parsed.volume);
    const selectedSound =
      parsed.selectedSound && soundMap[parsed.selectedSound]
        ? parsed.selectedSound
        : defaultSettings.selectedSound;

    return {
      initialTime: Number.isFinite(initialTime) && initialTime > 0 ? Math.floor(initialTime) : 0,
      repeat: Boolean(parsed.repeat),
      repeatCount: Number.isFinite(repeatCount) ? clampNumber(Math.floor(repeatCount), 1, 100) : 1,
      selectedSound,
      volume: Number.isFinite(volume) ? clampNumber(volume, 0, 1) : defaultSettings.volume,
      keepAwake: Boolean(parsed.keepAwake),
    };
  } catch {
    return defaultSettings;
  }
};

const loadCustomPresets = (): CustomPreset[] => {
  try {
    const saved = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((preset): CustomPreset | null => {
        const seconds = Number(preset.seconds);
        const label = typeof preset.label === "string" ? preset.label.trim() : "";

        if (!Number.isFinite(seconds) || seconds <= 0) {
          return null;
        }

        const safeSeconds = Math.floor(seconds);

        return {
          id: typeof preset.id === "string" ? preset.id : createStoredId(),
          label: (label || formatPresetLabel(safeSeconds)).slice(0, 24),
          seconds: safeSeconds,
        };
      })
      .filter((preset): preset is CustomPreset => preset !== null)
      .slice(0, MAX_CUSTOM_PRESETS);
  } catch {
    return [];
  }
};

const loadSessionHistory = (): SessionHistoryItem[] => {
  try {
    const saved = localStorage.getItem(SESSION_HISTORY_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): SessionHistoryItem | null => {
        const completedAtMs = Number(item.completedAtMs);
        const intervalSeconds = Number(item.intervalSeconds);
        const totalSeconds = Number(item.totalSeconds);
        const repeatCount = Number(item.repeatCount);

        if (
          !Number.isFinite(completedAtMs) ||
          !Number.isFinite(intervalSeconds) ||
          intervalSeconds <= 0 ||
          !Number.isFinite(totalSeconds) ||
          totalSeconds <= 0
        ) {
          return null;
        }

        return {
          id: typeof item.id === "string" ? item.id : createStoredId(),
          completedAtMs,
          startedAt: typeof item.startedAt === "string" ? item.startedAt : "",
          scheduledEnd: typeof item.scheduledEnd === "string" ? item.scheduledEnd : "",
          completedAt: typeof item.completedAt === "string" ? item.completedAt : "",
          intervalSeconds: Math.floor(intervalSeconds),
          totalSeconds: Math.floor(totalSeconds),
          repeatCount: Number.isFinite(repeatCount)
            ? clampNumber(Math.floor(repeatCount), 1, 100)
            : 1,
          selectedSound:
            typeof item.selectedSound === "string" && soundMap[item.selectedSound]
              ? item.selectedSound
              : defaultSettings.selectedSound,
          caughtUpIntervals: Number.isFinite(Number(item.caughtUpIntervals))
            ? Math.max(0, Math.floor(Number(item.caughtUpIntervals)))
            : 0,
        };
      })
      .filter((item): item is SessionHistoryItem => item !== null)
      .sort((a, b) => b.completedAtMs - a.completedAtMs)
      .slice(0, MAX_SESSION_HISTORY);
  } catch {
    return [];
  }
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00:00";
  }

  const hrs = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
};

const parseInputTime = (timeStr: string): number => {
  const parts = timeStr.split(":").map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return 0;
  }

  if (parts.length === 3) {
    const [hrs, mins, secs] = parts;
    return hrs * 3600 + mins * 60 + secs;
  } else if (parts.length === 2) {
    const [mins, secs] = parts;
    return mins * 60 + secs;
  }
  return 0;
};

const formatTimeWithSeconds = (date: Date) => {
  const hrs = date.getHours() % 12 || 12;
  const mins = date.getMinutes().toString().padStart(2, "0");
  const secs = date.getSeconds().toString().padStart(2, "0");
  const ampm = date.getHours() >= 12 ? "PM" : "AM";
  return `${hrs}:${mins}:${secs} ${ampm}`;
};

const App: React.FC = () => {
  const initialSettings = useRef(loadTimerSettings());
  const supportsWakeLock =
    typeof navigator !== "undefined" && "wakeLock" in (navigator as WakeLockNavigator);

  const [selectedSound, setSelectedSound] = useState(initialSettings.current.selectedSound);
  const [initialTime, setInitialTime] = useState(initialSettings.current.initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const [repeat, setRepeat] = useState(initialSettings.current.repeat);
  const [repeatCount, setRepeatCount] = useState(initialSettings.current.repeatCount);
  const [repeatCountInput, setRepeatCountInput] = useState(
    initialSettings.current.repeatCount.toString()
  );
  const [repeatCycle, setRepeatCycle] = useState(0);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? Boolean(JSON.parse(saved)) : true;
  });
  const [inputTime, setInputTime] = useState(formatTime(initialSettings.current.initialTime));
  const [showPopup, setShowPopup] = useState(false);
  const [timeRange, setTimeRange] = useState({ start: "", end: "" });
  const [volume, setVolume] = useState(initialSettings.current.volume);
  const [timeLeft, setTimeLeft] = useState(initialSettings.current.initialTime);
  const [repeatTimestamps, setRepeatTimestamps] = useState<string[]>([]);
  const [intervalProgress, setIntervalProgress] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [keepAwake, setKeepAwake] = useState(
    supportsWakeLock && initialSettings.current.keepAwake
  );
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [completedAt, setCompletedAt] = useState("");
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(loadCustomPresets);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>(loadSessionHistory);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetLabelDraft, setPresetLabelDraft] = useState("");
  const [draggedPresetId, setDraggedPresetId] = useState<string | null>(null);
  const [dragOverPresetId, setDragOverPresetId] = useState<string | null>(null);

  const timerSessionRef = useRef<TimerSession | null>(null);
  const selectedSoundRef = useRef(selectedSound);
  const volumeRef = useRef(volume);
  const audioCacheRef = useRef<Record<string, HTMLAudioElement>>({});
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const statusMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortcutCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const suppressPresetClickRef = useRef(false);

  useEffect(() => {
    selectedSoundRef.current = selectedSound;
  }, [selectedSound]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    const settings: TimerSettings = {
      initialTime,
      repeat,
      repeatCount,
      selectedSound,
      volume,
      keepAwake,
    };

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [initialTime, repeat, repeatCount, selectedSound, volume, keepAwake]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets));
  }, [customPresets]);

  useEffect(() => {
    localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(sessionHistory));
  }, [sessionHistory]);

  const getSoundUrl = useCallback((path: string) => {
    return `${process.env.PUBLIC_URL}${path}`;
  }, []);

  const preloadSound = useCallback(
    (path: string) => {
      const url = getSoundUrl(path);
      if (audioCacheRef.current[url]) return audioCacheRef.current[url];

      const audio = new Audio(url);
      audio.preload = "auto";
      audio.load();
      audioCacheRef.current[url] = audio;

      return audio;
    },
    [getSoundUrl]
  );

  const preloadCurrentSounds = useCallback(() => {
    preloadSound(soundMap[selectedSoundRef.current]);
    preloadSound(DONE_SOUND_PATH);
  }, [preloadSound]);

  const playSound = useCallback((overridePath?: string) => {
    const path = overridePath || soundMap[selectedSoundRef.current];
    const cachedAudio = preloadSound(path);
    const audio = cachedAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = volumeRef.current;
    audio.play().catch((err) => console.error("Playback failed:", err));
  }, [preloadSound]);

  useEffect(() => {
    preloadCurrentSounds();
  }, [preloadCurrentSounds, selectedSound]);

  const clearStatusMessage = useCallback(() => {
    if (statusMessageTimeoutRef.current) {
      clearTimeout(statusMessageTimeoutRef.current);
      statusMessageTimeoutRef.current = null;
    }

    setStatusMessage("");
  }, []);

  const showTemporaryStatusMessage = useCallback((message: string) => {
    if (statusMessageTimeoutRef.current) {
      clearTimeout(statusMessageTimeoutRef.current);
    }

    setStatusMessage(message);
    statusMessageTimeoutRef.current = setTimeout(() => {
      setStatusMessage("");
      statusMessageTimeoutRef.current = null;
    }, 4000);
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current;
    if (!wakeLock) {
      setWakeLockActive(false);
      return;
    }

    wakeLockRef.current = null;
    await wakeLock.release().catch(() => undefined);
    setWakeLockActive(false);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!supportsWakeLock || !keepAwake || document.visibilityState !== "visible") {
      return;
    }

    if (wakeLockRef.current && !wakeLockRef.current.released) {
      return;
    }

    try {
      const wakeLock = await (navigator as WakeLockNavigator).wakeLock?.request("screen");
      if (!wakeLock) return;

      wakeLockRef.current = wakeLock;
      setWakeLockActive(true);

      wakeLock.addEventListener("release", () => {
        if (wakeLockRef.current === wakeLock) {
          wakeLockRef.current = null;
        }
        setWakeLockActive(false);
      });
    } catch {
      setWakeLockActive(false);
      showTemporaryStatusMessage("Keep screen awake is unavailable right now.");
    }
  }, [keepAwake, showTemporaryStatusMessage, supportsWakeLock]);

  const reconcileTimer = useCallback(() => {
    const session = timerSessionRef.current;
    if (!session || session.pausedRemainingMs !== null) return;

    const snapshot = getTimerSnapshot(session, Date.now());

    session.currentCycleIndex = snapshot.currentCycleIndex;
    setRepeatCycle(snapshot.currentCycleIndex);
    setTimeLeft(Math.ceil(snapshot.remainingMs / 1000));
    setIntervalProgress(snapshot.intervalProgress);
    setTotalProgress(snapshot.totalProgress);

    if (snapshot.completedCycleCount <= session.lastAlarmedCycleCount) {
      return;
    }

    const missedCycleCount = snapshot.completedCycleCount - session.lastAlarmedCycleCount;
    session.lastAlarmedCycleCount = snapshot.completedCycleCount;

    if (snapshot.isComplete) {
      const completedDate = new Date();
      const completedAtLabel = formatTimeWithSeconds(completedDate);
      const intervalSeconds = Math.round(session.intervalMs / 1000);
      const totalSeconds = Math.round((session.intervalMs * session.repeatCount) / 1000);

      playSound();
      playSound(DONE_SOUND_PATH);
      setIsRunning(false);
      setRepeatCycle(0);
      setIntervalProgress(1);
      setTotalProgress(1);
      setCompletedAt(completedAtLabel);
      setShowPopup(true);
      setSessionHistory((items) => [
        {
          id: createStoredId(),
          completedAtMs: completedDate.getTime(),
          startedAt: formatTimeWithSeconds(new Date(session.startedAtMs)),
          scheduledEnd: formatTimeWithSeconds(new Date(session.startedAtMs + totalSeconds * 1000)),
          completedAt: completedAtLabel,
          intervalSeconds,
          totalSeconds,
          repeatCount: session.repeatCount,
          selectedSound: selectedSoundRef.current,
          caughtUpIntervals: Math.max(0, missedCycleCount - 1),
        },
        ...items,
      ].slice(0, MAX_SESSION_HISTORY));
      timerSessionRef.current = null;
    } else {
      if (missedCycleCount > 1) {
        showTemporaryStatusMessage(`Caught up: ${missedCycleCount} intervals passed while inactive.`);
      }

      playSound();
    }
  }, [playSound, showTemporaryStatusMessage]);

  useEffect(() => {
    if (!isRunning) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      reconcileTimer();

      if (timerSessionRef.current && timerSessionRef.current.pausedRemainingMs === null) {
        const delayMs = document.visibilityState === "visible" ? 100 : 1000;
        timeoutId = setTimeout(tick, delayMs);
      }
    };

    tick();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isRunning, reconcileTimer]);

  useEffect(() => {
    const reconcileOnReturn = () => {
      reconcileTimer();
      if (document.visibilityState === "visible" && isRunning) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", reconcileOnReturn);
    window.addEventListener("focus", reconcileOnReturn);
    window.addEventListener("pageshow", reconcileOnReturn);

    return () => {
      document.removeEventListener("visibilitychange", reconcileOnReturn);
      window.removeEventListener("focus", reconcileOnReturn);
      window.removeEventListener("pageshow", reconcileOnReturn);
    };
  }, [isRunning, reconcileTimer, requestWakeLock]);

  useEffect(() => {
    if (isRunning && keepAwake) {
      requestWakeLock();
    } else {
      void releaseWakeLock();
    }
  }, [isRunning, keepAwake, releaseWakeLock, requestWakeLock]);

  useEffect(() => {
    return () => {
      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

  const hasActiveSession = timerSessionRef.current !== null;
  const isPaused = hasActiveSession && !isRunning && timerSessionRef.current?.pausedRemainingMs !== null;
  const canEditTimer = !hasActiveSession;
  const canStartTimer = !isRunning && initialTime > 0;

  useEffect(() => {
    setInputTime(formatTime(timeLeft));
  }, [timeLeft]);

  useEffect(() => {
    return () => {
      if (statusMessageTimeoutRef.current) {
        clearTimeout(statusMessageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
    document.body.classList.toggle("light", !darkMode);
    localStorage.setItem("darkMode", JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    if (showShortcutHelp) {
      shortcutCloseButtonRef.current?.focus();
    }
  }, [showShortcutHelp]);

  useEffect(() => {
    if (showPopup) {
      document.title = "Time's Up!";
      return;
    }

    if (isPaused) {
      document.title = `Paused - ${formatTime(timeLeft)} left`;
      return;
    }

    if (!isRunning) {
      document.title = "Repeat Timer";
      return;
    }

    const cycleInfo = repeat ? ` (${repeatCycle + 1}/${repeatCount})` : "";
    document.title = `⏳ ${formatTime(timeLeft)} left${cycleInfo}`;

    return () => {
      document.title = "Repeat Timer";
    };
  }, [isPaused, isRunning, timeLeft, repeat, repeatCycle, repeatCount, showPopup]);

  const startTimer = (seconds: number) => {
    const pausedSession = timerSessionRef.current;
    if (typeof pausedSession?.pausedRemainingMs === "number") {
      preloadCurrentSounds();
      timerSessionRef.current = resumeTimerSession(pausedSession, Date.now());
      setIsRunning(true);
      setShowPopup(false);
      return;
    }

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }

    const now = new Date();
    preloadCurrentSounds();

    // Make sure we're using per-repeat duration, not total
    const perRepeatSeconds = seconds;
    const activeRepeatCount = repeat ? repeatCount : 1;
    const totalDuration = perRepeatSeconds * activeRepeatCount;

    const start = now;

    const end = new Date(start.getTime() + totalDuration * 1000);

    const timestamps: string[] = [];
    for (let i = 1; i < activeRepeatCount + 1; i++) {
      const repeatTime = new Date(start.getTime() + i * perRepeatSeconds * 1000);
      timestamps.push(formatTimeWithSeconds(repeatTime));
    }
    setRepeatTimestamps(timestamps);

    timerSessionRef.current = createTimerSession(
      start.getTime(),
      perRepeatSeconds * 1000,
      activeRepeatCount
    );

    setTimeRange({
      start: formatTimeWithSeconds(start),
      end: formatTimeWithSeconds(end),
    });

    setInitialTime(perRepeatSeconds); // ✅ Save per-repeat time
    setTimeLeft(perRepeatSeconds);
    setRepeatCycle(0);
    setIntervalProgress(0);
    setTotalProgress(0);
    setIsRunning(true);
    setShowPopup(false);
    setCompletedAt("");
    setEditingPresetId(null);
    setPresetLabelDraft("");
    clearStatusMessage();
  };

  const pauseTimer = () => {
    const session = timerSessionRef.current;
    if (!session || session.pausedRemainingMs !== null) {
      setIsRunning(false);
      return;
    }

    const snapshot = getTimerSnapshot(session, Date.now());

    if (snapshot.isComplete) {
      reconcileTimer();
      return;
    }

    timerSessionRef.current = pauseTimerSession(session, Date.now());
    setRepeatCycle(snapshot.currentCycleIndex);
    setTimeLeft(Math.ceil(snapshot.remainingMs / 1000));
    setIntervalProgress(snapshot.intervalProgress);
    setTotalProgress(snapshot.totalProgress);
    setIsRunning(false);
  };

  const stopTimer = () => {
    setIsRunning(false);
    setTimeLeft(0);
    setRepeatCycle(0);
    setShowPopup(false);
    timerSessionRef.current = null;
    setIntervalProgress(0);
    setTotalProgress(0);
    setCompletedAt("");
    setTimeRange({ start: "", end: "" }); // Optional reset
    setRepeatTimestamps([]); // Optional reset
    clearStatusMessage();
  };

  const handleInputBlurOrEnter = () => {
    const totalSeconds = parseInputTime(inputTime);
    const now = new Date();
    const end = new Date(now.getTime() + totalSeconds * 1000);
    timerSessionRef.current = null;
    setIsRunning(false);
    setInitialTime(totalSeconds);
    setTimeLeft(totalSeconds);
    setRepeatCycle(0);
    setIntervalProgress(0);
    setTotalProgress(0);
    setShowPopup(false);
    setCompletedAt("");
    clearStatusMessage();
    setTimeRange({
      start: formatTimeWithSeconds(now),
      end: formatTimeWithSeconds(end),
    });
  };

  const handleRepeatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (timerSessionRef.current) return;

    const value = e.target.value;
    const parsed = parseInt(value);

    if (!isNaN(parsed)) {
      const clamped = Math.min(Math.max(parsed, 1), 100);
      setRepeatCount(clamped);
      setRepeatCountInput(clamped.toString());

      const now = new Date();
      const end = new Date(now.getTime() + initialTime * clamped * 1000);
      setTimeRange({
        start: formatTimeWithSeconds(now),
        end: formatTimeWithSeconds(end),
      });
    } else {
      setRepeatCountInput("");
    }
  };

  const applyTimerSetup = useCallback(
    (seconds: number, nextRepeat: boolean, nextRepeatCount: number, nextSound?: string) => {
      if (timerSessionRef.current) return;

      const safeSeconds = Math.max(0, Math.floor(seconds));
      const safeRepeatCount = clampNumber(Math.floor(nextRepeatCount), 1, 100);
      const activeRepeatCount = nextRepeat ? safeRepeatCount : 1;
      const now = new Date();
      const end = new Date(now.getTime() + safeSeconds * activeRepeatCount * 1000);

      setRepeat(nextRepeat);
      setRepeatCount(safeRepeatCount);
      setRepeatCountInput(safeRepeatCount.toString());
      if (nextSound && soundMap[nextSound]) {
        setSelectedSound(nextSound);
      }
      setInputTime(formatTime(safeSeconds));
      setTimeLeft(safeSeconds);
      setInitialTime(safeSeconds);
      setIntervalProgress(0);
      setTotalProgress(0);
      setRepeatCycle(0);
      setIsRunning(false);
      setShowPopup(false);
      setCompletedAt("");
      setRepeatTimestamps([]);
      clearStatusMessage();
      setTimeRange({
        start: formatTimeWithSeconds(now),
        end: formatTimeWithSeconds(end),
      });
    },
    [clearStatusMessage]
  );

  const addCustomPreset = () => {
    if (initialTime <= 0) {
      showTemporaryStatusMessage("Set a timer duration before saving a custom preset.");
      return;
    }

    if (customPresets.some((preset) => preset.seconds === initialTime)) {
      showTemporaryStatusMessage("That time is already saved as a custom preset.");
      return;
    }

    const preset: CustomPreset = {
      id: createStoredId(),
      label: formatPresetLabel(initialTime),
      seconds: initialTime,
    };

    setCustomPresets((items) => [preset, ...items].slice(0, MAX_CUSTOM_PRESETS));
    showTemporaryStatusMessage("Custom preset saved.");
  };

  const deleteCustomPreset = (id: string) => {
    setCustomPresets((items) => items.filter((preset) => preset.id !== id));
    if (editingPresetId === id) {
      setEditingPresetId(null);
      setPresetLabelDraft("");
    }
  };

  const startEditingCustomPreset = (preset: CustomPreset) => {
    setEditingPresetId(preset.id);
    setPresetLabelDraft(preset.label);
  };

  const cancelEditingCustomPreset = () => {
    setEditingPresetId(null);
    setPresetLabelDraft("");
  };

  const saveCustomPresetLabel = (id: string) => {
    const preset = customPresets.find((item) => item.id === id);
    if (!preset) return;

    const nextLabel = normalizePresetLabel(presetLabelDraft) || formatPresetLabel(preset.seconds);

    setCustomPresets((items) =>
      items.map((item) => (item.id === id ? { ...item, label: nextLabel } : item))
    );
    setEditingPresetId(null);
    setPresetLabelDraft("");
  };

  const moveCustomPresetByOffset = (id: string, direction: -1 | 1) => {
    setCustomPresets((items) => {
      const currentIndex = items.findIndex((preset) => preset.id === id);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) {
        return items;
      }

      const reordered = [...items];
      const [movedPreset] = reordered.splice(currentIndex, 1);
      reordered.splice(nextIndex, 0, movedPreset);
      return reordered;
    });
  };

  const reorderCustomPreset = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;

    setCustomPresets((items) => {
      const draggedIndex = items.findIndex((preset) => preset.id === draggedId);
      const targetIndex = items.findIndex((preset) => preset.id === targetId);

      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
        return items;
      }

      const reordered = [...items];
      const [draggedPreset] = reordered.splice(draggedIndex, 1);
      reordered.splice(targetIndex, 0, draggedPreset);
      return reordered;
    });
  };

  const handleCustomPresetDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    presetId: string
  ) => {
    suppressPresetClickRef.current = true;
    setDraggedPresetId(presetId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", presetId);
  };

  const handleCustomPresetDrop = (
    event: React.DragEvent<HTMLDivElement>,
    targetPresetId: string
  ) => {
    event.preventDefault();
    const sourcePresetId = event.dataTransfer.getData("text/plain") || draggedPresetId;
    if (sourcePresetId) {
      reorderCustomPreset(sourcePresetId, targetPresetId);
    }
    setDraggedPresetId(null);
    setDragOverPresetId(null);
    window.setTimeout(() => {
      suppressPresetClickRef.current = false;
    }, 0);
  };

  const clearTimerSetup = () => {
    const shouldClear = window.confirm("Clear timer, repeat settings, and custom presets?");
    if (!shouldClear) return;

    timerSessionRef.current = null;
    setIsRunning(false);
    setInitialTime(0);
    setTimeLeft(0);
    setInputTime(formatTime(0));
    setRepeat(false);
    setRepeatCount(1);
    setRepeatCountInput("1");
    setRepeatCycle(0);
    setIntervalProgress(0);
    setTotalProgress(0);
    setTimeRange({ start: "", end: "" });
    setRepeatTimestamps([]);
    setCustomPresets([]);
    setShowPopup(false);
    setCompletedAt("");
    setEditingPresetId(null);
    setPresetLabelDraft("");
    setDraggedPresetId(null);
    setDragOverPresetId(null);
    suppressPresetClickRef.current = false;
    clearStatusMessage();
  };

  const deleteSessionHistoryItem = (id: string) => {
    setSessionHistory((items) => items.filter((item) => item.id !== id));
  };

  const clearSessionHistory = () => {
    setSessionHistory([]);
  };

  useEffect(() => {
    const isInteractiveTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;

      const tagName = target.tagName.toLowerCase();
      return (
        target.isContentEditable ||
        tagName === "input" ||
        tagName === "select" ||
        tagName === "textarea" ||
        tagName === "button"
      );
    };

    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape") {
        if (showShortcutHelp) {
          event.preventDefault();
          setShowShortcutHelp(false);
          return;
        }

        if (showPopup) {
          event.preventDefault();
          setShowPopup(false);
          return;
        }

        if (!isInteractiveTarget(event.target) && hasActiveSession) {
          event.preventDefault();
          stopTimer();
        }
        return;
      }

      if (showShortcutHelp || showPopup) return;

      if (isInteractiveTarget(event.target)) return;

      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        setShowShortcutHelp(true);
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (isRunning) {
          pauseTimer();
        } else if (canStartTimer) {
          startTimer(initialTime);
        }
      }
    };

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [
    canStartTimer,
    hasActiveSession,
    initialTime,
    isRunning,
    showPopup,
    showShortcutHelp,
  ]);

  const totalDurationSeconds = repeat ? initialTime * repeatCount : initialTime;
  const formattedDuration = formatTime(totalDurationSeconds);
  const wakeLockStatus = wakeLockActive ? "Active" : keepAwake ? "On" : "Off";

  const presetTimes = [
    { label: "3 sec", value: 3 },
    { label: "30 sec", value: 30 },
    { label: "1 min", value: 60 },
    { label: "1.5 min", value: 90 },
    { label: "2 min", value: 2 * 60 },
    { label: "5 min", value: 5 * 60 },
    { label: "10 min", value: 10 * 60 },
    { label: "15 min", value: 15 * 60 },
    { label: "20 min", value: 20 * 60 },  
    { label: "25 min", value: 25 * 60 },  
    { label: "30 min", value: 30 * 60 },
    { label: "45 min", value: 45 * 60 },
    { label: "50 min", value: 50 * 60 },
    { label: "60 min", value: 60 * 60 },
    { label: "90 min", value: 90 * 60 },
  ];

  const ordinal = (n: number): string => {
    const suffixes = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  };

  return (
    <div className="app">
      <div className="top-right-toggle">
        <div className="tooltip-wrap">
          <button
            className="icon-button"
            type="button"
            aria-label="Clear timer setup"
            onClick={clearTimerSetup}
          >
            <ClearIcon />
          </button>
          <div className="control-tooltip shortcut-tooltip" role="tooltip">
            Clear timer setup
          </div>
        </div>
        <div className="tooltip-wrap">
          <button
            className="icon-button"
            type="button"
            aria-label="Keyboard shortcuts"
            onClick={() => setShowShortcutHelp(true)}
          >
            ?
          </button>
          <div className="control-tooltip shortcut-tooltip" role="tooltip">
            Keyboard shortcuts
          </div>
        </div>
        {supportsWakeLock && (
          <div className="tooltip-wrap">
            <button
              className={`toggle-button top-keep-awake ${keepAwake ? "toggle-button-active" : ""}`}
              aria-pressed={keepAwake}
              onClick={() => setKeepAwake((current) => !current)}
              type="button"
            >
              <span className="toggle-main">Keep Awake</span>
              <span className="toggle-status">{wakeLockStatus}</span>
            </button>
            <div className="control-tooltip shortcut-tooltip" role="tooltip">
              Keep the screen awake while the timer runs
            </div>
          </div>
        )}
        <button
          onClick={() => {
            document.body.classList.add("with-transition");
            setDarkMode((prev) => !prev);

            setTimeout(() => {
              document.body.classList.remove("with-transition");
            }, 500);
          }}
          className="btn theme-toggle-button"
        >
          {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
        </button>
      </div>

      <h1>Repeat Timer</h1>

      <input
        type="text"
        value={inputTime}
        onChange={(e) => setInputTime(e.target.value)}
        onBlur={handleInputBlurOrEnter}
        onKeyDown={(e) => e.key === "Enter" && handleInputBlurOrEnter()}
        className="time-input"
        placeholder="HH:MM:SS"
        disabled={!canEditTimer}
      />

      <div className="preset-panel">
        <div className="preset-group">
          <div className="preset-header">
            <div className="preset-group-label">Presets</div>
            <button
              className="save-preset-button"
              type="button"
              disabled={!canEditTimer || initialTime <= 0}
              onClick={addCustomPreset}
            >
              + Save {formatPresetLabel(initialTime)}
            </button>
          </div>
          <div className="preset-grid">
            {presetTimes.map(({ label, value }) => (
              <button
                key={label}
                className="btn btn-secondary preset-btn"
                disabled={!canEditTimer}
                onClick={() => applyTimerSetup(value, repeat, repeatCount)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {customPresets.length > 0 && (
          <div className="preset-group">
            <div className="preset-group-label">Custom</div>
            <div className="custom-preset-strip">
              {customPresets.map((preset) => (
                <div
                  className={`custom-preset-item ${
                    dragOverPresetId === preset.id && draggedPresetId !== preset.id
                      ? "custom-preset-drag-over"
                      : ""
                  } ${editingPresetId === preset.id ? "custom-preset-editing" : ""}`}
                  key={preset.id}
                  onDragOver={(event) => {
                    if (!canEditTimer || !draggedPresetId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverPresetId(preset.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverPresetId === preset.id) {
                      setDragOverPresetId(null);
                    }
                  }}
                  onDrop={(event) => handleCustomPresetDrop(event, preset.id)}
                >
                  {editingPresetId === preset.id ? (
                    <>
                      <input
                        className="custom-preset-edit-input"
                        value={presetLabelDraft}
                        maxLength={24}
                        aria-label={`Custom preset label for ${preset.label}`}
                        autoFocus
                        onChange={(event) => setPresetLabelDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            saveCustomPresetLabel(preset.id);
                          } else if (event.key === "Escape") {
                            cancelEditingCustomPreset();
                          }
                        }}
                      />
                      <button
                        className="preset-icon-button preset-save-button"
                        type="button"
                        aria-label={`Save custom preset ${preset.label}`}
                        onClick={() => saveCustomPresetLabel(preset.id)}
                      >
                        <CheckIcon />
                      </button>
                      <button
                        className="preset-icon-button"
                        type="button"
                        aria-label={`Cancel editing custom preset ${preset.label}`}
                        onClick={cancelEditingCustomPreset}
                      >
                        <CancelIcon />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="custom-preset-btn"
                        type="button"
                        disabled={!canEditTimer}
                        draggable={canEditTimer}
                        title="Drag to reorder. Press Alt+Left or Alt+Right to reorder with the keyboard."
                        onClick={() => {
                          if (suppressPresetClickRef.current) return;
                          applyTimerSetup(preset.seconds, repeat, repeatCount);
                        }}
                        onDragStart={(event) => handleCustomPresetDragStart(event, preset.id)}
                        onDragEnd={() => {
                          setDraggedPresetId(null);
                          setDragOverPresetId(null);
                          window.setTimeout(() => {
                            suppressPresetClickRef.current = false;
                          }, 0);
                        }}
                        onKeyDown={(event) => {
                          if (event.altKey && event.key === "ArrowLeft") {
                            event.preventDefault();
                            moveCustomPresetByOffset(preset.id, -1);
                          } else if (event.altKey && event.key === "ArrowRight") {
                            event.preventDefault();
                            moveCustomPresetByOffset(preset.id, 1);
                          }
                        }}
                      >
                        <span>{preset.label}</span>
                      </button>
                      <button
                        className="preset-icon-button"
                        type="button"
                        aria-label={`Edit custom preset ${preset.label}`}
                        disabled={!canEditTimer}
                        onClick={() => startEditingCustomPreset(preset)}
                      >
                        <EditIcon />
                      </button>
                      <button
                        className="preset-delete-button"
                        type="button"
                        aria-label={`Delete custom preset ${preset.label}`}
                        disabled={!canEditTimer}
                        onClick={() => deleteCustomPreset(preset.id)}
                      >
                        x
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="btn-group">
        <button className="btn btn-green" onClick={() => startTimer(initialTime)} disabled={!canStartTimer}>
          <PlayIcon /> {isPaused ? "Resume" : "Start"}
        </button>
        <button className="btn btn-yellow" onClick={pauseTimer} disabled={!isRunning}>
          <PauseIcon /> Pause
        </button>
        <button className="btn btn-red" onClick={stopTimer}>
          <StopIcon /> Stop
        </button>
      </div>

      {hasActiveSession && (
        <div className="timer-status">
          {isPaused && <div className="paused-label">Paused</div>}
          {repeat && (
            <div>
              Repeat: {repeatCycle + 1} of {repeatCount}
            </div>
          )}
          <div className="progress-wrap" aria-label="Current interval progress">
            <div className="progress-label">
              <span>Interval</span>
              <span>{Math.round(intervalProgress * 100)}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.round(intervalProgress * 100)}%` }}
              />
            </div>
          </div>
          {repeat && (
            <div className="progress-wrap" aria-label="Total session progress">
              <div className="progress-label">
                <span>Total</span>
                <span>{Math.round(totalProgress * 100)}%</span>
              </div>
              <div className="progress-track progress-track-secondary">
                <div
                  className="progress-fill progress-fill-secondary"
                  style={{ width: `${Math.round(totalProgress * 100)}%` }}
                />
              </div>
            </div>
          )}
          {statusMessage && <div className="status-message">{statusMessage}</div>}
        </div>
      )}

      <div className="settings-row">
        <label>
          <input
            type="checkbox"
            checked={repeat}
            disabled={hasActiveSession}
            onChange={() => setRepeat(!repeat)}
          />{" "}
          Repeat
        </label>
        {repeat && (
          <>
            <input
              type="number"
              min={1}
              max={100}
              value={repeatCountInput}
              onChange={handleRepeatChange}
              disabled={hasActiveSession}
              className="repeat-count-input"
            />
            <span className="total-summary">
              Total: {formattedDuration}
              {timeRange.start && timeRange.end && ` (${timeRange.start} – ${timeRange.end})`}
            </span>
          </>
        )}
      </div>

      <div className="settings-row sound-row">
        <label>Sound: </label>
        <select
          value={selectedSound}
          onChange={(e) => setSelectedSound(e.target.value)}
          className="select-input"
        >
          {Object.keys(soundMap).map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        <button className="btn btn-blue" onClick={() => {
          preloadCurrentSounds();
          playSound();
        }}>
          Test Sound
        </button>
      </div>

      <div className="settings-row settings-row-spaced">
        <span title={`Volume: ${Math.round(volume * 100)}%`}>
          Volume
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="volume-input"
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
        <span className="volume-value">
          {Math.round(volume * 100)}%
        </span>
      </div>

      <section className="history-panel" aria-labelledby="history-title">
        <div className="panel-header">
          <h2 id="history-title">Recent Sessions</h2>
          {sessionHistory.length > 0 && (
            <button className="text-button" type="button" onClick={clearSessionHistory}>
              Clear
            </button>
          )}
        </div>
        {sessionHistory.length === 0 ? (
          <p className="history-empty">Completed timers will show up here.</p>
        ) : (
          <div className="history-list">
            {sessionHistory.map((item) => (
              <div className="history-item" key={item.id}>
                <div className="history-main">
                  <strong>Total {formatTime(item.totalSeconds)}</strong>
                  <span>
                    {item.intervalSeconds} sec x {item.repeatCount}{" "}
                    {item.repeatCount === 1 ? "repeat" : "repeats"} = {formatTime(item.totalSeconds)}
                  </span>
                </div>
                <div className="history-meta">
                  <span>Completed {item.completedAt}</span>
                  <span>{item.selectedSound}</span>
                  {item.caughtUpIntervals > 0 && (
                    <span>Caught up {item.caughtUpIntervals}</span>
                  )}
                </div>
                <button
                  className="btn btn-secondary history-use-button"
                  type="button"
                  disabled={!canEditTimer}
                  onClick={() =>
                    applyTimerSetup(
                      item.intervalSeconds,
                      item.repeatCount > 1,
                      item.repeatCount,
                      item.selectedSound
                    )
                  }
                >
                  Use Again
                </button>
                <button
                  className="history-delete-button"
                  type="button"
                  aria-label={`Delete session completed ${item.completedAt}`}
                  onClick={() => deleteSessionHistoryItem(item.id)}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {showPopup && (
        <div className="completion-popup">
          <h2>Time's Up</h2>
          <div className="completion-details">
            <div>
              <span title="The wall-clock time when this timer session started.">Started</span>
              <strong>{timeRange.start || "Not available"}</strong>
            </div>
            <div>
              <span title="The expected finish time calculated from the start time, interval length, and repeat count.">Scheduled End</span>
              <strong>{timeRange.end || "Not available"}</strong>
            </div>
            <div>
              <span title="The wall-clock time when the app observed completion and showed this summary. This can be later than scheduled if the browser paused the tab.">Completed</span>
              <strong>{completedAt || formatTimeWithSeconds(new Date())}</strong>
            </div>
            <div>
              <span title="The planned total timer length, including all repeats.">Total Duration</span>
              <strong>{formattedDuration}</strong>
            </div>
            <div>
              <span title="The number of planned intervals completed in this session.">Repeats Completed</span>
              <strong>{repeat ? repeatCount : 1}</strong>
            </div>
          </div>
          {repeatTimestamps.length > 0 && (
          <div className="alarm-list">
            <div className="alarm-list-heading">
              {new Date().toLocaleDateString()}
            </div>
            {repeatTimestamps.map((time, i) => (
              <div key={i}>
                <span>{ordinal(i + 1)} Alarm</span>
                <strong>{time}</strong>
              </div>
            ))}
          </div>
          )}
          <button className="btn" onClick={() => setShowPopup(false)}>
            Close
          </button>
        </div>
      )}

      {showShortcutHelp && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowShortcutHelp(false);
            }
          }}
        >
          <div
            className="shortcut-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcut-help-title"
          >
            <div className="modal-header">
              <h2 id="shortcut-help-title">Keyboard Shortcuts</h2>
              <button
                className="icon-button"
                ref={shortcutCloseButtonRef}
                type="button"
                aria-label="Close keyboard shortcuts"
                onClick={() => setShowShortcutHelp(false)}
              >
                x
              </button>
            </div>
            <div className="shortcut-list">
              <div>
                <kbd>Space</kbd>
                <span>Start, pause, or resume the timer</span>
              </div>
              <div>
                <kbd>Esc</kbd>
                <span>Close dialogs, or stop an active timer</span>
              </div>
              <div>
                <kbd>?</kbd>
                <span>Show keyboard shortcuts</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
