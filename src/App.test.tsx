import { act, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";

const SETTINGS_KEY = "repeatTimerSettings";
const CUSTOM_PRESETS_KEY = "repeatTimerCustomPresets";
const SESSION_HISTORY_KEY = "repeatTimerSessionHistory";

type PlayedAudio = {
  src: string;
  volume: number;
};

const fixedNow = new Date("2026-10-14T12:00:00");

const installAudioMock = () => {
  const playedAudio: PlayedAudio[] = [];

  const createAudio = (src = "") => {
    const audio = {
      src,
      preload: "",
      volume: 1,
      load: jest.fn(),
      play: jest.fn(() => {
        playedAudio.push({ src: audio.src, volume: audio.volume });
        return Promise.resolve();
      }),
      cloneNode: jest.fn(() => createAudio(src)),
    };

    return audio;
  };

  (window.Audio as unknown as jest.Mock).mockImplementation((src?: string) => createAudio(src));

  return playedAudio;
};

const advanceClock = (milliseconds: number) => {
  act(() => {
    jest.advanceTimersByTime(milliseconds);
  });
};

describe("App", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
    localStorage.clear();
    document.body.className = "";
    document.title = "";
    (window.Audio as unknown as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    localStorage.clear();
  });

  it("completes a one-shot timer, plays completion sounds, and records session history", () => {
    const playedAudio = installAudioMock();

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "3 sec" }));
    fireEvent.click(screen.getByRole("button", { name: /start/i }));

    advanceClock(3_100);

    expect(screen.getByRole("heading", { name: "Time's Up" })).toBeInTheDocument();
    expect(screen.getByText(/3 sec x 1 repeat = 00:00:03/)).toBeInTheDocument();
    expect(screen.getByText("Completed 12:00:03 PM")).toBeInTheDocument();
    expect(playedAudio).toEqual([
      { src: "/sounds/wood-door-knock.mp3", volume: 0.5 },
      { src: "/sounds/done-woman-voice.mp3", volume: 0.5 },
    ]);

    const savedHistory = JSON.parse(localStorage.getItem(SESSION_HISTORY_KEY) || "[]");
    expect(savedHistory).toHaveLength(1);
    expect(savedHistory[0]).toMatchObject({
      intervalSeconds: 3,
      totalSeconds: 3,
      repeatCount: 1,
      selectedSound: "Wood Knock",
      caughtUpIntervals: 0,
    });
  });

  it("pauses and resumes without counting paused wall-clock time", () => {
    installAudioMock();

    render(<App />);

    const timeInput = screen.getByPlaceholderText("HH:MM:SS");
    fireEvent.click(screen.getByRole("button", { name: "3 sec" }));
    fireEvent.click(screen.getByRole("button", { name: /start/i }));

    advanceClock(1_000);
    expect(timeInput).toHaveValue("00:00:02");

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    advanceClock(5_000);
    expect(timeInput).toHaveValue("00:00:02");
    expect(document.title).toBe("Paused - 00:00:02 left");

    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    advanceClock(1_000);

    expect(screen.queryByRole("heading", { name: "Time's Up" })).not.toBeInTheDocument();
    expect(timeInput).toHaveValue("00:00:01");

    advanceClock(1_100);
    expect(screen.getByRole("heading", { name: "Time's Up" })).toBeInTheDocument();
  });

  it("loads persisted settings, custom presets, and session history safely", () => {
    installAudioMock();
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        initialTime: 90,
        repeat: true,
        repeatCount: 150,
        selectedSound: "Missing Sound",
        volume: 2,
        keepAwake: true,
      })
    );
    localStorage.setItem(
      CUSTOM_PRESETS_KEY,
      JSON.stringify([
        { id: "bad", label: "Bad", seconds: 0 },
        { id: "valid", label: "Focus Block", seconds: 120.9 },
      ])
    );
    localStorage.setItem(
      SESSION_HISTORY_KEY,
      JSON.stringify([
        {
          id: "older",
          completedAtMs: fixedNow.getTime() - 1_000,
          startedAt: "11:59:00 AM",
          scheduledEnd: "12:00:00 PM",
          completedAt: "12:00:00 PM",
          intervalSeconds: 60,
          totalSeconds: 60,
          repeatCount: 1,
          selectedSound: "Magic Ring",
          caughtUpIntervals: 0,
        },
        {
          id: "newer",
          completedAtMs: fixedNow.getTime(),
          startedAt: "11:58:00 AM",
          scheduledEnd: "12:00:00 PM",
          completedAt: "12:00:01 PM",
          intervalSeconds: 60,
          totalSeconds: 120,
          repeatCount: 2,
          selectedSound: "Guitar Alert",
          caughtUpIntervals: 1,
        },
      ])
    );

    render(<App />);

    expect(screen.getByPlaceholderText("HH:MM:SS")).toHaveValue("00:01:30");
    expect(screen.getByRole("checkbox", { name: /repeat/i })).toBeChecked();
    expect(screen.getByDisplayValue("100")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Wood Knock")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Focus Block" })).toBeInTheDocument();

    const history = within(screen.getByRole("region", { name: /recent sessions/i }));
    const historyItems = history.getAllByText(/Total/);
    expect(historyItems[0]).toHaveTextContent("Total 00:02:00");
    expect(history.getByText("Caught up 1")).toBeInTheDocument();
  });

  it("saves and deletes custom presets", () => {
    installAudioMock();

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "5 min" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Save 5 min" }));

    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "5 min" })).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) || "[]")[0]).toMatchObject({
      label: "5 min",
      seconds: 300,
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete custom preset 5 min" }));

    expect(screen.queryByText("Custom")).not.toBeInTheDocument();
    expect(localStorage.getItem(CUSTOM_PRESETS_KEY)).toBe("[]");
  });

  it("edits and reorders custom presets", () => {
    installAudioMock();

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "5 min" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Save 5 min" }));
    fireEvent.click(screen.getByRole("button", { name: "10 min" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Save 10 min" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit custom preset 5 min" }));
    const labelInput = screen.getByRole("textbox", {
      name: "Custom preset label for 5 min",
    });
    fireEvent.change(labelInput, { target: { value: "Stretch break" } });
    fireEvent.keyDown(labelInput, { key: "Enter", code: "Enter" });

    fireEvent.keyDown(screen.getByRole("button", { name: "Stretch break" }), {
      key: "ArrowLeft",
      code: "ArrowLeft",
      altKey: true,
    });

    const savedPresets = JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) || "[]");
    expect(savedPresets.map((preset: { label: string }) => preset.label)).toEqual([
      "Stretch break",
      "10 min",
    ]);
    expect(screen.getByRole("button", { name: "Stretch break" })).toBeInTheDocument();
  });

  it("clears timer setup and custom presets after confirmation", () => {
    installAudioMock();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "5 min" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Save 5 min" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /repeat/i }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear timer setup" }));

    expect(confirmSpy).toHaveBeenCalledWith("Clear timer, repeat settings, and custom presets?");
    expect(screen.getByPlaceholderText("HH:MM:SS")).toHaveValue("00:00:00");
    expect(screen.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
    expect(screen.queryByText("Custom")).not.toBeInTheDocument();
    expect(localStorage.getItem(CUSTOM_PRESETS_KEY)).toBe("[]");
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")).toMatchObject({
      initialTime: 0,
      repeat: false,
      repeatCount: 1,
    });

    confirmSpy.mockRestore();
  });

  it("handles keyboard shortcuts without stealing input focus", () => {
    installAudioMock();

    render(<App />);

    const timeInput = screen.getByPlaceholderText("HH:MM:SS");
    fireEvent.change(timeInput, { target: { value: "00:00:03" } });
    fireEvent.keyDown(timeInput, { key: "Enter", code: "Enter" });

    timeInput.focus();
    fireEvent.keyDown(timeInput, { key: " ", code: "Space" });
    expect(screen.getByRole("button", { name: /pause/i })).toBeDisabled();

    fireEvent.keyDown(window, { key: "?", code: "Slash", shiftKey: true });
    expect(screen.getByRole("dialog", { name: /keyboard shortcuts/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("dialog", { name: /keyboard shortcuts/i })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(screen.getByRole("button", { name: /pause/i })).toBeEnabled();

    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(timeInput).toHaveValue("00:00:00");
    expect(screen.getByRole("button", { name: /pause/i })).toBeDisabled();
  });
});
