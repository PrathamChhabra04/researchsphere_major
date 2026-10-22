import type { LucideIcon } from "lucide-react";
import PageHeader from "@/components/PageHeader";

interface PageHeroProps {
  icon: LucideIcon;
  title: string;
  description: string;
  eyebrow?: string;
}

/** Full-width page intro; wraps the shared PageHeader in a container. */
const PageHero = ({ icon, title, description, eyebrow = "ResearchSphere" }: PageHeroProps) => (
  <section className="container mx-auto px-4 pt-6">
    <PageHeader icon={icon} eyebrow={eyebrow} title={title} description={description} />
  </section>
);

export default PageHero;
