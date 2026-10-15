export const MAX_INTERVAL_SECONDS = 99 * 3600 + 59 * 60 + 59;

export const durationSections = [
  { label: "Hours", max: 99 },
  { label: "Minutes", max: 59 },
  { label: "Seconds", max: 59 },
] as const;

export const validateDuration = (value: string): { seconds: number | null; error: string } => {
  const parts = value.split(":");
  if (parts.length !== 3 || parts.some((part) => !/^\d{0,2}$/.test(part))) {
    return { seconds: null, error: "Enter a valid duration in HH:MM:SS format." };
  }
  if (parts.some((part) => part === "")) {
    return { seconds: null, error: "Complete the hours, minutes, and seconds." };
  }
  for (let index = 0; index < parts.length; index++) {
    if (Number(parts[index]) > durationSections[index].max) {
      const { label, max } = durationSections[index];
      return { seconds: null, error: `${label} must be between 00 and ${max}.` };
    }
  }
  const [hours, minutes, seconds] = parts.map(Number);
  return { seconds: hours * 3600 + minutes * 60 + seconds, error: "" };
};

export const validateRepeatCount = (value: string): { count: number | null; error: string } => {
  if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > 100) {
    return { count: null, error: "Enter a whole number of repeats between 1 and 100." };
  }
  return { count: Number(value), error: "" };
};
