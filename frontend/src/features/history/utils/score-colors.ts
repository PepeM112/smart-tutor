import { AnswerStatus } from '@/client';

type ScoreTier = 'excellent' | 'good' | 'poor' | 'failing';

const TIERS: { min: number; tier: ScoreTier }[] = [
  { min: 80, tier: 'excellent' },
  { min: 65, tier: 'good' },
  { min: 35, tier: 'poor' },
];

function getScoreTier(pct: number): ScoreTier {
  return TIERS.find(t => pct >= t.min)?.tier ?? 'failing';
}

const TIER_STYLES: Record<ScoreTier, { text: string; ring: string; bg: string; circle: string; badge: string }> = {
  excellent: {
    text: 'text-feedback-correct',
    ring: 'ring-feedback-correct/40',
    bg: 'bg-feedback-correct-bg',
    circle: 'border-feedback-correct bg-feedback-correct/5 text-feedback-correct',
    badge: 'bg-feedback-correct-bg text-feedback-correct',
  },
  good: {
    text: 'text-feedback-partial',
    ring: 'ring-feedback-partial/40',
    bg: 'bg-feedback-partial-bg',
    circle: 'border-feedback-partial bg-feedback-partial/5 text-feedback-partial',
    badge: 'bg-feedback-partial-bg text-feedback-partial',
  },
  poor: {
    text: 'text-destructive',
    ring: 'ring-destructive/40',
    bg: 'bg-feedback-wrong-bg',
    circle: 'border-destructive bg-destructive/5 text-destructive',
    badge: 'bg-feedback-wrong-bg text-destructive',
  },
  failing: {
    text: 'text-foreground',
    ring: 'ring-foreground/10',
    bg: 'bg-foreground/5',
    circle: 'border-foreground/20 bg-foreground/5 text-foreground',
    badge: 'bg-muted text-muted-foreground',
  },
};

export const getScoreTextColor = (pct: number) => TIER_STYLES[getScoreTier(pct)].text;
export const getScoreRingColor = (pct: number) => TIER_STYLES[getScoreTier(pct)].ring;
export const getScoreBgColor = (pct: number) => TIER_STYLES[getScoreTier(pct)].bg;
export const getScoreCircleClasses = (pct: number) => TIER_STYLES[getScoreTier(pct)].circle;
export const getScoreBadgeClasses = (pct: number) => TIER_STYLES[getScoreTier(pct)].badge;
export const getScoreStyles = (pct: number) => TIER_STYLES[getScoreTier(pct)];

type StatusStyle = { text: string; ring: string; bg: string };

const DEFAULT_STATUS_STYLE: StatusStyle = {
  text: 'text-muted-foreground',
  ring: 'ring-foreground/10',
  bg: 'bg-foreground/5',
};

const STATUS_STYLES: Partial<Record<AnswerStatus, StatusStyle>> = {
  [AnswerStatus.CORRECT]: {
    text: 'text-feedback-correct',
    ring: 'ring-feedback-correct/40',
    bg: 'bg-feedback-correct-bg',
  },
  [AnswerStatus.PARTIAL]: {
    text: 'text-feedback-partial',
    ring: 'ring-feedback-partial/40',
    bg: 'bg-feedback-partial-bg',
  },
  [AnswerStatus.WRONG]: {
    text: 'text-destructive',
    ring: 'ring-destructive/40',
    bg: 'bg-feedback-wrong-bg',
  },
  [AnswerStatus.FAILED]: {
    text: 'text-destructive',
    ring: 'ring-destructive/40',
    bg: 'bg-feedback-wrong-bg',
  },
  [AnswerStatus.PENDING]: {
    text: 'text-muted-foreground',
    ring: 'ring-foreground/10',
    bg: 'bg-foreground/5',
  },
};

export const getStatusTextColor = (status: AnswerStatus | null) => (status != null ? STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE : DEFAULT_STATUS_STYLE).text;
export const getStatusRingColor = (status: AnswerStatus | null) => (status != null ? STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE : DEFAULT_STATUS_STYLE).ring;
export const getStatusBgColor = (status: AnswerStatus | null) => (status != null ? STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE : DEFAULT_STATUS_STYLE).bg;
export const getStatusStyles = (status: AnswerStatus | null) => (status != null ? STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE : DEFAULT_STATUS_STYLE);
