'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type MentionCandidate = {
  id: string;
  label: string;
  preview: string;
  content: string;
};

type PageDataContextValue = {
  contextData: string | null;
  setContextData: (data: string | null) => void;
  mentionCandidates: MentionCandidate[];
  setMentionCandidates: (candidates: MentionCandidate[]) => void;
};

const PageDataContext = createContext<PageDataContextValue>({
  contextData: null,
  setContextData: () => {},
  mentionCandidates: [],
  setMentionCandidates: () => {},
});

export function PageDataProvider({ children }: { children: ReactNode }) {
  const [contextData, setContextData] = useState<string | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const value = useMemo(
    () => ({ contextData, setContextData, mentionCandidates, setMentionCandidates }),
    [contextData, mentionCandidates]
  );
  return <PageDataContext.Provider value={value}>{children}</PageDataContext.Provider>;
}

export function usePageData() {
  return useContext(PageDataContext);
}
