import { ShopProvider } from "@/components/shop";
import { ShopHeader } from "@/components/menu-app";

export default function LojaLayout({ children }: LayoutProps<"/">) {
  return (
    <ShopProvider>
      <ShopHeader />
      {children}
    </ShopProvider>
  );
}
