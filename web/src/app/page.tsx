import { Hero } from "@/components/homepage/hero";
import { PoweredBy } from "@/components/homepage/powered-by";
import { Features } from "@/components/homepage/features";
import { CallToAction } from "@/components/homepage/call-to-action";
import { Header } from "@/components/homepage/header";
import { Footer } from "@/components/homepage/footer";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <PoweredBy />
        <Features />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
