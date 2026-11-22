import { describe, expect, it } from 'vitest';

import { feedErrorKey } from './feedErrors';

describe('feedErrorKey', () => {
  it.each([
    ['feed_teacher_only_post', 'feed.error_teacher_only_post'],
    ['feed_teacher_only_comment', 'feed.error_teacher_only_comment'],
    ['feed_author_only_edit', 'feed.error_author_only_edit'],
    ['space_archived', 'feed.error_archived'],
    ['feed_post_not_found', 'feed.error_post_not_found'],
    ['feed_comment_not_found', 'feed.error_comment_not_found'],
  ])('maps the code %s to %s', (code, key) => {
    expect(feedErrorKey({ detail: 'Any text', code })).toBe(key);
  });

  it('gives null for an unknown code or a missing body', () => {
    expect(feedErrorKey({ code: 'a_new_code' })).toBeNull();
    expect(feedErrorKey({ detail: 'Post not found' })).toBeNull();
    expect(feedErrorKey(undefined)).toBeNull();
  });

  it('does not match a name of Object.prototype', () => {
    expect(feedErrorKey({ code: 'constructor' })).toBeNull();
  });
});
