import { create } from 'zustand';

type CartItem = { id: string; name: string; price: number; qty: number };

type Store = {
  auth: { isLoggedIn: boolean; email: string | null };
  cart: { items: CartItem[] };
  login: (email: string) => void;
  logout: () => void;
  addToCart: (item: Omit<CartItem, 'qty'>) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
};

export const useStore = create<Store>((set) => ({
  auth: { isLoggedIn: false, email: null },
  cart: { items: [] },
  login: (email) => set({ auth: { isLoggedIn: true, email } }),
  logout: () => set({ auth: { isLoggedIn: false, email: null } }),
  addToCart: (item) =>
    set((s) => {
      const existing = s.cart.items.find((i) => i.id === item.id);
      if (existing) {
        return {
          cart: {
            items: s.cart.items.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i)),
          },
        };
      }
      return { cart: { items: [...s.cart.items, { ...item, qty: 1 }] } };
    }),
  removeFromCart: (id) => set((s) => ({ cart: { items: s.cart.items.filter((i) => i.id !== id) } })),
  clearCart: () => set({ cart: { items: [] } }),
}));
