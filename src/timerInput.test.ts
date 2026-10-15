import { MAX_INTERVAL_SECONDS, validateDuration, validateRepeatCount } from "./timerInput";

describe("timer setup validation", () => {
  it.each([
    ["00:00:00", 0],
    ["00:00:01", 1],
    ["1:5:9", 3909],
    ["99:59:59", MAX_INTERVAL_SECONDS],
  ])("accepts a whole duration %s", (value, seconds) => {
    expect(validateDuration(value)).toEqual({ seconds, error: "" });
  });

  it.each(["00:60:00", "00:00:60", "100:00:00", "00::00", "00:00:1.5", "-1:00:00", "00:1e1:00", "12:30"])(
    "rejects an incomplete or invalid duration %s", (value) => {
      expect(validateDuration(value).seconds).toBeNull();
      expect(validateDuration(value).error).not.toBe("");
    }
  );

  it.each(["", "0", "101", "1.5", "1e2", "-1"])("rejects invalid repeats %s", (value) => {
    expect(validateRepeatCount(value).count).toBeNull();
  });

  it.each(["1", "100"])("accepts repeat boundary %s", (value) => {
    expect(validateRepeatCount(value)).toEqual({ count: Number(value), error: "" });
  });
});
