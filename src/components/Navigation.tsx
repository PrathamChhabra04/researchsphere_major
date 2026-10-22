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

  const mainNavItems = [
    { name: "Home", path: "/" },
    { name: "Search All", path: "/general-finder" },
    // { name: "Assistant", path: "/assistant" },
    { name: "About", path: "/about" },
    { name: "Collaborate", path: "/research-collaboration" },
  ];

  const discoverItems = [
    { name: "Conferences", path: "/conferences" },
    { name: "Journals", path: "/journals" },
    { name: "Book Chapters", path: "/book-chapters" },
    { name: "Project Calls", path: "/project-calls" },
  ];

  const researchOpportunitiesItems = [
    { name: "PhD Programs", path: "/phd-programs" },
    { name: "Postdoc Positions", path: "/postdoc-positions" },
    { name: "Internships", path: "/internships" },
    { name: "Research Jobs", path: "/research-jobs" },
  ];

  const isActive = (path: string) => location.pathname === path;
  const isDiscoverActive = discoverItems.some(
    (item) => location.pathname === item.path,
  );
  const isResearchOpportunitiesActive = researchOpportunitiesItems.some(
    (item) => location.pathname === item.path,
  );

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
    `relative px-3 py-2 text-sm transition-colors ${
      active ? "text-primary" : "text-foreground/80 hover:text-foreground"
    }`;

  const renderDropdown = (
    label: string,
    items: typeof discoverItems,
    active: boolean,
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`${linkClass(active)} inline-flex items-center gap-1 outline-none`}>
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-72 rounded-2xl border-border bg-popover p-2">
        {items.map((item) => {
          const section = SECTIONS.find((entry) => entry.path === item.path);
          const Icon = section?.icon;
          return (
            <DropdownMenuItem key={item.path} asChild className="rounded-xl p-0 focus:bg-muted">
              <Link to={item.path} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5">
                {Icon && (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className={`block text-sm ${isActive(item.path) ? "text-primary" : "text-foreground"}`}>
                    {item.name}
                  </span>
                  {section && <span className="block text-xs text-muted-foreground">{section.short}</span>}
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex h-[72px] items-center justify-between gap-4">
          <BrandMark />

          {/* Desktop Navigation */}
          <div className="hidden items-center lg:flex">
            {mainNavItems.slice(0, 2).map((item) => (
              <Link key={item.path} to={item.path} className={linkClass(isActive(item.path))}>
                {item.name}
              </Link>
            ))}
            {renderDropdown("Call for", discoverItems, isDiscoverActive)}
            {renderDropdown("Opportunities", researchOpportunitiesItems, isResearchOpportunitiesActive)}
            {mainNavItems.slice(2, 3).map((item) => (
              <Link key={item.path} to={item.path} className={linkClass(isActive(item.path))}>
                {item.name}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </button>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-lime to-lime/40 text-lime-foreground ring-2 ring-background transition-transform hover:scale-105"
              title="Your research preferences"
            >
              {profile.name ? (
                <span className="text-sm font-semibold">{profile.name.trim().charAt(0).toUpperCase()}</span>
              ) : (
                <User className="h-[18px] w-[18px]" />
              )}
              <span className="sr-only">Your research preferences</span>
            </button>
            <Link to="/research-collaboration" className="pill hidden md:inline-flex">
              Collaborate
            </Link>

            {/* Mobile menu button */}
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              <span className="sr-only">Menu</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="space-y-6 pb-6 pt-2 lg:hidden">
            <div className="flex flex-wrap gap-2">
              {mainNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-full border px-4 py-1.5 text-sm ${
                    isActive(item.path) ? "border-primary text-primary" : "border-border text-foreground"
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
            {[
              { label: "Call for", items: discoverItems },
              { label: "Opportunities", items: researchOpportunitiesItems },
            ].map((group) => (
              <div key={group.label}>
                <p className="eyebrow mb-2">{group.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {group.items.map((item) => {
                    const Icon = SECTIONS.find((entry) => entry.path === item.path)?.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-2 rounded-xl bg-card px-3 py-2.5 text-sm ${
                          isActive(item.path) ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {Icon && <Icon className="h-4 w-4 text-primary" />}
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
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
