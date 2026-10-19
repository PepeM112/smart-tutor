import { describe, expect, it } from 'vitest';

import { NotificationType, SpaceItemKind, SpaceKind, type NotificationRead } from '@/client';

import { renderNotification } from './renderers';

const ID = '01JAAAAAAAAAAAAAAAAAAAAAAA';

function make(type: NotificationType, payload: NotificationRead['payload']): NotificationRead {
  return {
    id: 'n1',
    type,
    spaceId: ID,
    actorId: null,
    payload,
    readAt: null,
    createdAt: new Date('2026-05-01T10:00:00Z'),
  };
}

describe('renderNotification', () => {
  it('renders an invitation with a link to the space page (Accept / Decline are there)', () => {
    const result = renderNotification(
      make(NotificationType.INVITE_RECEIVED, {
        kind: 'invite_received',
        spaceId: ID,
        spaceTitle: 'Biology 101',
        spaceKind: SpaceKind.CLASSROOM,
        actorName: 'Ms Rivera',
      })
    );
    expect(result.textKey).toBe('types.invite_received');
    expect(result.params).toEqual({ actor: 'Ms Rivera', space: 'Biology 101' });
    expect(result.href).toBe(`/classrooms/biology-101-${ID}`);
  });

  it('sends an invitation to a course to the course page', () => {
    const result = renderNotification(
      make(NotificationType.INVITE_RECEIVED, {
        kind: 'invite_received',
        spaceId: ID,
        spaceTitle: 'Intro',
        spaceKind: SpaceKind.COURSE,
        actorName: 'Ana',
      })
    );
    expect(result.href).toBe(`/courses/intro-${ID}`);
  });

  it('opens the Members tab for a join request', () => {
    const result = renderNotification(
      make(NotificationType.JOIN_REQUESTED, {
        kind: 'join_requested',
        spaceId: ID,
        spaceTitle: 'Biology 101',
        spaceKind: SpaceKind.CLASSROOM,
        actorName: 'Leo',
      })
    );
    expect(result.textKey).toBe('types.join_requested');
    expect(result.href).toBe(`/classrooms/biology-101-${ID}?tab=members`);
  });

  it('renders an approved request', () => {
    const result = renderNotification(
      make(NotificationType.REQUEST_APPROVED, {
        kind: 'request_approved',
        spaceId: ID,
        spaceTitle: 'Intro',
        spaceKind: SpaceKind.COURSE,
      })
    );
    expect(result.textKey).toBe('types.request_approved');
    expect(result.href).toBe(`/courses/intro-${ID}`);
  });

  it('links published content of a classroom course to the classroom', () => {
    const result = renderNotification(
      make(NotificationType.CONTENT_PUBLISHED, {
        kind: 'content_published',
        spaceId: 'course-id',
        spaceTitle: 'Cells',
        classroomId: ID,
        classroomTitle: 'Biology 101',
      })
    );
    expect(result.textKey).toBe('types.content_published_classroom');
    expect(result.params).toEqual({ space: 'Cells', classroom: 'Biology 101' });
    expect(result.href).toBe(`/classrooms/biology-101-${ID}`);
  });

  it('names the classroom once when the classroom itself was published', () => {
    const result = renderNotification(
      make(NotificationType.CONTENT_PUBLISHED, {
        kind: 'content_published',
        spaceId: ID,
        spaceTitle: 'Biology 101',
        classroomId: ID,
        classroomTitle: 'Biology 101',
      })
    );
    expect(result.textKey).toBe('types.content_published');
    expect(result.params).toEqual({ space: 'Biology 101' });
    expect(result.href).toBe(`/classrooms/biology-101-${ID}`);
  });

  it('links published content of a standalone course to the course', () => {
    const result = renderNotification(
      make(NotificationType.CONTENT_PUBLISHED, { kind: 'content_published', spaceId: ID, spaceTitle: 'Intro' })
    );
    expect(result.textKey).toBe('types.content_published');
    expect(result.href).toBe(`/courses/intro-${ID}`);
  });

  it('opens the Stream tab for a post and for a comment', () => {
    const post = renderNotification(
      make(NotificationType.POST_CREATED, {
        kind: 'post_created',
        spaceId: ID,
        spaceTitle: 'Biology 101',
        postId: 'p1',
        excerpt: 'Hello',
        actorName: 'Ms Rivera',
      })
    );
    const comment = renderNotification(
      make(NotificationType.COMMENT_CREATED, {
        kind: 'comment_created',
        spaceId: ID,
        spaceTitle: 'Biology 101',
        postId: 'p1',
        commentId: 'c1',
        excerpt: 'Thanks',
        actorName: 'Leo',
      })
    );
    expect(post.textKey).toBe('types.post_created');
    expect(post.params).toEqual({ actor: 'Ms Rivera', space: 'Biology 101', excerpt: 'Hello' });
    expect(post.href).toBe(`/classrooms/biology-101-${ID}?tab=stream`);
    expect(comment.textKey).toBe('types.comment_created');
    expect(comment.href).toBe(`/classrooms/biology-101-${ID}?tab=stream`);
  });

  describe('due soon', () => {
    const COURSE_ID = '01JBBBBBBBBBBBBBBBBBBBBBBB';
    const dueAt = new Date('2026-05-02T10:00:00Z');
    const due = (itemKind: SpaceItemKind, spaceId: string, spaceTitle: string): NotificationRead =>
      make(NotificationType.DUE_SOON, {
        kind: 'due_soon',
        itemId: 'item1',
        itemTitle: 'Cell quiz',
        itemKind,
        spaceId,
        spaceTitle,
        classroomId: ID,
        dueAt,
      });

    it('renders the text and the params', () => {
      const result = renderNotification(due(SpaceItemKind.TEST, ID, 'Biology 101'));
      expect(result.textKey).toBe('types.due_soon');
      expect(result.params).toEqual({ item: 'Cell quiz', space: 'Biology 101', dueAt });
    });

    it('selects a note that sits in the classroom itself', () => {
      const result = renderNotification(due(SpaceItemKind.NOTE, ID, 'Biology 101'));
      expect(result.href).toBe(`/classrooms/biology-101-${ID}?item=item1`);
    });

    it('opens the attempt page for a test that sits in the classroom itself', () => {
      const result = renderNotification(due(SpaceItemKind.TEST, ID, 'Biology 101'));
      expect(result.href).toBe(`/courses/biology-101-${ID}/tests/item1`);
    });

    it('selects a note of a course in the course page', () => {
      const result = renderNotification(due(SpaceItemKind.NOTE, COURSE_ID, 'Cell Lab'));
      expect(result.href).toBe(`/courses/cell-lab-${COURSE_ID}?item=item1`);
    });

    it('opens the attempt page for a test of a course', () => {
      const result = renderNotification(due(SpaceItemKind.TEST, COURSE_ID, 'Cell Lab'));
      expect(result.href).toBe(`/courses/cell-lab-${COURSE_ID}/tests/item1`);
    });
  });

  it('turns a dueAt string from the API into a Date', () => {
    const result = renderNotification(
      make(NotificationType.DUE_SOON, {
        kind: 'due_soon',
        itemId: 'item1',
        itemTitle: 'Cell quiz',
        itemKind: SpaceItemKind.TEST,
        spaceId: ID,
        spaceTitle: 'Biology 101',
        classroomId: ID,
        dueAt: '2026-05-02T10:00:00Z' as unknown as Date,
      })
    );
    expect(result.params.dueAt).toEqual(new Date('2026-05-02T10:00:00Z'));
  });

  it('links an overridden grade to the result', () => {
    const result = renderNotification(
      make(NotificationType.GRADE_OVERRIDDEN, {
        kind: 'grade_overridden',
        resultId: 'r1',
        itemTitle: 'Cell quiz',
        spaceId: ID,
        spaceTitle: 'Biology 101',
        score: 3,
        points: 5,
        actorName: 'Ms Rivera',
      })
    );
    expect(result.textKey).toBe('types.grade_overridden');
    expect(result.params).toMatchObject({ item: 'Cell quiz', score: 3, points: 5 });
    expect(result.href).toBe('/history/r1');
  });

  it('falls back to a generic text that opens the notifications page for an unknown kind', () => {
    const unknown = make(NotificationType.POST_CREATED, {
      kind: 'brand_new_kind',
    } as unknown as NotificationRead['payload']);
    const result = renderNotification(unknown);
    expect(result.textKey).toBe('types.unknown');
    expect(result.href).toBe('/notifications');
    expect(result.icon).toBeDefined();
  });
});
