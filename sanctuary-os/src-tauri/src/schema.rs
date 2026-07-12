use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub struct BackupTarget {
    pub name: String,
    pub path: String,
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub struct TimeCapsuleConfig {
    pub world_state_targets: Vec<BackupTarget>,
    pub engine_state_targets: Vec<BackupTarget>,
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VersionExtraction {
    pub relative_path: String,
    pub line_prefix: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GameSchema {
    pub schema_version: u32,
    pub game_id: String,
    pub display_name: String,
    pub executable_names: Vec<String>,
    pub paths: SchemaPaths,
    pub extensions: SchemaExtensions,
    pub conflict_radar: Option<ConflictRadar>,
    pub constraints: Option<SchemaConstraints>,
    pub taxonomy: Option<SchemaTaxonomy>,
    pub time_capsule: Option<TimeCapsuleConfig>,
    pub exception_logs: Option<Vec<LogMatcher>>,
    pub version_extraction: Option<VersionExtraction>,
    pub dlc_folder_prefixes: Option<Vec<String>>,
    pub local_mod_heuristics: Option<Vec<String>>,
    pub magic_bytes: Option<std::collections::HashMap<String, String>>,
    pub manifest_content: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SchemaPaths {
    pub default_mod_dir_windows: String,
    pub default_mod_dir_mac: String,
    pub manifest_file: String,
    pub auto_scan_paths_windows: Vec<String>,
    pub auto_scan_paths_mac: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SchemaExtensions {
    pub supported: Vec<String>,
    pub vault_visible: Option<Vec<String>>,
    pub parsers: HashMap<String, String>,
    pub labels: HashMap<String, String>,
    pub cache_files: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ConflictRadar {
    pub tier_4_fatal: Option<Vec<String>>,
    pub tier_3_tuning: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SchemaConstraints {
    pub max_folder_depth: Option<u32>,
    pub requires_script_unzipping: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SchemaTaxonomy {
    pub source: Option<String>,
    pub table: Option<String>,
    pub harmless_types: Option<Vec<String>>,
    pub critical_types: Option<Vec<String>>,
    pub warning_types: Option<Vec<String>>,
    pub explicit_local_types: Option<Vec<String>>,
    pub cas_part_type: Option<String>,
    pub obj_def_type: Option<String>,
}
