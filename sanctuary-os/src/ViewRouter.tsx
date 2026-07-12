import React from "react";
import { useStore } from "./store";
import { ErrorBoundary } from "./ErrorBoundary";
import CommandCenter from "./CommandCenter";
import Lab from "./Lab";
import Vault from "./Vault";
import ArchitectHub from "./ArchitectHub";
import Nexus from "./Nexus";
import { DbpfScout } from "./DbpfScout";
import Settings from "./SettingsTab";
import MasonHub from "./MasonHub";
import MasonProfile from "./MasonProfile";
import TimeCapsule from "./TimeCapsule";
import Blueprints from "./Blueprints";
import Oversight from "./Oversight";

export function ViewRouter({ props }: any) {
  const view = useStore(state => state.view);

  return (
    <div className="flex-1 w-full h-full relative z-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
      <div className="p-8 min-h-full flex flex-col">
      {view === "dashboard" && (
        <ErrorBoundary moduleName="Command Center">
          <CommandCenter {...props} />
        </ErrorBoundary>
      )}
      
      {view === "lab" && (
        <ErrorBoundary moduleName="Homestead Lab">
          <Lab {...props} />
        </ErrorBoundary>
      )}
      
      {(view === "vault" || view === "vault") && (
        <ErrorBoundary moduleName="Vault">
          <Vault {...props} />
        </ErrorBoundary>
      )}
      
      {(view === "hub" || view === "architect" || view === "ArchitectHub") && (
        <ErrorBoundary moduleName="Architect Hub">
          <ArchitectHub {...props} />
        </ErrorBoundary>
      )}
      
      {view === "Oversight" && (
        <ErrorBoundary moduleName="Oversight">
          <Oversight {...props} />
        </ErrorBoundary>
      )}
      
      {view === "nexus" && (
        <ErrorBoundary moduleName="Nexus">
          <Nexus {...props} />
        </ErrorBoundary>
      )}
      
      {view === "scout" && (
        <ErrorBoundary moduleName="DBPF Scout">
          <DbpfScout {...props} />
        </ErrorBoundary>
      )}
      
      {view === "settings" && (
        <ErrorBoundary moduleName="Settings">
          <Settings {...props} />
        </ErrorBoundary>
      )}
      
      {view === "blueprints" && (
        <ErrorBoundary moduleName="Blueprints">
          <Blueprints {...props} />
        </ErrorBoundary>
      )}
      
      {view === "MasonHub" && (
        <ErrorBoundary moduleName="Mason Hub">
          <MasonHub {...props} />
        </ErrorBoundary>
      )}
      
      {view === "MasonProfile" && (
        <ErrorBoundary moduleName="Mason Profile">
          <MasonProfile {...props} />
        </ErrorBoundary>
      )}
      
      {view === "TimeCapsule" && (
        <ErrorBoundary moduleName="Time Capsule">
          <TimeCapsule {...props} />
        </ErrorBoundary>
      )}
      </div>
    </div>
  );
}
