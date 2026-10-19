import { describe, expect, it } from 'vitest';

import { feedErrorKey } from './feedErrors';

describe('feedErrorKey', () => {
  it.each([
    ['Only the teacher can post in this classroom', 'feed.error_teacher_only_post'],
    ['Only the teacher can comment in this classroom', 'feed.error_teacher_only_comment'],
    ['Only the author can edit this post', 'feed.error_author_only_edit'],
    ['Only the author can edit this comment', 'feed.error_author_only_edit'],
    ['The classroom is archived', 'feed.error_archived'],
    ['Post not found', 'feed.error_post_not_found'],
    ['Comment not found', 'feed.error_comment_not_found'],
  ])('maps "%s" to %s', (detail, key) => {
    expect(feedErrorKey(detail)).toBe(key);
  });

  it('gives null for an unknown or a missing detail', () => {
    expect(feedErrorKey('Something new')).toBeNull();
    expect(feedErrorKey(undefined)).toBeNull();
    expect(feedErrorKey('')).toBeNull();
  });

  it('does not match a name of Object.prototype', () => {
    expect(feedErrorKey('constructor')).toBeNull();
  });
});
