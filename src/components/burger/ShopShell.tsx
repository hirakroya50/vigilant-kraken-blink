import { Link, NavLink, Outlet, Navigate } from "react-router-dom";
import { ArrowUpRight, Flame, ShoppingBag, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportError, useShop } from "@/lib/burger/store";
export function ShopShell() {
  const { state, account, reset } = useShop();
  const count = state.cart.reduce((sum, l) => sum + l.quantity, 0);
  return <div className="min-h-screen">
    <div className="bg-foreground px-4 py-2 text-center text-[11px] font-semibold tracking-[.12em] text-background">GOOD FOOD. GOOD MOOD. <span className="mx-3 opacity-60">✦</span> A LOCAL DEMO, MADE WITH LOVE</div>
    <header className="border-b bg-background/95"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-10">
      <Link to="/" className="flex items-center gap-2" aria-label="Bun & Ember home"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"><Flame size={25} /></span><span className="font-display text-2xl font-bold tracking-tight">bun<span className="text-primary">&</span>ember<span className="block font-sans text-[9px] font-semibold uppercase tracking-[.3em]">The neighborhood burger shop</span></span></Link>
      <nav className="order-3 flex w-full justify-center gap-6 text-sm font-semibold md:order-none md:w-auto" aria-label="Main navigation"><NavLink to="/" end className="nav-link">Home</NavLink><NavLink to="/menu" className="nav-link">Our menu</NavLink><NavLink to="/orders" className="nav-link">My orders</NavLink>{account && account.role !== "customer" && <NavLink to="/manage/menu" className="nav-link">Manage menu</NavLink>}</nav>
      <div className="flex items-center gap-3"><Link to="/login" className="flex items-center gap-2 text-sm font-semibold"><UserRound size={18} /><span className="hidden sm:inline">{account ? account.name.split(" ")[0] : "Demo login"}</span></Link><Link to="/cart" className="flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><ShoppingBag size={17} /> Bag <span className="rounded-full bg-white/20 px-2">{count}</span></Link></div>
    </div></header>
    <main><Outlet /></main>
    <footer className="mt-16 border-t bg-secondary"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-6 py-10 md:flex-row md:px-10"><div><p className="font-display text-3xl font-bold">A little messy. A lot delicious.</p><p className="mt-2 text-sm text-muted-foreground">Demo fixture · Browser-only data · No real payments</p></div><div className="flex items-center gap-6"><Link to="/menu" className="flex items-center gap-2 font-semibold">Find your favorite <ArrowUpRight size={17} /></Link><Button variant="outline" className="rounded-full border-foreground/20 bg-transparent text-xs" onClick={() => { if (window.confirm("Reset all demo menu, orders, bag, and account data in this browser?")) { try { reset(); } catch (e) { reportError(e); } } }}>Reset demo</Button></div></div></footer>
  </div>;
}
export function RoleGate({ staff = false, children }: { staff?: boolean; children: React.ReactNode }) {
  const { account } = useShop();
  if (!account) return <Navigate to="/login" replace />;
  if (staff ? account.role === "customer" : account.role !== "customer") return <section className="page-wrap"><h1 className="page-title">This page isn’t for your demo role.</h1><p className="mt-4">{staff ? "Menu management is available to managers and owners." : "Sign in as a demo customer to use this page."}</p><Link to="/login" className="mt-6 inline-block font-semibold text-primary underline">Switch demo account</Link></section>;
  return <>{children}</>;
}
