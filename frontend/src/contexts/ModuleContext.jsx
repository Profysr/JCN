import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";

const ModuleContext = createContext({ modules: [], isLoaded: false });

export function ModuleProvider({ workspaceId, children }) {
  const { data: modules = [], isSuccess } = useQuery({
    queryKey: ["workspace-modules", workspaceId],
    queryFn: async () => {
      const { data } = await api.get(`/api/workspaces/${workspaceId}/modules/`);
      return data;
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <ModuleContext.Provider value={{ modules, isLoaded: isSuccess }}>
      {children}
    </ModuleContext.Provider>
  );
}

export function useModules() {
  const { modules, isLoaded } = useContext(ModuleContext);

  function isEnabled(moduleKey) {
    const mod = modules.find((m) => m.key === moduleKey);
    return mod ? mod.is_enabled : false;
  }

  function getModule(moduleKey) {
    return modules.find((m) => m.key === moduleKey) ?? null;
  }

  return { modules, isLoaded, isEnabled, getModule };
}
