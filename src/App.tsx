import React, { useEffect, useRef, useState } from "react";
import "./index.css";
import { FaPlay, FaPause, FaStop } from "react-icons/fa";

const soundMap: Record<string, string> = {
  "Wood Knock": "/sounds/wood-door-knock.mp3",
  "Guitar Alert": "/sounds/guitar-alert.mp3",
  "Gaming Lock": "/sounds/gaming-lock.mp3",
  "Correct Tone": "/sounds/correct-tone.mp3",
  "Magic Ring": "/sounds/magic-ring.mp3",
  "Church Bell": "/sounds/church-bell.mp3",
  "Done Voice": "/sounds/done-woman-voice.mp3",
};

const formatTime = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const mins = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
};

const parseInputTime = (timeStr: string): number => {
  const parts = timeStr.split(":" ).map(Number);
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
  const [selectedSound, setSelectedSound] = useState("Wood Knock");
  const [timeLeft, setTimeLeft] = useState(0);
  const [initialTime, setInitialTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [repeatCount, setRepeatCount] = useState(1);
  const [repeatCountInput, setRepeatCountInput] = useState("1");
  const [repeatCycle, setRepeatCycle] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : true;
  });
  const [inputTime, setInputTime] = useState("00:00:00");
  const [showPopup, setShowPopup] = useState(false);
  const [timeRange, setTimeRange] = useState({ start: "", end: "" });
  const [volume, setVolume] = useState(0.50);

  const intervalRef = useRef<number | null>(null);

  const playSound = (overridePath?: string) => {
    const path = overridePath || soundMap[selectedSound];
    const audio = new Audio(process.env.PUBLIC_URL + path);
    audio.volume = volume;

    audio.play().catch((err) => {
      console.error("Playback failed:", err);
    });
  };

  const startNewInterval = () => {
    clearInterval(intervalRef.current!);
    intervalRef.current = window.setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
  };

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      startNewInterval();
    } else if (timeLeft === 0 && isRunning) {
      if (repeat && repeatCycle + 1 < repeatCount) {
        playSound();
        setRepeatCycle((prev) => prev + 1);
        setTimeLeft(initialTime);
        startNewInterval();
      } else {
        playSound(); // can remove
        playSound("/sounds/done-woman-voice.mp3");
        setIsRunning(false);
        setRepeatCycle(0);
        setShowPopup(true);
        clearInterval(intervalRef.current!);
        document.title = "Time's Up!";
      }
    }
    return () => clearInterval(intervalRef.current!);
  }, [isRunning, timeLeft]);

  useEffect(() => {
    setInputTime(formatTime(timeLeft));
  }, [timeLeft]);

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
    document.body.classList.toggle("light", !darkMode);
    localStorage.setItem("darkMode", JSON.stringify(darkMode));
  }, [darkMode]);

  const startTimer = (seconds: number) => {
    const now = new Date();
    const end = new Date(now.getTime() + (repeat ? seconds * repeatCount : seconds) * 1000);
    setTimeRange({
      start: formatTimeWithSeconds(now),
      end: formatTimeWithSeconds(end),
    });
    setTimeLeft(seconds);
    setInitialTime(seconds);
    setRepeatCycle(0);
    setIsRunning(true);
    setShowPopup(false);
  };

  const stopTimer = () => {
    setIsRunning(false);
    setTimeLeft(0);
    setRepeatCycle(0);
    setShowPopup(false);
    clearInterval(intervalRef.current!);
  };

  const handleInputBlurOrEnter = () => {
    const totalSeconds = parseInputTime(inputTime);
    const now = new Date();
    const end = new Date(now.getTime() + (repeat ? totalSeconds * repeatCount : totalSeconds) * 1000);
    setTimeLeft(totalSeconds);
    setInitialTime(totalSeconds);
    setTimeRange({
      start: formatTimeWithSeconds(now),
      end: formatTimeWithSeconds(end),
    });
  };

  const handleRepeatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const totalDurationSeconds = repeat ? initialTime * repeatCount : initialTime;
  const formattedDuration = formatTime(totalDurationSeconds);

  const presetTimes = [
    { label: "3 sec", value: 3 },
    { label: "1 min", value: 60 },
    { label: "5 min", value: 5 * 60 },
    { label: "30 min", value: 30 * 60 },
    { label: "60 min", value: 60 * 60 },
    { label: "90 min", value: 90 * 60 },
  ];

  return (
    <div className="app">
      <div className="top-right-toggle">
        <button
          onClick={() => {
            document.body.classList.add("with-transition");
            setDarkMode((prev) => !prev);

            setTimeout(() => {
              document.body.classList.remove("with-transition");
            }, 500); // Match CSS transition duration
          }}
          className="btn text-sm"
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
        style={{ width: "8rem", fontSize: "1.5rem", textAlign: "center", padding: "0.5rem" }}
      />

      <div className="btn-group">
        {presetTimes.map(({ label, value }) => (
          <button
            key={label}
            className="btn btn-secondary"
            onClick={() => {
              const now = new Date();
              const totalSeconds = repeat ? value * repeatCount : value;
              const end = new Date(now.getTime() + totalSeconds * 1000);
              setInputTime(formatTime(value));
              setTimeLeft(value);
              setInitialTime(value);
              setTimeRange({
                start: formatTimeWithSeconds(now),
                end: formatTimeWithSeconds(end),
              });
              setRepeatCycle(0);
              setIsRunning(false);
              setShowPopup(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="btn-group">
        <button className="btn btn-green" onClick={() => startTimer(initialTime)}>
          <FaPlay /> Start
        </button>
        <button className="btn btn-yellow" onClick={() => setIsRunning(false)}>
          <FaPause /> Pause
        </button>
        <button className="btn btn-red" onClick={stopTimer}>
          <FaStop /> Stop
        </button>
      </div>

      {repeat && isRunning && (
        <div style={{ marginBottom: "1rem" }}>
          Repeat: {repeatCycle + 1} of {repeatCount}
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <label>
          <input
            type="checkbox"
            checked={repeat}
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
              style={{ marginLeft: "1rem", width: "60px", padding: "0.25rem" }}
            />
            <span style={{ marginLeft: "1rem" }}>
              Total: {formattedDuration}
              {timeRange.start && timeRange.end && ` (${timeRange.start} – ${timeRange.end})`}
            </span>
          </>
        )}
      </div>

      <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <label>Sound: </label>
        <select
          value={selectedSound}
          onChange={(e) => setSelectedSound(e.target.value)}
          style={{ fontSize: "1rem", padding: "0.5rem" }}
        >
          {Object.keys(soundMap).map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        <button className="btn btn-blue" onClick={() => playSound()}>
          Test Sound
        </button>
      </div>

      <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
          style={{ width: "200px" }}
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
        <span style={{ fontSize: "0.875rem", width: "40px" }}>
          {Math.round(volume * 100)}%
        </span>
      </div>

      {showPopup && (
        <div
          style={{
            position: "fixed",
            top: "30%",
            left: "50%",
            transform: "translate(-50%, -30%)",
            padding: "2rem",
            backgroundColor: darkMode ? "#222" : "#fff",
            color: darkMode ? "#fff" : "#000",
            borderRadius: "10px",
            boxShadow: "0 0 10px rgba(0, 0, 0, 0.3)",
            textAlign: "center",
            zIndex: 1000,
          }}
        >
          <h2>Time's Up</h2>
          <p>
            {new Date().toLocaleDateString()} ({timeRange.start} – {timeRange.end})
          </p>
          <button className="btn" onClick={() => setShowPopup(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
