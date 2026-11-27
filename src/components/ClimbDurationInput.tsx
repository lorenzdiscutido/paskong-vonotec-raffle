import React, { useEffect, useState } from 'react';

interface ClimbDurationInputProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  className?: string;
  inputClassName?: string;
  unitClassName?: string;
}

export const ClimbDurationInput: React.FC<ClimbDurationInputProps> = ({
  value,
  min = 5,
  max = 300,
  onChange,
  className = '',
  inputClassName = '',
  unitClassName = 'text-xs text-slate-300 font-semibold select-none',
}) => {
  const [localText, setLocalText] = useState<string>(() => String(value));

  // Keep local text in sync when value changes externally (e.g. preset buttons clicked)
  useEffect(() => {
    setLocalText(String(value));
  }, [value]);

  const commitValue = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setLocalText(String(value));
      return;
    }
    const parsed = parseInt(trimmed, 10);
    const valid = isNaN(parsed) ? value : Math.max(min, Math.min(max, parsed));
    setLocalText(String(valid));
    if (valid !== value) {
      onChange(valid);
    }
  };

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <input
        type="number"
        aria-label="Custom climb duration in seconds"
        min={min}
        max={max}
        value={localText}
        onChange={(e) => {
          const raw = e.target.value;
          setLocalText(raw);
          const parsed = parseInt(raw.trim(), 10);
          if (!isNaN(parsed) && parsed >= min && parsed <= max) {
            onChange(parsed);
          }
        }}
        onBlur={() => commitValue(localText)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        placeholder={`${min}-${max}`}
        className={inputClassName}
      />
      <span className={unitClassName}>sec</span>
    </div>
  );
};
