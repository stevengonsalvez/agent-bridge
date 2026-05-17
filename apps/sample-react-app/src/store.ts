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

const STORAGE_KEY = 'debug-bridge-demo-store';

function loadPersistedState(): Pick<Store, 'auth' | 'cart'> {
  if (typeof window === 'undefined') {
    return { auth: { isLoggedIn: false, email: null }, cart: { items: [] } };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { auth: { isLoggedIn: false, email: null }, cart: { items: [] } };
    const parsed = JSON.parse(raw) as Pick<Store, 'auth' | 'cart'>;
    return {
      auth: parsed.auth ?? { isLoggedIn: false, email: null },
      cart: parsed.cart ?? { items: [] },
    };
  } catch {
    return { auth: { isLoggedIn: false, email: null }, cart: { items: [] } };
  }
}

function persistState(auth: Store['auth'], cart: Store['cart']): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth, cart }));
}

const initialState = loadPersistedState();

export const useStore = create<Store>((set) => ({
  auth: initialState.auth,
  cart: initialState.cart,
  login: (email) =>
    set((s) => {
      const auth = { isLoggedIn: true, email };
      persistState(auth, s.cart);
      return { auth };
    }),
  logout: () =>
    set((s) => {
      const auth = { isLoggedIn: false, email: null };
      persistState(auth, s.cart);
      return { auth };
    }),
  addToCart: (item) =>
    set((s) => {
      const existing = s.cart.items.find((i) => i.id === item.id);
      if (existing) {
        const cart = {
          items: s.cart.items.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i)),
        };
        persistState(s.auth, cart);
        return {
          cart,
        };
      }
      const cart = { items: [...s.cart.items, { ...item, qty: 1 }] };
      persistState(s.auth, cart);
      return { cart };
    }),
  removeFromCart: (id) =>
    set((s) => {
      const cart = { items: s.cart.items.filter((i) => i.id !== id) };
      persistState(s.auth, cart);
      return { cart };
    }),
  clearCart: () =>
    set((s) => {
      const cart = { items: [] };
      persistState(s.auth, cart);
      return { cart };
    }),
}));
