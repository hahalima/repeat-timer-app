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
  const input = page.getByPlaceholder("HH:MM:SS");
  await input.fill(value);
  await input.press("Enter");
};

test.beforeEach(async ({ page }) => {
  await silenceMediaPlayback(page);
  await clearSavedState(page);
});

test("loads the core timer controls", async ({ page }) => {
  await gotoApp(page);

  await expect(page.getByRole("heading", { name: "Repeat Timer" })).toBeVisible();
  await expect(page.getByPlaceholder("HH:MM:SS")).toHaveValue("00:00:00");
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
});

test("pauses and resumes without counting paused wall-clock time", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "3 sec" }).click();
  await page.getByRole("button", { name: /start/i }).click();
  await expect(page.getByPlaceholder("HH:MM:SS")).toHaveValue("00:00:02", { timeout: 2_500 });

  await page.getByRole("button", { name: /pause/i }).click();
  const pausedValue = await page.getByPlaceholder("HH:MM:SS").inputValue();

  await page.waitForTimeout(3_300);
  await expect(page.getByRole("heading", { name: "Time's Up" })).toBeHidden();
  await expect(page.getByPlaceholder("HH:MM:SS")).toHaveValue(pausedValue);

  await page.getByRole("button", { name: /resume/i }).click();
  await expect(page.getByRole("heading", { name: "Time's Up" })).toBeVisible({
    timeout: 4_000,
  });
});

test("runs a repeated timer through final completion", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("checkbox", { name: /repeat/i }).check();
  await page.getByRole("spinbutton").fill("2");
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
});

test("persists, edits, reorders, and deletes custom presets", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await page.getByRole("button", { name: "+ Save 5 min" }).click();
  await page.getByRole("button", { name: "10 min", exact: true }).click();
  await page.getByRole("button", { name: "+ Save 10 min" }).click();
  await expect(page.getByText("Custom")).toBeVisible();

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
  await expect(page.getByText("Custom")).toBeVisible();
  const stretchPreset = page.getByRole("button", { name: "Stretch break", exact: true });
  await expect(stretchPreset).toBeVisible();
  await stretchPreset.hover();
  await expect(page.getByRole("button", { name: "Delete custom preset Stretch break" })).toBeVisible();

  await page.getByRole("button", { name: "Delete custom preset Stretch break" }).click();
  await page.locator(".custom-preset-btn").filter({ hasText: "10 min" }).hover();
  await page.getByRole("button", { name: "Delete custom preset 10 min" }).click();
  await expect(page.getByText("Custom")).toBeHidden();

  await page.reload();
  await expect(page.getByText("Custom")).toBeHidden();
});

test("clears timer setup and custom presets after confirmation", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await page.getByRole("button", { name: "+ Save 5 min" }).click();
  await page.getByRole("checkbox", { name: /repeat/i }).check();
  await page.getByRole("spinbutton").fill("4");

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Clear timer, repeat settings, and custom presets?");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Clear timer setup" }).click();

  await expect(page.getByPlaceholder("HH:MM:SS")).toHaveValue("00:00:00");
  await expect(page.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
  await expect(page.getByText("Custom")).toBeHidden();

  await page.reload();
  await expect(page.getByPlaceholder("HH:MM:SS")).toHaveValue("00:00:00");
  await expect(page.getByRole("checkbox", { name: /repeat/i })).not.toBeChecked();
  await expect(page.getByText("Custom")).toBeHidden();
});

test("persists timer settings across reloads", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "1 min", exact: true }).click();
  await page.getByRole("checkbox", { name: /repeat/i }).check();
  await page.getByRole("spinbutton").fill("4");
  await page.getByRole("combobox").selectOption("Magic Ring");
  await page.locator(".volume-input").fill("0.75");
  await page.getByRole("button", { name: /light mode/i }).click();

  await page.reload();

  await expect(page.getByPlaceholder("HH:MM:SS")).toHaveValue("00:01:00");
  await expect(page.getByRole("checkbox", { name: /repeat/i })).toBeChecked();
  await expect(page.getByRole("spinbutton")).toHaveValue("4");
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
  await expect(page.getByPlaceholder("HH:MM:SS")).toHaveValue("00:00:03");

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
  await page.getByPlaceholder("HH:MM:SS").focus();
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
