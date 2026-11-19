import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { spokeOversightFrom } from "../supabase";
import {
  ActionButton,
  handleOpenUrl,
  LoadingScreen,
  SidePanel,
  SidePanelHeroCard,
  StatBox,
  UniversalGroup,
  VAULT_CHIP_CLASS,
} from "../shared";
import type { LegalTargetItem } from "./DmcaAndLegalFlowSteps";

export interface SpokeTargetPreResolvedMeta {
  description?: string;
  url?: string;
  status?: string;
  complianceTier?: number;
  createdAt?: string;
  versions?: Array<{
    version_label?: string;
    dna_hash?: string;
    created_at?: string;
  }>;
}

interface SpokeTargetDossierSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  item: LegalTargetItem | null;
  spokeGame: any | null;
  isSelected?: boolean;
  onToggleSelect?: (item: LegalTargetItem) => void;
  preResolved?: SpokeTargetPreResolvedMeta | null;
  backdropZ?: string;
  panelZ?: string;
}

interface HydratedSpokeTarget {
  id: string;
  code?: string;
  name: string;
  author: string;
  description?: string;
  url?: string;
  status?: string;
  category?: string;
  compatibleVersions?: string[];
  createdAt?: string;
  complianceTier?: number;
  versions: Array<{
    version_label?: string;
    dna_hash?: string;
    created_at?: string;
  }>;
}

export function SpokeTargetDossierSidePanel({
  isOpen,
  onClose,
  item,
  spokeGame,
  isSelected = false,
  onToggleSelect,
  preResolved,
  backdropZ = "z-[50100]",
  panelZ = "z-[50101]",
}: SpokeTargetDossierSidePanelProps) {
  const { t } = useLexicon();
  const [loading, setLoading] = useState(false);
  const [targetData, setTargetData] = useState<HydratedSpokeTarget | null>(null);
  const [fetchWarning, setFetchWarning] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !item) {
      setTargetData(null);
      setFetchWarning("");
      return;
    }

    const spokeUrl = String(spokeGame?.supabase_url || "").trim();
    const spokeAnon = String(spokeGame?.supabase_anon_key || "").trim();
    const storeState = useStore.getState();
    const activeWs = Array.isArray(storeState.workspaces)
      ? storeState.workspaces.find((w: any) => w.id === storeState.activeWorkspaceId)
      : null;
    const isCurrentActiveSpoke = Boolean(
      storeState.activeWorkspaceId &&
        storeState.activeWorkspaceId !== "web" &&
        storeState.activeWorkspaceId !== "default_workspace" &&
        (!spokeGame?.id ||
          String(activeWs?.game_id || "") === String(spokeGame.id) ||
          String(activeWs?.schema_id || "").toLowerCase() ===
            String(spokeGame?.schema_id || "").toLowerCase())
    );

    if (!spokeUrl || !spokeAnon) {
      if (!isCurrentActiveSpoke) {
        setTargetData({
          id: item.identifier,
          name: item.title,
          author: item.subtitle || t("label_unknown_author", "Unknown Author"),
          description: preResolved?.description,
          url: preResolved?.url,
          status: preResolved?.status,
          complianceTier: preResolved?.complianceTier,
          createdAt: preResolved?.createdAt,
          versions: preResolved?.versions || [],
        });
        return;
      }
    }

    let cancelled = false;
    const hydrate = async () => {
      setLoading(true);
      setFetchWarning("");
      try {
        const spokeClient =
          spokeUrl && spokeAnon
            ? createClient(spokeUrl, spokeAnon, {
                auth: {
                  persistSession: false,
                  autoRefreshToken: false,
                  detectSessionInUrl: false,
                },
              })
            : null;
        const isHashToken = /^[0-9a-f]{64}$/i.test(item.identifier.trim());
        const isUuidToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          item.identifier.trim()
        );

        const tryFetchModFromSource = async (
          queryTable: (table: string) => any
        ): Promise<any | null> => {
          let targetModId = isUuidToken ? item.identifier.trim() : "";
          if (!targetModId && isHashToken) {
            const { data: verRow } = await queryTable("mod_versions")
              .select("mod_id")
              .eq("dna_hash", item.identifier.trim().toLowerCase())
              .limit(1)
              .maybeSingle();
            if (verRow?.mod_id) targetModId = String(verRow.mod_id);
          }
          if (!targetModId) return null;

          const primaryRes = await queryTable("mods")
            .select(
              "id, name, created_at, category_override, master_author, mason_id, masons(name), compliance_tier, image_url, description, url, compatible_versions, status, mod_versions(dna_hash, version_label, created_at)"
            )
            .eq("id", targetModId)
            .maybeSingle();

          if (!primaryRes.error && primaryRes.data) {
            return primaryRes.data;
          }
          const fallbackRes = await queryTable("mods")
            .select(
              "id, name, created_at, master_author, compliance_tier, description, url, status, mod_versions(dna_hash, version_label, created_at)"
            )
            .eq("id", targetModId)
            .maybeSingle();
          return !fallbackRes.error && fallbackRes.data ? fallbackRes.data : null;
        };

        if (item.kind === "mod") {
          let row: any = null;
          if (isCurrentActiveSpoke) {
            row = await tryFetchModFromSource((tbl) => spokeOversightFrom(tbl));
          }
          if (!row && spokeClient) {
            row = await tryFetchModFromSource((tbl) => spokeClient.from(tbl));
          }

          if (!cancelled && row) {
            const joinedMason = Array.isArray(row.masons)
              ? row.masons[0]?.name
              : row.masons?.name;
            const author = String(
              joinedMason || row.master_author || item.subtitle || ""
            ).trim();
            const versions = Array.isArray(row.mod_versions)
              ? [...row.mod_versions].sort((a: any, b: any) =>
                  String(b?.created_at || "").localeCompare(
                    String(a?.created_at || "")
                  )
                )
              : [];
            setTargetData({
              id: String(row.id || item.identifier),
              name: String(row.name || item.title),
              author: author || t("label_unknown_author", "Unknown Author"),
              description: row.description
                ? String(row.description).trim()
                : preResolved?.description,
              url: row.url ? String(row.url).trim() : preResolved?.url,
              status: row.status ? String(row.status).trim() : preResolved?.status,
              category: row.category_override
                ? String(row.category_override).trim()
                : undefined,
              compatibleVersions: Array.isArray(row.compatible_versions)
                ? row.compatible_versions.map((v: any) => String(v))
                : undefined,
              createdAt: row.created_at
                ? String(row.created_at)
                : preResolved?.createdAt,
              complianceTier:
                typeof row.compliance_tier === "number"
                  ? row.compliance_tier
                  : preResolved?.complianceTier ?? 0,
              versions: versions.length > 0 ? versions : preResolved?.versions || [],
            });
            return;
          }
        } else if (item.kind === "blueprint" && spokeClient) {
          let row: any = null;
          const primaryRes = await spokeClient
            .from("blueprints")
            .select("id, code, name, description, created_at, compliance_tier")
            .or(`code.eq.${item.identifier},id.eq.${item.identifier}`)
            .limit(1)
            .maybeSingle();

          if (!primaryRes.error && primaryRes.data) {
            row = primaryRes.data;
          } else {
            const fallbackRes = await spokeClient
              .from("blueprints")
              .select("id, code, name, created_at, compliance_tier")
              .or(`code.eq.${item.identifier},id.eq.${item.identifier}`)
              .limit(1)
              .maybeSingle();
            if (!fallbackRes.error && fallbackRes.data) {
              row = fallbackRes.data;
            }
          }

          if (!cancelled && row) {
            setTargetData({
              id: String(row.id || item.identifier),
              code: row.code ? String(row.code) : undefined,
              name: String(row.name || item.title),
              author:
                item.subtitle || t("dmca_kind_blueprint", "{Blueprint}"),
              description: row.description
                ? String(row.description).trim()
                : undefined,
              createdAt: row.created_at ? String(row.created_at) : undefined,
              complianceTier:
                typeof row.compliance_tier === "number"
                  ? row.compliance_tier
                  : 0,
              versions: [],
            });
            return;
          }
        } else if (spokeClient) {
          let row: any = null;
          const primaryRes = await spokeClient
            .from("collections")
            .select("id, name, description, created_at, compliance_tier")
            .eq("id", item.identifier)
            .maybeSingle();

          if (!primaryRes.error && primaryRes.data) {
            row = primaryRes.data;
          } else {
            const fallbackRes = await spokeClient
              .from("collections")
              .select("id, name, created_at, compliance_tier")
              .eq("id", item.identifier)
              .maybeSingle();
            if (!fallbackRes.error && fallbackRes.data) {
              row = fallbackRes.data;
            }
          }

          if (!cancelled && row) {
            setTargetData({
              id: String(row.id || item.identifier),
              name: String(row.name || item.title),
              author:
                item.subtitle || t("dmca_kind_collection", "Collection"),
              description: row.description
                ? String(row.description).trim()
                : undefined,
              createdAt: row.created_at ? String(row.created_at) : undefined,
              complianceTier:
                typeof row.compliance_tier === "number"
                  ? row.compliance_tier
                  : 0,
              versions: [],
            });
            return;
          }
        }

        if (!cancelled) {
          setTargetData({
            id: item.identifier,
            name: item.title,
            author: item.subtitle || t("label_unknown_author", "Unknown Author"),
            description: preResolved?.description,
            url: preResolved?.url,
            status: preResolved?.status,
            complianceTier: preResolved?.complianceTier,
            createdAt: preResolved?.createdAt,
            versions: preResolved?.versions || [],
          });
        }
      } catch {
        if (!cancelled) {
          setFetchWarning(
            t(
              "dmca_dossier_partial_warn",
              "Showing indexed catalog summary from workspace search."
            )
          );
          setTargetData({
            id: item.identifier,
            name: item.title,
            author: item.subtitle || t("label_unknown_author", "Unknown Author"),
            description: preResolved?.description,
            url: preResolved?.url,
            status: preResolved?.status,
            complianceTier: preResolved?.complianceTier,
            createdAt: preResolved?.createdAt,
            versions: preResolved?.versions || [],
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [isOpen, item, spokeGame, t, preResolved]);

  if (!isOpen || !item) return null;

  const kindLabel =
    item.kind === "blueprint"
      ? t("dmca_kind_blueprint", "{Blueprint}")
      : item.kind === "collection"
        ? t("dmca_kind_collection", "Collection")
        : t("dmca_kind_mod", "{Mod}");

  const kindIcon =
    item.kind === "blueprint"
      ? t("icon_layers", "layers")
      : item.kind === "collection"
        ? t("icon_folder_special", "folder_special")
        : t("icon_inventory_2", "inventory_2");

  const resolved: HydratedSpokeTarget = targetData || {
    id: item.identifier,
    name: item.title,
    author: item.subtitle || t("label_unknown_author", "Unknown Author"),
    description: preResolved?.description,
    url: preResolved?.url,
    status: preResolved?.status,
    complianceTier: preResolved?.complianceTier,
    createdAt: preResolved?.createdAt,
    versions: preResolved?.versions || [],
  };

  const formattedCreated = resolved.createdAt
    ? new Date(resolved.createdAt).toLocaleDateString()
    : t("date_unknown", "Unknown Date");

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      backdropZ={backdropZ}
      panelZ={panelZ}
      widthClass="w-[90vw] md:w-[660px]"
      title={resolved.name}
      subtitle={`${String(spokeGame?.name || spokeGame?.schema_id || t("tab_workspace", "Workspace"))} • ${kindLabel}`}
      icon={kindIcon}
    >
      {loading ? (
        <div className="min-h-[360px] flex items-center justify-center">
          <LoadingScreen
            title={t("dmca_dossier_loading", "Loading Target Dossier")}
            subtitle={t("loading", "Loading...")}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-8">
          <SidePanelHeroCard
            icon={kindIcon}
            overline={String(
              spokeGame?.name ||
                spokeGame?.schema_id ||
                t("tab_workspace", "Workspace")
            )}
            title={resolved.name}
            description={
              resolved.description
                ? resolved.description.slice(0, 180) +
                  (resolved.description.length > 180 ? "..." : "")
                : t(
                    "dmca_dossier_hero_desc",
                    "Inspect indexed workspace identity, creator attribution, and registered file hashes before finalizing your report."
                  )
            }
            badge={`Tier ${resolved.complianceTier ?? 0}`}
            badgeIcon={t("icon_verified", "verified")}
            variant="accent"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              <StatBox
                label={t("role_creator", "{Mason}")}
                value={resolved.author}
                icon={t("icon_person", "person")}
                iconColorClass="text-[var(--accent)]"
              />
              <StatBox
                label={t("status", "Status")}
                value={
                  resolved.status
                    ? `${kindLabel} • ${resolved.status}`
                    : kindLabel
                }
                icon={kindIcon}
                iconColorClass="text-[var(--success)]"
              />
            </div>
          </SidePanelHeroCard>

          {fetchWarning && (
            <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--warning)_28%,transparent)] flex items-center gap-2.5 text-xs text-[var(--subtext)] no-text-case">
              <span className="material-symbols-outlined !text-[18px] text-[var(--warning)] shrink-0">
                {t("icon_info", "info")}
              </span>
              <span>{fetchWarning}</span>
            </div>
          )}

          <UniversalGroup
            title={t("overview", "Overview")}
            icon={t("icon_info", "info")}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                  {resolved.code
                    ? t("dmca_dossier_code_label", "{Blueprint} Code")
                    : t("lbl_uuid", "UUID")}
                </span>
                <span className="text-xs font-mono font-bold text-[var(--text)] break-all no-text-case">
                  {resolved.code || resolved.id}
                </span>
              </div>

              <div className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                  {t("created_date", "Published")}
                </span>
                <span className="text-xs font-bold text-[var(--text)] no-text-case">
                  {formattedCreated}
                </span>
              </div>
            </div>

            {(resolved.category ||
              (resolved.compatibleVersions &&
                resolved.compatibleVersions.length > 0)) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {resolved.category && (
                  <span className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_category", "category")}
                    </span>
                    <span>{resolved.category}</span>
                  </span>
                )}
                {resolved.compatibleVersions?.slice(0, 6).map((ver) => (
                  <span key={ver} className={VAULT_CHIP_CLASS}>
                    <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                      {t("icon_deployed_code", "deployed_code")}
                    </span>
                    <span>{ver}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="glass-surface rounded-xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-75">
                {t("upload_desc", "Description")}
              </span>
              <p className="text-xs text-[var(--text)] opacity-90 leading-relaxed whitespace-pre-wrap m-0 no-text-case">
                {resolved.description ||
                  t(
                    "dmca_dossier_no_description",
                    "No public description metadata was supplied on this workspace record."
                  )}
              </p>
            </div>

            {resolved.url && (
              <div className="flex justify-end">
                <ActionButton
                  variant="glass"
                  icon={t("icon_open_in_new", "open_in_new")}
                  label={t("dmca_dossier_open_source_url", "Open Listed Reference URL")}
                  onClick={() => handleOpenUrl(resolved.url!)}
                />
              </div>
            )}
          </UniversalGroup>

          {resolved.versions.length > 0 && (
            <UniversalGroup
              title={t(
                "dmca_dossier_versions_hashes",
                "Indexed Versions & SHA-256 Hashes"
              )}
              icon={t("icon_fingerprint", "fingerprint")}
              count={resolved.versions.length}
            >
              <div className="flex flex-col gap-2">
                {resolved.versions.slice(0, 12).map((ver, idx) => (
                  <div
                    key={`${ver.dna_hash || idx}`}
                    className="glass-surface rounded-xl p-3 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-1 no-text-case"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-[var(--text)]">
                        {ver.version_label || t("shared_version_unknown", "v.Unknown")}
                      </span>
                      {ver.created_at && (
                        <span className="text-[10px] font-mono text-[var(--subtext)]">
                          {new Date(ver.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {ver.dna_hash && (
                      <span className="text-[11px] font-mono text-[var(--subtext)] break-all">
                        {ver.dna_hash}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </UniversalGroup>
          )}

          {onToggleSelect && (
            <ActionButton
              variant={isSelected ? "danger" : "primary"}
              className="w-full"
              icon={
                isSelected
                  ? t("icon_remove_circle_outline", "remove_circle_outline")
                  : t("icon_add_circle_outline", "add_circle_outline")
              }
              label={
                isSelected
                  ? t("dmca_dossier_remove_target", "Remove From Takedown Notice")
                  : t("dmca_dossier_select_target", "Select Reported Content")
              }
              onClick={() => {
                onToggleSelect(item);
                onClose();
              }}
            />
          )}
        </div>
      )}
    </SidePanel>
  );
}
