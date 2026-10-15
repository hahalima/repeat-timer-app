export const readStoredJson = (key: string): unknown => {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? null : JSON.parse(saved);
  } catch {
    return null;
  }
};

export const writeStoredJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full. Keep the current in-memory state usable.
  }
};
