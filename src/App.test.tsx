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
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it("blocks invalid and incomplete durations and normalizes committed sections", () => {
    installAudioMock();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "5 min" }));
    const minutes = screen.getByRole("textbox", { name: "Minutes" });
    fireEvent.change(minutes, { target: { value: "75" } });
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /\+ Save/ })).toBeDisabled();
    fireEvent.blur(minutes);
    expect(screen.getByRole("alert")).toHaveTextContent("Minutes must be between 00 and 59.");
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(screen.getByRole("button", { name: /pause/i })).toBeDisabled();
    fireEvent.change(minutes, { target: { value: "" } });
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    fireEvent.change(minutes, { target: { value: "2" } });
    fireEvent.blur(minutes);
    expect(minutes).toHaveValue("02");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeEnabled();
    fireEvent.change(minutes, { target: { value: "1e" } });
    expect(minutes).toHaveValue("02");
    fireEvent.change(minutes, { target: { value: "" } });
    fireEvent.blur(minutes);
    expect(minutes).toHaveValue("00");
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
  });

  it("accepts formatted duration paste and keeps rejected paste errors until corrected", () => {
    installAudioMock();
    render(<App />);
    const hours = screen.getByRole("textbox", { name: "Hours" });
    fireEvent.paste(hours, { clipboardData: { getData: () => "01:15:09" } });
    expect(hours).toHaveValue("01");
    expect(screen.getByRole("textbox", { name: "Minutes" })).toHaveValue("15");
    expect(screen.getByRole("textbox", { name: "Seconds" })).toHaveValue("09");
    expect(screen.getByRole("button", { name: /start/i })).toBeEnabled();
    fireEvent.paste(hours, { clipboardData: { getData: () => "00:00:1.5" } });
    fireEvent.blur(hours);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid duration");
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "3 sec" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(hours).toHaveValue("00");
    expect(screen.getByRole("button", { name: /start/i })).toBeEnabled();
  });

  it("updates the preview from duration and repeats without accepting an invalid repeat draft", () => {
    installAudioMock();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "5 min" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /repeat/i }));
    const repeats = screen.getByRole("textbox", { name: "Repeat count" });
    fireEvent.change(repeats, { target: { value: "4" } });
    expect(screen.getByText(/^Total:/)).toHaveTextContent("Total: 00:20:00 (12:00:00 PM – 12:20:00 PM)");
    fireEvent.change(screen.getByRole("textbox", { name: "Minutes" }), { target: { value: "2" } });
    expect(screen.getByText(/^Total:/)).toHaveTextContent("Total: 00:08:00 (12:00:00 PM – 12:08:00 PM)");
    fireEvent.change(repeats, { target: { value: "" } });
    expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /\+ Save/ })).toBeDisabled();
    fireEvent.blur(repeats);
    expect(screen.getByRole("alert")).toHaveTextContent("between 1 and 100");
    fireEvent.click(screen.getByRole("button", { name: "30 sec" }));
    expect(repeats).toHaveValue("");
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    fireEvent.change(repeats, { target: { value: "101" } });
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    fireEvent.change(repeats, { target: { value: "2" } });
    expect(screen.getByText(/^Total:/)).toHaveTextContent("Total: 00:01:00 (12:00:00 PM – 12:01:00 PM)");
    fireEvent.change(screen.getByRole("textbox", { name: "Seconds" }), { target: { value: "75" } });
    expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3 sec" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /repeat/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /repeat/i }));
    expect(screen.getByText(/^Total:/)).toHaveTextContent("Total: 00:00:06 (12:00:00 PM – 12:00:06 PM)");
  });

  it("shows setup feedback when saving a preset without an active timer", () => {
    installAudioMock();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "5 min" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Save 5 min" }));
    expect(screen.getByRole("status")).toHaveTextContent("Custom preset saved.");
    fireEvent.click(screen.getByRole("button", { name: "+ Save 5 min" }));
    expect(screen.getByRole("status")).toHaveTextContent("That time is already saved");
    advanceClock(4_000);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("keeps popup, history, and alarm times consistent across multiple pauses", () => {
    installAudioMock();
    render(<App />);
    fireEvent.click(screen.getByRole("checkbox", { name: /repeat/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Repeat count" }), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "3 sec" }));
    fireEvent.click(screen.getByRole("button", { name: /start/i }));

    advanceClock(1_000);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    advanceClock(5_000);
    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    advanceClock(3_000); // The first alarm has fired at 12:00:08.
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    advanceClock(10_000);
    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    expect(screen.getByText(/12:00:00 PM – 12:00:24 PM/)).toBeInTheDocument();
    advanceClock(5_100);

    const popup = screen.getByRole("heading", { name: "Time's Up" }).parentElement!;
    expect(popup.querySelector(".completion-details")).toHaveTextContent(
      "Started12:00:00 PMScheduled End12:00:24 PMCompleted12:00:24 PM"
    );
    const alarms = popup.querySelector(".alarm-list")!;
    expect(alarms).toHaveTextContent("1st Alarm12:00:08 PM");
    expect(alarms).toHaveTextContent("2nd Alarm12:00:21 PM");
    expect(alarms).toHaveTextContent("3rd Alarm12:00:24 PM");
    expect(JSON.parse(localStorage.getItem(SESSION_HISTORY_KEY) || "[]")[0]).toMatchObject({
      startedAt: "12:00:00 PM",
      scheduledEnd: "12:00:24 PM",
      completedAt: "12:00:24 PM",
      totalSeconds: 9,
      repeatCount: 3,
    });
  });

  it.each(["Close", "Escape"])("clears the completed setup on %s and supports Use Again", (dismissal) => {
    installAudioMock();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "3 sec" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Save 3 sec" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Magic Ring" } });
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.75" } });
    fireEvent.click(screen.getByRole("button", { name: /light mode/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /repeat/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Repeat count" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    advanceClock(6_100);
    expect(screen.getByRole("heading", { name: "Time's Up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    if (dismissal === "Close") {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    } else {
      fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    }

    expect(screen.queryByRole("heading", { name: "Time's Up" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("Magic Ring");
    expect(screen.getByRole("slider")).toHaveValue("0.75");
    expect(document.body).toHaveClass("light");
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")).toMatchObject({
      initialTime: 0, repeat: false, repeatCount: 1,
    });

    fireEvent.click(screen.getByRole("button", { name: "Use Again" }));
    expect(screen.getByRole("textbox", { name: "Seconds" })).toHaveValue("03");
    expect(screen.getByRole("textbox", { name: "Repeat count" })).toHaveValue("2");
    expect(screen.getByRole("button", { name: /start/i })).toBeEnabled();
  });

  it.each([false, true])("clears setup when stopping a timer (paused: %s)", (paused) => {
    installAudioMock();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "3 sec" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /repeat/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Repeat count" }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    advanceClock(1_000);
    if (paused) fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    advanceClock(20_000);
    expect(screen.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")).toMatchObject({
      initialTime: 0, repeat: false, repeatCount: 1,
    });
    expect(screen.queryByRole("heading", { name: "Time's Up" })).not.toBeInTheDocument();
    expect(localStorage.getItem(SESSION_HISTORY_KEY)).toBe("[]");
  });

  it.each(["invalid-json", "null", "[]", '"false"'])("falls back safely for malformed saved data: %s", (saved) => {
    installAudioMock();
    [SETTINGS_KEY, CUSTOM_PRESETS_KEY, SESSION_HISTORY_KEY, "darkMode"].forEach((key) =>
      localStorage.setItem(key, saved)
    );
    render(<App />);
    expect(screen.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    expect(document.body).toHaveClass("dark");
    fireEvent.click(screen.getByRole("button", { name: "3 sec" }));
    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    advanceClock(3_100);
    expect(screen.getByRole("heading", { name: "Time's Up" })).toBeInTheDocument();
  });

  it("rejects invalid field types and skips malformed entries without losing valid entries", () => {
    installAudioMock();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      initialTime: "90", repeat: "false", repeatCount: null,
      volume: false, selectedSound: "toString", keepAwake: "false",
    }));
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify([
      null, false, { seconds: 0.5 }, { seconds: "60" }, { id: "valid", seconds: 120, label: "Focus" },
    ]));
    localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify([
      null, false, { intervalSeconds: 0.5, totalSeconds: 0.5, completedAtMs: fixedNow.getTime() },
      { id: "valid", intervalSeconds: 60, totalSeconds: 60, completedAtMs: fixedNow.getTime() },
    ]));
    render(<App />);
    expect(screen.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
    expect(screen.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
    expect(screen.getByRole("combobox")).toHaveValue("Wood Knock");
    expect(screen.getByRole("slider")).toHaveValue("0.5");
    expect(screen.getByRole("button", { name: "Focus" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Use Again" })).toHaveLength(1);
  });

  it.each(["reads and writes", "writes"])("continues working when storage rejects %s", (failures) => {
    installAudioMock();
    if (failures === "reads and writes") {
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Unavailable"); });
    }
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "3 sec" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Save 3 sec" }));
    fireEvent.click(screen.getByRole("button", { name: /light mode/i }));
    fireEvent.click(screen.getByRole("button", { name: /start/i }));
    advanceClock(3_100);
    expect(screen.getByRole("heading", { name: "Time's Up" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Again" })).toBeInTheDocument();
    expect(document.body).toHaveClass("light");
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

    const timeInput = screen.getByRole("textbox", { name: "Seconds" });
    fireEvent.click(screen.getByRole("button", { name: "3 sec" }));
    fireEvent.click(screen.getByRole("button", { name: /start/i }));

    advanceClock(1_000);
    expect(timeInput).toHaveValue("02");

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    advanceClock(5_000);
    expect(timeInput).toHaveValue("02");
    expect(document.title).toBe("Paused - 00:00:02 left");

    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    advanceClock(1_000);

    expect(screen.queryByRole("heading", { name: "Time's Up" })).not.toBeInTheDocument();
    expect(timeInput).toHaveValue("01");

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

    expect(screen.getByRole("textbox", { name: "Minutes" })).toHaveValue("01");
    expect(screen.getByRole("textbox", { name: "Seconds" })).toHaveValue("30");
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
    fireEvent.change(screen.getByRole("textbox", { name: "Repeat count" }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear timer setup" }));

    expect(confirmSpy).toHaveBeenCalledWith("Clear timer, repeat settings, and custom presets?");
    expect(screen.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
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

    const timeInput = screen.getByRole("textbox", { name: "Seconds" });
    fireEvent.change(timeInput, { target: { value: "03" } });
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
    expect(timeInput).toHaveValue("00");
    expect(screen.getByRole("button", { name: /pause/i })).toBeDisabled();
  });
});
