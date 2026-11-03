import { handleReview } from './reviews.js';

const POLL_MINUTES = 15;

// Poll the client's Google reviews and run each new, unanswered one through the review flow.
export async function pollGoogleReviews(ctx, client) {
  if (!ctx.google || !client.google) return 0;
  const state = ctx.store.getState(client.id);
  if (state.googleLastPoll && ctx.now() - state.googleLastPoll < POLL_MINUTES * 60_000) return 0;

  const reviews = await ctx.google.listReviews(client.google);
  const seen = new Set(state.googleSeen ?? []);
  // First poll only records what already exists, so connecting a business doesn't replay years of reviews.
  const fresh = state.googleSeen ? reviews.filter((r) => !seen.has(r.reviewId) && !r.replied && r.rating) : [];

  ctx.store.updateState(client.id, (s) => ({
    ...s,
    googleLastPoll: ctx.now(),
    googleSeen: [...new Set([...reviews.map((r) => r.reviewId), ...(s.googleSeen ?? [])])].slice(0, 500),
  }));
  for (const review of fresh.reverse()) await handleReview(ctx, client, review);
  return fresh.length;
}
