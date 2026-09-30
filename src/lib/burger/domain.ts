import { z } from "zod";

export const accounts = [
  { id: "customer-alex", name: "Alex Morgan", role: "customer" },
  { id: "customer-jamie", name: "Jamie Lee", role: "customer" },
  { id: "manager-sam", name: "Sam Rivera", role: "manager" },
  { id: "owner-robin", name: "Robin Brooks", role: "owner" },
] as const;
export type Account = typeof accounts[number];
export const categories = ["Burgers", "Sides", "Drinks"] as const;
export const imageSchema = z.string().max(2000).refine(value => value === "" || /^https:\/\//i.test(value) || /^\/[^/]/.test(value), "Use an HTTPS image URL or a local image path.");
export const itemSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400), image: imageSchema,
  category: z.enum(categories), price: z.number().int().min(0).max(1000000), available: z.boolean(),
});
export type MenuItem = z.infer<typeof itemSchema>;
export const lineSchema = z.object({ itemId: z.string(), quantity: z.number().int().min(1).max(99), price: z.number().int().min(0).max(1000000) });
export type CartLine = z.infer<typeof lineSchema>;
export const orderSchema = z.object({
  id: z.string(), customerId: z.string().refine(id => accounts.some(a => a.id === id && a.role === "customer")),
  createdAt: z.string().datetime(), total: z.number().int().min(0),
  lines: z.array(z.object({ name: z.string(), quantity: z.number().int().min(1).max(99), price: z.number().int().min(0) })).min(1),
}).refine(order => order.total === order.lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
export type Order = z.infer<typeof orderSchema>;
export const stateSchema = z.object({ version: z.literal(1), menu: z.array(itemSchema).min(1).refine(items => new Set(items.map(i => i.id)).size === items.length), cart: z.array(lineSchema).refine(lines => new Set(lines.map(i => i.itemId)).size === lines.length), orders: z.array(orderSchema), accountId: z.string().nullable().refine(id => id === null || accounts.some(a => a.id === id)), checkoutToken: z.string().min(1), nextOrder: z.number().int().positive() });
export type ShopState = z.infer<typeof stateSchema>;
export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export const burgerImage = "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85";
export const seedMenu: MenuItem[] = [
  { id: "classic", name: "The House Classic", description: "Smash-seared beef, aged cheddar, crisp lettuce, and our not-so-secret house sauce.", category: "Burgers", price: 1090, available: true, image: burgerImage },
  { id: "smoky", name: "Smoky Double", description: "Two juicy patties, smoked bacon, caramelized onions, and a generous drizzle of BBQ.", category: "Burgers", price: 1490, available: true, image: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=85" },
  { id: "garden", name: "Garden Party", description: "Our chickpea patty, avocado, pickled onion, and fresh herb mayo. All plants, all flavor.", category: "Burgers", price: 1190, available: true, image: "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=900&q=85" },
  { id: "fries", name: "Golden Fries", description: "Crispy, fluffy, sea-salted. The perfect plus-one.", category: "Sides", price: 450, available: true, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=85" },
  { id: "shake", name: "Vanilla Cloud", description: "Real vanilla ice cream, whipped cream, and a little nostalgia.", category: "Drinks", price: 650, available: true, image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85" },
  { id: "special", name: "Weekend Special", description: "A rotating chef's creation. Back on the grill soon.", category: "Burgers", price: 1390, available: false, image: burgerImage },
];
export const freshState = (): ShopState => ({ version: 1, menu: seedMenu.map(item => ({ ...item })), cart: [], orders: [], accountId: null, checkoutToken: crypto.randomUUID(), nextOrder: 1 });
export const STORAGE_KEY = "safi-burger-v1";
