import ModuleChecklist from "@/shared/components/onboarding/ModuleChecklist";

const ITEMS = [
  {
    key: "create_board",
    label: "Create your first board",
    desc: "Set up a board to organise your work",
    action: (navigate, ws) => navigate(`/w/${ws}/boards`),
    cta: "Create board",
  },
  {
    key: "add_task",
    label: "Add a task",
    desc: "Break work into trackable pieces",
    action: (navigate, ws) => navigate(`/w/${ws}/boards`),
    cta: "Go to boards",
  },
  {
    key: "invite_teammate",
    label: "Invite a teammate",
    desc: "Collaboration is better together",
    action: (navigate, ws) => navigate(`/w/${ws}/members`),
    cta: "Invite members",
  },
];

export default function ProjectsGettingStarted() {
  return <ModuleChecklist moduleKey="projects" items={ITEMS} />;
}
