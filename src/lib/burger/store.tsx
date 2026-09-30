import { createContext, useContext, useRef, useState, ReactNode } from "react";
import { toast } from "sonner";
import { accounts, Account, CartLine, freshState, itemSchema, MenuItem, ShopState, stateSchema, STORAGE_KEY } from "./domain";

function load(): ShopState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch { /* Malformed or inaccessible browser storage recovers to seeds. */ }
  return freshState();
}
type Shop = {
  state: ShopState; account: Account | undefined;
  login: (id: string | null) => void; reset: () => void;
  add: (id: string) => void; quantity: (id: string, value: number) => void;
  saveItem: (item: MenuItem) => void; checkout: (token: string) => string;
  cartIssues: string[]; total: number;
};
const Context = createContext<Shop | null>(null);
export function ShopProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(load);
  const current = useRef(state);
  function commit(next: ShopState) {
    const validated = stateSchema.parse(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(validated)); }
    catch { throw new Error("Browser storage is unavailable or full. Changes were not saved."); }
    current.current = validated;
    setState(validated);
  }
  const account = accounts.find(a => a.id === state.accountId);
  function login(id: string | null) {
    if (id !== null && !accounts.some(a => a.id === id)) throw new Error("Unknown demo account.");
    commit({ ...current.current, accountId: id, cart: [], checkoutToken: crypto.randomUUID() });
  }
  function quantity(id: string, value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 99) throw new Error("Quantity must be between 0 and 99.");
    const s = current.current;
    commit({ ...s, cart: s.cart.flatMap(line => line.itemId === id ? value === 0 ? [] : [{ ...line, quantity: value }] : [line]), checkoutToken: crypto.randomUUID() });
  }
  function add(id: string) {
    const s = current.current;
    const item = s.menu.find(i => i.id === id);
    if (!item?.available) throw new Error("This item is currently unavailable.");
    const line = s.cart.find(l => l.itemId === id);
    if (line && line.quantity >= 99) throw new Error("Maximum quantity is 99.");
    const cart: CartLine[] = line ? s.cart.map(l => l.itemId === id ? { ...l, quantity: l.quantity + 1, price: item.price } : l) : [...s.cart, { itemId: id, quantity: 1, price: item.price }];
    commit({ ...s, cart, checkoutToken: crypto.randomUUID() });
    toast.success(`${item.name} added to your bag`);
  }
  function saveItem(input: MenuItem) {
    const s = current.current;
    const actor = accounts.find(a => a.id === s.accountId);
    if (!actor || actor.role === "customer") throw new Error("Manager or owner demo account required.");
    const item = itemSchema.parse(input);
    commit({ ...s, menu: s.menu.some(i => i.id === item.id) ? s.menu.map(i => i.id === item.id ? item : i) : [...s.menu, item] });
  }
  function checkout(token: string): string {
    const s = current.current;
    const actor = accounts.find(a => a.id === s.accountId);
    if (actor?.role !== "customer") throw new Error("Sign in as a demo customer to checkout.");
    const existing = s.orders.find(o => o.id === token && o.customerId === actor.id);
    if (existing) return existing.id;
    if (token !== s.checkoutToken || !s.cart.length) throw new Error("Your bag changed. Please review it and try again.");
    const lines = s.cart.map(line => {
      const item = s.menu.find(i => i.id === line.itemId);
      if (!item?.available) throw new Error("An item is no longer available. Remove it from your bag.");
      if (item.price !== line.price) throw new Error("A price changed. Remove and re-add the item to accept the current price.");
      return { name: item.name, quantity: line.quantity, price: item.price };
    });
    commit({ ...s, orders: [{ id: token, customerId: actor.id, createdAt: new Date().toISOString(), lines, total: lines.reduce((sum, l) => sum + l.price * l.quantity, 0) }, ...s.orders], cart: [], checkoutToken: crypto.randomUUID(), nextOrder: s.nextOrder + 1 });
    return token;
  }
  const cartIssues = state.cart.flatMap(line => {
    const item = state.menu.find(i => i.id === line.itemId);
    return !item?.available ? [`${item?.name ?? "An item"} is unavailable. Please remove it.`] : item.price !== line.price ? [`${item.name} has a new price. Remove and re-add it to accept the change.`] : [];
  });
  return <Context.Provider value={{ state, account, login, reset: () => commit(freshState()), add, quantity, saveItem, checkout, cartIssues, total: state.cart.reduce((sum, l) => sum + l.price * l.quantity, 0) }}>{children}</Context.Provider>;
}
export function useShop() { const value = useContext(Context); if (!value) throw new Error("ShopProvider required"); return value; }
export function reportError(error: unknown) { toast.error(error instanceof Error ? error.message : "Something went wrong."); }
