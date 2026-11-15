import React, { useState, useRef, useLayoutEffect, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: string;
  placement?: TooltipPlacement;
  disabled?: boolean;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  placement = 'top',
  disabled = false,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();

  const close = () => {
    setOpen(false);
    setCoords(null);
  };

  useEffect(() => {
    if (disabled && open) {
      close();
    }
  }, [disabled, open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };

    const handleScrollOrResize = () => {
      close();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tipRect = tooltipRef.current.getBoundingClientRect();
    const gap = 8;
    const margin = 8;

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'bottom':
        top = triggerRect.bottom + gap;
        left = triggerRect.left + triggerRect.width / 2 - tipRect.width / 2;
        if (top + tipRect.height > window.innerHeight - margin) {
          top = triggerRect.top - tipRect.height - gap;
        }
        break;
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - tipRect.height / 2;
        left = triggerRect.left - tipRect.width - gap;
        if (left < margin) {
          left = triggerRect.right + gap;
        }
        break;
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - tipRect.height / 2;
        left = triggerRect.right + gap;
        if (left + tipRect.width > window.innerWidth - margin) {
          left = triggerRect.left - tipRect.width - gap;
        }
        break;
      case 'top':
      default:
        top = triggerRect.top - tipRect.height - gap;
        left = triggerRect.left + triggerRect.width / 2 - tipRect.width / 2;
        if (top < margin) {
          top = triggerRect.bottom + gap;
        }
        break;
    }

    const clampedLeft = Math.max(
      margin,
      Math.min(left, window.innerWidth - tipRect.width - margin)
    );
    const clampedTop = Math.max(
      margin,
      Math.min(top, window.innerHeight - tipRect.height - margin)
    );

    setCoords({ top: clampedTop, left: clampedLeft });
  }, [open, placement, content]);

  const handleMouseEnter = () => {
    if (!disabled && content) {
      setOpen(true);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLSpanElement>) => {
    if (disabled || !content) return;
    const target = e.target as HTMLElement | null;
    if (target) {
      try {
        if (target.matches(':focus-visible')) {
          setOpen(true);
        }
      } catch {
        // Ignore unsupported :focus-visible
      }
    }
  };

  const portalContainer =
    typeof document !== 'undefined'
      ? document.fullscreenElement || document.body
      : null;

  const childWithDescribedBy = open
    ? React.cloneElement(children, {
        'aria-describedby': tooltipId,
      })
    : children;

  return (
    <span
      ref={triggerRef}
      className="inline-flex shrink-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={close}
      onPointerDown={close}
      onClick={close}
      onFocus={handleFocus}
      onBlur={close}
    >
      {childWithDescribedBy}
      {open &&
        portalContainer &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            style={
              coords
                ? { top: `${coords.top}px`, left: `${coords.left}px` }
                : { top: '-9999px', left: '-9999px', visibility: 'hidden' }
            }
            className="fixed z-[100] pointer-events-none select-none px-2.5 py-1 rounded-lg bg-slate-900/90 backdrop-blur-md text-slate-100 border border-white/15 shadow-lg text-xs font-medium whitespace-nowrap"
          >
            {content}
          </div>,
          portalContainer
        )}
    </span>
  );
};
