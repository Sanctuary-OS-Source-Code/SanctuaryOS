import React from 'react';

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Slider: React.FC<SliderProps> = ({ value, min = 0, max = 100, className = '', ...props }) => {
  // Clamp value between min and max to prevent percent from going out of bounds
  const clampedValue = Math.min(Math.max(value, min), max);
  const percent = ((clampedValue - min) / (max - min)) * 100;

  return (
    <input
      type="range"
      min={min}
      max={max}
      value={clampedValue}
      className={`sanctuary-slider ${className}`}
      style={{
        '--slider-percent': `${percent}%`,
        ...props.style
      } as React.CSSProperties}
      {...props}
    />
  );
};

