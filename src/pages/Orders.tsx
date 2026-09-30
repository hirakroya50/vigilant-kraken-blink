import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShop } from "@/lib/burger/store";
import { money } from "@/lib/burger/domain";
export default function Orders() {
  const { state, account } = useShop(); const orders = state.orders.filter(o => o.customerId === account?.id);
  return <section className="page-wrap max-w-4xl"><p className="eyebrow">Your delicious little history</p><h1 className="page-title">Happy memories.</h1><p className="mt-4 text-muted-foreground">Only {account?.name}’s demo orders are shown here.</p><div className="mt-8 space-y-5">{orders.map(order => <article key={order.id} className="rounded-3xl border bg-card p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-bold text-[hsl(var(--success))]"><CheckCircle2 size={18} /> Demo payment confirmed</p><p className="mt-2 text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString()} · {order.id.slice(0, 8)}</p></div><strong className="text-xl">{money(order.total)}</strong></div><div className="mt-5 space-y-2 border-t pt-4">{order.lines.map((line, index) => <div key={index} className="flex justify-between text-sm"><span>{line.quantity} × {line.name}</span><span>{money(line.quantity * line.price)}</span></div>)}</div></article>)}{!orders.length && <div className="rounded-3xl border bg-card p-10 text-center"><h2 className="font-display text-2xl font-bold">Your first favorite is waiting.</h2><Button asChild className="mt-5 rounded-full"><Link to="/menu">Order something good</Link></Button></div>}</div></section>;
}
