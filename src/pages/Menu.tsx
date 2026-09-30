import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/burger/ProductCard";
import { categories } from "@/lib/burger/domain";
import { useShop } from "@/lib/burger/store";
export default function Menu() {
  const { state } = useShop();
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("All");
  const items = state.menu.filter(i => (category === "All" || i.category === category) && `${i.name} ${i.description}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="page-wrap"><p className="eyebrow">Made to make your day</p><h1 className="page-title">Find your happy bite.</h1><p className="mt-4 text-muted-foreground">Burgers with personality. Sides worth sharing. Zero compromises.</p><div className="my-8 flex flex-col justify-between gap-5 md:flex-row"><div className="flex flex-wrap gap-2">{["All", ...categories].map(c => <Button key={c} variant={c === category ? "default" : "outline"} className="rounded-full px-6" aria-pressed={c === category} onClick={() => setCategory(c)}>{c}</Button>)}</div><div className="relative md:w-72"><Search className="absolute left-4 top-3 text-muted-foreground" size={18} /><Input aria-label="Search menu" placeholder="What are you craving?" className="h-11 rounded-full bg-card pl-11" value={query} onChange={e => setQuery(e.target.value)} /></div></div><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{items.map(item => <ProductCard key={item.id} item={item} />)}</div>{!items.length && <p className="rounded-2xl border p-10 text-center">No matches. Try a different craving.</p>}</section>;
}
