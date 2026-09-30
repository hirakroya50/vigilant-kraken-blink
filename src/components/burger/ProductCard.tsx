import { Plus, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MenuItem, money } from "@/lib/burger/domain";
import { reportError, useShop } from "@/lib/burger/store";
import { useState } from "react";
export function FoodImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed || !src ? <div role="img" aria-label={alt} className={`flex items-center justify-center bg-secondary ${className}`}><span className="text-6xl" aria-hidden="true">🍔</span></div> : <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />;
}
export function ProductCard({ item }: { item: MenuItem }) {
  const { add } = useShop();
  return <article className="group overflow-hidden rounded-[1.5rem] border bg-card"><div className="relative"><FoodImage src={item.image} alt={item.name + ", freshly prepared"} className="h-60 w-full object-cover" /><span className="absolute left-4 top-4 rounded-full bg-background px-3 py-1 text-[11px] font-bold uppercase tracking-wider">{item.id === "garden" ? <span className="flex items-center gap-1"><Leaf size={12} /> Plant-powered</span> : item.category}</span>{!item.available && <span className="absolute bottom-4 left-4 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">Back soon</span>}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><h3 className="font-display text-2xl font-bold">{item.name}</h3><span className="pt-1 text-sm font-bold text-primary">{money(item.price)}</span></div><p className="mt-2 min-h-16 text-sm leading-relaxed text-muted-foreground">{item.description}</p><Button className="mt-4 w-full rounded-full py-5 font-semibold" disabled={!item.available} onClick={() => { try { add(item.id); } catch (e) { reportError(e); } }}><Plus size={17} className="mr-2" />{item.available ? "Add to bag" : "Currently unavailable"}</Button></div></article>;
}
