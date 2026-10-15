import { expect, test } from "@playwright/test";

const settingsKey = "repeatTimerSettings";
const customPresetsKey = "repeatTimerCustomPresets";
const sessionHistoryKey = "repeatTimerSessionHistory";

const gotoApp = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
};

const silenceMediaPlayback = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    window.HTMLMediaElement.prototype.load = () => undefined;
  });
};

const clearSavedState = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.evaluate(
    ({ settingsKey, customPresetsKey, sessionHistoryKey }) => {
      localStorage.removeItem(settingsKey);
      localStorage.removeItem(customPresetsKey);
      localStorage.removeItem(sessionHistoryKey);
      localStorage.removeItem("darkMode");
    },
    { settingsKey, customPresetsKey, sessionHistoryKey }
  );
};

const setTimerInput = async (page: import("@playwright/test").Page, value: string) => {
  const parts = value.split(":");
  for (const [index, name] of ["Hours", "Minutes", "Seconds"].entries()) {
    await page.getByRole("textbox", { name }).fill(parts[index]);
  }
  await page.getByRole("textbox", { name: "Seconds" }).press("Enter");
};

test.beforeEach(async ({ page }) => {
  await silenceMediaPlayback(page);
  await clearSavedState(page);
});

test("validates numeric duration sections, paste, and keyboard navigation", async ({ page }) => {
  await gotoApp(page);
  const hours = page.getByRole("textbox", { name: "Hours" });
  const minutes = page.getByRole("textbox", { name: "Minutes" });
  const seconds = page.getByRole("textbox", { name: "Seconds" });
  const start = page.getByRole("button", { name: /start/i });
  await hours.focus();
  await page.keyboard.type("ab-.");
  await expect(hours).toHaveValue("00");
  await page.keyboard.type("1");
  await page.keyboard.press("Tab");
  await expect(hours).toHaveValue("01");
  await expect(minutes).toBeFocused();
  await page.keyboard.type("75");
  await expect(start).toBeDisabled();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("alert")).toContainText("Minutes must be between 00 and 59");
  await expect(seconds).toBeFocused();
  await minutes.fill("5");
  await minutes.press("Enter");
  await expect(minutes).toHaveValue("05");
  await expect(start).toBeEnabled();
  await seconds.focus();
  await seconds.press("ArrowLeft");
  await expect(minutes).toBeFocused();
  await minutes.press("ArrowLeft");
  await expect(hours).toBeFocused();

  const paste = async (value: string) => {
    await hours.evaluate((input, text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text", text);
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
    }, value);
  };
  await paste("00:00:1.5");
  await expect(start).toBeDisabled();
  await page.getByRole("heading", { name: "Repeat Timer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("valid duration");
  await expect(start).toBeDisabled();
  await paste("00:00:45");
  await expect(hours).toHaveValue("00");
  await expect(minutes).toHaveValue("00");
  await expect(seconds).toHaveValue("45");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(start).toBeEnabled();
  await start.click();
  await expect(seconds).toBeDisabled();
});

test("keeps repeat validation and the finish preview consistent with manual edits", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-14T12:00:00") });
  await gotoApp(page);
  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await page.getByRole("checkbox", { name: /repeat/i }).check();
  const repeats = page.getByRole("textbox", { name: "Repeat count" });
  await repeats.fill("4");
  await expect(page.locator(".total-summary")).toContainText("Total: 00:20:00 (12:00:00 PM – 12:20:00 PM)");
  await page.getByRole("textbox", { name: "Minutes" }).fill("2");
  await expect(page.locator(".total-summary")).toContainText("Total: 00:08:00 (12:00:00 PM – 12:08:00 PM)");
  await repeats.fill("");
  await repeats.press("Tab");
  await expect(page.getByRole("alert")).toContainText("between 1 and 100");
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /\+ Save/ })).toBeDisabled();
  await expect(page.locator(".total-summary")).toHaveCount(0);
  await page.getByRole("button", { name: "30 sec", exact: true }).click();
  await expect(repeats).toHaveValue("");
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
  await repeats.fill("101");
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
  await repeats.fill("2");
  await expect(page.locator(".total-summary")).toContainText("Total: 00:01:00 (12:00:00 PM – 12:01:00 PM)");
  await repeats.evaluate((input) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "1.5");
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await repeats.press("Tab");
  await expect(repeats).toHaveValue("2");
  await expect(page.getByRole("alert")).toContainText("between 1 and 100");
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
  await repeats.fill("3");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".total-summary")).toContainText("Total: 00:01:30 (12:00:00 PM – 12:01:30 PM)");
  await page.getByRole("button", { name: /start/i }).click();
  await expect(page.locator(".timer-status")).toContainText("Repeat: 1 of 3");
});

test("shows setup messages and keeps the duration control usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await gotoApp(page);
  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await page.getByRole("button", { name: "+ Save 5 min" }).click();
  await expect(page.getByRole("status")).toContainText("Custom preset saved.");
  await page.getByRole("button", { name: "+ Save 5 min" }).click();
  await expect(page.getByRole("status")).toContainText("That time is already saved");
  await page.getByRole("textbox", { name: "Minutes" }).fill("75");
  await page.getByRole("textbox", { name: "Minutes" }).press("Tab");
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole("button", { name: "3 sec", exact: true }).click();
  await expect(page.getByRole("group", { name: "Timer duration" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("loads the core timer controls", async ({ page }) => {
  await gotoApp(page);

  await expect(page.getByRole("heading", { name: "Repeat Timer" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
  await expect(page.getByRole("button", { name: "3 sec" })).toBeVisible();
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /pause/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /stop/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /repeat/i })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveValue("Wood Knock");
  await expect(page.getByRole("button", { name: "Test Sound" })).toBeVisible();
  await expect(page.getByRole("region", { name: /recent sessions/i })).toContainText(
    "Completed timers will show up here."
  );
});

test("completes a single timer and records it in history", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "3 sec" }).click();
  await page.getByRole("button", { name: /start/i }).click();

  await expect(page.getByRole("heading", { name: "Time's Up" })).toBeVisible({
    timeout: 8_000,
  });
  await expect(page.locator(".completion-popup")).toContainText("Total Duration");
  await expect(page.locator(".completion-popup")).toContainText("00:00:03");
  await expect(page.getByRole("region", { name: /recent sessions/i })).toContainText(
    "3 sec x 1 repeat = 00:00:03"
  );

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Time's Up" })).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
});

test("pauses and resumes without counting paused wall-clock time", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "3 sec" }).click();
  await page.getByRole("button", { name: /start/i }).click();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("02", { timeout: 2_500 });

  await page.getByRole("button", { name: /pause/i }).click();
  const pausedValue = await page.getByRole("textbox", { name: "Seconds" }).inputValue();

  await page.waitForTimeout(3_300);
  await expect(page.getByRole("heading", { name: "Time's Up" })).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue(pausedValue);

  await page.getByRole("button", { name: /resume/i }).click();
  await expect(page.getByRole("heading", { name: "Time's Up" })).toBeVisible({
    timeout: 4_000,
  });
});

test("runs a repeated timer through final completion", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("checkbox", { name: /repeat/i }).check();
  await page.getByRole("textbox", { name: "Repeat count" }).fill("2");
  await page.getByRole("button", { name: "3 sec" }).click();
  await page.getByRole("button", { name: /start/i }).click();

  await expect(page.locator(".timer-status")).toContainText("Repeat: 1 of 2");
  await expect(page.locator(".timer-status")).toContainText("Interval");
  await expect(page.locator(".timer-status")).toContainText("Total");
  await expect(page.getByRole("heading", { name: "Time's Up" })).toBeVisible({
    timeout: 9_000,
  });
  await expect(page.getByRole("region", { name: /recent sessions/i })).toContainText(
    "3 sec x 2 repeats = 00:00:06"
  );

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
  await page.getByRole("button", { name: "Use Again" }).click();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("03");
  await expect(page.getByRole("textbox", { name: "Repeat count" })).toHaveValue("2");
  await expect(page.getByRole("button", { name: /start/i })).toBeEnabled();
});

test("stopping clears the saved setup while preserving preferences and custom presets", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await page.getByRole("button", { name: "+ Save 5 min" }).click();
  await page.getByRole("checkbox", { name: /repeat/i }).check();
  await page.getByRole("textbox", { name: "Repeat count" }).fill("4");
  await page.getByRole("combobox").selectOption("Magic Ring");
  await page.locator(".volume-input").fill("0.75");
  await page.getByRole("button", { name: /start/i }).click();
  await page.getByRole("button", { name: /stop/i }).click();
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
  await expect(page.getByRole("button", { name: /start/i })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
  await expect(page.getByText("Custom", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveValue("Magic Ring");
  await expect(page.locator(".volume-input")).toHaveValue("0.75");
});

test("recovers from a corrupted saved theme on reload", async ({ page }) => {
  await gotoApp(page);
  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("darkMode", "invalid-json"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Repeat Timer" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Minutes" })).toHaveValue("05");
  await expect(page.locator("body")).toHaveClass(/dark/);
  await page.getByRole("button", { name: /start/i }).click();
  await expect(page.getByRole("button", { name: /pause/i })).toBeEnabled();
});

test("persists, edits, reorders, and deletes custom presets", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await page.getByRole("button", { name: "+ Save 5 min" }).click();
  await page.getByRole("button", { name: "10 min", exact: true }).click();
  await page.getByRole("button", { name: "+ Save 10 min" }).click();
  await expect(page.getByText("Custom", { exact: true })).toBeVisible();

  await page.locator(".custom-preset-btn").filter({ hasText: "5 min" }).hover();
  await page.getByRole("button", { name: "Edit custom preset 5 min" }).click();
  await page.getByRole("textbox", { name: "Custom preset label for 5 min" }).fill("Stretch break");
  await page.keyboard.press("Enter");

  const dragHandle = page.getByRole("button", { name: "Stretch break", exact: true });
  const dropTarget = page.locator(".custom-preset-btn").filter({ hasText: "10 min" });
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await dragHandle.dispatchEvent("dragstart", { dataTransfer });
  await dropTarget.dispatchEvent("dragover", { dataTransfer });
  await dropTarget.dispatchEvent("drop", { dataTransfer });

  await expect
    .poll(() =>
      page.evaluate((customPresetsKey) => {
        const presets = JSON.parse(localStorage.getItem(customPresetsKey) || "[]");
        return presets.map((preset: { label: string }) => preset.label);
      }, customPresetsKey)
    )
    .toEqual(["Stretch break", "10 min"]);

  await page.reload();
  await expect(page.getByText("Custom", { exact: true })).toBeVisible();
  const stretchPreset = page.getByRole("button", { name: "Stretch break", exact: true });
  await expect(stretchPreset).toBeVisible();
  await stretchPreset.hover();
  await expect(page.getByRole("button", { name: "Delete custom preset Stretch break" })).toBeVisible();

  await page.getByRole("button", { name: "Delete custom preset Stretch break" }).click();
  await page.locator(".custom-preset-btn").filter({ hasText: "10 min" }).hover();
  await page.getByRole("button", { name: "Delete custom preset 10 min" }).click();
  await expect(page.getByText("Custom", { exact: true })).toBeHidden();

  await page.reload();
  await expect(page.getByText("Custom", { exact: true })).toBeHidden();
});

test("clears timer setup and custom presets after confirmation", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await page.getByRole("button", { name: "+ Save 5 min" }).click();
  await page.getByRole("checkbox", { name: /repeat/i }).check();
  await page.getByRole("textbox", { name: "Repeat count" }).fill("4");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Clear timer, repeat settings, and custom presets?");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Clear timer setup" }).click();

  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
  await expect(page.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
  await expect(page.getByText("Custom", { exact: true })).toBeHidden();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("00");
  await expect(page.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
  await expect(page.getByText("Custom", { exact: true })).toBeHidden();
});

test("persists timer settings across reloads", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "1 min", exact: true }).click();
  await page.getByRole("checkbox", { name: /repeat/i }).check();
  await page.getByRole("textbox", { name: "Repeat count" }).fill("4");
  await page.getByRole("combobox").selectOption("Magic Ring");
  await page.locator(".volume-input").fill("0.75");
  await page.getByRole("button", { name: /light mode/i }).click();

  await page.reload();

  await expect(page.getByRole("textbox", { name: "Minutes" })).toHaveValue("01");
  await expect(page.getByRole("checkbox", { name: /repeat/i })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Repeat count" })).toHaveValue("4");
  await expect(page.getByRole("combobox")).toHaveValue("Magic Ring");
  await expect(page.locator(".volume-input")).toHaveValue("0.75");
  await expect(page.getByText("75%")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/light/);
  await expect(page.getByRole("button", { name: /dark mode/i })).toBeVisible();
});

test("uses and clears completed session history", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "3 sec" }).click();
  await page.getByRole("button", { name: /start/i }).click();
  await expect(page.getByRole("heading", { name: "Time's Up" })).toBeVisible({
    timeout: 8_000,
  });
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Use Again" }).click();
  await expect(page.getByRole("textbox", { name: "Seconds" })).toHaveValue("03");

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("region", { name: /recent sessions/i })).toContainText(
    "Completed timers will show up here."
  );
});

test("supports keyboard shortcuts while protecting focused inputs", async ({ page }) => {
  await gotoApp(page);

  await page.locator("body").click({ position: { x: 10, y: 10 } });
  await page.keyboard.press("Shift+/");
  await expect(page.getByRole("dialog", { name: /keyboard shortcuts/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /keyboard shortcuts/i })).toBeHidden();

  await setTimerInput(page, "00:00:03");
  await page.getByRole("textbox", { name: "Seconds" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /pause/i })).toBeDisabled();

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /pause/i })).toBeEnabled();

  await page.keyboard.press("Space");
  await expect(page.getByText("Paused")).toBeVisible();
});
