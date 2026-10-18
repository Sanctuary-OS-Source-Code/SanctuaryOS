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
    #[serde(default)]
    pub save_airgap_targets: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SchemaInstallRoute {
    pub id: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub folder_match: Option<String>,
    pub target_root: String,
    pub target_subdir: String,
    #[serde(default)]
    pub preserve_vanilla: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SchemaExternalTool {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub executable_names: Vec<String>,
    #[serde(default)]
    pub requires_save_airgap: Option<bool>,
    #[serde(default)]
    pub requires_mod_isolation: Option<bool>,
    #[serde(default)]
    pub default_args: Option<Vec<String>>,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SchemaExceptionRule {
    pub id: String,
    pub title: String,
    pub pattern: String,
    #[serde(default)]
    pub file_hint: Option<String>,
    #[serde(default)]
    pub severity: String,
    #[serde(default)]
    pub diagnosis: String,
    #[serde(default)]
    pub resolution: String,
    #[serde(default)]
    pub ignore_in_lab: bool,
    #[serde(default = "default_true")]
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VersionExtraction {
    pub relative_path: String,
    pub line_prefix: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PriorityTier {
    pub id: String,
    pub label: String,
    pub priority: i32,
    pub folder: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LoadOrderConfig {
    pub strategy: Option<String>,
    pub direction: Option<String>,
    pub manifest_file: Option<String>,
    pub prefix_format: Option<String>,
    pub line_template: Option<String>,
    pub priority_tiers: Option<Vec<PriorityTier>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WorldLoadSignatureConfig {
    #[serde(default)]
    pub stabilize_boot_seconds: Option<u32>,
    #[serde(default)]
    pub min_disk_read_mb: Option<u64>,
    #[serde(default)]
    pub min_ram_step_percent: Option<u32>,
    #[serde(default)]
    pub warm_cache_ram_step_percent: Option<u32>,
    #[serde(default)]
    pub scratch_activity_subdirs: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SchemaLabVerification {
    #[serde(default)]
    pub require_for_mason_publish: Option<bool>,
    #[serde(default)]
    pub require_for_scout_approval: Option<bool>,
    #[serde(default)]
    pub required_active_seconds: Option<u32>,
    #[serde(default)]
    pub max_idle_seconds: Option<u32>,
    #[serde(default)]
    pub require_focus: Option<bool>,
    #[serde(default)]
    pub require_save_checkpoint: Option<bool>,
    #[serde(default)]
    pub seed_sandbox_from_latest_save: Option<bool>,
    #[serde(default)]
    pub save_extensions: Option<Vec<String>>,
    #[serde(default)]
    pub world_load_signature: Option<WorldLoadSignatureConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GameSchema {
    pub schema_version: u32,
    pub game_id: String,
    pub display_name: String,
    pub executable_names: Vec<String>,
    pub paths: SchemaPaths,
    pub extensions: SchemaExtensions,
    pub constraints: Option<SchemaConstraints>,
    pub taxonomy: Option<serde_json::Value>,
    pub time_capsule: Option<TimeCapsuleConfig>,
    pub exception_logs: Option<Vec<LogMatcher>>,
    #[serde(default)]
    pub exception_rules: Option<Vec<SchemaExceptionRule>>,
    pub version_extraction: Option<VersionExtraction>,
    pub dlc_folder_prefixes: Option<Vec<String>>,

    pub magic_bytes: Option<std::collections::HashMap<String, String>>,
    pub manifest_content: Option<String>,
    pub load_order: Option<LoadOrderConfig>,
    #[serde(default)]
    pub install_routes: Option<Vec<SchemaInstallRoute>>,
    #[serde(default)]
    pub external_tools: Option<Vec<SchemaExternalTool>>,
    #[serde(default)]
    pub lab_verification: Option<SchemaLabVerification>,
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
    pub ignore_unidentified: Option<Vec<String>>,
    pub labels: HashMap<String, String>,
    pub cache_files: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SchemaConstraints {
    pub max_folder_depth: Option<u32>,
    pub requires_script_unzipping: Option<bool>,
}
