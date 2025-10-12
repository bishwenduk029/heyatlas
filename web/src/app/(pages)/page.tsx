import { Hero } from "@/components/homepage/hero";
import { PoweredBy } from "@/components/homepage/powered-by";
import { Features } from "@/components/homepage/features";
import { CallToAction } from "@/components/homepage/call-to-action";

export default function HomePage() {
  return (
    <>
      <Hero />
      <PoweredBy />
      <Features />
      <CallToAction />
    </>
  );
}
