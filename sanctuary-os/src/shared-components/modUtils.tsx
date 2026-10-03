import { useStore } from '../store';
import { useLexicon } from '../LexiconContext';
import { useTheme } from '../ThemeContext';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useModalStore } from '../store/modalStore';
import { useTooltipStore } from '../store/tooltipStore';
import { supabase } from '../supabase';
import { UniversalCard } from '../components/universal/UniversalCard';

import { cleanSearchName } from "./stringUtils";
let _cachedExtSchema: any = null;
let _cachedExtRegex: RegExp | null = null;

export interface ModData {
  name: string;
  physical_path?: string;
  hash: string;
  id?: string;
  status: string;
  status_reason?: string;
  updated_at?: string;
  created_at?: string;
  compatible_versions?: string[];
  color: string;
  displayName?: string;
  author?: string;
  description?: string;
  imageUrl?: string;
  url?: string;
  category?: string;
  family_slug?: string | null;
  type?: string;
  bondedTo?: string | null;
  relationshipType?:
    "twin" | "addon" | "flavor" | "set_item" | "requirement" | "beta" | null;
  requires?: string[];
  isSynced?: boolean;
  conflicts?: string[];
  isVirtual?: boolean;
  flavors?: any[];
  folder_structure?: any[];
  dbId?: string | null;
  isParent?: boolean;
  parentId?: string | null;
  familyId?: string | null;
  version?: string;
  requirements?: string[];
  flavorGroupId?: string | null;
  isFlavorFolder?: boolean;
  flavorGroupName?: string | null;
  invisibleRivals?: string[];
  setId?: string | null;
  isCollection?: boolean;
  allow_write?: boolean;
  compliance_tier?: number;
  mtime?: number;
  isLocalOverride?: boolean;
}
export const getFileLabel = (filename: string, schema: any): string => {
  if (!filename) return "UNKNOWN";
  if (!schema || !schema.extensions || !schema.extensions.labels) {
    return filename.split(".").pop()?.toUpperCase() || "FILE";
  }
  const ext = Object.keys(schema.extensions.labels).find((e) =>
    filename.toLowerCase().endsWith(e.toLowerCase()),
  );
  return ext
    ? schema.extensions.labels[ext]
    : filename.split(".").pop()?.toUpperCase() || "UNKNOWN";
};
export const getModFallbackUrl = (
  modName: string,
  modHash: string | undefined,
  activeGameSchema: any,
  blueprintMeta?: any,
): string => {
  let localOverrides: any = {};
  try {
    localOverrides = JSON.parse(
      localStorage.getItem("sanctuary_local_overrides") || "{}",
    );
  } catch (e) {}

  if (modHash && localOverrides[modHash]?.url)
    return localOverrides[modHash].url;
  if (blueprintMeta?.url) return blueprintMeta.url;

  const registryMod = useStore
    .getState()
    .modList.find(
      (m: any) =>
        (modHash && m.hash === modHash) ||
        (!modHash &&
          cleanSearchName(m.name || "", activeGameSchema) ===
            cleanSearchName(modName, activeGameSchema)),
    );
  if (registryMod && registryMod.url)
    return registryMod.url.startsWith("http")
      ? registryMod.url
      : `https://${registryMod.url}`;

  return `https://www.google.com/search?q=${encodeURIComponent(activeGameSchema?.display_name || "Mod")}+${encodeURIComponent(cleanSearchName(modName, activeGameSchema))}`;
};
export const getModFallbackAuthor = (
  modHash: string | undefined,
  blueprintMeta?: any,
  modName?: string,
  activeGameSchema?: any,
): string | null => {
  let localOverrides: any = {};
  try {
    localOverrides = JSON.parse(
      localStorage.getItem("sanctuary_local_overrides") || "{}",
    );
  } catch (e) {}

  if (modHash && localOverrides[modHash]?.author)
    return localOverrides[modHash].author;
  if (blueprintMeta?.author) return blueprintMeta.author;

  if (modName && activeGameSchema) {
    const registryMod = useStore
      .getState()
      .modList.find(
        (m: any) =>
          (modHash && m.hash === modHash) ||
          (!modHash &&
            cleanSearchName(m.name || "", activeGameSchema) ===
              cleanSearchName(modName, activeGameSchema)),
      );
    if (registryMod && registryMod.author) return registryMod.author;
  }

  return null;
};
export const getExtensionRegex = (schema: any) => {
  const cacheKey = JSON.stringify(schema?.extensions?.supported || []);
  if (_cachedExtSchema === cacheKey && _cachedExtRegex) return _cachedExtRegex;
  const exts = schema?.extensions?.supported || [];
  let regex;
  if (exts.length === 0) {
    regex = /\.[a-z0-9]+$/i;
  } else {
    regex = new RegExp(
      `\\.(${exts.map((e: any) => e.replace(".", "")).join("|")})$`,
      "i",
    );
  }
  _cachedExtSchema = cacheKey;
  _cachedExtRegex = regex;
  return regex;
};
export const isSupportedExtension = (
  filename: string,
  schema: any,
): boolean => {
  if (
    !filename ||
    !schema ||
    !schema.extensions ||
    !schema.extensions.supported
  )
    return false;
  return schema.extensions.supported.some((ext: string) =>
    filename.toLowerCase().endsWith(ext.toLowerCase()),
  );
};
export const DLC_MAP: Record<string, string> = {};
export const loadDLCMap = async () => {
  try {
    if (!navigator.onLine) return;
    const { data } = await supabase.from("dlc_registry").select("id, name");
    if (data && data.length > 0) {
      for (const key of Object.keys(DLC_MAP)) {
        delete DLC_MAP[key];
      }
      data.forEach((d: any) => {
        DLC_MAP[d.id.toUpperCase()] = d.name;
      });
    }
  } catch (e) {
    console.error("Failed to load DLC map from DB", e);
  }
};
export const LOCAL_DLC_MAP: Record<string, string> = {
  EP01: "Get to Work",
  EP02: "Get Together",
  EP03: "City Living",
  EP04: "Cats & Dogs",
  EP05: "Seasons",
  EP06: "Get Famous",
  EP07: "Island Living",
  EP08: "Discover University",
  EP09: "Eco Lifestyle",
  EP10: "Snowy Escape",
  EP11: "Cottage Living",
  EP12: "High School Years",
  EP13: "Growing Together",
  EP14: "Horse Ranch",
  EP15: "For Rent",
  EP16: "Lovestruck",
  EP17: "Life & Death",
  GP01: "Outdoor Retreat",
  GP02: "Spa Day",
  GP03: "Dine Out",
  GP04: "Vampires",
  GP05: "Parenthood",
  GP06: "Jungle Adventure",
  GP07: "StrangerVille",
  GP08: "Realm of Magic",
  GP09: "Star Wars: Journey to Batuu",
  GP10: "Dream Home Decorator",
  GP11: "My Wedding Stories",
  GP12: "Werewolves",
  SP01: "Luxury Party",
  SP02: "Perfect Patio",
  SP03: "Cool Kitchen",
  SP04: "Spooky Stuff",
  SP05: "Movie Hangout",
  SP06: "Romantic Garden",
  SP07: "Kids Room",
  SP08: "Backyard Stuff",
  SP09: "Vintage Glamour",
  SP10: "Bowling Night",
  SP11: "Fitness Stuff",
  SP12: "Toddler Stuff",
  SP13: "Laundry Day",
  SP14: "First Pet",
  SP15: "Moschino",
  SP16: "Tiny Living",
  SP17: "Nifty Knitting",
  SP18: "Paranormal",
  SP46: "Home Chef Hustle",
  SP47: "Crystal Creations",
  SP22: "Throwback Fit Kit",
  SP23: "Country Kitchen Kit",
  SP24: "Bust the Dust Kit",
  SP64: "Riviera Retreat Kit",
  SP65: "Cozy Bistro Kit",
  SP68: "SpongeBobâ€™s House Kit",
  SP70: "SpongeBob Kidâ€™s Room Kit",
  SP75: "Wonderland Playroom Set",
  SP81: "Prairie Dreams Set",
  SP82: "Yard Charm Kit",
};
export const mapDlcCode = (code: string) => {
  let baseCode = code.split(" ")[0].toUpperCase();
  baseCode = baseCode.replace(/^([A-Z]+)(\d)$/, "$10$2");
  return DLC_MAP[baseCode] || LOCAL_DLC_MAP[baseCode] || code;
};
export const getModIcon = (mod: any, schema: any, t: any) => {
  if (mod.isFlavorFolder) return t("icon_style") || "style";
  if (
    mod.isParent &&
    mod.flavors?.some((f: any) =>
      ["twin", "beta", "addon"].includes(f.relationshipType),
    )
  )
    return t("icon_account_tree") || "account_tree";
  if (mod.isParent) return t("icon_folder_open") || "folder_open";

  const name = (mod.name || "").toLowerCase();
  const rawType = (mod.type || mod.category_override || "").toLowerCase();

  const category = schema?.mod_categories?.find(
    (c: any) => c.id.toLowerCase() === rawType,
  );
  if (category && category.icon_key) {
    const translation = t(category.icon_key);
    if (translation && translation !== category.icon_key) return translation;
  }

  if (
    rawType.includes("cas") ||
    name.includes("hair") ||
    name.includes("clothes") ||
    name.includes("tattoo")
  )
    return t("icon_checkroom") || "checkroom";
  if (
    rawType.includes("build") ||
    name.includes("furniture") ||
    name.includes("object")
  )
    return t("icon_chair") || "chair";
  if (rawType.includes("script") || getFileLabel(name, schema) === "SCRIPT")
    return t("icon_receipt_long") || "code";
  if (rawType.includes("anim") || name.includes("anim"))
    return t("icon_movie") || "animation";
  if (rawType.includes("cc") || name.includes("set"))
    return t("icon_folder_special") || "folder_special";
  return t("icon_extension") || "extension";
};
export const processModsIntoCollections = (
  modsData: any[],
  flavorGroups: any[],
  collections: any[],
  relationships: any[],
  allFlavorMembers: any[],
  allSetMembers: any[],
) => {
  let allItems: any[] = [];
  const modsById = new Map<string, any>();
  if (modsData) {
    modsData.forEach((mod: any) => {
      modsById.set(String(mod.id), mod);
    });
  }

  const familyMap = new Map<string, Set<string>>();
  const processedMods = new Set<string>();

  if (relationships) {
    relationships.forEach((rel: any) => {
      const parentId = String(rel.parent_id);
      const childId = String(rel.child_id);

      if (modsById.has(parentId) && modsById.has(childId)) {
        if (!familyMap.has(parentId)) {
          familyMap.set(parentId, new Set([parentId]));
        }
        familyMap.get(parentId)!.add(childId);
      }
    });

    familyMap.forEach((memberIds, parentId) => {
      if (memberIds.size > 1) {
        const members = Array.from(memberIds)
          .map((id) => modsById.get(id))
          .filter(Boolean);

        const parentMod = modsById.get(parentId);
        const isValidName =
          parentMod?.name &&
          !parentMod.name.match(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          );

        if (members.length > 1 && parentMod && isValidName) {
          allItems.push({
            ...parentMod,
            isVirtual: true,
            isParent: true,
            familyId: parentId,
            flavors: members,
            familyCount: members.length,
            is_paid: parentMod.is_paid || members.some((m) => m.is_paid),
            is_early_access:
              parentMod.is_early_access ||
              members.some((m) => m.is_early_access),
          });
          memberIds.forEach((id) => processedMods.add(id));
        }
      }
    });
  }

  if (flavorGroups) {
    const membersByGroup = new Map<string, any[]>();
    if (allFlavorMembers) {
      for (const fm of allFlavorMembers) {
        if (!membersByGroup.has(fm.group_id))
          membersByGroup.set(fm.group_id, []);
        membersByGroup.get(fm.group_id)!.push(fm);
      }
    }

    for (const group of flavorGroups) {
      const flavorMembers = membersByGroup.get(group.id) || [];
      const members: any[] = [];
      const memberIds = new Set<string>();

      if (flavorMembers.length > 0) {
        for (const fm of flavorMembers) {
          for (const [modId, mod] of modsById.entries()) {
            if (
              mod.mod_versions?.some((v: any) => v.dna_hash === fm.mod_hash)
            ) {
              if (!memberIds.has(modId)) {
                members.push(mod);
                memberIds.add(modId);
                processedMods.add(modId);
              }
              break;
            }
          }
        }
      }

      if (members.length > 0) {
        allItems.push({
          id: `flavor_${group.id}`,
          name: group.name,
          category_override: "Exclusives",
          image_url: group.image_url || null,
          master_author: "Flavor Group",
          description: null,
          created_at: group.created_at,
          isFlavorGroup: true,
          flavorGroupId: group.id,
          flavors: members,
          familyCount: members.length,
          isVirtual: true,
          isParent: true,
          is_paid: members.some((m) => m.is_paid),
          is_early_access: members.some((m) => m.is_early_access),
        });
      }
    }
  }

  if (collections) {
    const membersBySet = new Map<string, any[]>();
    if (allSetMembers) {
      for (const sm of allSetMembers) {
        if (!membersBySet.has(sm.set_id)) membersBySet.set(sm.set_id, []);
        membersBySet.get(sm.set_id)!.push(sm);
      }
    }

    for (const set of collections) {
      const setMembers = membersBySet.get(set.id) || [];
      const members =
        setMembers
          .map((sm: any) => modsById.get(String(sm.mod_id)))
          .filter(Boolean) || [];

      if (setMembers.length > 0) {
        setMembers.forEach((sm: any) => processedMods.add(String(sm.mod_id)));
      }

      if (members.length > 0) {
        allItems.push({
          id: `ccset_${set.id}`,
          name: set.name,
          category_override: "Collection",
          image_url: set.image_url || null,
          master_author: set.creator_name || "Unknown Creator",
          description: null,
          created_at: set.created_at,
          url: set.url || null,
          isCollection: true,
          collectionId: set.id,
          flavors: members,
          familyCount: members.length,
          isVirtual: true,
          isParent: true,
          is_paid: members.some((m) => m.is_paid),
          is_early_access: members.some((m) => m.is_early_access),
        });
      }
    }
  }

  modsById.forEach((mod, id) => {
    if (!processedMods.has(id)) {
      allItems.push(mod);
    }
  });

  const nameMap = new Map<string, any>();
  allItems.forEach((item) => {
    const name = item.name?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!name) return;

    const existing = nameMap.get(name);
    if (!existing) {
      nameMap.set(name, item);
    } else {
      if (
        (existing.isVirtual || existing.isParent) &&
        (item.isVirtual || item.isParent)
      )
        return;
      if (item.isVirtual || item.isParent) {
        nameMap.set(name, item);
      } else if (existing.isVirtual || existing.isParent) {
        return;
      } else {
        const existingVersions = existing.compatible_versions || [];
        const itemVersions = item.compatible_versions || [];
        const mergedVersions = Array.from(
          new Set([...existingVersions, ...itemVersions]),
        );
        if (itemVersions.length > existingVersions.length) {
          nameMap.set(name, { ...item, compatible_versions: mergedVersions });
        } else {
          nameMap.set(name, {
            ...existing,
            compatible_versions: mergedVersions,
          });
        }
      }
    }
  });

  return Array.from(nameMap.values());
};
export const enrichBlueprintsWithPremiumStatus = async (
  supabase: any,
  blueprintsData: any[],
) => {
  let premiumMap: Record<string, any> = {};
  const allHashes = new Set<string>();
  blueprintsData.forEach((b: any) => {
    const artifacts = b.json_data?.artifacts || b.artifacts || [];
    artifacts.forEach((a: any) => {
      if (a.hash) allHashes.add(a.hash);
    });
  });

  if (allHashes.size > 0) {
    const hashes = Array.from(allHashes);
    const chunkSize = 100;
    const promises = [];
    for (let i = 0; i < hashes.length; i += chunkSize) {
      promises.push(
        supabase
          .from("mod_versions")
          .select("dna_hash, mods(id, is_paid, is_early_access)")
          .in("dna_hash", hashes.slice(i, i + chunkSize)),
      );
    }
    const results = await Promise.all(promises);
    const hashToPremium: Record<string, any> = {};
    results.forEach(({ data }) => {
      if (data) {
        data.forEach((d: any) => {
          const modRef = Array.isArray(d.mods) ? d.mods[0] : d.mods;
          if (modRef && (modRef.is_paid || modRef.is_early_access)) {
            hashToPremium[d.dna_hash] = {
              is_paid: modRef.is_paid,
              is_early_access: modRef.is_early_access,
            };
          }
        });
      }
    });

    // Fetch all premium mods for a quick fuzzy search fallback
    const { data: premiumMods } = await supabase
      .from("mods")
      .select("id, name, is_paid, is_early_access")
      .or("is_paid.eq.true,is_early_access.eq.true");
    const premiumNameMap = new Map();
    if (premiumMods) {
      premiumMods.forEach((m: any) => {
        if (m.name) premiumNameMap.set(cleanSearchName(m.name), m);
      });
    }

    blueprintsData.forEach((b: any) => {
      const artifacts = b.json_data?.artifacts || b.artifacts || [];
      let is_paid = false;
      let is_early_access = false;
      artifacts.forEach((a: any, index: number) => {
        const isStr = typeof a === "string";
        const aName = isStr ? a : a.name;
        const aHash = isStr ? undefined : a.hash;

        if (aHash && hashToPremium[aHash]) {
          if (hashToPremium[aHash].is_paid) {
            is_paid = true;
            if (isStr) {
              artifacts[index] = { name: a, is_paid: true };
            } else {
              a.is_paid = true;
            }
          }
          if (hashToPremium[aHash].is_early_access) {
            is_early_access = true;
            if (isStr) {
              if (typeof artifacts[index] === "string")
                artifacts[index] = { name: a, is_early_access: true };
              else artifacts[index].is_early_access = true;
            } else {
              a.is_early_access = true;
            }
          }
        } else if (aName) {
          const clean = cleanSearchName(aName);
          let pMod = premiumNameMap.get(clean);
          if (!pMod) {
            const superCleanTarget = clean
              .replace(/[^a-zA-Z0-9]/g, "")
              .toLowerCase();
            for (const [pName, pObj] of premiumNameMap.entries()) {
              const superCleanP = pName
                .replace(/[^a-zA-Z0-9]/g, "")
                .toLowerCase();
              if (
                superCleanP.length > 10 &&
                (superCleanTarget.includes(superCleanP) ||
                  superCleanP.includes(superCleanTarget))
              ) {
                pMod = pObj;
                break;
              }
            }
          }
          if (pMod) {
            if (pMod.is_paid) {
              is_paid = true;
              if (isStr) {
                artifacts[index] = { name: a, is_paid: true };
              } else {
                a.is_paid = true;
              }
            }
            if (pMod.is_early_access) {
              is_early_access = true;
              if (isStr) {
                if (typeof artifacts[index] === "string")
                  artifacts[index] = { name: a, is_early_access: true };
                else artifacts[index].is_early_access = true;
              } else {
                a.is_early_access = true;
              }
            }
          }
        }
      });
      if (is_paid || is_early_access) {
        premiumMap[b.id] = { is_paid, is_early_access };
      }
    });
  }
  return premiumMap;
};

