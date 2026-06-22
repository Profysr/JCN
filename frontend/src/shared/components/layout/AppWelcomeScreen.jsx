import { ArrowRight, Network, Users2, CheckCircle2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

const MODULE_CONTENT = {
  org_structure: {
    icon: Network,
    iconBg: "bg-blue-50 dark:bg-blue-950/30",
    iconColor: "text-blue-500",
    accentColor: "bg-blue-500",
    name: "Org Structure",
    tagline: "Your company, clearly mapped.",
    description:
      "Build a living org chart that reflects how your team is actually structured — departments, teams, reporting lines, and job titles all in one place.",
    setupItems: [
      "Create your top-level departments (e.g. Engineering, Design, Operations)",
      "Add teams within each department and assign members",
      "Set manager relationships to build out the reporting hierarchy",
      "Assign job titles so every member's role is visible at a glance",
    ],
    ctaLabel: "Set up Org Structure",
  },
  hr_management: {
    icon: Users2,
    iconBg: "bg-purple-50 dark:bg-purple-950/30",
    iconColor: "text-purple-500",
    accentColor: "bg-purple-500",
    name: "HR Management",
    tagline: "Leave, attendance, and employee records — unified.",
    description:
      "Give your team a single place to request leave, clock in and out, and keep employee records up to date. Managers get the visibility they need without the spreadsheets.",
    setupItems: [
      "Define leave policies (annual leave, sick leave, etc.) with accrual rules",
      "Enrol employees so they can start submitting requests",
      "Configure attendance settings for clock-in/out and QR check-in",
      "Review the HR overview dashboard to monitor balances and absences",
    ],
    ctaLabel: "Set up HR Management",
  },
};

export default function AppWelcomeScreen({ moduleKey, onGetStarted }) {
  const content = MODULE_CONTENT[moduleKey];

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 text-center">
        <p className="text-muted-foreground">App ready. Click below to continue.</p>
        <Button className="mt-6" onClick={onGetStarted}>
          Get Started <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  const Icon = content.icon;

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] h-full px-6 py-16">
      <div className="w-full max-w-lg">
        {/* Icon */}
        <div className={`w-14 h-14 rounded-2xl ${content.iconBg} flex items-center justify-center mb-6`}>
          <Icon className={`w-7 h-7 ${content.iconColor}`} />
        </div>

        {/* Headline */}
        <h1 className="text-2xl font-bold text-foreground">{content.name}</h1>
        <p className={`text-sm font-medium mt-1 mb-3 ${content.iconColor}`}>
          {content.tagline}
        </p>
        <p className="text-muted-foreground leading-relaxed mb-8">
          {content.description}
        </p>

        {/* Setup checklist */}
        <div className="rounded-xl border bg-card p-5 mb-8">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            What to set up first
          </p>
          <ul className="space-y-2.5">
            {content.setupItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                <CheckCircle2 className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <Button className="gap-2 w-full sm:w-auto" onClick={onGetStarted}>
          {content.ctaLabel}
          <ArrowRight className="w-4 h-4" />
        </Button>
        <p className="text-xs text-muted-foreground mt-3">
          This screen won't appear again. You can always return to these steps from the Settings page.
        </p>
      </div>
    </div>
  );
}
