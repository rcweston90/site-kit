'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminConfig } from '../config.js';

/**
 * The session, through story-server's `session` route: `GET` says whether this
 * browser is signed in, `POST {passcode}` signs in, `DELETE` signs out (see
 * `createPasscodeAuth`).
 */
export function useAdminAuth(sessionUrl?: string) {
  const config = useAdminConfig();
  const url = sessionUrl ?? `${config.storyApi}/session`;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const checkAuth = useCallback(
    () =>
      fetch(url, { credentials: 'same-origin' })
        .then((response) => response.json())
        .then((data: { authenticated?: boolean }) => setIsAuthenticated(data.authenticated === true))
        .catch(() => setIsAuthenticated(false))
        .finally(() => setIsChecking(false)),
    [url],
  );

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const authenticate = async (passcode: string): Promise<boolean> => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; role?: string; error?: string };
      if (response.ok && data.ok && data.role === 'admin') {
        setIsAuthenticated(true);
        return true;
      }
      if (response.status === 429) throw new Error(data.error || 'Too many attempts');
      if (response.status >= 500) throw new Error('Server error — try again later');
      return false;
    } catch (error) {
      if (error instanceof Error) throw error;
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
    } finally {
      setIsAuthenticated(false);
    }
  };

  return { isAuthenticated, isChecking, authenticate, logout };
}
