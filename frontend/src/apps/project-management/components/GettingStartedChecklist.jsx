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
    key: "assign_task",
    label: "Assign a task",
    desc: "Assigned tasks show up in that person's My Work",
    action: (navigate, ws) => navigate(`/w/${ws}/boards`),
    cta: "Go to boards",
  },
];

export default function ProjectsGettingStarted() {
  return <ModuleChecklist moduleKey="projects" items={ITEMS} />;
}
