import { BookOpen, Clock, GraduationCap, Mail, MessageCircle, MessageSquare, UserCheck, UserPlus } from 'lucide-react';

import { type NotificationRead } from '@/client';
import { spaceHref } from '@/features/courses/lib/spaceHref';
import { classroomHref, classroomItemHref, courseHref, Routes } from '@/lib/routes';

import type { LucideIcon } from 'lucide-react';

type Payload = NotificationRead['payload'];

/** The ICU values a notification text may use. */
export type NotificationParams = Record<string, string | number | Date>;

export type RenderedNotification = {
  /** Key of the text, in the `notifications` namespace (e.g. `types.post_created`). */
  textKey: string;
  params: NotificationParams;
  /** The page that a click opens. */
  href: string;
  icon: LucideIcon;
};

/** Query param of a space page that opens one tab (`useUrlTab`). */
const tabHref = (href: string, tab: string): string => `${href}?tab=${tab}`;

function assertNever(value: never): never {
  throw new Error(`Unhandled notification payload: ${JSON.stringify(value)}`);
}

/**
 * Turns a notification into its text key, params, target page and icon. The payload keeps the titles and
 * ids from the time of the event, so no extra request is needed. The `switch` is exhaustive on the payload
 * `kind`: the backend ties each `NotificationType` to one `kind`, so a new type fails the type check here
 * until it has a renderer.
 */
export function renderNotification(notification: NotificationRead): RenderedNotification {
  const payload: Payload = notification.payload;

  switch (payload.kind) {
    case 'invite_received':
      return {
        textKey: 'types.invite_received',
        params: { actor: payload.actorName, space: payload.spaceTitle },
        // The space page has the Accept / Decline buttons for an invited user.
        href: spaceHref({ id: payload.spaceId, title: payload.spaceTitle, kind: payload.spaceKind }),
        icon: Mail,
      };
    case 'join_requested':
      return {
        textKey: 'types.join_requested',
        params: { actor: payload.actorName, space: payload.spaceTitle },
        href: tabHref(
          spaceHref({ id: payload.spaceId, title: payload.spaceTitle, kind: payload.spaceKind }),
          'members'
        ),
        icon: UserPlus,
      };
    case 'request_approved':
      return {
        textKey: 'types.request_approved',
        params: { space: payload.spaceTitle },
        href: spaceHref({ id: payload.spaceId, title: payload.spaceTitle, kind: payload.spaceKind }),
        icon: UserCheck,
      };
    case 'content_published':
      // A publish of the classroom itself has the classroom as `space`: the text names it once, not "X (X)".
      if (payload.classroomId && payload.classroomId !== payload.spaceId) {
        return {
          textKey: 'types.content_published_classroom',
          params: { space: payload.spaceTitle, classroom: payload.classroomTitle ?? '' },
          href: classroomHref({ id: payload.classroomId, title: payload.classroomTitle ?? '' }),
          icon: BookOpen,
        };
      }
      return {
        textKey: 'types.content_published',
        params: { space: payload.spaceTitle },
        href: payload.classroomId
          ? classroomHref({ id: payload.classroomId, title: payload.classroomTitle ?? payload.spaceTitle })
          : courseHref({ id: payload.spaceId, title: payload.spaceTitle }),
        icon: BookOpen,
      };
    case 'post_created':
      return {
        textKey: 'types.post_created',
        params: { actor: payload.actorName, space: payload.spaceTitle, excerpt: payload.excerpt },
        href: tabHref(classroomHref({ id: payload.spaceId, title: payload.spaceTitle }), 'stream'),
        icon: MessageSquare,
      };
    case 'comment_created':
      return {
        textKey: 'types.comment_created',
        params: { actor: payload.actorName, space: payload.spaceTitle, excerpt: payload.excerpt },
        href: tabHref(classroomHref({ id: payload.spaceId, title: payload.spaceTitle }), 'stream'),
        icon: MessageCircle,
      };
    case 'due_soon':
      // The generated transformer does not reach the payload union, so `dueAt` is an ISO string at run time.
      return {
        textKey: 'types.due_soon',
        params: { item: payload.itemTitle, space: payload.spaceTitle, dueAt: new Date(payload.dueAt) },
        href: classroomItemHref({ id: payload.classroomId, title: payload.spaceTitle }, payload.itemId),
        icon: Clock,
      };
    case 'grade_overridden':
      return {
        textKey: 'types.grade_overridden',
        params: {
          actor: payload.actorName,
          item: payload.itemTitle,
          space: payload.spaceTitle,
          score: payload.score,
          points: payload.points,
        },
        href: Routes.RESULT_DETAIL(payload.resultId),
        icon: GraduationCap,
      };
    default:
      return assertNever(payload);
  }
}
