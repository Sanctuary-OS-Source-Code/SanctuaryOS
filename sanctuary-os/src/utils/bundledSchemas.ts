const rawSchemaModules = import.meta.glob('../data/schemas/*.json', {
  eager: true,
}) as Record<string, { default?: Record<string, any> } | Record<string, any>>;

const bundledSchemaByFileId = new Map<string, Record<string, any>>();
const bundledSchemaByAlias = new Map<string, Record<string, any>>();

for (const [modPath, modVal] of Object.entries(rawSchemaModules)) {
  const fileMatch = modPath.match(/\/([^/]+)\.json$/i);
  if (!fileMatch) continue;
  const fileKey = fileMatch[1].trim().toLowerCase();
  const data = (
    modVal && typeof modVal === 'object' && 'default' in modVal && modVal.default
      ? modVal.default
      : modVal
  ) as Record<string, any>;
  if (!data || typeof data !== 'object') continue;

  bundledSchemaByFileId.set(fileKey, data);
  bundledSchemaByAlias.set(fileKey, data);

  const idAlias = String(data.id || '').trim().toLowerCase();
  if (idAlias) bundledSchemaByAlias.set(idAlias, data);

  const gameIdAlias = String(data.game_id || '').trim().toLowerCase();
  if (gameIdAlias) bundledSchemaByAlias.set(gameIdAlias, data);
}

function cloneJson<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export const DEFAULT_SCHEMA_CACHE_KEY = 'sanctuary_cached_default_schema_v2';

export const BUNDLED_DEFAULT_SCHEMA: Record<string, any> =
  bundledSchemaByFileId.get('default') || {
    id: 'default',
    game_id: 'default',
    display_name: 'Default Master Schema',
    default_lexicon: 'en-default',
    schema_version: 5,
    min_scout_submissions: 3,
    steam_app_id: null,
    executable_names: [],
    paths: {
      manifest_file: '',
      executable_subdir: null,
      user_data_dir_mac: null,
      auto_scan_paths_mac: [],
      default_mod_dir_mac: '',
      user_data_dir_linux: null,
      auto_scan_paths_linux: [],
      default_mod_dir_linux: '',
      user_data_dir_windows: null,
      auto_scan_paths_windows: [],
      default_mod_dir_windows: '',
    },
    extensions: {
      labels: {},
      parsers: {},
      supported: [],
      cache_files: [],
      magic_bytes: {},
      vault_visible: [],
      twin_extensions: [],
      config_extensions: [],
      script_extensions: [],
      archive_containers: [],
      ignore_unidentified: [],
      relative_root_anchors: [],
      editable_config_formats: [],
      preserve_auxiliary_assets: true,
    },
    constraints: {
      max_folder_depth: null,
      requires_script_unzipping: false,
      wrap_loose_files_in_folders: false,
      mods_dir_is_shared_with_vanilla: false,
      preserve_archive_folder_structure: true,
    },
    install_routes: [],
    dlc_catalog: [],
    dlc_subdirs: [],
    dlc_file_extensions: [],
    dlc_folder_prefixes: [],
    launch_args_dlc_mask_template: null,
    manifest_content: null,
    external_tools: [],
    conflict_analyzers: [],
    version_extraction: {
      method: null,
      json_key: null,
      line_prefix: '',
      relative_path: '',
    },
    load_order: {
      strategy: null,
      direction: null,
      line_template: null,
      manifest_file: null,
      prefix_format: null,
      priority_tiers: [],
      document_footer: null,
      document_header: null,
      prefix_separator: null,
    },
    mod_categories: [],
    taxonomy: {
      categories: [],
    },
    lab_verification: {
      require_focus: true,
      save_extensions: [],
      max_idle_seconds: 8,
      pause_key_vk_codes: [],
      resume_key_vk_codes: [],
      world_load_signature: {
        min_disk_read_mb: 75,
        min_ram_step_percent: 20,
        stabilize_boot_seconds: 14,
        scratch_activity_subdirs: [],
        warm_cache_ram_step_percent: 35,
      },
      require_save_checkpoint: false,
      required_active_seconds: 120,
      require_for_mason_publish: false,
      require_for_scout_approval: false,
      enable_hotkey_pause_detection: false,
      seed_sandbox_from_latest_save: false,
    },
    exception_logs: [],
    exception_rules: [],
    time_capsule: {
      world_state_targets: [],
      engine_state_targets: [],
      save_airgap_targets: [],
    },
  };

export function getCachedOrBundledDefaultSchema(): Record<string, any> {
  if (typeof localStorage !== 'undefined') {
    try {
      // Purge legacy v1 cache key if still present
      localStorage.removeItem('sanctuary_cached_default_schema_v1');
      const raw = localStorage.getItem(DEFAULT_SCHEMA_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const parsedId = String(parsed?.id || 'default').trim().toLowerCase();
        const parsedGameId = String(parsed?.game_id || 'default').trim().toLowerCase();
        const parsedVer = Number(parsed?.schema_version) || 0;
        const bundledVer = Number(BUNDLED_DEFAULT_SCHEMA?.schema_version) || 0;
        if (
          parsed &&
          typeof parsed === 'object' &&
          Object.keys(parsed).length > 3 &&
          parsedId === 'default' &&
          parsedGameId === 'default' &&
          parsedVer >= bundledVer
        ) {
          return parsed;
        }
        localStorage.removeItem(DEFAULT_SCHEMA_CACHE_KEY);
      }
    } catch {
      // Fall back to bundled default.json
    }
  }
  return cloneJson(BUNDLED_DEFAULT_SCHEMA);
}

export function getBundledSchema(schemaId?: string | null): Record<string, any> | null {
  const clean = String(schemaId || '').trim().toLowerCase();
  if (
    !clean ||
    clean === 'default' ||
    clean === 'default_schema' ||
    clean === 'default_workspace'
  ) {
    return cloneJson(BUNDLED_DEFAULT_SCHEMA);
  }

  const hit =
    bundledSchemaByFileId.get(clean) ||
    bundledSchemaByAlias.get(clean) ||
    bundledSchemaByAlias.get(clean.replace(/_/g, '-')) ||
    bundledSchemaByAlias.get(clean.replace(/-/g, '_'));

  return hit ? cloneJson(hit) : null;
}

export function listBundledSpokeSchemas(): Array<{ fileId: string; schema: Record<string, any> }> {
  const list: Array<{ fileId: string; schema: Record<string, any> }> = [];
  for (const [fileId, schema] of bundledSchemaByFileId.entries()) {
    if (fileId === 'default') continue;
    list.push({ fileId, schema: cloneJson(schema) });
  }
  return list;
}

