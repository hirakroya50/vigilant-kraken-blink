import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useShop, reportError } from "@/lib/burger/store";
import { money } from "@/lib/burger/domain";
export default function Checkout() {
  const { state, account, checkout, total, cartIssues } = useShop(); const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const submitted = useRef(false);
  const token = state.checkoutToken;
  if (!state.cart.length) return <section className="page-wrap"><h1 className="page-title">Your bag is empty.</h1><Link to="/menu" className="mt-6 inline-block text-primary underline">Find something delicious</Link></section>;
  return <section className="page-wrap max-w-2xl"><p className="eyebrow">One last little step</p><h1 className="page-title">Make it a meal.</h1><div className="mt-8 rounded-3xl border bg-card p-7"><ShieldCheck size={32} className="text-primary" /><h2 className="mt-4 font-display text-2xl font-bold">Simulated payment only</h2><p className="mt-3 leading-relaxed text-muted-foreground">Hi {account?.name.split(" ")[0]}! This is a browser-local demo. No card details, no real charge, and no actual food delivery.</p><div className="my-6 space-y-3">{state.cart.map(line => <div key={line.itemId} className="flex justify-between gap-4"><span>{line.quantity} × {state.menu.find(i => i.id === line.itemId)?.name}</span><span>{money(line.price * line.quantity)}</span></div>)}</div><div className="flex justify-between border-t pt-5 text-xl font-bold"><span>Total</span><span>{money(total)}</span></div>{cartIssues.map(issue => <p role="alert" key={issue} className="mt-4 text-primary">{issue}</p>)}<label className="my-6 flex cursor-pointer items-start gap-3 text-sm leading-relaxed"><Checkbox checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} className="mt-1" />I understand this creates a demo order without charging money.</label><Button disabled={!confirmed || busy || !!cartIssues.length} className="w-full rounded-full py-6" onClick={() => { if (submitted.current) return; submitted.current = true; setBusy(true); try { checkout(token); navigate("/orders", { replace: true }); } catch (e) { submitted.current = false; setBusy(false); reportError(e); } }}>{busy ? "Creating your order…" : `Confirm demo payment · ${money(total)}`}</Button><Link to="/cart" className="mt-4 block text-center text-sm text-primary underline">Back to your bag</Link></div></section>;
}
