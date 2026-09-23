import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../cn';
import { useAutoRepeat } from '../hooks';
import { controlBase, controlSizes, FieldLabel, hasContent, type FieldSize } from './Field';

function decimalsOf(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  if (s.includes('e-')) return Math.min(10, Number(s.split('e-')[1]) || 0);
  const i = s.indexOf('.');
  return i === -1 ? 0 : Math.min(10, s.length - i - 1);
}

// strips float noise, e.g. 0.1 + 0.2
function clean(n: number, decimals = 6): number {
  return Number(n.toFixed(Math.min(10, decimals)));
}

function clamp(n: number, min?: number, max?: number): number {
  let v = n;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

function formatNumberText(v: number | undefined): string {
  return v === undefined || !Number.isFinite(v) ? '' : String(clean(v));
}

// undefined = empty, null = not a number yet (e.g. "-" or ".")
function parseNumberText(s: string): number | undefined | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return undefined;
  if (!/^-?\d*\.?\d*$/.test(t) || t === '-' || t === '.' || t === '-.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const stepButtonSizes: Record<FieldSize, string> = {
  sm: 'w-6 rounded-[7px] [&_svg]:size-3.5',
  md: 'w-8 rounded-[9px] [&_svg]:size-4',
  lg: 'w-[38px] rounded-[10px] [&_svg]:size-[18px]',
};

// keeps the step buttons square
const stepperPadding: Record<FieldSize, string> = {
  sm: 'gap-1 p-[3px]',
  md: 'gap-1.5 p-[3px]',
  lg: 'gap-2 p-1',
};

function StepButton({
  direction,
  onStep,
  disabled,
  size,
  label,
}: {
  direction: -1 | 1;
  onStep: () => void;
  disabled: boolean;
  size: FieldSize;
  label: string;
}) {
  const repeat = useAutoRepeat(onStep, disabled);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      disabled={disabled}
      {...repeat}
      className={cn(
        'relative flex h-full shrink-0 touch-manipulation select-none items-center justify-center text-fg-2',
        'bg-surface-3 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--fg)_7%,transparent)]',
        'light:bg-surface light:shadow-[0_1px_2px_rgb(17_20_39/0.1),inset_0_0_0_1px_var(--line)]',
        'transition-[background-color,color,transform,opacity] duration-150 hover:text-fg hover:brightness-110 active:scale-90',
        'disabled:pointer-events-none disabled:opacity-35',
        'after:absolute after:-inset-1',
        stepButtonSizes[size],
      )}
    >
      {direction < 0 ? <Minus strokeWidth={2.5} aria-hidden /> : <Plus strokeWidth={2.5} aria-hidden />}
    </button>
  );
}

const valueText: Record<FieldSize, string> = {
  sm: 'text-sm',
  md: 'text-[15px]',
  lg: 'font-display text-xl tracking-tight',
};

export interface NumberFieldProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  /** Shift+Arrow steps 10x. */
  step?: number;
  label?: ReactNode;
  suffix?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  steppers?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

/** Accepts a comma or dot for decimals and clamps on blur. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  suffix,
  size = 'md',
  steppers = true,
  placeholder,
  className,
  autoFocus,
  disabled = false,
  id,
  'aria-label': ariaLabel,
}: NumberFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => formatNumberText(value));
  const [prevValue, setPrevValue] = useState(value);

  // sync outside changes without clobbering what's being typed ("1." stays "1.")
  if (!Object.is(value, prevValue)) {
    setPrevValue(value);
    const parsed = parseNumberText(text);
    if (parsed !== value && !(parsed === null && value === undefined)) setText(formatNumberText(value));
  }

  const safeStep = step > 0 ? step : 1;
  const current = (() => {
    const parsed = parseNumberText(text);
    return typeof parsed === 'number' ? parsed : value;
  })();

  const emit = (next: number | undefined) => {
    if (!Object.is(next, value)) onChange(next);
  };

  const stepBy = (direction: number) => {
    if (disabled) return;
    const decimals = Math.max(decimalsOf(safeStep), current === undefined ? 0 : decimalsOf(current));
    const start = current ?? (min !== undefined && min > 0 ? min - safeStep : 0);
    const next = clean(clamp(start + direction * safeStep, min, max), decimals);
    setText(formatNumberText(next));
    emit(next);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\s/g, '');
    const allowNegative = min === undefined || min < 0;
    if (!/^-?\d*[.,]?\d*$/.test(raw) || (!allowNegative && raw.startsWith('-'))) return;
    setText(raw);
    const parsed = parseNumberText(raw);
    if (parsed === undefined) emit(undefined);
    else if (parsed !== null) emit(parsed);
  };

  const commit = () => {
    const parsed = parseNumberText(text);
    if (parsed === undefined) {
      setText('');
      emit(undefined);
      return;
    }
    if (parsed === null) {
      setText(formatNumberText(value));
      return;
    }
    const next = clean(clamp(parsed, min, max));
    setText(formatNumberText(next));
    emit(next);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepBy((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const onBlur = (_e: FocusEvent<HTMLInputElement>) => commit();

  const width = Math.max(text.length, placeholder?.length ?? 0, 1) + 0.6;
  const centered = steppers;

  return (
    <div className={cn('w-full', className)}>
      {hasContent(label) && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <div
        className={cn(
          controlBase,
          controlSizes[size],
          steppers && stepperPadding[size],
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {steppers && (
          <StepButton
            direction={-1}
            onStep={() => stepBy(-1)}
            disabled={disabled || (min !== undefined && current !== undefined && current <= min)}
            size={size}
            label="Decrease"
          />
        )}
        <label
          htmlFor={inputId}
          className={cn(
            'flex h-full min-w-0 flex-1 cursor-text items-center gap-1.5',
            centered ? 'justify-center px-1' : size === 'lg' ? 'px-4' : 'px-3',
          )}
        >
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="spinbutton"
            aria-label={ariaLabel}
            aria-valuenow={value}
            aria-valuemin={min}
            aria-valuemax={max}
            disabled={disabled}
            autoFocus={autoFocus}
            placeholder={placeholder}
            value={text}
            onChange={onInputChange}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            onFocus={(e) => e.currentTarget.select()}
            style={centered && hasContent(suffix) ? { width: `${width}ch` } : undefined}
            className={cn(
              'min-w-0 bg-transparent font-semibold tabular text-fg outline-none placeholder:font-medium placeholder:text-fg-4 focus-visible:outline-none',
              valueText[size],
              size !== 'lg' && 'pointer-coarse:text-base',
              centered ? (hasContent(suffix) ? 'max-w-full text-right' : 'w-full text-center') : 'w-full flex-1 text-left',
            )}
          />
          {hasContent(suffix) && (
            <span className={cn('shrink-0 truncate font-medium text-fg-3', size === 'lg' ? 'text-sm' : 'text-xs')}>{suffix}</span>
          )}
        </label>
        {steppers && (
          <StepButton
            direction={1}
            onStep={() => stepBy(1)}
            disabled={disabled || (max !== undefined && current !== undefined && current >= max)}
            size={size}
            label="Increase"
          />
        )}
      </div>
    </div>
  );
}

export interface DurationFieldProps {
  /** Minutes. */
  value: number | undefined;
  onChange: (minutes: number | undefined) => void;
  label?: ReactNode;
  /** Minutes. Values snap to the step. */
  step?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

function splitMinutes(total: number | undefined): { h: string; m: string } {
  if (total === undefined || !Number.isFinite(total)) return { h: '', m: '' };
  const rounded = Math.max(0, Math.round(total));
  return { h: String(Math.floor(rounded / 60)), m: String(rounded % 60) };
}

function totalFromParts(h: string, m: string): number | undefined {
  if (h.trim() === '' && m.trim() === '') return undefined;
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
}

export function DurationField({
  value,
  onChange,
  label,
  step = 15,
  size = 'md',
  className,
  autoFocus,
  disabled = false,
}: DurationFieldProps) {
  const baseId = useId();
  const hoursId = `${baseId}-h`;
  const minutesId = `${baseId}-m`;
  const labelId = `${baseId}-label`;
  const groupRef = useRef<HTMLDivElement>(null);
  const [parts, setParts] = useState(() => splitMinutes(value));
  const [prevValue, setPrevValue] = useState(value);

  if (!Object.is(value, prevValue)) {
    setPrevValue(value);
    if (totalFromParts(parts.h, parts.m) !== value) setParts(splitMinutes(value));
  }

  const safeStep = step > 0 ? step : 15;
  const total = totalFromParts(parts.h, parts.m);

  const emit = (next: number | undefined) => {
    if (!Object.is(next, value)) onChange(next);
  };

  const applyTotal = (next: number) => {
    const clamped = Math.max(0, Math.min(99 * 60 + 59, Math.round(next)));
    setParts(splitMinutes(clamped));
    emit(clamped);
  };

  const stepBy = (direction: -1 | 1) => {
    if (disabled) return;
    const cur = total ?? 0;
    const next =
      direction > 0 ? Math.floor(cur / safeStep) * safeStep + safeStep : Math.ceil(cur / safeStep) * safeStep - safeStep;
    applyTotal(next);
  };

  const onPartChange = (key: 'h' | 'm') => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, key === 'h' ? 2 : 3);
    const next = { ...parts, [key]: raw };
    setParts(next);
    emit(totalFromParts(next.h, next.m));
  };

  const onGroupBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (groupRef.current?.contains(e.relatedTarget as Node | null)) return;
    const t = totalFromParts(parts.h, parts.m);
    if (t === undefined) return;
    // 0h 90m becomes 1h 30m
    setParts(splitMinutes(t));
  };

  const onKeyDown = (key: 'h' | 'm') => (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const amount = key === 'h' ? 60 : e.shiftKey ? 10 : 1;
      applyTotal((total ?? 0) + dir * amount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const unitClass = cn('font-medium text-fg-3', size === 'lg' ? 'text-sm' : 'text-xs');
  const inputClass = cn(
    'min-w-0 bg-transparent text-right font-semibold tabular text-fg outline-none placeholder:text-fg-4 focus-visible:outline-none',
    'rounded-md focus:bg-[color-mix(in_oklab,var(--accent)_14%,transparent)]',
    valueText[size],
    size !== 'lg' && 'pointer-coarse:text-base',
  );

  return (
    <div className={cn('w-full', className)}>
      {hasContent(label) && (
        <div id={labelId} className="mb-1.5 block text-[13px] font-medium text-fg-2">
          {label}
        </div>
      )}
      <div
        ref={groupRef}
        role="group"
        aria-labelledby={hasContent(label) ? labelId : undefined}
        aria-label={hasContent(label) ? undefined : 'Duration'}
        onBlur={onGroupBlur}
        className={cn(
          controlBase,
          controlSizes[size],
          stepperPadding[size],
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <StepButton
          direction={-1}
          onStep={() => stepBy(-1)}
          disabled={disabled || total === undefined || total <= 0}
          size={size}
          label={`Decrease by ${safeStep} minutes`}
        />
        <div className="flex h-full min-w-0 flex-1 items-center justify-center gap-2.5 px-1">
          <label htmlFor={hoursId} className="flex h-full cursor-text items-center gap-1">
            <input
              id={hoursId}
              type="text"
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="off"
              aria-label="Hours"
              disabled={disabled}
              autoFocus={autoFocus}
              placeholder="0"
              value={parts.h}
              onChange={onPartChange('h')}
              onKeyDown={onKeyDown('h')}
              onFocus={(e) => e.currentTarget.select()}
              style={{ width: `${Math.max(parts.h.length, 1) + 0.7}ch` }}
              className={inputClass}
            />
            <span className={unitClass}>h</span>
          </label>
          <label htmlFor={minutesId} className="flex h-full cursor-text items-center gap-1">
            <input
              id={minutesId}
              type="text"
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="off"
              aria-label="Minutes"
              disabled={disabled}
              placeholder="0"
              value={parts.m}
              onChange={onPartChange('m')}
              onKeyDown={onKeyDown('m')}
              onFocus={(e) => e.currentTarget.select()}
              style={{ width: `${Math.max(parts.m.length, 2) + 0.7}ch` }}
              className={inputClass}
            />
            <span className={unitClass}>m</span>
          </label>
        </div>
        <StepButton
          direction={1}
          onStep={() => stepBy(1)}
          disabled={disabled}
          size={size}
          label={`Increase by ${safeStep} minutes`}
        />
      </div>
    </div>
  );
}
