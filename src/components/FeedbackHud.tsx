import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  FastForward,
  Rewind,
  Gauge,
  Volume2,
  Volume1,
  VolumeX,
} from 'lucide-react';
import { DEFAULT_FEEDBACK_TIMING } from '../config/controlSettings';
import {
  type FeedbackIcon,
  type FeedbackMessage,
  scheduleFeedbackTimers,
} from '../utils/feedbackHud';

interface FeedbackHudProps {
  feedback: FeedbackMessage | null;
  onDismiss?: () => void;
}

function renderFeedbackIcon(icon: FeedbackIcon) {
  const className = 'w-5 h-5 text-indigo-400 shrink-0';

  switch (icon) {
    case 'play':
      return <Play className={`${className} fill-indigo-400/20`} />;
    case 'pause':
      return <Pause className={`${className} fill-indigo-400/20`} />;
    case 'fast-forward':
      return <FastForward className={`${className} fill-indigo-400/20`} />;
    case 'rewind':
      return <Rewind className={`${className} fill-indigo-400/20`} />;
    case 'speed':
      return <Gauge className={className} />;
    case 'volume-up':
      return <Volume2 className={className} />;
    case 'volume-down':
      return <Volume1 className={className} />;
    case 'volume-muted':
      return <VolumeX className={className} />;
  }
}

export const FeedbackHud: React.FC<FeedbackHudProps> = ({ feedback, onDismiss }) => {
  const [phase, setPhase] = useState<'visible' | 'fading'>('visible');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!feedback) {
      setIsVisible(false);
      return;
    }

    setPhase('visible');
    setIsVisible(true);

    return scheduleFeedbackTimers(
      () => setPhase('fading'),
      () => {
        setIsVisible(false);
        onDismiss?.();
      },
      DEFAULT_FEEDBACK_TIMING.displayDurationMs,
      DEFAULT_FEEDBACK_TIMING.fadeDurationMs
    );
  }, [feedback, onDismiss]);

  if (!feedback || !isVisible) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      aria-live="polite"
    >
      <div
        data-testid="feedback-hud"
        data-phase={phase}
        className={`inline-flex items-center gap-2.5 rounded-xl border border-indigo-400/35 bg-slate-950/85 px-4 py-2.5 text-base font-semibold leading-tight text-indigo-100 shadow-lg shadow-indigo-950/50 backdrop-blur-md transition-all ease-out ${
          phase === 'visible'
            ? 'translate-y-0 scale-100 opacity-100 duration-150'
            : 'translate-y-1 scale-95 opacity-0 duration-[400ms]'
        }`}
      >
        {renderFeedbackIcon(feedback.icon)}
        <span className="tabular-nums whitespace-nowrap">{feedback.label}</span>
      </div>
    </div>
  );
};
