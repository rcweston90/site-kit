'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StoryEditor } from '@rcweston/story-editor';
import { createFetchTransport } from '@rcweston/story-server/client';
import { blocks } from './SignupFunnel';
import { mediaUrl, renderLink } from './links';

function SignInForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="demo-signin"
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch('/api/story/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ passcode }),
        });
        if (response.ok) onSignedIn();
        else setProblem('That passcode didn\'t work. Try again.');
      }}
    >
      <label>
        Passcode
        <input type="password" autoComplete="current-password" value={passcode} onChange={(event) => setPasscode(event.target.value)} />
      </label>
      {problem ? <p role="alert">{problem}</p> : null}
      <button type="submit">Sign in</button>
    </form>
  );
}

export function Editor({ slug, openEditing }: { slug: string; openEditing: boolean }) {
  const router = useRouter();
  const transport = useMemo(() => createFetchTransport({ baseUrl: '/api/story' }), []);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // The theme goes on <html> so the page background follows it, not just
  // the editor's own surfaces.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    return () => { delete root.dataset.theme; };
  }, [theme]);
  return (
    <div>
      <StoryEditor
        slug={slug}
        transport={transport}
        navigate={(href) => router.push(href)}
        routes={{ editor: (s) => `/admin/stories/${s}`, reader: (s) => `/stories/${s}` }}
        backLink={{ href: '/admin', label: 'All stories' }}
        renderLink={renderLink}
        renderSignIn={({ onSignedIn }) => <SignInForm onSignedIn={onSignedIn} />}
        blocks={blocks}
        media={{ mediaUrl }}
        theme={theme}
        onThemeChange={setTheme}
        label={openEditing ? { badge: 'Demo', note: 'Anyone can edit. Saves last until the server restarts.' } : undefined}
      />
    </div>
  );
}
