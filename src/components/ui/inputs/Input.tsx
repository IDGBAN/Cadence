import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';
import { useMergeRefs } from '@floating-ui/react';
import { cn } from '../cn';
import {
  controlBase,
  controlDisabled,
  controlInvalid,
  controlSizes,
  FieldLabel,
  FieldMessage,
  hasContent,
  nativeInputClass,
} from './Field';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Styles the native <input>. className goes on the wrapper. */
  inputClassName?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  label,
  hint,
  error,
  leading,
  trailing,
  size = 'md',
  className,
  inputClassName,
  id,
  ref,
  disabled,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  const innerRef = useRef<HTMLInputElement>(null);
  const mergedRef = useMergeRefs([innerRef, ref]);
  const invalid = hasContent(error);
  const describedBy = invalid || hasContent(hint) ? msgId : undefined;

  const focusInput = (e: ReactPointerEvent<HTMLDivElement>) => {
    const input = innerRef.current;
    if (!input || e.target === input) return;
    if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return;
    e.preventDefault();
    input.focus();
  };

  return (
    <div className={cn('w-full', className)}>
      {hasContent(label) && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
      <div
        onPointerDown={focusInput}
        className={cn(controlBase, controlSizes[size], invalid && controlInvalid, disabled && controlDisabled, 'cursor-text')}
      >
        {hasContent(leading) && (
          <span className="flex shrink-0 items-center pl-3 text-fg-3 [&_svg]:size-4">{leading}</span>
        )}
        <input
          ref={mergedRef}
          id={inputId}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            nativeInputClass,
            size === 'lg' ? 'px-4' : 'px-3',
            hasContent(leading) && 'pl-2',
            hasContent(trailing) && 'pr-2',
            inputClassName,
          )}
          {...rest}
        />
        {hasContent(trailing) && (
          <span className="flex shrink-0 items-center pr-2.5 text-fg-3 [&_svg]:size-4">{trailing}</span>
        )}
      </div>
      <FieldMessage id={msgId} hint={hint} error={error} />
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  autoGrow?: boolean;
  maxRows?: number;
  error?: ReactNode;
  /** Styles the native <textarea>. className goes on the wrapper. */
  textareaClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  label,
  hint,
  error,
  autoGrow = false,
  maxRows = 10,
  rows,
  className,
  textareaClassName,
  id,
  ref,
  value,
  onInput,
  ...rest
}: TextareaProps) {
  const autoId = useId();
  const areaId = id ?? autoId;
  const msgId = `${areaId}-msg`;
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const mergedRef = useMergeRefs([innerRef, ref]);
  const invalid = hasContent(error);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el || !autoGrow) return;
    const cs = getComputedStyle(el);
    const borders = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const lineHeight = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 14) * 1.5;
    const maxHeight = lineHeight * Math.max(1, maxRows) + padding + borders;
    el.style.height = 'auto';
    const needed = el.scrollHeight + borders;
    el.style.height = `${Math.min(needed, maxHeight)}px`;
    el.style.overflowY = needed > maxHeight + 1 ? 'auto' : 'hidden';
  }, [autoGrow, maxRows]);

  useLayoutEffect(resize, [resize, value]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || !autoGrow || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        resize();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoGrow, resize]);

  const handleInput: NonNullable<TextareaHTMLAttributes<HTMLTextAreaElement>['onInput']> = (e) => {
    onInput?.(e);
    resize();
  };

  return (
    <div className={cn('w-full', className)}>
      {hasContent(label) && <FieldLabel htmlFor={areaId}>{label}</FieldLabel>}
      <textarea
        ref={mergedRef}
        id={areaId}
        rows={rows ?? (autoGrow ? 2 : 4)}
        value={value}
        onInput={handleInput}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid || hasContent(hint) ? msgId : undefined}
        className={cn(
          'block w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-fg placeholder:text-fg-4',
          'shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] light:shadow-[inset_0_1px_2px_rgb(17_20_39/0.04)]',
          'transition-[border-color,box-shadow] duration-150 ease-out hover:border-line-strong',
          'outline-none focus:border-[color-mix(in_oklab,var(--accent)_65%,var(--line-strong))] focus:ring-4 focus:ring-accent/15 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:text-base',
          autoGrow ? 'resize-none overflow-hidden' : 'resize-y',
          invalid && 'border-[color-mix(in_oklab,var(--danger)_60%,var(--line))] focus:border-danger focus:ring-danger/15',
          textareaClassName,
        )}
        {...rest}
      />
      <FieldMessage id={msgId} hint={hint} error={error} />
    </div>
  );
}
