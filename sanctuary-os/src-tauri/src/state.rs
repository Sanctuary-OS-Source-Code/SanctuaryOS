use notify::Watcher;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{Emitter, Manager};
use crate::utils::*;


pub struct AppState {
    pub active_schema: std::sync::Mutex<Option<crate::schema::GameSchema>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SolderConfig {
    pub live_path: String,
    pub mods_path: String,
    pub vault_path: String,
    pub engine_agency_level: Option<u32>,
    pub defcon_backup_target: Option<u32>,
    pub backup_preference: Option<u32>,
    pub engine_retention_cycles: Option<u32>,
    pub world_retention_cycles: Option<u32>,
    pub vault_capacity_gb: Option<u32>,
    pub timeline_retention_copies: Option<u32>,
    pub timeline_retention_size_mb: Option<u32>,
}

#[derive(serde::Deserialize, Debug)]
pub struct StructureNode {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(rename = "assignedModName")]
    pub assigned_mod_name: Option<String>,
    pub children: Option<Vec<StructureNode>>,
}

#[derive(Debug, serde::Deserialize)]
pub struct DeployMod {
    pub path: String,
    pub allow_write: bool,
    pub target_path: Option<String>,
    pub folder_structure: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModData {
    pub name: String,
    pub hash: String,
    pub status: String,
    pub color: String,
    pub is_script: bool,
    pub mtime: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CacheEntry {
    pub mtime: u64,
    pub dna_hash: String,
    #[serde(default)]
    pub explicitly_local: bool,
    #[serde(default)]
    pub quarantined: bool,
    #[serde(default)]
    pub heuristic_malware_sig: Option<String>,
    #[serde(default)]
    pub heuristic_sigs_mtime: u64,
}

pub type BunkerCache = HashMap<String, CacheEntry>;

pub struct SecurityState {
    pub malware_hashes: std::sync::Mutex<Vec<String>>,
    pub tier2_hashes: std::sync::Mutex<Vec<String>>,
}

#[derive(Serialize)]
pub struct Conflict {
    pub mod_pair: String,
    pub shared_assets: usize,
    pub severity_rank: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HeuristicSignature {
    pub id: String,
    pub signature: String,
    pub match_type: String,
    pub severity: String,
    pub source: String,
    pub enabled: bool,
    pub created_by: String,
    pub created_at: String,
    pub notes: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct QuarantineManifest {
    pub artifact_name: String,
    pub detected_hash: String,
    pub signature: String,
    pub quarantine_path: String,
    pub original_path: Option<String>,
    pub original_hash_at_import: Option<String>,
    pub original_exists: bool,
    pub original_shredded: bool,
    pub quarantined_file_shredded: bool,
    pub detected_at: String,
}

#[derive(Serialize)]
pub struct BackupInfo {
    pub name: String,
    pub size_mb: f64,
}

#[derive(Serialize, Clone)]
pub struct BackupProgress {
    pub current: usize,
    pub total: usize,
    pub action: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct HistoryEntry {
    pub timestamp: u64,
    pub content: String,
    #[serde(default)]
    pub pinned: Option<bool>,
}



pub struct DownloadsWatcherState(pub std::sync::Mutex<Option<std::sync::mpsc::Sender<()>>>);
