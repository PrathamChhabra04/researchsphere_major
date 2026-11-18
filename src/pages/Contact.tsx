import { useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  Handshake,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { submitCollaborationRequest } from "@/services/apiClient";
import { cn } from "@/lib/utils";

// ─── constants ────────────────────────────────────────────────────────────────

const COLLAB_OPTIONS = [
  { value: "co-authorship",       label: "Co-authorship" },
  { value: "research-project",    label: "Research project" },
  { value: "internship",          label: "Research internship" },
  { value: "mentorship",          label: "PhD / Postdoc mentorship" },
  { value: "industry-consulting", label: "Industry consulting" },
  { value: "dataset-sharing",     label: "Dataset sharing" },
  { value: "other",               label: "Other" },
];

const MESSAGE_LIMIT = 600;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const EMPTY: FormValues = {
  name: "",
  email: "",
  institution: "",
  collaborationType: "",
  subject: "",
  message: "",
};

// ─── types ────────────────────────────────────────────────────────────────────

type FormValues = {
  name: string;
  email: string;
  institution: string;
  collaborationType: string;
  subject: string;
  message: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

// ─── validation ───────────────────────────────────────────────────────────────

const validate = (v: FormValues): FormErrors => {
  const e: FormErrors = {};
  if (!v.name.trim())              e.name = "Enter your full name.";
  if (!v.email.trim())             e.email = "Enter your email address.";
  else if (!EMAIL_RE.test(v.email.trim())) e.email = "Enter a valid email address.";
  if (!v.institution.trim())       e.institution = "Enter your institution or organization.";
  if (!v.collaborationType)        e.collaborationType = "Select a collaboration type.";
  if (!v.subject.trim())           e.subject = "Enter a subject.";
  return e;
};

// ─── shared field styling ─────────────────────────────────────────────────────

const field = (err: boolean) =>
  cn(
    "h-[56px] w-full rounded-lg border bg-card px-4 text-base md:text-base text-foreground transition-colors",
    "placeholder:text-muted-foreground/80 placeholder:text-base",
    "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-0",
    err
      ? "border-destructive/60 focus-visible:border-destructive/70 focus-visible:ring-destructive/15"
      : "border-border hover:border-foreground/25",
  );

// ─── component ────────────────────────────────────────────────────────────────

const Contact = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [errors, setErrors]         = useState<FormErrors>({});
  const [form, setForm]             = useState<FormValues>(EMPTY);

  const patch = (key: keyof FormValues, value: string) => {
    setForm((p) => ({ ...p, [key]: value }));
    setErrors((p) => (p[key] ? { ...p, [key]: undefined } : p));
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => patch(e.target.name as keyof FormValues, e.target.value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      await submitCollaborationRequest({
        collaborationType: form.collaborationType,
        name:             form.name.trim(),
        email:            form.email.trim(),
        institution:      form.institution.trim(),
        subject:          form.subject.trim(),
        projectDetails:   form.message.trim(),
      });
      setSubmittedEmail(form.email.trim());
      setSubmitted(true);
      setForm(EMPTY);
    } catch (err) {
      toast({
        title: "Submission failed",
        description:
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setErrors({});
    setForm(EMPTY);
    setSubmittedEmail("");
    setSubmitted(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navigation />

      <div className="flex-1">
        {/*
          Outer wrapper: centres everything on the same axis.
          py-14 top / pb-16 bottom keeps the gap to the gradient banner
          consistent with other page section gaps.
        */}
        <div className="container mx-auto max-w-[720px] px-5 pb-8 pt-12 md:px-6 md:pb-10 md:pt-14">

          {/* ── Page header ── */}
          <header className="mb-10 text-center">
            <div className="flex items-center justify-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-primary shadow-sm ring-1 ring-border">
                <Handshake className="h-[15px] w-[15px]" />
              </span>
              <p className="eyebrow">Research collaboration</p>
            </div>

            {/* Heading: original large display scale, semibold, normal tracking */}
            <h1
              className="mt-5 font-display text-[3.25rem] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground sm:text-6xl md:text-[4.5rem]"
            >
              Collaborate with us
            </h1>

            {/* Intro: 2 lines max, generous width */}
            <p className="mx-auto mt-5 max-w-[600px] text-lg leading-relaxed text-muted-foreground">
              Reach out for co-authorship, research projects, internships,
              mentorship or applied consulting.
            </p>
          </header>

          {/* ── Form card ── */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="p-8 md:p-10">

              {/* ── Success state ── */}
              {submitted ? (
                <div role="status" className="py-8 text-center">
                  <span
                    aria-hidden="true"
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E9F0FA] dark:bg-[#22344D] text-[#2F5D9E] dark:text-[#9DBBE6]"
                  >
                    <CheckCircle className="h-6 w-6" />
                  </span>
                  <h2 className="mt-5 font-display text-[1.35rem] font-semibold tracking-normal text-foreground">
                    Request received
                  </h2>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                    Thanks for reaching out. We'll reply to{" "}
                    <span className="font-medium text-foreground">
                      {submittedEmail || "your email"}
                    </span>{" "}
                    within 3–5 business days.
                  </p>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="mt-7 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Send another request
                  </button>
                </div>

              ) : (
                <>
                  {/* Card header */}
                  <div className="mb-7 border-b border-border pb-6">
                    <h2 className="font-display text-xl font-semibold tracking-normal text-foreground">
                      Submit a collaboration request
                    </h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Fields marked <span className="text-foreground">*</span> are required.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} noValidate className="space-y-6">

                    {/* Name + Email */}
                    <div className="grid gap-6 sm:grid-cols-2">

                      {/* Full name */}
                      <div className="space-y-2.5">
                        <label htmlFor="name" className="block text-base font-medium text-foreground">
                          Full name *
                        </label>
                        <Input
                          id="name"
                          name="name"
                          autoComplete="name"
                          placeholder="Dr. Jane Smith"
                          value={form.name}
                          onChange={handleChange}
                          aria-invalid={Boolean(errors.name)}
                          aria-describedby={errors.name ? "name-err" : undefined}
                          className={field(Boolean(errors.name))}
                        />
                        {errors.name && (
                          <p id="name-err" className="text-xs text-destructive">
                            {errors.name}
                          </p>
                        )}
                      </div>

                      {/* Email */}
                      <div className="space-y-2.5">
                        <label htmlFor="email" className="block text-base font-medium text-foreground">
                          Email address *
                        </label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          placeholder="you@university.edu"
                          value={form.email}
                          onChange={handleChange}
                          aria-invalid={Boolean(errors.email)}
                          aria-describedby={errors.email ? "email-err" : undefined}
                          className={field(Boolean(errors.email))}
                        />
                        {errors.email && (
                          <p id="email-err" className="text-xs text-destructive">
                            {errors.email}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Institution */}
                    <div className="space-y-2.5">
                      <label htmlFor="institution" className="block text-base font-medium text-foreground">
                        Institution / Organization *
                      </label>
                      <Input
                        id="institution"
                        name="institution"
                        autoComplete="organization"
                        placeholder="Your university or company"
                        value={form.institution}
                        onChange={handleChange}
                        aria-invalid={Boolean(errors.institution)}
                        aria-describedby={errors.institution ? "inst-err" : undefined}
                        className={field(Boolean(errors.institution))}
                      />
                      {errors.institution && (
                        <p id="inst-err" className="text-xs text-destructive">
                          {errors.institution}
                        </p>
                      )}
                    </div>

                    {/* Collaboration type — dropdown */}
                    <div className="space-y-2.5">
                      <label htmlFor="collaborationType" className="block text-base font-medium text-foreground">
                        Collaboration type *
                      </label>
                      <div className="relative">
                        <select
                          id="collaborationType"
                          name="collaborationType"
                          value={form.collaborationType}
                          onChange={(e) => patch("collaborationType", e.target.value)}
                          aria-invalid={Boolean(errors.collaborationType)}
                          aria-describedby={errors.collaborationType ? "collab-err" : undefined}
                          className={cn(
                            "h-[56px] w-full appearance-none rounded-lg border bg-card pl-4 pr-10 text-base md:text-base text-foreground transition-colors",
                            "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 focus:ring-offset-0",
                            !form.collaborationType && "text-muted-foreground/80",
                            errors.collaborationType
                              ? "border-destructive/60 focus:border-destructive/70 focus:ring-destructive/15"
                              : "border-border hover:border-foreground/25",
                          )}
                        >
                          <option value="" disabled className="text-muted-foreground/80">Select a type…</option>
                          {COLLAB_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value} className="text-foreground">{o.label}</option>
                          ))}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                      {errors.collaborationType && (
                        <p id="collab-err" className="text-xs text-destructive">
                          {errors.collaborationType}
                        </p>
                      )}
                    </div>

                    {/* Subject */}
                    <div className="space-y-2.5">
                      <label htmlFor="subject" className="block text-base font-medium text-foreground">
                        Subject *
                      </label>
                      <Input
                        id="subject"
                        name="subject"
                        placeholder="e.g. Joint paper on federated learning, Internship inquiry"
                        value={form.subject}
                        onChange={handleChange}
                        aria-invalid={Boolean(errors.subject)}
                        aria-describedby={errors.subject ? "subject-err" : undefined}
                        className={field(Boolean(errors.subject))}
                      />
                      {errors.subject && (
                        <p id="subject-err" className="text-xs text-destructive">
                          {errors.subject}
                        </p>
                      )}
                    </div>

                    {/* Message */}
                    <div className="space-y-2.5">
                      <label htmlFor="message" className="block text-base font-medium text-foreground">
                        Message{" "}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </label>
                      <Textarea
                        id="message"
                        name="message"
                        placeholder="Describe your proposal, research idea, or how a collaboration could be mutually beneficial…"
                        value={form.message}
                        onChange={handleChange}
                        maxLength={MESSAGE_LIMIT}
                        className={cn(
                          "min-h-[160px] w-full resize-none rounded-lg border border-border bg-card",
                          "px-4 py-3.5 text-base md:text-base leading-7 text-foreground placeholder:text-muted-foreground/80 placeholder:text-base",
                          "transition-colors hover:border-foreground/25",
                          "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-0",
                        )}
                      />
                      <p className="text-right text-xs tabular-nums text-muted-foreground">
                        {form.message.length} / {MESSAGE_LIMIT}
                      </p>
                    </div>

                    {/* Submit */}
                    <div className="pt-2">
                      <Button
                        type="submit"
                        disabled={submitting}
                        className="h-14 w-full gap-2 rounded-lg bg-[#3B6FB6] hover:bg-[#335F9C] text-white dark:bg-[#7FA6DB] dark:hover:bg-[#9DBBE6] dark:text-[#0B1320] text-base font-semibold transition-colors focus-visible:ring-primary/40"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Submitting…
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            Send collaboration request
                          </>
                        )}
                      </Button>
                      <p className="mt-3 text-center text-sm text-muted-foreground">
                        We reply within 3–5 business days.
                      </p>
                    </div>

                  </form>
                </>
              )}

            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Contact;
