import React from "react";
import { useStore } from "./store";
import { ErrorBoundary } from "./ErrorBoundary";
import CommandCenter from "./CommandCenter";
import Lab from "./Lab";
import Collection from "./Collection";
import ArchitectHub from "./ArchitectHub";
import Marketplace from "./Marketplace";
import { DbpfScout } from "./DbpfScout";
import Settings from "./SettingsTab";
import MasonHub from "./MasonHub";
import MasonProfile from "./MasonProfile";
import TimeCapsule from "./TimeCapsule";
import Blueprints from "./Blueprints";

export function ViewRouter({ props }: any) {
  const view = useStore(state => state.view);

  return (
    <div className="flex-1 w-full h-full p-8 relative z-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
      {view === "dashboard" && (
        <ErrorBoundary moduleName="Command Center">
          <CommandCenter {...props} />
        </ErrorBoundary>
      )}
      
      {view === "lab" && (
        <ErrorBoundary moduleName="Solder Lab">
          <Lab {...props} />
        </ErrorBoundary>
      )}
      
      {(view === "vault" || view === "collection") && (
        <ErrorBoundary moduleName="Collection">
          <Collection {...props} />
        </ErrorBoundary>
      )}
      
      {(view === "hub" || view === "architect") && (
        <ErrorBoundary moduleName="Architect Hub">
          <ArchitectHub {...props} />
        </ErrorBoundary>
      )}
      
      {view === "marketplace" && (
        <ErrorBoundary moduleName="Marketplace">
          <Marketplace {...props} />
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
  );
}
