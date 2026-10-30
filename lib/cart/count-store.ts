import { createStore } from "zustand/vanilla"

// The header's cart count (docs/specs/025-cart-single-items, Behavior 14, D8):
// the one trigger every cart action and the count route share. null until a
// count has loaded, so the server render and the first client render match.
export type CartCountState = {
  count: number | null
  // Bumped by every action result, so a slow route response can tell it lost
  seq: number
  // An action returned this count: it always wins
  fromAction: (count: number) => void
  // The route returned this count for a request started at `seqAtStart`;
  // dropped when an action finished since
  fromRoute: (count: number, seqAtStart: number) => void
}

export const createCartCountStore = () =>
  createStore<CartCountState>()((set) => ({
    count: null,
    seq: 0,
    fromAction: (count) => set((state) => ({ count, seq: state.seq + 1 })),
    fromRoute: (count, seqAtStart) =>
      set((state) => (state.seq === seqAtStart ? { count } : state)),
  }))

export const cartCountStore = createCartCountStore()
