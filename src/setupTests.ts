import "@testing-library/jest-dom";

type MockAudioInstance = {
  src: string;
  preload: string;
  volume: number;
  load: jest.Mock;
  play: jest.Mock<Promise<void>, []>;
  cloneNode: jest.Mock<MockAudioInstance, [boolean?]>;
};

const createMockAudio = (src = ""): MockAudioInstance => {
  const audio: MockAudioInstance = {
    src,
    preload: "",
    volume: 1,
    load: jest.fn(),
    play: jest.fn(() => Promise.resolve()),
    cloneNode: jest.fn(() => createMockAudio(src)),
  };

  return audio;
};

Object.defineProperty(window, "Audio", {
  configurable: true,
  writable: true,
  value: jest.fn((src?: string) => createMockAudio(src)),
});
