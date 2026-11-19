import KeepersComplianceContactView from "./keepers-support/KeepersComplianceContactView";
import KeepersPlatformSupportView from "./keepers-support/KeepersPlatformSupportView";
import KeepersSpokeSupportView from "./keepers-support/KeepersSpokeSupportView";
import type { FiveTabId } from "./keepers-support/useKeepersTicketsDomain";

export type KeepersSupportLegacyTab =
  | "overview"
  | "dmca"
  | "bugs"
  | "feedback"
  | "contact"
  | "partner_apps"
  | "new"
  | "pending"
  | "closed"
  | "settings";

export default function KeepersSupportTickets({
  userRole = "keeper",
  masonProfileId,
  onEditMetadata,
  initialTab,
}: {
  userRole?: string;
  masonProfileId?: string;
  onEditMetadata?: (hash: string) => void;
  setStatus?: any;
  initialTab?: KeepersSupportLegacyTab;
}) {
  if (initialTab === "dmca" || initialTab === "contact") {
    return (
      <KeepersComplianceContactView
        userRole={userRole}
        masonProfileId={masonProfileId}
        onEditMetadata={onEditMetadata}
        initialTab={initialTab === "contact" ? "new" : "overview"}
      />
    );
  }

  const mappedTab: FiveTabId | undefined =
    initialTab === "settings" ||
    initialTab === "pending" ||
    initialTab === "closed" ||
    initialTab === "new" ||
    initialTab === "overview"
      ? initialTab
      : initialTab === "bugs" || initialTab === "feedback"
        ? "new"
        : undefined;

  return (
    <KeepersPlatformSupportView
      userRole={userRole}
      masonProfileId={masonProfileId}
      onEditMetadata={onEditMetadata}
      initialTab={mappedTab}
    />
  );
}

export {
  KeepersComplianceContactView,
  KeepersPlatformSupportView,
  KeepersSpokeSupportView,
};
