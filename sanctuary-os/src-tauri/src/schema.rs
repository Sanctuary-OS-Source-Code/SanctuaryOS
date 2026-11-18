use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;

fn deserialize_u32_flex<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: Deserializer<'de>,
{
    let val = serde_json::Value::deserialize(deserializer)?;
    match val {
        serde_json::Value::Number(n) => Ok(n.as_u64().unwrap_or(0) as u32),
        serde_json::Value::String(s) => Ok(s.trim().parse::<u32>().unwrap_or(0)),
        _ => Ok(0),
    }
}

fn deserialize_opt_u32_flex<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    match val {
        Some(serde_json::Value::Number(n)) => Ok(n.as_u64().map(|v| v as u32)),
        Some(serde_json::Value::String(s)) => Ok(s.trim().parse::<u32>().ok()),
        _ => Ok(None),
    }
}

fn deserialize_opt_u64_flex<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    match val {
        Some(serde_json::Value::Number(n)) => Ok(n.as_u64()),
        Some(serde_json::Value::String(s)) => Ok(s.trim().parse::<u64>().ok()),
        _ => Ok(None),
    }
}

fn deserialize_i32_flex<'de, D>(deserializer: D) -> Result<i32, D::Error>
where
    D: Deserializer<'de>,
{
    let val = serde_json::Value::deserialize(deserializer)?;
    match val {
        serde_json::Value::Number(n) => Ok(n.as_i64().unwrap_or(0) as i32),
        serde_json::Value::String(s) => Ok(s.trim().parse::<i32>().unwrap_or(0)),
        _ => Ok(0),
    }
}

fn parse_json_bool(val: &serde_json::Value) -> Option<bool> {
    match val {
        serde_json::Value::Bool(b) => Some(*b),
        serde_json::Value::Number(n) => n.as_i64().map(|v| v != 0),
        serde_json::Value::String(s) => match s.trim().to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" => Some(true),
            "false" | "0" | "no" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn deserialize_bool_flex<'de, D>(deserializer: D) -> Result<bool, D::Error>
where
    D: Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(val.as_ref().and_then(parse_json_bool).unwrap_or(false))
}

fn deserialize_bool_true_flex<'de, D>(deserializer: D) -> Result<bool, D::Error>
where
    D: Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(val.as_ref().and_then(parse_json_bool).unwrap_or(true))
}

fn deserialize_opt_bool_flex<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(val.as_ref().and_then(parse_json_bool))
}

fn deserialize_opt_bool_true_flex<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(Some(val.as_ref().and_then(parse_json_bool).unwrap_or(true)))
}

fn deserialize_opt_string_flex<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    match val {
        Some(serde_json::Value::String(s)) => Ok(Some(s)),
        Some(serde_json::Value::Number(n)) => Ok(Some(n.to_string())),
        _ => Ok(None),
    }
}

fn value_to_string_map(val: serde_json::Value) -> HashMap<String, String> {
    let mut map = HashMap::new();
    match val {
        serde_json::Value::Object(obj) => {
            for (k, v) in obj {
                let s = match v {
                    serde_json::Value::String(s) => s,
                    serde_json::Value::Number(n) => n.to_string(),
                    serde_json::Value::Bool(b) => b.to_string(),
                    serde_json::Value::Object(inner) => inner
                        .get("name")
                        .or_else(|| inner.get("label"))
                        .or_else(|| inner.get("title"))
                        .or_else(|| inner.get("value"))
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string(),
                    _ => String::new(),
                };
                map.insert(k, s);
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                match item {
                    serde_json::Value::String(s) => {
                        let trimmed = s.trim().to_string();
                        if !trimmed.is_empty() {
                            map.insert(trimmed.clone(), trimmed);
                        }
                    }
                    serde_json::Value::Object(obj) => {
                        let key = obj
                            .get("code")
                            .or_else(|| obj.get("id"))
                            .or_else(|| obj.get("ext"))
                            .or_else(|| obj.get("key"))
                            .and_then(|x| x.as_str())
                            .map(|s| s.trim().to_string())
                            .unwrap_or_default();
                        if !key.is_empty() {
                            let val_str = obj
                                .get("name")
                                .or_else(|| obj.get("label"))
                                .or_else(|| obj.get("title"))
                                .or_else(|| obj.get("value"))
                                .and_then(|x| x.as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| key.clone());
                            map.insert(key, val_str);
                        }
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
    map
}

fn deserialize_string_map_flex<'de, D>(deserializer: D) -> Result<HashMap<String, String>, D::Error>
where
    D: Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(val.map(value_to_string_map).unwrap_or_default())
}

fn deserialize_opt_string_map_flex<'de, D>(
    deserializer: D,
) -> Result<Option<HashMap<String, String>>, D::Error>
where
    D: Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    match val {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(v) => Ok(Some(value_to_string_map(v))),
    }
}

fn deserialize_opt_dll_overrides_flex<'de, D>(
    deserializer: D,
) -> Result<Option<Vec<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    let val = Option::<serde_json::Value>::deserialize(deserializer)?;
    match val {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::Array(arr)) => {
            let mut out = Vec::new();
            for item in arr {
                if let Some(s) = item.as_str() {
                    let clean = s.trim().to_string();
                    if !clean.is_empty() && !out.contains(&clean) {
                        out.push(clean);
                    }
                }
            }
            Ok(Some(out))
        }
        Some(serde_json::Value::Object(map)) => {
            let mut pairs: Vec<(String, String)> = map
                .into_iter()
                .filter_map(|(k, v)| {
                    let key = k.trim().to_string();
                    if key.is_empty() {
                        return None;
                    }
                    let val_str = match v {
                        serde_json::Value::String(s) => s.trim().to_string(),
                        _ => "n,b".to_string(),
                    };
                    let mode = if val_str.is_empty() {
                        "n,b".to_string()
                    } else {
                        val_str
                    };
                    Some((key, mode))
                })
                .collect();
            pairs.sort_by(|a, b| a.0.to_ascii_lowercase().cmp(&b.0.to_ascii_lowercase()));
            let out: Vec<String> = pairs
                .into_iter()
                .map(|(k, m)| format!("{}={}", k, m))
                .collect();
            Ok(Some(out))
        }
        Some(serde_json::Value::String(s)) => {
            let out: Vec<String> = s
                .split(&[';', ','][..])
                .map(str::trim)
                .filter(|x| !x.is_empty())
                .map(String::from)
                .collect();
            Ok((!out.is_empty()).then_some(out))
        }
        _ => Ok(None),
    }
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone, Default)]
pub struct BackupTarget {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub path: String,
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone, Default)]
pub struct TimeCapsuleConfig {
    #[serde(default)]
    pub world_state_targets: Vec<BackupTarget>,
    #[serde(default)]
    pub engine_state_targets: Vec<BackupTarget>,
    #[serde(default)]
    pub save_airgap_targets: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SchemaInstallRoute {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub file_names: Option<Vec<String>>,
    #[serde(default)]
    pub folder_match: Option<String>,
    #[serde(default)]
    pub target_root: String,
    #[serde(default)]
    pub target_subdir: String,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub preserve_vanilla: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub apply_load_order_prefix: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub apply_wine_dll_override: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SchemaConflictAnalyzer {
    #[serde(default)]
    pub id: String,
    #[serde(default, alias = "type")]
    pub analyzer_type: String,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub magic_bytes: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_u64_flex")]
    pub header_offset: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_opt_u64_flex")]
    pub index_count_offset: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_opt_u64_flex")]
    pub index_offset_pos: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_opt_u64_flex")]
    pub entry_size: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_opt_u64_flex")]
    pub key_size: Option<u64>,
    #[serde(default)]
    pub endian: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub bitmask_constant_header: Option<bool>,
    #[serde(default)]
    pub selector_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub container_format: Option<String>,
}

fn default_true() -> bool {
    true
}

fn default_some_true() -> Option<bool> {
    Some(true)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SchemaExceptionRule {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub pattern: String,
    #[serde(default)]
    pub file_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_log: Option<String>,
    #[serde(default)]
    pub severity: String,
    #[serde(default)]
    pub diagnosis: String,
    #[serde(default)]
    pub resolution: String,
    #[serde(default, deserialize_with = "deserialize_bool_flex")]
    pub ignore_in_lab: bool,
    #[serde(default, deserialize_with = "deserialize_bool_flex")]
    pub pinned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinned_order: Option<i32>,
    #[serde(default = "default_true", deserialize_with = "deserialize_bool_true_flex")]
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LogMatcher {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub starts_with: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ends_with: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exact: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct VersionExtraction {
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub relative_path: String,
    #[serde(default)]
    pub line_prefix: String,
    #[serde(default)]
    pub json_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub xml_tag: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub regex_pattern: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback_paths: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct PriorityTier {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default, deserialize_with = "deserialize_i32_flex")]
    pub priority: i32,
    #[serde(default)]
    pub folder: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ManifestBaseEntryDescriptor {
    #[serde(default)]
    pub uuid: String,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub folder: String,
    #[serde(default)]
    pub version64: Option<String>,
    #[serde(default)]
    pub publish_handle: Option<String>,
}

fn deserialize_base_entries_flex<'de, D>(
    deserializer: D,
) -> Result<Vec<ManifestBaseEntryDescriptor>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let val = serde_json::Value::deserialize(deserializer)?;
    let Some(arr) = val.as_array() else {
        return Ok(Vec::new());
    };
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        match item {
            serde_json::Value::String(s) => {
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if trimmed.contains('|') {
                    let parts: Vec<&str> = trimmed.split('|').map(str::trim).collect();
                    let uuid = parts.first().copied().unwrap_or("").to_string();
                    let id = parts.get(1).copied().filter(|x| !x.is_empty()).map(String::from);
                    let title = parts.get(2).copied().unwrap_or(id.as_deref().unwrap_or("")).to_string();
                    let folder = parts
                        .get(3)
                        .copied()
                        .filter(|x| !x.is_empty())
                        .or(id.as_deref())
                        .unwrap_or(title.as_str())
                        .to_string();
                    let version64 = parts.get(4).copied().filter(|x| !x.is_empty()).map(String::from);
                    let publish_handle = parts.get(5).copied().filter(|x| !x.is_empty()).map(String::from);
                    out.push(ManifestBaseEntryDescriptor {
                        uuid,
                        id,
                        name: if title.is_empty() { folder.clone() } else { title },
                        folder,
                        version64,
                        publish_handle,
                    });
                } else {
                    out.push(ManifestBaseEntryDescriptor {
                        uuid: String::new(),
                        id: Some(trimmed.to_string()),
                        name: trimmed.to_string(),
                        folder: trimmed.to_string(),
                        version64: None,
                        publish_handle: None,
                    });
                }
            }
            serde_json::Value::Object(_) => {
                if let Ok(desc) = serde_json::from_value::<ManifestBaseEntryDescriptor>(item.clone()) {
                    out.push(desc);
                }
            }
            _ => {}
        }
    }
    Ok(out)
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ManifestTargetDescriptor {
    #[serde(default)]
    pub root_source: String,
    #[serde(default)]
    pub relative_path: String,
    #[serde(default)]
    pub format: String,
    #[serde(default)]
    pub template: Option<String>,
    #[serde(default)]
    pub entry_template: Option<String>,
    #[serde(default)]
    pub secondary_list_template: Option<String>,
    #[serde(default)]
    pub entry_key: Option<String>,
    #[serde(default)]
    pub section: Option<String>,
    #[serde(default)]
    pub encoding: Option<String>,
    #[serde(default)]
    pub header: Option<String>,
    #[serde(default)]
    pub document_header: Option<String>,
    #[serde(default)]
    pub footer: Option<String>,
    #[serde(default)]
    pub document_footer: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub require_uuid: Option<bool>,
    #[serde(default)]
    pub include_extensions: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_base_entries_flex")]
    pub base_entries: Vec<ManifestBaseEntryDescriptor>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[allow(dead_code)]
pub struct SchemaExternalTool {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub executable: String,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SchemaModMetadataExtractor {
    #[serde(default)]
    pub manifest_files: Vec<String>,
    #[serde(default)]
    pub id_key: Option<String>,
    #[serde(default)]
    pub name_key: Option<String>,
    #[serde(default)]
    pub version_key: Option<String>,
    #[serde(default)]
    pub uuid_key: Option<String>,
    #[serde(default)]
    pub author_key: Option<String>,
    #[serde(default)]
    pub dependencies_key: Option<String>,
    #[serde(default)]
    pub load_before_key: Option<String>,
    #[serde(default)]
    pub load_after_key: Option<String>,
    #[serde(default)]
    pub binary_master_header: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LoadOrderSlotBucket {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default, deserialize_with = "deserialize_u32_flex")]
    pub max_slots: u32,
    #[serde(default)]
    pub include_extensions: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub required_flag_mask: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub excluded_flag_mask: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct LoadOrderConfig {
    #[serde(default)]
    pub strategy: Option<String>,
    #[serde(default)]
    pub direction: Option<String>,
    #[serde(default)]
    pub manifest_file: Option<String>,
    #[serde(default)]
    pub prefix_format: Option<String>,
    #[serde(default)]
    pub prefix_separator: Option<String>,
    #[serde(default, alias = "manifest_line_template")]
    pub line_template: Option<String>,
    #[serde(default)]
    pub document_header: Option<String>,
    #[serde(default)]
    pub document_footer: Option<String>,
    #[serde(default)]
    pub priority_tiers: Option<Vec<PriorityTier>>,
    #[serde(default)]
    pub manifest_targets: Option<Vec<ManifestTargetDescriptor>>,
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub index_base: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub use_tier_priority_as_base: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_u64_flex")]
    pub timestamp_step_secs: Option<u64>,
    #[serde(default)]
    pub asset_overwrite_order: Option<String>,
    #[serde(default)]
    pub slot_buckets: Option<Vec<LoadOrderSlotBucket>>,
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub early_master_flag_mask: Option<u32>,
    #[serde(default)]
    pub early_master_extensions: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct WorldLoadSignatureConfig {
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub stabilize_boot_seconds: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u64_flex")]
    pub min_disk_read_mb: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub min_ram_step_percent: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub warm_cache_ram_step_percent: Option<u32>,
    #[serde(default)]
    pub scratch_activity_subdirs: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SchemaLabVerification {
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub require_for_mason_publish: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub require_for_scout_approval: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub required_active_seconds: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub max_idle_seconds: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub require_focus: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub require_save_checkpoint: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub seed_sandbox_from_latest_save: Option<bool>,
    #[serde(default)]
    pub save_extensions: Option<Vec<String>>,
    #[serde(default)]
    pub world_load_signature: Option<WorldLoadSignatureConfig>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub enable_hotkey_pause_detection: Option<bool>,
    #[serde(default)]
    pub pause_key_vk_codes: Option<Vec<u32>>,
    #[serde(default)]
    pub resume_key_vk_codes: Option<Vec<u32>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct GameSchema {
    #[serde(default, deserialize_with = "deserialize_opt_string_flex")]
    pub id: Option<String>,
    #[serde(default, deserialize_with = "deserialize_u32_flex")]
    pub schema_version: u32,
    #[serde(default)]
    pub game_id: String,
    #[serde(default, deserialize_with = "deserialize_opt_string_flex")]
    pub steam_app_id: Option<String>,
    #[serde(default)]
    pub display_name: String,
    #[serde(default, deserialize_with = "deserialize_opt_string_flex")]
    pub default_lexicon: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub min_scout_submissions: Option<u32>,
    #[serde(default)]
    pub executable_names: Vec<String>,
    #[serde(default)]
    pub paths: SchemaPaths,
    #[serde(default)]
    pub extensions: SchemaExtensions,
    #[serde(default)]
    pub constraints: Option<SchemaConstraints>,
    #[serde(default)]
    pub taxonomy: Option<serde_json::Value>,
    #[serde(default, alias = "mod_categories")]
    pub mod_categories: Option<serde_json::Value>,
    #[serde(default)]
    pub external_tools: Option<Vec<serde_json::Value>>,
    #[serde(default, deserialize_with = "deserialize_opt_string_map_flex")]
    pub dlc_catalog: Option<HashMap<String, String>>,
    #[serde(default)]
    pub conflict_analyzers: Option<Vec<SchemaConflictAnalyzer>>,
    #[serde(default)]
    pub time_capsule: Option<TimeCapsuleConfig>,
    #[serde(default)]
    pub exception_logs: Option<Vec<LogMatcher>>,
    #[serde(default)]
    pub log_subdirs: Option<Vec<String>>,
    #[serde(default)]
    pub exception_rules: Option<Vec<SchemaExceptionRule>>,
    #[serde(default)]
    pub version_extraction: Option<VersionExtraction>,
    #[serde(default)]
    pub dlc_folder_prefixes: Option<Vec<String>>,
    #[serde(default)]
    pub dlc_file_extensions: Option<Vec<String>>,
    #[serde(default)]
    pub dlc_subdirs: Option<Vec<String>>,
    #[serde(default)]
    pub launch_args_dlc_mask_template: Option<String>,

    #[serde(default)]
    pub manifest_content: Option<String>,
    #[serde(default)]
    pub load_order: Option<LoadOrderConfig>,
    #[serde(default)]
    pub install_routes: Option<Vec<SchemaInstallRoute>>,
    #[serde(default)]
    pub lab_verification: Option<SchemaLabVerification>,
    #[serde(default, deserialize_with = "deserialize_opt_dll_overrides_flex")]
    pub wine_dll_overrides: Option<Vec<String>>,
    #[serde(default)]
    pub mod_metadata_extractor: Option<SchemaModMetadataExtractor>,
    #[serde(default)]
    pub mod_unit_mode: Option<String>,
    #[serde(default)]
    pub mod_unit_markers: Option<Vec<String>>,
    #[serde(default)]
    pub gog_app_ids: Option<Vec<String>>,
    #[serde(default)]
    pub epic_app_names: Option<Vec<String>>,
    #[serde(default)]
    pub xbox_store_ids: Option<Vec<String>>,
    #[serde(default)]
    pub ea_content_ids: Option<Vec<String>>,
    #[serde(default)]
    pub install_folder_names: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SchemaPaths {
    #[serde(default)]
    pub default_mod_dir_windows: String,
    #[serde(default)]
    pub default_mod_dir_mac: String,
    #[serde(default)]
    pub default_mod_dir_linux: String,
    #[serde(default)]
    pub manifest_file: String,
    #[serde(default)]
    pub auto_scan_paths_windows: Vec<String>,
    #[serde(default)]
    pub auto_scan_paths_mac: Vec<String>,
    #[serde(default)]
    pub auto_scan_paths_linux: Vec<String>,
    #[serde(default)]
    pub executable_subdir: Option<String>,
    #[serde(default)]
    pub user_data_dir_windows: Option<String>,
    #[serde(default)]
    pub user_data_dir_mac: Option<String>,
    #[serde(default)]
    pub user_data_dir_linux: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SchemaExtensions {
    #[serde(default)]
    pub supported: Vec<String>,
    #[serde(default)]
    pub vault_visible: Option<Vec<String>>,
    #[serde(default)]
    pub ignore_unidentified: Option<Vec<String>>,
    #[serde(default, deserialize_with = "deserialize_string_map_flex")]
    pub labels: HashMap<String, String>,
    #[serde(default)]
    pub cache_files: Option<Vec<String>>,
    #[serde(default)]
    pub config_extensions: Option<Vec<String>>,
    #[serde(default)]
    pub script_extensions: Option<Vec<String>>,
    #[serde(default)]
    pub twin_extensions: Option<Vec<Vec<String>>>,
    #[serde(default)]
    pub parsers: Option<serde_json::Value>,
    #[serde(default)]
    pub magic_bytes: Option<serde_json::Value>,
    #[serde(default)]
    pub archive_containers: Option<Vec<String>>,
    #[serde(
        default = "default_some_true",
        deserialize_with = "deserialize_opt_bool_true_flex"
    )]
    pub preserve_auxiliary_assets: Option<bool>,
    #[serde(default)]
    pub relative_root_anchors: Option<Vec<String>>,
    #[serde(default)]
    pub editable_config_formats: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SchemaConstraints {
    #[serde(default, deserialize_with = "deserialize_opt_u32_flex")]
    pub max_folder_depth: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub requires_script_unzipping: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub mods_dir_is_shared_with_vanilla: Option<bool>,
    #[serde(
        default,
        alias = "preserve_archive_subfolder_structure",
        deserialize_with = "deserialize_opt_bool_flex"
    )]
    pub preserve_archive_folder_structure: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_flex")]
    pub wrap_loose_files_in_folders: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_all_preset_and_cloud_schemas() {
        let schemas_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("src")
            .join("data")
            .join("schemas");
        if schemas_dir.exists() {
            for entry in std::fs::read_dir(&schemas_dir).expect("read schemas dir") {
                let path = entry.expect("entry").path();
                if path.extension().and_then(|e| e.to_str()) == Some("json") {
                    let raw = std::fs::read_to_string(&path).expect("read schema json");
                    let parsed: GameSchema = serde_json::from_str(&raw)
                        .unwrap_or_else(|e| panic!("Failed to parse {:?}: {}", path, e));
                    assert!(!parsed.game_id.is_empty());
                }
            }
        }

        let cloud_variant = r#"{
            "id": "default",
            "schema_version": "3",
            "min_scout_submissions": " ",
            "steam_app_id": 100,
            "dlc_catalog": [
                { "id": "DLC01", "code": "DLC01", "name": "Expansion One" }
            ],
            "extensions": {
                "supported": [],
                "labels": [
                    { "ext": ".bin", "label": "BINARY" }
                ]
            },
            "constraints": {
                "max_folder_depth": " ",
                "requires_script_unzipping": " ",
                "wrap_loose_files_in_folders": "true"
            }
        }"#;
        let parsed_cloud: GameSchema =
            serde_json::from_str(cloud_variant).expect("parse flexible cloud schema");
        assert_eq!(
            parsed_cloud
                .dlc_catalog
                .as_ref()
                .and_then(|m| m.get("DLC01"))
                .map(|s| s.as_str()),
            Some("Expansion One")
        );
        assert_eq!(parsed_cloud.constraints.as_ref().unwrap().requires_script_unzipping, None);
        assert_eq!(parsed_cloud.constraints.as_ref().unwrap().wrap_loose_files_in_folders, Some(true));

        let map_overrides_json = r#"{
            "id": "skyrim_test",
            "wine_dll_overrides": { "winhttp": "n,b", "dinput8": "n,b" },
            "load_order": {
                "manifest_targets": [
                    {
                        "root_source": "local_appdata",
                        "relative_path": "Skyrim Special Edition/plugins.txt",
                        "format": "plugins_asterisk",
                        "include_extensions": [".esm", ".esp", ".esl"]
                    }
                ]
            }
        }"#;
        let parsed_map: GameSchema =
            serde_json::from_str(map_overrides_json).expect("parse map wine_dll_overrides");
        assert_eq!(
            parsed_map.wine_dll_overrides,
            Some(vec!["dinput8=n,b".to_string(), "winhttp=n,b".to_string()])
        );
        let mt = &parsed_map.load_order.unwrap().manifest_targets.unwrap()[0];
        assert_eq!(mt.include_extensions, vec![".esm", ".esp", ".esl"]);

        let vec_overrides_json = r#"{
            "id": "vec_test",
            "wine_dll_overrides": ["version=n,b", "DWrite"]
        }"#;
        let parsed_vec: GameSchema =
            serde_json::from_str(vec_overrides_json).expect("parse vec wine_dll_overrides");
        assert_eq!(
            parsed_vec.wine_dll_overrides,
            Some(vec!["version=n,b".to_string(), "DWrite".to_string()])
        );
    }
}
