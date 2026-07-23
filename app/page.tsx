import AtlasApp from "@/components/atlas/AtlasApp";
import WeyraProductProvider from "@/components/product/WeyraProductProvider";

export default function HomePage() {
  return (
    <WeyraProductProvider>
      <AtlasApp />
    </WeyraProductProvider>
  );
}
