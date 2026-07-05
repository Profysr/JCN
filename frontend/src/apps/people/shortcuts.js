export const PEOPLE_SHORTCUT_GROUPS = [
  {
    id: "people_nav",
    label: "People & HR Navigation",
    shortcuts: [
      {
        id: "nav:departments",
        navKey: "departments",
        keys: ["g", "then", "e"],
        display: ["g", "e"],
        description: "Go to Departments",
      },
      {
        id: "nav:teams",
        navKey: "teams",
        keys: ["g", "then", "t"],
        display: ["g", "t"],
        description: "Go to Teams",
      },
      {
        id: "nav:org-chart",
        navKey: "org-chart",
        keys: ["g", "then", "o"],
        display: ["g", "o"],
        description: "Go to Org Chart",
      },
      {
        id: "nav:people",
        navKey: "people",
        keys: ["g", "then", "p"],
        display: ["g", "p"],
        description: "Go to Employee Hub",
      },
      {
        id: "nav:job-titles",
        navKey: "job-titles",
        keys: ["g", "then", "j"],
        display: ["g", "j"],
        description: "Go to Job Titles",
      },
      {
        id: "nav:hr-dashboard",
        navKey: "hr-dashboard",
        keys: ["g", "then", "h"],
        display: ["g", "h"],
        description: "Go to Dashboard",
      },
      {
        id: "nav:hr-leave",
        navKey: "hr-leave",
        keys: ["g", "then", "l"],
        display: ["g", "l"],
        description: "Go to Leave",
      },
      {
        id: "nav:hr-attendance",
        navKey: "hr-attendance",
        keys: ["g", "then", "k"],
        display: ["g", "k"],
        description: "Go to Attendance",
      },
    ],
  },
  {
    id: "org",
    label: "Org Structure",
    shortcuts: [
      {
        id: "org:create",
        keys: ["n"],
        display: ["n"],
        description: "New department / team",
      },
    ],
  },
];
