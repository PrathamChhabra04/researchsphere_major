import { useState } from "react";
import {
  Briefcase,
  CheckCircle,
  FileText,
  FlaskConical,
  GraduationCap,
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

const COLLABORATION_TYPES = [
  {
    icon: FileText,
    title: "Co-Authorship",
    description: "Joint publications in peer-reviewed conferences and journals",
  },
  {
    icon: FlaskConical,
    title: "Research Projects",
    description: "Contribute to or lead ongoing funded research initiatives",
  },
  {
    icon: GraduationCap,
    title: "Mentorship",
    description: "Guidance for PhD aspirants, postdocs, and junior researchers",
  },
  {
    icon: Briefcase,
    title: "Industry Consulting",
    description: "Applied research partnerships bridging academia and industry",
  },
];

const PROCESS_STEPS = [
  "Submit your collaboration request using the form",
  "Research team reviews your proposal",
  "Introductory meeting scheduled if there is alignment",
  "Collaboration plan drafted and work begins",
];

const EMPTY_FORM = {
  collaborationType: "",
  name: "",
  email: "",
  institution: "",
  researchAreas: "",
  projectDetails: "",
};

const PROJECT_DETAILS_LIMIT = 600;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FormValues = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormValues, string>>;

const validateForm = (values: FormValues): FormErrors => {
  const errors: FormErrors = {};

  if (!values.collaborationType) {
    errors.collaborationType = "Select a collaboration type.";
  }

  if (!values.name.trim()) {
    errors.name = "Enter your full name.";
  }

  if (!values.email.trim()) {
    errors.email = "Enter your email address.";
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (!values.institution.trim()) {
    errors.institution = "Enter your institution or organization.";
  }

  if (!values.researchAreas.trim()) {
    errors.researchAreas = "Add at least one research area.";
  }

  return errors;
};

const fieldClass = (hasError: boolean) =>
  cn(
    "h-12 rounded-md border bg-background px-3.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground",
    "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    hasError
      ? "border-destructive focus-visible:border-destructive"
      : "border-border hover:border-foreground/25",
  );

const Contact = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<FormValues>(EMPTY_FORM);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) =>
      prev[name as keyof FormValues]
        ? { ...prev, [name]: undefined }
        : prev,
    );
  };

  const handleTypeSelect = (title: string) => {
    setFormData((prev) => ({ ...prev, collaborationType: title }));
    setErrors((prev) => ({ ...prev, collaborationType: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors = validateForm(formData);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);

    try {
      await submitCollaborationRequest({
        collaborationType: formData.collaborationType,
        name: formData.name.trim(),
        email: formData.email.trim(),
        institution: formData.institution.trim(),
        researchAreas: formData.researchAreas.trim(),
        projectDetails: formData.projectDetails.trim(),
      });
      setFormData(EMPTY_FORM);
      setSubmitted(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again later.";
      toast({
        title: "Submission failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setErrors({});
    setFormData(EMPTY_FORM);
    setSubmitted(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navigation />

      <div className="flex-1">
        <div className="container mx-auto max-w-[1380px] px-5 pb-8 pt-8 md:px-6 md:pb-0 md:pt-10">
          <header className="pb-16 md:pb-24">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary">
                <Handshake className="h-4 w-4" />
              </span>
              <p className="eyebrow">Research collaboration</p>
            </div>
            <h1 className="display-xl mt-5 text-[2.6rem] normal-case sm:text-6xl lg:text-[5.2rem]">
              Collaborate with us
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Share a proposal for co-authorship, funded projects, mentorship or
              applied research. We review every request and reply with clear
              next steps.
            </p>
          </header>

          <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
            {/* Left: plain content, no cards */}
            <div className="space-y-10">
              <section aria-labelledby="collaboration-types-heading">
                <h2
                  id="collaboration-types-heading"
                  className="font-display text-xl font-medium tracking-[-0.01em] text-foreground"
                >
                  What you can collaborate on
                </h2>
                <ul className="mt-5 divide-y divide-border border-t border-border">
                  {COLLABORATION_TYPES.map(
                    ({ icon: Icon, title, description }) => (
                      <li key={title} className="flex items-start gap-4 py-4">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lime/25 text-primary"
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {title}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {description}
                          </p>
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              </section>

              <section aria-labelledby="process-heading">
                <h2
                  id="process-heading"
                  className="font-display text-xl font-medium tracking-[-0.01em] text-foreground"
                >
                  How it works
                </h2>
                <ol className="relative mt-5">
                  <span
                    aria-hidden="true"
                    className="absolute bottom-4 left-4 top-4 w-px -translate-x-1/2 bg-foreground/15"
                  />
                  {PROCESS_STEPS.map((step, i) => (
                    <li
                      key={step}
                      className="relative flex gap-4 pb-6 last:pb-0"
                    >
                      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-xs font-semibold text-foreground">
                        {i + 1}
                      </span>
                      <p className="pt-1.5 text-sm leading-6 text-muted-foreground">
                        {step}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            {/* Right: one clean form card */}
            <div className="rounded-lg border border-border bg-card p-6 md:p-8">
              {submitted ? (
                <div role="status">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-lime/25 text-primary"
                  >
                    <CheckCircle className="h-5 w-5" />
                  </span>
                  <h2 className="mt-5 font-display text-2xl font-medium tracking-[-0.01em] text-foreground">
                    Request received
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                    Thanks for reaching out. Your collaboration request is with
                    our team, and we will reply to the email address you shared
                    with clear next steps.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    className="mt-6 h-11 rounded-md px-5"
                  >
                    Submit another request
                  </Button>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-2xl font-medium tracking-[-0.01em] text-foreground">
                    Submit a collaboration request
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Fields marked * are required.
                  </p>

                  <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
                    <fieldset
                      aria-describedby={
                        errors.collaborationType
                          ? "collaborationType-error"
                          : undefined
                      }
                    >
                      <legend className="text-sm font-medium text-foreground">
                        Collaboration type *
                      </legend>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {COLLABORATION_TYPES.map(({ title }) => {
                          const selected =
                            formData.collaborationType === title;
                          return (
                            <button
                              key={title}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => handleTypeSelect(title)}
                              className={cn(
                                "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                selected
                                  ? "border-transparent bg-lime text-lime-foreground"
                                  : "border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                              )}
                            >
                              {title}
                            </button>
                          );
                        })}
                      </div>
                      {errors.collaborationType && (
                        <p
                          id="collaborationType-error"
                          className="mt-2 text-xs text-destructive"
                        >
                          {errors.collaborationType}
                        </p>
                      )}
                    </fieldset>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="name"
                          className="text-sm font-medium text-foreground"
                        >
                          Full name *
                        </label>
                        <Input
                          id="name"
                          name="name"
                          placeholder="Dr. Jane Smith"
                          value={formData.name}
                          onChange={handleChange}
                          aria-invalid={Boolean(errors.name)}
                          aria-describedby={
                            errors.name ? "name-error" : undefined
                          }
                          className={cn("mt-2", fieldClass(Boolean(errors.name)))}
                        />
                        {errors.name && (
                          <p
                            id="name-error"
                            className="mt-2 text-xs text-destructive"
                          >
                            {errors.name}
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor="email"
                          className="text-sm font-medium text-foreground"
                        >
                          Email address *
                        </label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="you@university.edu"
                          value={formData.email}
                          onChange={handleChange}
                          aria-invalid={Boolean(errors.email)}
                          aria-describedby={
                            errors.email ? "email-error" : undefined
                          }
                          className={cn(
                            "mt-2",
                            fieldClass(Boolean(errors.email)),
                          )}
                        />
                        {errors.email && (
                          <p
                            id="email-error"
                            className="mt-2 text-xs text-destructive"
                          >
                            {errors.email}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="institution"
                        className="text-sm font-medium text-foreground"
                      >
                        Institution / Organization *
                      </label>
                      <Input
                        id="institution"
                        name="institution"
                        placeholder="Your university or company"
                        value={formData.institution}
                        onChange={handleChange}
                        aria-invalid={Boolean(errors.institution)}
                        aria-describedby={
                          errors.institution ? "institution-error" : undefined
                        }
                        className={cn(
                          "mt-2",
                          fieldClass(Boolean(errors.institution)),
                        )}
                      />
                      {errors.institution && (
                        <p
                          id="institution-error"
                          className="mt-2 text-xs text-destructive"
                        >
                          {errors.institution}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="researchAreas"
                        className="text-sm font-medium text-foreground"
                      >
                        Research areas / Specialization *
                      </label>
                      <Input
                        id="researchAreas"
                        name="researchAreas"
                        placeholder="e.g. Machine Learning, Computer Vision, NLP"
                        value={formData.researchAreas}
                        onChange={handleChange}
                        aria-invalid={Boolean(errors.researchAreas)}
                        aria-describedby={
                          errors.researchAreas
                            ? "researchAreas-error"
                            : undefined
                        }
                        className={cn(
                          "mt-2",
                          fieldClass(Boolean(errors.researchAreas)),
                        )}
                      />
                      {errors.researchAreas && (
                        <p
                          id="researchAreas-error"
                          className="mt-2 text-xs text-destructive"
                        >
                          {errors.researchAreas}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="projectDetails"
                        className="text-sm font-medium text-foreground"
                      >
                        Project details / Research proposal
                      </label>
                      <Textarea
                        id="projectDetails"
                        name="projectDetails"
                        placeholder="Describe your research idea, objectives, and how a collaboration could be mutually beneficial..."
                        value={formData.projectDetails}
                        onChange={handleChange}
                        maxLength={PROJECT_DETAILS_LIMIT}
                        className={cn(
                          "mt-2 min-h-[168px] rounded-md border-border bg-background px-3.5 py-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground",
                          "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        )}
                      />
                      <p className="mt-2 text-right text-xs tabular-nums text-muted-foreground">
                        {formData.projectDetails.length} /{" "}
                        {PROJECT_DETAILS_LIMIT}
                      </p>
                    </div>

                    <div className="pt-1">
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="h-12 w-full gap-2 rounded-md bg-lime text-sm font-semibold text-lime-foreground transition-colors hover:bg-lime/90 focus-visible:ring-lime focus-visible:ring-offset-background"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            Submit collaboration request
                          </>
                        )}
                      </Button>
                      <p className="mt-3 text-center text-xs text-muted-foreground">
                        All requests are reviewed within 3-5 business days.
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
