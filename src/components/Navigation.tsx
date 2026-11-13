import { Link, useLocation } from "react-router-dom";
import { Moon, Sun, User, ChevronDown, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getUserPreferences,
  saveUserPreferences,
  type TargetKind,
  type UserPreferences,
} from "@/lib/personalization";

import BrandMark from "@/components/BrandMark";
import { SECTIONS } from "@/lib/sections";

const Navigation = () => {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [savedState, setSavedState] = useState<"idle" | "saved">("idle");
  const [profile, setProfile] = useState<UserPreferences>(getUserPreferences());
  const [interestsInput, setInterestsInput] = useState("");

  const visibleSectionItems = [
    { name: "Find Journals", path: "/journals" },
    { name: "Conferences", path: "/conferences" },
  ];

  const callForItems = [
    { name: "Book Chapters", path: "/book-chapters" },
    { name: "Project Calls", path: "/project-calls" },
  ];

  const opportunityItems = [
    { name: "PhD Programs", path: "/phd-programs" },
    { name: "Postdoc Positions", path: "/postdoc-positions" },
    { name: "Internships", path: "/internships" },
    { name: "Research Jobs", path: "/research-jobs" },
  ];

  const mobileNavItems = [
    { name: "Home", path: "/" },
    { name: "Search All", path: "/general-finder" },
    ...visibleSectionItems,
    ...callForItems,
    ...opportunityItems,
    { name: "About", path: "/about" },
    { name: "Collaborate", path: "/research-collaboration" },
  ];

  const isCallForActive = callForItems.some((item) => location.pathname === item.path);
  const isOpportunitiesActive = opportunityItems.some(
    (item) => location.pathname === item.path,
  );

  const isActive = (path: string) => location.pathname === path;

  useEffect(() => {
    if (!profileOpen) return;
    const stored = getUserPreferences();
    setProfile(stored);
    setInterestsInput(stored.interests.join(", "));
    setSavedState("idle");
  }, [profileOpen]);

  const toggleTargetKind = (kind: TargetKind) => {
    setProfile((prev) => {
      const nextKinds = prev.targetKinds.includes(kind)
        ? prev.targetKinds.filter((entry) => entry !== kind)
        : [...prev.targetKinds, kind];
      return {
        ...prev,
        targetKinds: nextKinds.length ? nextKinds : prev.targetKinds,
      };
    });
  };

  const saveProfile = () => {
    const cleaned = {
      ...profile,
      interests: interestsInput
        .split(",")
        .map((interest) => interest.trim())
        .filter(Boolean),
    };

    saveUserPreferences(cleaned);
    setSavedState("saved");
  };

  const linkClass = (active: boolean) =>
    `relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-2.5 text-[clamp(15px,1.2vw,19px)] font-medium tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background 2xl:px-3 ${
      active
        ? "bg-primary/10 text-primary"
        : "text-foreground/80 hover:bg-muted hover:text-foreground"
    }`;

  const renderDropdown = (
    label: string,
    items: Array<{ name: string; path: string }>,
    active: boolean,
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`${linkClass(active)} outline-none`}>
          {label}
          <ChevronDown className="h-4 w-4 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 rounded-2xl border-border bg-popover p-2">
        {items.map((item) => {
          const section = SECTIONS.find((entry) => entry.path === item.path);
          const Icon = section?.icon;
          return (
            <DropdownMenuItem key={item.path} asChild className="rounded-xl p-0 focus:bg-muted">
              <Link to={item.path} className="flex w-full cursor-pointer items-center gap-3 px-3 py-3">
                {Icon && (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                )}
                <span className="min-w-0">
                  <span
                    className={`block text-base font-medium ${
                      isActive(item.path) ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {item.name}
                  </span>
                  {section && (
                    <span className="block text-sm text-muted-foreground">
                      {section.short}
                    </span>
                  )}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl"
    >
      <div className="w-full px-6 min-[1400px]:px-8 2xl:px-10">
        <div className="grid h-[84px] grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="justify-self-start">
            <BrandMark large />
          </div>

          {/* Desktop Navigation */}
          <div className="hidden items-center justify-center gap-2 min-[1400px]:gap-2.5 2xl:gap-4 xl:flex">
            <Link
              to="/"
              className={linkClass(isActive("/"))}
              aria-current={isActive("/") ? "page" : undefined}
            >
              Home
            </Link>
            <Link
              to="/general-finder"
              className={linkClass(isActive("/general-finder"))}
              aria-current={isActive("/general-finder") ? "page" : undefined}
            >
              Search All
            </Link>
            {visibleSectionItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={linkClass(isActive(item.path))}
                aria-current={isActive(item.path) ? "page" : undefined}
              >
                {item.name}
              </Link>
            ))}
            {renderDropdown("Call for", callForItems, isCallForActive)}
            {renderDropdown("Opportunities", opportunityItems, isOpportunitiesActive)}
            <Link
              to="/about"
              className={linkClass(isActive("/about"))}
              aria-current={isActive("/about") ? "page" : undefined}
            >
              About
            </Link>
          </div>

          {/* Right side */}
          <div className="flex items-center justify-self-end gap-1.5 min-[1400px]:gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="relative flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </button>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-lime to-lime/40 text-lime-foreground ring-2 ring-background transition-transform hover:scale-105"
              title="Your research preferences"
            >
              {profile.name ? (
                <span className="text-base font-semibold">{profile.name.trim().charAt(0).toUpperCase()}</span>
              ) : (
                <User className="h-5 w-5" />
              )}
              <span className="sr-only">Your research preferences</span>
            </button>
            <Link
              to="/research-collaboration"
              className="pill hidden px-5 py-2.5 text-base min-[1400px]:px-6 md:inline-flex"
            >
              Collaborate
            </Link>

            {/* Mobile menu button */}
            <button
              type="button"
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted xl:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              <span className="sr-only">Menu</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="pb-6 pt-2 xl:hidden">
            <div className="grid grid-cols-2 gap-2">
              {mobileNavItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center rounded-xl px-4 py-3 text-lg font-medium transition-colors ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Your research preferences</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={profile.name}
                  onChange={(event) =>
                    setProfile((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={profile.role || "unspecified"}
                  onValueChange={(value) =>
                    setProfile((prev) => ({
                      ...prev,
                      role: value === "unspecified" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unspecified">Not specified</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="researcher">Researcher</SelectItem>
                    <SelectItem value="faculty">Faculty</SelectItem>
                    <SelectItem value="industry">
                      Industry professional
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-interests">
                Interests (comma-separated)
              </Label>
              <Input
                id="profile-interests"
                value={interestsInput}
                onChange={(event) => setInterestsInput(event.target.value)}
                placeholder="ai, ml, blockchain"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-location">Preferred location</Label>
              <Input
                id="profile-location"
                value={profile.location}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    location: event.target.value,
                  }))
                }
                placeholder="Hyderabad, India"
              />
            </div>

            <div className="space-y-2">
              <Label>Priority content types</Label>
              <div className="flex gap-2 flex-wrap">
                {(["conference", "journal", "opportunity"] as TargetKind[]).map(
                  (kind) => {
                    const selected = profile.targetKinds.includes(kind);
                    return (
                      <Button
                        key={kind}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        className="capitalize"
                        onClick={() => toggleTargetKind(kind)}
                      >
                        {kind}
                      </Button>
                    );
                  },
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Used for your personalized recommendations.
              </p>
              <div className="flex items-center gap-2">
                <Link to="/user-hub">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setProfileOpen(false)}
                  >
                    Open User Hub
                  </Button>
                </Link>
                <Button size="sm" onClick={saveProfile}>
                  Save preferences
                </Button>
              </div>
            </div>

            {savedState === "saved" && (
              <p className="text-xs text-primary">Preferences saved.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </nav>
  );
};

export default Navigation;
