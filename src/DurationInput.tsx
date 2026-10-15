import React, { useRef } from "react";
import { durationSections, validateDuration } from "./timerInput";

type DurationInputProps = {
  value: string;
  disabled: boolean;
  error: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onInvalidPaste: (message: string) => void;
};

const DurationInput: React.FC<DurationInputProps> = ({
  value, disabled, error, onChange, onCommit, onInvalidPaste,
}) => {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const parts = value.split(":");

  const replaceSection = (index: number, next: string) =>
    parts.map((part, partIndex) => partIndex === index ? next : part).join(":");

  return (
    <div className="duration-field">
      <div className="time-input" role="group" aria-label="Timer duration" aria-disabled={disabled}>
        {durationSections.map(({ label, max }, index) => (
          <React.Fragment key={label}>
            {index > 0 && <span className="time-separator" aria-hidden="true">:</span>}
            <input
              ref={(input) => { inputs.current[index] = input; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              autoComplete="off"
              aria-label={label}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "duration-error" : undefined}
              title={`${label}: 00–${max}`}
              placeholder="00"
              value={parts[index]}
              disabled={disabled}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                if (/^\d{0,2}$/.test(event.target.value)) {
                  onChange(replaceSection(index, event.target.value));
                }
              }}
              onBlur={() => onCommit(replaceSection(index, (parts[index] || "0").padStart(2, "0")))}
              onKeyDown={(event) => {
                if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && !/^\d$/.test(event.key)) {
                  event.preventDefault();
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommit(parts.map((part) => (part || "0").padStart(2, "0")).join(":"));
                } else if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                  const input = event.currentTarget;
                  const targetIndex = event.key === "ArrowLeft" && input.selectionStart === 0
                    ? index - 1
                    : event.key === "ArrowRight" && input.selectionEnd === input.value.length
                      ? index + 1 : -1;
                  if (targetIndex >= 0 && targetIndex < inputs.current.length) {
                    event.preventDefault();
                    inputs.current[targetIndex]?.focus();
                  }
                }
              }}
              onPaste={(event) => {
                event.preventDefault();
                const pasted = event.clipboardData.getData("text").trim();
                if (pasted.includes(":")) {
                  const result = validateDuration(pasted);
                  if (result.seconds !== null) {
                    onChange(pasted.split(":").map((part) => part.padStart(2, "0")).join(":"));
                  } else {
                    onInvalidPaste(result.error);
                  }
                  return;
                }
                const input = event.currentTarget;
                const next = input.value.slice(0, input.selectionStart ?? 0) + pasted +
                  input.value.slice(input.selectionEnd ?? input.value.length);
                if (/^\d{1,2}$/.test(pasted) && /^\d{1,2}$/.test(next)) {
                  onChange(replaceSection(index, next));
                } else {
                  onInvalidPaste("Paste a valid HH:MM:SS duration or up to two digits in a section.");
                }
              }}
            />
          </React.Fragment>
        ))}
      </div>
      {error && <div id="duration-error" className="validation-error" role="alert">{error}</div>}
    </div>
  );
};

export default DurationInput;
