export interface ModSubcategoryDescriptor {
  id: string;
  label?: string;
  lexicon_key?: string;
  icon?: string;
  icon_key?: string;
  styles?: string[];
  [key: string]: any;
}

export interface ModCategoryDescriptor {
  id: string;
  label: string;
  lexicon_key?: string;
  icon?: string;
  icon_key?: string;
  sort_order?: number;
  subcategories: ModSubcategoryDescriptor[];
  _db_id?: string;
  _db_ids?: string[];
}

let categoryStoreAccessor: {
  getCategories: () => ModCategoryDescriptor[];
  setCategories: (cats: ModCategoryDescriptor[]) => void;
  getActiveSchema: () => any;
} | null = null;

export function registerCategoryStoreAccessor(accessor: {
  getCategories: () => ModCategoryDescriptor[];
  setCategories: (cats: ModCategoryDescriptor[]) => void;
  getActiveSchema: () => any;
}) {
  categoryStoreAccessor = accessor;
}

export function getTaxonomyCacheKey(gameKey?: string | null): string {
  const clean = String(gameKey || "default")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
  return `sanctuary_taxonomy_${clean || "default"}`;
}

function normalizeSubcategoryEntry(raw: any): ModSubcategoryDescriptor | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const clean = raw.trim();
    if (!clean) return null;
    const slug = clean.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return {
      id: clean,
      label: clean,
      lexicon_key: `vault_sub_${slug}`,
    };
  }
  if (typeof raw === "object") {
    const id = String(raw.id || raw.label || "").trim();
    if (!id) return null;
    const slug = id.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return {
      ...raw,
      id,
      label: String(raw.label || id).trim(),
      lexicon_key: String(raw.lexicon_key || `vault_sub_${slug}`).trim(),
      styles: Array.isArray(raw.styles)
        ? raw.styles.map((s: any) => String(s || "").trim()).filter(Boolean)
        : undefined,
    };
  }
  return null;
}

export function normalizeLegacyCategoryList(rawCats: any[]): ModCategoryDescriptor[] {
  if (!Array.isArray(rawCats)) return [];
  const out: ModCategoryDescriptor[] = [];
  rawCats.forEach((raw, idx) => {
    if (!raw || typeof raw !== "object") return;
    const id = String(raw.id || raw.category || raw.label || "").trim();
    if (!id) return;
    const slug = id.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const rawSubs = Array.isArray(raw.subcategories) ? raw.subcategories : [];
    const subMap = new Map<string, ModSubcategoryDescriptor>();
    for (const s of rawSubs) {
      const normalized = normalizeSubcategoryEntry(s);
      if (normalized && !subMap.has(normalized.id.toLowerCase())) {
        subMap.set(normalized.id.toLowerCase(), normalized);
      }
    }
    out.push({
      id,
      label: String(raw.label || raw.type || id).trim(),
      lexicon_key: String(raw.lexicon_key || `class_dd_${slug}`).trim(),
      icon: String(raw.icon || "category").trim(),
      icon_key: raw.icon_key ? String(raw.icon_key).trim() : `ui_icon_${slug}`,
      sort_order: typeof raw.sort_order === "number" ? raw.sort_order : idx,
      subcategories: Array.from(subMap.values()),
      _db_id: raw._db_id ? String(raw._db_id) : undefined,
    });
  });
  return out.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.id.localeCompare(b.id));
}

export function normalizeTaxonomyRows(rows: any[]): ModCategoryDescriptor[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const grouped = new Map<
    string,
    {
      cat: ModCategoryDescriptor;
      subMap: Map<string, ModSubcategoryDescriptor>;
    }
  >();

  rows.forEach((row, idx) => {
    if (!row || typeof row !== "object") return;
    const categoryId = String(row.category || "").trim();
    if (!categoryId) return;
    const key = categoryId.toLowerCase();
    const attrs =
      row.taxonomy_attributes && typeof row.taxonomy_attributes === "object"
        ? row.taxonomy_attributes
        : {};
    const slug = key.replace(/[^a-z0-9]/g, "_");

    if (!grouped.has(key)) {
      grouped.set(key, {
        cat: {
          id: categoryId,
          label: String(attrs.label || row.type || categoryId).trim(),
          lexicon_key: String(attrs.lexicon_key || `class_dd_${slug}`).trim(),
          icon: String(attrs.icon || "category").trim(),
          icon_key: attrs.icon_key ? String(attrs.icon_key).trim() : `ui_icon_${slug}`,
          sort_order: typeof attrs.sort_order === "number" ? attrs.sort_order : idx,
          subcategories: [],
          _db_id: row.id ? String(row.id) : undefined,
          _db_ids: row.id ? [String(row.id)] : [],
        },
        subMap: new Map<string, ModSubcategoryDescriptor>(),
      });
    }

    const bucket = grouped.get(key)!;
    if (row.id) {
      const rid = String(row.id);
      if (!bucket.cat._db_id) {
        bucket.cat._db_id = rid;
      }
      if (!bucket.cat._db_ids) {
        bucket.cat._db_ids = [];
      }
      if (!bucket.cat._db_ids.includes(rid)) {
        bucket.cat._db_ids.push(rid);
      }
    }

    if (Array.isArray(attrs.subcategories)) {
      for (const s of attrs.subcategories) {
        const sub = normalizeSubcategoryEntry(s);
        if (sub && !bucket.subMap.has(sub.id.toLowerCase())) {
          bucket.subMap.set(sub.id.toLowerCase(), sub);
        }
      }
    }

    const rowSub = String(row.sub_type || "").trim();
    if (rowSub) {
      const subKey = rowSub.toLowerCase();
      const existing = bucket.subMap.get(subKey) || {
        id: rowSub,
        label: rowSub,
        lexicon_key: `vault_sub_${subKey.replace(/[^a-z0-9]/g, "_")}`,
        styles: [],
      };
      const rowStyle = String(row.style || "").trim();
      if (rowStyle) {
        const nextStyles = new Set([...(existing.styles || []), rowStyle]);
        existing.styles = Array.from(nextStyles);
      }
      bucket.subMap.set(subKey, existing);
    }
  });

  return Array.from(grouped.values())
    .map(({ cat, subMap }) => ({
      ...cat,
      subcategories: Array.from(subMap.values()),
    }))
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.id.localeCompare(b.id));
}

export function loadCachedModCategories(gameKey?: string | null): ModCategoryDescriptor[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(getTaxonomyCacheKey(gameKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function cacheModCategories(
  gameKey: string | null | undefined,
  categories: ModCategoryDescriptor[]
) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getTaxonomyCacheKey(gameKey), JSON.stringify(categories));
  } catch {}
}

export async function loadModCategories(
  gameClient?: any,
  gameKey?: string | null
): Promise<ModCategoryDescriptor[]> {
  const currentCats = categoryStoreAccessor?.getCategories() || [];
  const activeSchema = categoryStoreAccessor?.getActiveSchema();
  const effectiveKey =
    gameKey || activeSchema?.game_id || activeSchema?.id || "default";

  const cached = loadCachedModCategories(effectiveKey);
  if (cached.length > 0 && currentCats.length === 0) {
    categoryStoreAccessor?.setCategories(cached);
  }

  const isLocalOnly =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("sanctuary_local_only") === "true";

  if (
    gameClient &&
    typeof navigator !== "undefined" &&
    navigator.onLine &&
    !isLocalOnly
  ) {
    try {
      const { data, error } = await gameClient
        .from("taxonomy")
        .select("*")
        .order("category", { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        const normalized = normalizeTaxonomyRows(data);
        cacheModCategories(effectiveKey, normalized);
        categoryStoreAccessor?.setCategories(normalized);
        return normalized;
      }
    } catch (e) {
      console.warn("[Taxonomy] Failed to load remote categories:", e);
    }
  }

  if (cached.length > 0) {
    categoryStoreAccessor?.setCategories(cached);
    return cached;
  }

  const schemaLegacy = activeSchema?.mod_categories;
  if (Array.isArray(schemaLegacy) && schemaLegacy.length > 0) {
    const legacy = normalizeLegacyCategoryList(schemaLegacy);
    categoryStoreAccessor?.setCategories(legacy);
    return legacy;
  }

  return categoryStoreAccessor?.getCategories() || [];
}

export function getActiveModCategories(): ModCategoryDescriptor[] {
  const current = categoryStoreAccessor?.getCategories() || [];
  if (Array.isArray(current) && current.length > 0) return current;
  const schema = categoryStoreAccessor?.getActiveSchema();
  return loadCachedModCategories(schema?.game_id || schema?.id || "default");
}
