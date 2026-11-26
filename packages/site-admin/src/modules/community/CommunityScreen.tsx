'use client';

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { communityPaths, visibleCommunity, type CommunityContent, type CommunityGroup, type CommunityResponse, type CommunityTalk } from '@rcweston/site-data/client';
import { AutoTextarea, ListEditor, inputClass, labelClass } from '../../components/CopyFields.js';
import { KeptEditsNotice, SaveBar as AdminSaveBar, deleteWithUndo, explainFailure, useFormSave } from '@rcweston/save-kit';
import { useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { withConflict } from '../home/conflict.js';

const isCommunity = (value: unknown): value is CommunityContent =>
  Boolean(value && typeof value === 'object' && 'mentoring' in value && 'speaking' in value && 'events' in value);

const RICH_HINT = 'Links: [Fieldnote Studio](https://…). Bold: **like this**. Leave empty to hide the line.';
const smallButton = 'px-2 py-1 rounded border border-foreground-muted/30 font-mono text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted disabled:opacity-30 disabled:hover:text-foreground-muted transition-colors';
const outlineButton = 'inline-flex items-center px-3 py-2 rounded-md border border-foreground-muted/30 font-mono text-xs uppercase tracking-wider text-foreground hover:border-foreground-muted hover:bg-foreground/[0.03] transition-colors';

// ── Fields ──────────────────────────────────────────────────

/** One labelled line of text — headings, button labels, links. */
function TextField({ id, label, hint, value, onChange, type = 'text' }: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'url' | 'date' | 'number';
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {hint && <p className="font-mono text-xs text-foreground-muted -mt-1 mb-half">{hint}</p>}
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </div>
  );
}

/** A labelled paragraph that grows to fit. */
function ProseField({ id, label, hint = RICH_HINT, value, onChange }: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {hint && <p className="font-mono text-xs text-foreground-muted -mt-1 mb-half">{hint}</p>}
      <AutoTextarea id={id} value={value} onChange={onChange} />
    </div>
  );
}

type RowField<T> = { key: keyof T & string; label: string; type?: 'text' | 'url' | 'date' | 'number'; wide?: boolean };

/**
 * A reorderable list of records — the talks and the groups. Each row is a
 * small grid of fields with the same ↑ ↓ ✕ controls as ListEditor, plus a
 * Hide toggle that keeps the row here and leaves it off the page. ✕ takes
 * the row out at once with Undo; nothing is stored until Save.
 */
function RowsEditor<T extends { hidden?: boolean }>({ label, noun, hint, rows, fields, blank, addLabel, onChange }: {
  label: string;
  /** "Talk", "Group": what the toast calls a removed row. */
  noun: string;
  hint?: string;
  rows: T[];
  fields: RowField<T>[];
  blank: T;
  addLabel: string;
  onChange: (next: T[]) => void;
}) {
  // The toast's Undo runs after later edits, so it puts the row back into
  // whatever the list is by then, not the list it was removed from.
  const latest = useRef(rows);
  latest.current = rows;
  const update = (index: number, key: keyof T, value: string, type?: string) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: type === 'number' ? (value === '' ? null : Number(value)) : value } : row)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const toggle = (index: number) =>
    onChange(rows.map((row, i) => {
      if (i !== index) return row;
      const { hidden, ...rest } = row;
      return (hidden ? rest : { ...rest, hidden: true }) as T;
    }));
  const remove = (index: number) => {
    const row = rows[index];
    onChange(rows.filter((_, j) => j !== index));
    deleteWithUndo({
      key: `community-${noun.toLowerCase()}-${Date.now()}`,
      label: `${noun} removed. Save to keep the change.`,
      // A row is part of the form, so there is nothing to send: Save stores the list.
      send: async () => undefined,
      onUndo: () => {
        const next = [...latest.current];
        next.splice(Math.min(index, next.length), 0, row);
        onChange(next);
      },
    });
  };

  return (
    <div>
      <span className={labelClass}>{label}</span>
      {hint && <p className="font-mono text-xs text-foreground-muted -mt-1 mb-half">{hint}</p>}
      <div className="space-y-half">
        {rows.map((row, i) => (
          <fieldset key={i} data-hidden={row.hidden ? '' : undefined} className="flex gap-2 items-start rounded-md border border-foreground-muted/20 p-half data-[hidden]:border-dashed data-[hidden]:bg-foreground/[0.02]">
            <legend className="sr-only">{label} {i + 1}{row.hidden ? ' (hidden)' : ''}</legend>
            <div className={`grid flex-1 gap-half sm:grid-cols-2 ${row.hidden ? 'opacity-60' : ''}`}>
              {row.hidden && <p className="sm:col-span-2 font-mono text-xs uppercase tracking-wider text-foreground-muted">Hidden · not on the page</p>}
              {fields.map((field) => {
                const id = `${label}-${i}-${field.key}`.replace(/\s+/g, '-').toLowerCase();
                const value = row[field.key];
                return (
                  <div key={field.key} className={field.wide ? 'sm:col-span-2' : undefined}>
                    <label htmlFor={id} className="block font-mono text-xs text-foreground-muted mb-1">{field.label}</label>
                    <input
                      id={id}
                      type={field.type ?? 'text'}
                      value={value === null || value === undefined ? '' : String(value)}
                      onChange={(e) => update(i, field.key, e.target.value, field.type)}
                      className={inputClass}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${label} ${i + 1} up`} className={smallButton}>↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move ${label} ${i + 1} down`} className={smallButton}>↓</button>
              <button type="button" onClick={() => toggle(i)} aria-pressed={Boolean(row.hidden)} aria-label={`${row.hidden ? 'Show' : 'Hide'} ${label} ${i + 1}`} title={row.hidden ? 'Show on the page' : 'Hide from the page'} className={smallButton}>{row.hidden ? 'Show' : 'Hide'}</button>
              <button type="button" onClick={() => remove(i)} aria-label={`Remove ${label} ${i + 1}`} className={smallButton}>✕</button>
            </div>
          </fieldset>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...rows, { ...blank }])} className={`mt-half ${outlineButton}`}>
        {addLabel} +
      </button>
    </div>
  );
}

const TALK_FIELDS: RowField<CommunityTalk>[] = [
  { key: 'title', label: 'Title', wide: true },
  { key: 'description', label: 'One-line description', wide: true },
  { key: 'kind', label: 'Kind (Podcast, Talk, Panel…)' },
  { key: 'venue', label: 'Venue' },
  { key: 'date', label: 'Aired', type: 'date' },
  { key: 'minutes', label: 'Minutes', type: 'number' },
  { key: 'action', label: 'Action (Watch, Listen)' },
  { key: 'href', label: 'Recording link', type: 'url' },
];
const BLANK_TALK: CommunityTalk = { date: '', title: '', venue: '', description: '', kind: '', action: 'Watch', minutes: null, href: '' };

const GROUP_FIELDS: RowField<CommunityGroup>[] = [
  { key: 'name', label: 'Name' },
  { key: 'action', label: 'Action (Events, Website)' },
  { key: 'about', label: 'One line about it', wide: true },
  { key: 'href', label: 'Link', type: 'url', wide: true },
];
const BLANK_GROUP: CommunityGroup = { name: '', about: '', href: '', action: 'Events' };

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-minor">
      <h2 className="font-mono text-sm uppercase tracking-widest text-foreground font-semibold pb-half border-b border-foreground-muted/20">{title}</h2>
      {children}
    </section>
  );
}

// ── Component ───────────────────────────────────────────────

/**
 * Admin → Community: every word and link on the community page. `Preview`
 * is the host's own page view, fed the unsaved form, so the preview is the
 * page; without one the screen shows no preview.
 */
export function CommunityScreen({ Preview }: { Preview?: ComponentType<{ content: CommunityContent }> }) {
  const config = useAdminConfig();
  const url = `${config.siteApi}${communityPaths.page()}`;
  const [form, setForm] = useState<CommunityContent | null>(null);
  const [saved, setSaved] = useState<CommunityContent | null>(null);
  const [defaults, setDefaults] = useState<CommunityContent | null>(null);
  const [customized, setCustomized] = useState(false);
  const [version, setVersion] = useState(0);
  const [path, setPath] = useState('/community');
  const [error, setError] = useState<string | null>(null);
  const { dirty, status, kept } = useFormSave<CommunityContent | null>({
    storageKey: 'admin:unsaved:community',
    ready: Boolean(form && saved),
    value: form,
    saved,
    accept: isCommunity,
    onSave: () => void handleSave(),
  });
  const saving = status.pending.length > 0;

  useEffect(() => {
    // A late answer from an earlier run never overwrites what's been typed.
    let current = true;
    const load = async () => {
      try {
        const data = await adminRequest<CommunityResponse>(url);
        if (!current) return;
        setSaved(data.content);
        setDefaults(data.defaults);
        setCustomized(data.customized);
        setVersion(data.version);
        setPath(data.path);
        setForm(data.content);
      } catch (reason) {
        if (current) setError(explainFailure(reason, 'loaded'));
      }
    };
    load();
    return () => { current = false; };
  }, [url]);

  if (!form || !saved || !defaults) {
    return (
      <div role={error ? 'alert' : 'status'} className="text-foreground-muted font-mono text-sm uppercase tracking-wider">
        {error ?? 'Loading...'}
      </div>
    );
  }

  const set = (patch: Partial<CommunityContent>) => setForm({ ...form, ...patch });
  const setMentoring = (patch: Partial<CommunityContent['mentoring']>) => set({ mentoring: { ...form.mentoring, ...patch } });
  const setSpeaking = (patch: Partial<CommunityContent['speaking']>) => set({ speaking: { ...form.speaking, ...patch } });
  const setEvents = (patch: Partial<CommunityContent['events']>) => set({ events: { ...form.events, ...patch } });
  // Rows are changed from a toast's Undo too, after other edits: always build on the latest form.
  const setTalks = (talks: CommunityTalk[]) => setForm((current) => current && { ...current, speaking: { ...current.speaking, talks } });
  const setGroups = (groups: CommunityGroup[]) => setForm((current) => current && { ...current, events: { ...current.events, groups } });

  /** What's stored now, after a save met a newer one: it becomes the saved copy, the form keeps the edit. */
  const refresh = async () => {
    const data = await adminRequest<CommunityResponse>(url);
    setSaved(data.content);
    setCustomized(data.customized);
    setVersion(data.version);
  };

  async function handleSave() {
    await status.run(() => withConflict(() => adminRequest<CommunityResponse>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: form, expectedVersion: version }),
    }), refresh), {
      success: `Saved — ${path} is updating`,
      onSaved: (value) => {
        // The API trims and drops incomplete rows — mirror what was stored.
        setForm(value.content);
        setSaved(value.content);
        setCustomized(true);
        setVersion(value.version);
      },
    });
  }

  /** Back to the original words at once, with Undo; the reset is sent when
   *  the toast goes. */
  const handleReset = () => {
    const before = { form, saved, customized, version };
    setForm(defaults);
    setSaved(defaults);
    setCustomized(false);
    setVersion(0);
    deleteWithUndo({
      key: 'community',
      label: 'Community page reset to the original',
      send: ({ keepalive }) => adminRequest(url, { method: 'DELETE', keepalive }),
      onUndo: () => {
        setForm(before.form);
        setSaved(before.saved);
        setCustomized(before.customized);
        setVersion(before.version);
      },
    });
  };

  const restore = () => {
    const value = kept.offer?.value;
    kept.restore();
    if (value) setForm(value);
  };

  const m = form.mentoring;
  return (
    <div>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-minor-2 pb-minor border-b-2 border-foreground-muted/30">
          <h1 className="font-mono text-3xl md:text-4xl font-bold text-foreground uppercase tracking-wide">
            Community
          </h1>
          <p className="font-mono text-xs text-foreground-muted mt-half">
            Every word and link on {path}.{' '}
            {customized ? 'Currently showing your edits.' : 'Currently showing the shipped defaults.'}{' '}
            <a href={path} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">View the page ↗</a>
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-minor p-half rounded-md border border-status-error/40 bg-status-error/5 font-mono text-xs text-status-error">
            {error}
          </div>
        )}

        {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restore} onDiscard={kept.discard} className="mb-minor" />}

        <div className="space-y-minor-2">
          <Group title="Header">
            <TextField id="title" label="Title" value={form.title} onChange={(title) => set({ title })} />
            <ProseField id="summary" label="Summary" value={form.summary} onChange={(summary) => set({ summary })} />
            <div className="grid gap-minor sm:grid-cols-2">
              <TextField id="contact-label" label="Button label" hint="Empty hides the button." value={form.contactLabel} onChange={(contactLabel) => set({ contactLabel })} />
              <TextField id="contact-href" label="Button link" hint="mailto:… or https://…" value={form.contactHref} onChange={(contactHref) => set({ contactHref })} />
            </div>
          </Group>

          <Group title="Mentoring">
            <TextField id="mentoring-heading" label="Heading" value={m.heading} onChange={(heading) => setMentoring({ heading })} />
            <ProseField id="mentoring-intro" label="Intro" value={m.intro} onChange={(intro) => setMentoring({ intro })} />
            <div className="grid gap-minor sm:grid-cols-2">
              <TextField id="booking-label" label="Booking button label" hint="Empty hides the button." value={m.bookingLabel} onChange={(bookingLabel) => setMentoring({ bookingLabel })} />
              <TextField id="booking-href" label="Booking link" type="url" value={m.bookingHref} onChange={(bookingHref) => setMentoring({ bookingHref })} />
            </div>
            <ProseField id="booking-note" label="Note under the button" value={m.bookingNote} onChange={(bookingNote) => setMentoring({ bookingNote })} />
            <ProseField id="pitch" label="Pitch" hint="The large serif line. Same markup as the others." value={m.pitch} onChange={(pitch) => setMentoring({ pitch })} />
            <ListEditor label="Paragraphs" hint={RICH_HINT} items={m.body} addLabel="Add paragraph" onChange={(body) => setMentoring({ body })} />
            <TextField id="topics-heading" label="Topics heading" value={m.topicsHeading} onChange={(topicsHeading) => setMentoring({ topicsHeading })} />
            <ListEditor label="Topics" hint="The two-column list. An empty list hides it and its heading." items={m.topics} addLabel="Add topic" onChange={(topics) => setMentoring({ topics })} />
            <ProseField id="history" label="Closing note" value={m.history} onChange={(history) => setMentoring({ history })} />
          </Group>

          <Group title="Speaking">
            <TextField id="speaking-heading" label="Heading" value={form.speaking.heading} onChange={(heading) => setSpeaking({ heading })} />
            <ProseField id="speaking-intro" label="Intro" value={form.speaking.intro} onChange={(intro) => setSpeaking({ intro })} />
            <RowsEditor
              label="Talks"
              noun="Talk"
              hint="Newest first. A talk needs a title and a link; the page shows the year."
              rows={form.speaking.talks}
              fields={TALK_FIELDS}
              blank={BLANK_TALK}
              addLabel="Add talk"
              onChange={setTalks}
            />
          </Group>

          <Group title="Events">
            <TextField id="events-heading" label="Heading" value={form.events.heading} onChange={(heading) => setEvents({ heading })} />
            <ProseField id="events-intro" label="Intro" value={form.events.intro} onChange={(intro) => setEvents({ intro })} />
            <RowsEditor
              label="Groups"
              noun="Group"
              hint="A group needs a name and a link."
              rows={form.events.groups}
              fields={GROUP_FIELDS}
              blank={BLANK_GROUP}
              addLabel="Add group"
              onChange={setGroups}
            />
          </Group>
        </div>
      </div>

      {/* Preview — the page's own component, fed the unsaved form */}
      {Preview && (
        <section aria-label="Preview" className="mt-minor-2">
          <span className={`${labelClass} max-w-3xl mx-auto`}>Preview{dirty ? ' · unsaved' : ''}</span>
          <div className="rounded-md border border-foreground-muted/20 overflow-hidden">
            <Preview content={visibleCommunity(form)} />
          </div>
        </section>
      )}

      {/* Actions — pinned, so Save is in reach from anywhere in a long form */}
      <AdminSaveBar status={status} dirty={dirty}>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          aria-keyshortcuts="Meta+S Control+S"
          className="px-5 py-2.5 rounded-md bg-foreground text-background font-mono text-xs uppercase tracking-wider font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={saving || !customized}
          title={customized ? undefined : 'Already showing the original words'}
          className="px-5 py-2.5 rounded-md border border-foreground-muted/30 font-mono text-xs uppercase tracking-wider text-foreground hover:border-foreground-muted disabled:opacity-40 transition-colors"
        >
          Reset to defaults
        </button>
        <button
          type="button"
          onClick={() => setForm(defaults)}
          className="font-mono text-xs uppercase tracking-wider text-foreground-muted hover:text-foreground transition-colors"
        >
          Load defaults into the form
        </button>
      </AdminSaveBar>
    </div>
  );
}

export default CommunityScreen;
