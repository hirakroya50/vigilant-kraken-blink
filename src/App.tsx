import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ShopProvider } from "@/lib/burger/store";
import { ShopShell, RoleGate } from "@/components/burger/ShopShell";
import Index from "./pages/Index";
import Menu from "./pages/Menu";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Orders from "./pages/Orders";
import Login from "./pages/Login";
import ManageMenu from "./pages/ManageMenu";
import NotFound from "./pages/NotFound";
export default function App() {
  return <TooltipProvider><ShopProvider><Toaster /><BrowserRouter><Routes><Route element={<ShopShell />}><Route path="/" element={<Index />} /><Route path="/menu" element={<Menu />} /><Route path="/cart" element={<Cart />} /><Route path="/checkout" element={<RoleGate><Checkout /></RoleGate>} /><Route path="/orders" element={<RoleGate><Orders /></RoleGate>} /><Route path="/login" element={<Login />} /><Route path="/manage/menu" element={<RoleGate staff><ManageMenu /></RoleGate>} /><Route path="*" element={<NotFound />} /></Route></Routes></BrowserRouter></ShopProvider></TooltipProvider>;
}
