import { AlertCircle, FolderCheck, X } from 'lucide-react';
import { StoredHandlePrompt } from '../hooks/useVideoLibrary';

interface RecoveryBannerProps {
  prompt: StoredHandlePrompt;
  onGrant: () => void;
  onDismiss: () => void;
}

export function RecoveryBanner({ prompt, onGrant, onDismiss }: RecoveryBannerProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl glass-panel border border-sky-400/40 bg-sky-500/10 dark:bg-sky-950/40 shadow-lg text-sm text-slate-800 dark:text-slate-200">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-400">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-white">Previous library found: </span>
            <span className="text-sky-700 dark:text-sky-300 font-medium">"{prompt.folderName}"</span>
            <span className="text-slate-600 dark:text-slate-400 text-xs block sm:inline sm:ml-2">
              Browser security requires re-authorizing local directory access.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={onGrant}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-medium text-xs hover:bg-sky-400 transition cursor-pointer shadow"
          >
            <FolderCheck className="h-3.5 w-3.5" />
            <span>Grant Access</span>
          </button>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
            title="Dismiss remembered folder"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
