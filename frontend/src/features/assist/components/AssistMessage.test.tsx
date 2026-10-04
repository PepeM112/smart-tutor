// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionCard, ToolResultRow } from './AssistMessage';

import type { ReactNode } from 'react';

const KNOWN_LABELS = vi.hoisted(() => [
  'test_generation.difficulty_hard',
  'questions.type_simple',
  'questions.type_multiple_choice',
  'notes_ai.length_short',
]);

// The mock translator returns the key. Without a namespace it adds a "root:" prefix.
// `has` is true only for the labels in KNOWN_LABELS (the tool labels are not translated here).
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) =>
    Object.assign((key: string) => (namespace ? key : `root:${key}`), {
      has: (key: string) => KNOWN_LABELS.includes(key),
    }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

describe('ToolResultRow', () => {
  it('renders the markdown of a write tool output as HTML', () => {
    const output = 'Folder created successfully!\n\n- **Name:** Hello World\n- **ID:** `abc`';
    const { container } = render(<ToolResultRow name="create_folder" output={output} />);

    expect(container.querySelector('strong')?.textContent).toBe('Name:');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('code')?.textContent).toBe('abc');
    // The raw markdown markers must not show.
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('renders nothing for a read tool', () => {
    const { container } = render(<ToolResultRow name="list_tests" output="- **a**" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('ActionCard enum values', () => {
  const renderCard = (summary: { key: string; value: string }[]) =>
    render(
      <ActionCard
        id="c1"
        name="create_test"
        arguments={{}}
        context={{ summary }}
        status="pending"
        onConfirm={() => undefined}
        disabled={false}
      />
    );

  it('translates the difficulty and the question types of a create_test card', () => {
    renderCard([
      { key: 'note', value: 'My note' },
      { key: 'difficulty', value: 'hard' },
      { key: 'question_types', value: 'SIMPLE,MULTIPLE_CHOICE' },
      { key: 'question_count', value: '10' },
    ]);

    expect(screen.getByText('root:test_generation.difficulty_hard')).toBeTruthy();
    expect(screen.getByText('root:questions.type_simple, root:questions.type_multiple_choice')).toBeTruthy();
    // Other rows stay as they are.
    expect(screen.getByText('My note')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('translates the length of a create_note card', () => {
    renderCard([{ key: 'length', value: 'short' }]);
    expect(screen.getByText('root:notes_ai.length_short')).toBeTruthy();
  });

  it('translates only the root segment of a location path', () => {
    // A user folder named "Files" deeper in the path is data, so it stays as it is.
    renderCard([
      { key: 'folder', value: 'Files' },
      { key: 'destination', value: 'Files > Biology > Files' },
    ]);
    expect(screen.getByText('root:files.title')).toBeTruthy();
    expect(screen.getByText('root:files.title > Biology > Files')).toBeTruthy();
  });

  it('shows a raw value that has no label', () => {
    renderCard([{ key: 'difficulty', value: 'extreme' }]);
    expect(screen.getByText('extreme')).toBeTruthy();
  });
});
