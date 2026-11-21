import { useEffect, useRef, useState } from 'react';

import { type UserUpdate } from '@/client';

import { useUpdateUser } from './useUpdateUser';

type AutoSaveField = {
  value: string;
  setValue: (value: string) => void;
  /** Saves the value. Call it on blur and on form submit. */
  save: () => void;
};

/**
 * A text field that saves its own value. The field goes back to `savedValue` when the value is invalid
 * or the save fails, so it never shows something the server does not hold.
 * `buildPatch` returns null for an unchanged or invalid value.
 */
export function useAutoSaveField(savedValue: string, buildPatch: (value: string) => UserUpdate | null): AutoSaveField {
  const [value, setValue] = useState(savedValue);
  const latestSaved = useRef(savedValue);
  // Enter saves and then the blur fires. The user is still the old one until the response, so
  // the patch alone cannot tell that this value is already on its way.
  const lastSubmitted = useRef(savedValue);

  useEffect(() => {
    latestSaved.current = savedValue;
  }, [savedValue]);

  const { mutate: saveUser } = useUpdateUser({
    onError: () => {
      lastSubmitted.current = latestSaved.current;
      setValue(latestSaved.current);
    },
  });

  const save = (): void => {
    const patch = buildPatch(value);
    if (!patch) {
      setValue(savedValue);
      return;
    }
    if (value === lastSubmitted.current) return;
    lastSubmitted.current = value;
    saveUser(patch);
  };

  return { value, setValue, save };
}
