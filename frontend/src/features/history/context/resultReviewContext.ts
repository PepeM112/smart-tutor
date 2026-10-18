import { createContext, useContext } from 'react';

/** What the result view needs to know about who is looking. */
export type ResultReview = {
  /** The viewer is a teacher of the classroom of this result: they can override grades. */
  canOverride: boolean;
  /** The id of the result in view (the override call updates its cache). */
  resultId: string;
  /** The result is of a course or classroom test. The Class key may pay for AI there, so own keys are not required. */
  isSpaceResult: boolean;
};

export const ResultReviewContext = createContext<ResultReview>({
  canOverride: false,
  resultId: '',
  isSpaceResult: false,
});

export function useResultReview(): ResultReview {
  return useContext(ResultReviewContext);
}
