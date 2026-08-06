import React, { useState, useEffect } from 'react';
import { useLexicon } from './LexiconContext';
import { useStore } from './store';
import { ViewHeader, HubTabButton, HubTabDropdown, EmptyState } from './shared';
import { IdentityMatrix } from './IdentityMatrix';
import MasonIDE from './MasonIDE';
import { WayfinderChameleons } from './hub-components/WayfinderChameleons';
import KeepersActiveGames from './hub-components/KeepersActiveGames';

export default function KeepersCore() {
  const { t } = useLexicon();
  const activeTab = useStore(state => state.keepersActiveTab || "active_games");
  const setActiveTab = useStore(state => state.setKeepersActiveTab || (() => { }));

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full flex-1 pb-48 relative">
      <ViewHeader title="KEEPERS CORE" subtitle="CORE OS OVERSIGHT & INFRASTRUCTURE" icon="admin_panel_settings" iconColorClass="text-purple-400 border-purple-500/30">
      </ViewHeader>

      <div className="flex flex-col gap-1 w-full mb-4 shrink-0">
        <div className="flex items-center overflow-hidden accent-scrollbar theme-glass-panel rounded-2xl border border-white/5 shadow-inner divide-x divide-white/5 shrink-0">
          <HubTabButton id="active_games" icon="dns" label="Active Workspaces" activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="identities" icon="group" label="Citizen Oversight" activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="ide" icon="code" label="Keepers IDE" activeTab={activeTab} setTab={setActiveTab} />
          <HubTabButton id="chameleons" icon="palette" label="Chameleons" activeTab={activeTab} setTab={setActiveTab} />
        </div>
      </div>

      <div className="w-full flex-1 flex flex-col min-h-0">
        {activeTab === "active_games" && <KeepersActiveGames />}
        {activeTab === "identities" && <IdentityMatrix isWayfinder={false} isKeepers={true} />}
        {activeTab === "ide" && <MasonIDE isCloudMode={true} cloudTarget="sanctuary_lexicons" isKeepers={true} />}
        {activeTab === "chameleons" && <WayfinderChameleons isKeepers={true} />}
      </div>
    </div>
  );
}
