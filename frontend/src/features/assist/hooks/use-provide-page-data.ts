'use client';

import { useEffect } from 'react';

import { usePageData, type MentionCandidate } from '../context/page-data-context';

/**
 * Call from any page component to provide context data to the AI assistant.
 * Automatically clears the data when the component unmounts (navigation away).
 */
export function useProvidePageData(data: string | null | undefined, mentionCandidates?: MentionCandidate[]) {
  const { setContextData, setMentionCandidates } = usePageData();

  useEffect(() => {
    setContextData(data ?? null);
    return () => setContextData(null);
  }, [data, setContextData]);

  useEffect(() => {
    setMentionCandidates(mentionCandidates ?? []);
    return () => setMentionCandidates([]);
  }, [mentionCandidates, setMentionCandidates]);
}
