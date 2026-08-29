export type FontSizeId = 'small' | 'default' | 'large' | 'extra-large';

export interface FontSizeOption {
  id: FontSizeId;
  label: string;
  value: string;
}

export const DEFAULT_FONT_SIZE_ID: FontSizeId = 'default';
export const FONT_SIZE_STORAGE_KEY = 'smarttutor-font-size';
export const FONT_SIZE_COOKIE = 'smarttutor-font-size';

export const fontSizes: FontSizeOption[] = [
  { id: 'small', label: 'Small', value: '14px' },
  { id: 'default', label: 'Default', value: '16px' },
  { id: 'large', label: 'Large', value: '17.6px' },
  { id: 'extra-large', label: 'Extra Large', value: '20px' },
];

export function getFontSizeValue(id: FontSizeId): string {
  return fontSizes.find(f => f.id === id)?.value ?? '16px';
}
