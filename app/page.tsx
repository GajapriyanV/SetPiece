import HeroSection from "@/components/landing/HeroSection";
import LiveDebatesGrid from "@/components/landing/LiveDebatesGrid";
import FourRoundsOneWinner from "@/components/landing/FourRoundsOneWinner";
import LeaderboardPreview from "@/components/landing/LeaderboardPreview";
import CtaStrip from "@/components/landing/CtaStrip";
import LandingFooter from "@/components/landing/LandingFooter";

export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <LiveDebatesGrid />
      <FourRoundsOneWinner />
      <LeaderboardPreview />
      <CtaStrip />
      <LandingFooter />
    </main>
  );
}
