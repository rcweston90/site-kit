'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import { ArrowLeft, Check, Eye, Pencil, Redo2, Settings2, Undo2 } from 'lucide-react';
import { GUARDED_LINK_ATTRIBUTE } from '@rcweston/save-kit';
import { EditorThemeToggle } from '@rcweston/story-editor';
import { AdminLink as Link } from '../router.js';
import { useAdminTheme } from '../theme/index.js';

// The admin's theme, or null outside its provider (a test, or the editor
// embedded on its own). useAdminTheme reads the context before it throws, so
// the hooks run in the same order either way.
function useAdminThemeIfAny() {
  try {
    return useAdminTheme();
  } catch {
    return null;
  }
}

/**
 * The top bar of a full-width writing surface (a post's editor): back, the
 * title and its save line, undo and redo, Edit and Preview, theme, settings,
 * save and publish. The host supplies the more-menu and the publish control.
 */

/* The bar reads as a document toolbar, not a control panel: sentence-case
   sans labels, quiet until hovered, 44px hit areas inside a 48px row. */
const barControl = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md font-sans text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent motion-reduce:transition-none';
export const barIconButton = 'grid h-11 w-11 shrink-0 place-items-center rounded-md text-foreground-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent motion-reduce:transition-none';
export const barButton = `${barControl} px-3`;
const barDivider = <span aria-hidden="true" className="mx-1 h-minor w-px shrink-0 bg-default" />;

type WorkspaceBarProps = {
  backHref: string; backLabel: string; onBack?: MouseEventHandler<HTMLAnchorElement>;
  title: string; untitled: string; saveStatus: string; publicationStatus: string;
  statusStrip?: boolean;
  saveState: 'error' | 'saving' | 'idle' | 'saved';
  hasUnsavedChanges: boolean; saveDisabled: boolean; saveButtonLabel: string;
  canUndo: boolean; canRedo: boolean; runHistoryAction: (kind: 'undo' | 'redo') => void;
  view: 'edit' | 'preview' | 'reference'; changeView: (view: 'edit' | 'preview') => void;
  settingsLabel: string; settingsOpen: boolean; onSettings: (trigger: HTMLButtonElement) => void;
  moreMenu: (mobile: boolean) => ReactNode; renderPublish: (compact: boolean) => ReactNode;
  onSave: () => void; onSavePointerDown?: () => void;
};

export function EditorialWorkspaceBar({
  backHref, backLabel, onBack, title, untitled, saveStatus, publicationStatus, statusStrip,
  saveState, hasUnsavedChanges, saveDisabled, saveButtonLabel,
  canUndo, canRedo, runHistoryAction, view, changeView, settingsLabel, settingsOpen, onSettings,
  moreMenu, renderPublish, onSave, onSavePointerDown,
}: WorkspaceBarProps) {
  const theme = useAdminThemeIfAny();
  const themeToggle = (compact: boolean) => theme
    ? <EditorThemeToggle compact={compact} theme={theme.resolvedTheme} onChange={theme.setPreference} />
    : null;
  return (
      <header data-story-workspace-bar=""
        // The admin shell hides its navigation for this full-width editor, so the
        // document bar owns the top edge at every width.
        className="sticky top-0 z-30 -mx-4 -mt-half border-b border-default bg-background px-2 md:-mx-8 md:-mt-minor md:px-4"
      >
        <div className="mx-auto flex h-minor-2 max-w-[100rem] items-center gap-1">
          <Link
            href={backHref}
            {...{ [GUARDED_LINK_ATTRIBUTE]: '' }}
            className={barIconButton}
            aria-label={backLabel}
            title={backLabel}
            onClick={onBack}
          >
            <ArrowLeft aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col justify-center pl-1 lg:flex-row lg:items-baseline lg:gap-3">
            <p className="mb-0 truncate font-sans text-sm font-medium leading-baseline text-foreground md:text-base" title={title}>
              {title || untitled}
            </p>
            {/* Beside the title from lg; below it, a strip under the bar when
                there's an error or a notice, otherwise read out but not shown. */}
            <p id="editor-save-status" role="status" aria-live="polite" className={`mb-0 truncate font-sans text-xs leading-baseline lg:max-w-[60%] lg:shrink-0 lg:text-sm ${saveState === 'error' ? 'text-status-error' : 'text-foreground-muted'} ${statusStrip
              ? 'max-lg:absolute max-lg:inset-x-0 max-lg:top-full max-lg:border-b max-lg:border-default max-lg:bg-background max-lg:px-4'
              : 'max-lg:sr-only'}`}>
              {saveStatus}
              {/* On phones the Publish button's own label (Publish / Publish
                  changes / Published) already says this. */}
              <span className="hidden sm:inline"> · {publicationStatus}</span>
            </p>
          </div>
          <div className="hidden items-center lg:flex">
            <button
              type="button"
              className={barIconButton}
              aria-label="Undo"
              aria-keyshortcuts="Meta+Z Control+Z"
              title="Undo (⌘Z)"
              disabled={!canUndo}
              onClick={() => runHistoryAction('undo')}
            >
              <Undo2 aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={barIconButton}
              aria-label="Redo"
              aria-keyshortcuts="Shift+Meta+Z Shift+Control+Z"
              title="Redo (⇧⌘Z)"
              disabled={!canRedo}
              onClick={() => runHistoryAction('redo')}
            >
              <Redo2 aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </button>
            {barDivider}
            <nav aria-label="Editorial workspace views" className="flex rounded-md border border-default">
              {([['edit', 'Edit', 'Edit draft'], ['preview', 'Preview', 'Preview draft']] as const).map(([key, label, fullLabel]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  aria-label={fullLabel}
                  onClick={() => changeView(key)}
                  className={`inline-flex min-h-11 items-center px-3 font-sans text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary motion-reduce:transition-none ${view === key ? 'bg-foreground/[0.08] text-foreground' : 'text-foreground-muted hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </nav>
            {theme && <>{barDivider}{themeToggle(false)}</>}
            {barDivider}
            <button
              type="button"
              className={`${barControl} px-2 xl:px-3`}
              aria-label={settingsLabel}
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              title={settingsLabel}
              onClick={(event) => onSettings(event.currentTarget)}
            >
              <Settings2 aria-hidden="true" className="h-4 w-4 text-foreground-muted" strokeWidth={1.75} />
              <span className="hidden xl:inline">Settings</span>
            </button>
            {moreMenu(false)}
            {barDivider}
          </div>
          <div className="ml-1 hidden lg:block">
            <button
              type="button"
              aria-keyshortcuts="Control+S Meta+S"
              title="Save (⌘S)"
              disabled={saveDisabled}
              onPointerDown={() => {
                onSavePointerDown?.();
              }}
              onClick={() => onSave()}
              style={hasUnsavedChanges && !saveDisabled && saveState !== 'error' ? { color: 'var(--background)' } : undefined}
              className={`${barButton} border ${saveState === 'error' && hasUnsavedChanges
                ? 'border-status-error text-status-error'
                : hasUnsavedChanges && !saveDisabled
                  ? 'border-foreground bg-foreground hover:bg-foreground/90'
                  : 'border-default bg-foreground/[0.03] text-foreground-muted'}`}
            >
              {!hasUnsavedChanges && saveState !== 'saving' && <Check aria-hidden="true" className="h-4 w-4" />}
              {saveButtonLabel}
            </button>
          </div>
          <div className="hidden lg:block">
            {renderPublish(false)}
          </div>
          {theme && <div className="max-[359px]:hidden lg:hidden">
            {themeToggle(true)}
          </div>}
          <div className="lg:hidden">
            <button
              type="button"
              className={barIconButton}
              aria-label={view === 'edit' ? 'Preview draft' : 'Edit draft'}
              title={view === 'edit' ? 'Preview draft' : 'Edit draft'}
              onClick={() => changeView(view === 'edit' ? 'preview' : 'edit')}
            >
              {view === 'edit'
                ? <Eye aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
                : <Pencil aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />}
            </button>
          </div>
          <div className="lg:hidden">
            <button
              type="button"
              aria-keyshortcuts="Control+S Meta+S"
              aria-describedby="editor-save-status"
              aria-label={saveButtonLabel}
              disabled={saveDisabled}
              onPointerDown={() => { onSavePointerDown?.(); }}
              onClick={() => onSave()}
              style={hasUnsavedChanges && !saveDisabled && saveState !== 'error' ? { color: 'var(--background)' } : undefined}
              className={`${barControl} border ${!hasUnsavedChanges && saveState !== 'saving' ? 'w-11 px-0' : 'px-2'} ${saveState === 'error' && hasUnsavedChanges
                ? 'border-status-error text-status-error'
                : hasUnsavedChanges && !saveDisabled
                  ? 'border-foreground bg-foreground hover:bg-foreground/90'
                  : 'border-default bg-foreground/[0.03] text-foreground-muted'}`}
            >
              {!hasUnsavedChanges && saveState !== 'saving' && <Check aria-hidden="true" className="h-4 w-4" />}
              <span className={!hasUnsavedChanges && saveState !== 'saving' ? 'sr-only' : undefined}>
                {saveState === 'saving' ? 'Saving…' : saveState === 'error' && hasUnsavedChanges ? 'Retry' : hasUnsavedChanges ? 'Save' : 'Saved'}
              </span>
            </button>
          </div>
          <div className="lg:hidden">
            {renderPublish(true)}
          </div>
          <div className="lg:hidden">{moreMenu(true)}</div>
        </div>
      </header>
  );
}
