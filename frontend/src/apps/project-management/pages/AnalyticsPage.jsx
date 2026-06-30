import { useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart2, LayoutGrid, Layers, Users } from "lucide-react";
import { useBoards } from "@/apps/project-management/hooks/useBoards";
import { useLabels } from "@/apps/project-management/hooks/useLabels";
import { useMembers } from "@/shared/hooks/useMembers";
import { buildTaskParams } from "@/shared/hooks/useAnalyticsV2";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/components/ui/Tabs";
import FilterBar from "@/pages/workspace/analytics/FilterBar";
import KpiSection from "@/pages/workspace/analytics/KpiSection";
import OverdueSection from "@/pages/workspace/analytics/OverdueSection";
import BoardTab from "@/pages/workspace/analytics/BoardTab";
import SprintsTab from "@/pages/workspace/analytics/SprintsTab";
import TeamsTab from "@/pages/workspace/analytics/TeamsTab";

const TABS = [
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "sprints", label: "Sprints", icon: Layers },
  { id: "teams", label: "Teams", icon: Users },
];

// Kanban-style filter state, minus the board-only `pendingMyApproval` toggle.
const EMPTY_FILTERS = {
  search: "",
  priorities: [],
  assignees: [],
  labels: [],
  types: [],
  due: [],
};

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function buildDatesFromDays(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

function SectionHeader({ label, description }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
          {label}
        </p>
        <div className="flex-1 h-px bg-border" />
      </div>
      {description && (
        <p className="text-xs text-muted-foreground pl-0.5">{description}</p>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const { workspaceId } = useParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("board");
  const [refreshing, setRefreshing] = useState(false);

  // Filter state
  const [activeDays, setActiveDays] = useState(30);
  const initialDates = buildDatesFromDays(30);
  const [startDate, setStartDate] = useState(initialDates.startDate);
  const [endDate, setEndDate] = useState(initialDates.endDate);
  const [boardId, setBoardId] = useState(undefined);
  const [kfilters, setKFilters] = useState(EMPTY_FILTERS);

  const { data: projects = [] } = useBoards(workspaceId);
  const { data: members = [] } = useMembers(workspaceId);
  // Labels are board-scoped — only available once a board is picked.
  const { data: labels = [] } = useLabels(workspaceId, boardId);

  // Shared flat filter params forwarded to every tab/chart/drill-down.
  const filterParams = useMemo(
    () => buildTaskParams(kfilters, boardId),
    [kfilters, boardId],
  );

  function handlePresetClick(days) {
    setActiveDays(days);
    const { startDate: s, endDate: e } = buildDatesFromDays(days);
    setStartDate(s);
    setEndDate(e);
  }

  function handleStartDateChange(val) {
    setStartDate(val);
    setActiveDays(null);
  }

  function handleEndDateChange(val) {
    setEndDate(val);
    setActiveDays(null);
  }

  // Refresh Button
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["analytics"] });
    setRefreshing(false);
  }, [queryClient]);

  
  const filters = { workspaceId, boardId, startDate, endDate, filterParams };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          Analytics
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Workspace insights — tasks, people, delivery
        </p>
      </div>

      <FilterBar
        activeDays={activeDays}
        startDate={startDate}
        endDate={endDate}
        boardId={boardId}
        projects={projects}
        refreshing={refreshing}
        kfilters={kfilters}
        onKFiltersChange={setKFilters}
        members={members}
        labels={labels}
        onPresetClick={handlePresetClick}
        onStartDateChange={handleStartDateChange}
        onEndDateChange={handleEndDateChange}
        onBoardChange={setBoardId}
        onRefresh={handleRefresh}
      />

      {/* Body */}
      <div className="flex-1 overflow-auto py-6 px-4">
        <div className="max-w-7xl mx-auto space-y-8">
        {/* <KpiSection workspaceId={workspaceId} filterParams={filterParams} /> */}

        <div className="space-y-3">
          <SectionHeader
            label="Overdue Tasks"
            description="Tasks past their due date that are still open — needs immediate attention"
          />
          <OverdueSection workspaceId={workspaceId} filterParams={filterParams} />
        </div>

        <div className="space-y-4">
          <SectionHeader label="Deep Dive" />

          <Tabs value={activeTab} onChange={setActiveTab}>
            <TabsList className="w-fit">
              {TABS.map(({ id, label, icon }) => (
                <TabsTrigger key={id} value={id} icon={icon}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="board" className="mt-4">
              <BoardTab {...filters} />
            </TabsContent>
            <TabsContent value="sprints" className="mt-4">
              <SprintsTab {...filters} />
            </TabsContent>
            <TabsContent value="teams" className="mt-4">
              <TeamsTab {...filters} />
            </TabsContent>
          </Tabs>
        </div>
        </div>
      </div>
    </div>
  );
}
