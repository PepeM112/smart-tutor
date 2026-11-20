// @vitest-environment jsdom

import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type FileTreeFolder, type FileTreeNote } from '@/client';

import { FilesTreeContext, type FilesTreeContextValue } from '../context/FilesTreeContext';
import { buildChildrenIndex } from '../lib/fileTree';

import { FolderTreeRow, NoteTreeRow } from './FileTreeRow';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./MoveDialog', () => ({ MoveDialog: () => null }));

afterEach(cleanup);

const NOW = new Date('2026-01-01T00:00:00Z');
const folder: FileTreeFolder = { id: 'f1', name: 'Folder', parentId: null, updatedAt: NOW };
const emptyFolder: FileTreeFolder = { id: 'f2', name: 'Empty', parentId: null, updatedAt: NOW };
const note: FileTreeNote = {
  id: 'n1',
  title: 'Note',
  folderId: 'f1',
  updatedAt: NOW,
  isFavorite: false,
  favoritedAt: null,
};

const renderRow = (row: ReactNode, onPreview = vi.fn()) => {
  const folders = [folder, emptyFolder];
  const value: FilesTreeContextValue = {
    isExpanded: () => false,
    isVisible: () => true,
    onToggleExpand: vi.fn(),
    childrenIndex: buildChildrenIndex({ folders, notes: [note] }),
    folders,
    onPreview,
    previewId: null,
    // SAFETY: the rows call a mutation only on a menu action, and these tests click none.
    mutations: {} as FilesTreeContextValue['mutations'],
    isDesktop: false,
  };

  render(
    <QueryClientProvider client={new QueryClient()}>
      <DndContext>
        <FilesTreeContext.Provider value={value}>{row}</FilesTreeContext.Provider>
      </DndContext>
    </QueryClientProvider>
  );
  return onPreview;
};

describe('NoteTreeRow', () => {
  it('has no expand chevron', () => {
    renderRow(<NoteTreeRow note={note} depth={0} />);

    expect(screen.queryByRole('button', { name: /^files\.(expand|collapse)/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /preview_for/ })).toBeNull();
  });

  it('opens the right panel from the Eye button', () => {
    const onPreview = renderRow(<NoteTreeRow note={note} depth={0} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.preview' }));

    expect(onPreview).toHaveBeenCalledWith('n1');
  });
});

describe('FolderTreeRow', () => {
  it('shows the chevron only when the folder has children', () => {
    renderRow(
      <>
        <FolderTreeRow folder={folder} depth={0} />
        <FolderTreeRow folder={emptyFolder} depth={0} />
      </>
    );

    expect(screen.getAllByRole('button', { name: 'files.expand_folder' })).toHaveLength(1);
  });

  it('has no Eye button', () => {
    renderRow(<FolderTreeRow folder={folder} depth={0} />);

    expect(screen.queryByRole('button', { name: 'common.preview' })).toBeNull();
  });
});
