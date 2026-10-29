use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct VersionExtraction {
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub relative_path: String,
    #[serde(default)]
    pub line_prefix: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct PriorityTier {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub folder: String,
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
    #[serde(default, alias = "manifest_line_template")]
    pub line_template: Option<String>,
    #[serde(default)]
    pub priority_tiers: Option<Vec<PriorityTier>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
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

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
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
    #[serde(default)]
    pub enable_hotkey_pause_detection: Option<bool>,
    #[serde(default)]
    pub pause_key_vk_codes: Option<Vec<u32>>,
    #[serde(default)]
    pub resume_key_vk_codes: Option<Vec<u32>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct GameSchema {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default)]
    pub game_id: String,
    #[serde(default)]
    pub steam_app_id: Option<String>,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub default_lexicon: Option<String>,
    #[serde(default)]
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
    #[serde(default)]
    pub time_capsule: Option<TimeCapsuleConfig>,
    #[serde(default)]
    pub exception_logs: Option<Vec<LogMatcher>>,
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
    #[serde(default)]
    pub labels: HashMap<String, String>,
    #[serde(default)]
    pub cache_files: Option<Vec<String>>,
    #[serde(default)]
    pub config_extensions: Option<Vec<String>>,
    #[serde(default)]
    pub twin_extensions: Option<Vec<Vec<String>>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SchemaConstraints {
    #[serde(default)]
    pub max_folder_depth: Option<u32>,
    #[serde(default)]
    pub requires_script_unzipping: Option<bool>,
    #[serde(default)]
    pub mods_dir_is_shared_with_vanilla: Option<bool>,
    #[serde(default, alias = "preserve_archive_subfolder_structure")]
    pub preserve_archive_folder_structure: Option<bool>,
    #[serde(default)]
    pub wrap_loose_files_in_folders: Option<bool>,
}
