import {
  BookMarked,
  BookOpenText,
  BrainCircuit,
  FlaskConical,
  GraduationCap,
  HandCoins,
  Presentation,
  Rocket,
  Sparkles,
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
  /** Set false for sections that should stay out of the home "every corner" grid. */
  showInHomeGrid?: boolean;
}

/** Single source of truth for the listing sections (navigation, home grid, footer). */
export const SECTIONS: SiteSection[] = [
  {
    path: "/conferences",
    title: "Conferences",
    short: "CFPs & venues",
    description: "Upcoming tech venues — AI, cloud, security, Web3, IoT and more — with deadlines and live status.",
    icon: Presentation,
    countKey: "conference",
    group: "publish",
  },
  {
    path: "/journals",
    title: "Journals",
    short: "Find the right venue",
    description: "Match your abstract to Springer, Elsevier and IEEE journals by scope and topic.",
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
    path: "/special-issues",
    title: "Special Issues",
    short: "Guest-edited issues",
    description:
      "Computer science special issues from ScienceDirect journals, with guest editors and submission deadlines.",
    icon: Sparkles,
    countKey: "special-issue",
    group: "publish",
    // Kept out of the home grid so the eight existing cards stay in two rows.
    showInHomeGrid: false,
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
    description: "Funded PhD studentships and doctoral admissions across computing and emerging tech.",
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
    description: "Research internships at industry labs, IITs, ETH, CERN and more, with closing dates.",
    icon: Rocket,
    countKey: "internship",
    group: "career",
  },
  {
    path: "/research-jobs",
    title: "Research Jobs",
    short: "Academia & industry labs",
    description: "Research scientist and engineer roles from universities and industry labs like OpenAI and Databricks.",
    icon: BrainCircuit,
    countKey: "research",
    group: "career",
  },
];
