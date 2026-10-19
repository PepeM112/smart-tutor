// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BodyForm } from './BodyForm';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof BodyForm>> = {}) {
  const onSubmit = vi.fn();
  render(
    <BodyForm maxLength={50} label="Write" submitLabel="Send" isSubmitting={false} onSubmit={onSubmit} {...props} />
  );
  return {
    onSubmit,
    field: screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Write' }),
    submit: screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }),
  };
}

describe('BodyForm', () => {
  it('disables Send while the text is empty or only spaces', () => {
    const { field, submit } = setup();
    expect(submit.disabled).toBe(true);

    fireEvent.change(field, { target: { value: '   ' } });
    expect(submit.disabled).toBe(true);
  });

  it('sends the trimmed text', () => {
    const { field, submit, onSubmit } = setup();
    fireEvent.change(field, { target: { value: '  Hello class  ' } });
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith('Hello class', expect.any(Function));
  });

  it('clears the field when the caller runs the done callback', () => {
    const { field, submit, onSubmit } = setup();
    fireEvent.change(field, { target: { value: 'Hello' } });
    fireEvent.click(submit);

    // The caller runs it after the write worked.
    act(() => (onSubmit.mock.calls[0][1] as () => void)());
    expect(field.value).toBe('');
  });

  it('keeps Send disabled when an edit has not changed the text', () => {
    const { field, submit } = setup({ initialValue: 'Same', onCancel: vi.fn() });
    expect(submit.disabled).toBe(true);

    fireEvent.change(field, { target: { value: 'Other' } });
    expect(submit.disabled).toBe(false);
  });

  it('sends with Ctrl+Enter', () => {
    const { field, onSubmit } = setup();
    fireEvent.change(field, { target: { value: 'Quick' } });
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });

    expect(onSubmit).toHaveBeenCalledWith('Quick', expect.any(Function));
  });

  it('shows Cancel only for an edit form', () => {
    const onCancel = vi.fn();
    setup({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
