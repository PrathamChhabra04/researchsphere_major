import {
  BookMarked,
  BookOpenText,
  BrainCircuit,
  FlaskConical,
  GraduationCap,
  HandCoins,
  Presentation,
  Rocket,
  type LucideIcon,
} from "lucide-react";

export interface SiteSection {
  path: string;
  title: string;
  short: string;
  description: string;
  icon: LucideIcon;
  /** Key in /harvest/status liveCounts */
  countKey: string;
  group: "publish" | "career";
}

/** Single source of truth for the listing sections (navigation, home grid, footer). */
export const SECTIONS: SiteSection[] = [
  {
    path: "/conferences",
    title: "Conferences",
    short: "CFPs & venues",
    description: "Upcoming CS and AI venues with event dates, submission deadlines and live status.",
    icon: Presentation,
    countKey: "conference",
    group: "publish",
  },
  {
    path: "/journals",
    title: "Journals",
    short: "Find the right venue",
    description: "Match your abstract to Springer and Elsevier journals by scope and topic.",
    icon: BookOpenText,
    countKey: "journal",
    group: "publish",
  },
  {
    path: "/book-chapters",
    title: "Book Chapters",
    short: "Calls for chapters",
    description: "Open calls for chapters in edited volumes on computing and intelligent systems.",
    icon: BookMarked,
    countKey: "book-chapter",
    group: "publish",
  },
  {
    path: "/project-calls",
    title: "Project Calls",
    short: "Grants & funding",
    description: "Funding calls from NSF, UKRI and Indian agencies such as ANRF, DST and MeitY.",
    icon: HandCoins,
    countKey: "project-call",
    group: "publish",
  },
  {
    path: "/phd-programs",
    title: "PhD Programs",
    short: "Studentships",
    description: "Funded PhD studentships and doctoral admissions in CS, AI and data science.",
    icon: GraduationCap,
    countKey: "phd",
    group: "career",
  },
  {
    path: "/postdoc-positions",
    title: "Postdocs",
    short: "Research fellowships",
    description: "Postdoctoral and research fellow openings across labs and departments.",
    icon: FlaskConical,
    countKey: "postdoc",
    group: "career",
  },
  {
    path: "/internships",
    title: "Internships",
    short: "Research internships",
    description: "Research internships at AI labs, IITs, ETH, CERN and more, with closing dates.",
    icon: Rocket,
    countKey: "internship",
    group: "career",
  },
  {
    path: "/research-jobs",
    title: "Research Jobs",
    short: "Academia & AI labs",
    description: "Research scientist and engineer roles from universities and labs like OpenAI and Anthropic.",
    icon: BrainCircuit,
    countKey: "research",
    group: "career",
  },
];
