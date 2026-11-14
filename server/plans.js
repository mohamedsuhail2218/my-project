// Server-owned plan catalogue. Seat counts are derived from the plan, never from
// client-supplied workspace JSON.
export const PLAN_SEATS = {
  Starter: 3,
  Professional: 10,
  Enterprise: 9999,
};

export const PLAN_NAMES = Object.keys(PLAN_SEATS);
