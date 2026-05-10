#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod parser;

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
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SolderConfig {
    pub live_path: String,
    pub mods_path: String,
    pub vault_path: String,
    pub engine_agency_level: Option<u32>,
    pub backup_preference: Option<u32>,
    pub backup_retention_cycles: Option<u32>,
}

#[derive(serde::Deserialize)]
pub struct DeployMod {
    pub path: String,
    pub allow_write: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModData {
    name: String,
    hash: String,
    status: String,
    color: String,
    is_script: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct CacheEntry {
    mtime: u64,
    dna_hash: String,
    #[serde(default)]
    explicitly_local: bool,
}

type BunkerCache = HashMap<String, CacheEntry>;

struct SecurityState {
    malware_hashes: std::sync::Mutex<Vec<String>>,
    tier2_hashes: std::sync::Mutex<Vec<String>>,
}

#[tauri::command]
fn sync_security_definitions(
    state: tauri::State<'_, SecurityState>,
    malware: Vec<String>,
    tier2: Vec<String>,
) -> Result<(), String> {
    if let Ok(mut m) = state.malware_hashes.lock() {
        *m = malware;
    }
    if let Ok(mut t) = state.tier2_hashes.lock() {
        *t = tier2;
    }
    Ok(())
}

fn get_cache_path(vault_path: &str) -> PathBuf {
    Path::new(vault_path).join(".sanctuary_cache.json")
}

fn load_cache(vault_path: &str) -> BunkerCache {
    let path = get_cache_path(vault_path);
    if let Ok(file) = std::fs::File::open(&path) {
        let reader = BufReader::new(file);
        if let Ok(cache) = serde_json::from_reader(reader) {
            return cache;
        }
    }
    HashMap::new()
}

fn save_cache(vault_path: &str, cache: &BunkerCache) {
    let path = get_cache_path(vault_path);
    if let Ok(file) = std::fs::File::create(&path) {
        let writer = BufWriter::new(file);
        let _ = serde_json::to_writer(writer, cache);
    }
}

#[tauri::command]
fn mark_explicitly_local(vault_path: String, file_path: String) -> Result<(), String> {
    let mut cache = load_cache(&vault_path);
    if let Some(entry) = cache.get_mut(&file_path) {
        entry.explicitly_local = true;
        save_cache(&vault_path, &cache);
        Ok(())
    } else {
        Err("File not found in cache".to_string())
    }
}

fn calculate_hash(path: &Path) -> Result<String, std::io::Error> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 1024 * 8];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex::encode(hasher.finalize()))
}

#[derive(Serialize)]
struct Conflict {
    mod_pair: String,
    shared_assets: usize,
    severity_rank: u32,
}

fn get_config_path() -> PathBuf {
    dirs::config_dir()
        .map(|d| d.join("SanctuaryOS"))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("sanctuary_config.json")
}

fn walk_packages(dir: &Path, files: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                walk_packages(&p, files);
            } else if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ext_lower == "package" || ext_lower == "ts4script" {
                    files.push(p);
                }
            }
        }
    }
}

#[tauri::command]
fn launch_game(live_path: String, mods_path: String) -> Result<String, String> {
    let mut doc_dir = std::path::PathBuf::from(&mods_path);
    if doc_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase()
        == "mods"
    {
        doc_dir.pop();
    }

    let check_and_delete = |dir: &std::path::Path| {
        if dir.exists() && dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_lowercase();
                    if (name.starts_with("lastexception") && name.ends_with(".txt"))
                        || (name.starts_with("lastuiexception") && name.ends_with(".txt"))
                        || (name.starts_with("lastcleanexception") && name.ends_with(".txt"))
                        || (name.starts_with("be-exceptionreport") && name.ends_with(".html"))
                        || name == "mc_lastexception.html"
                        || name == "localthumbcache.package"
                        || name == "avatarcache.package"
                        || name == "localsimtexturecache.package"
                    {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
    };

    check_and_delete(&doc_dir);
    check_and_delete(std::path::Path::new(&mods_path));

    let mut exe_path = std::path::PathBuf::from(&live_path);

    if !exe_path.ends_with("Bin") && !exe_path.ends_with("bin") {
        exe_path.push("Game");
        exe_path.push("Bin");
    }

    exe_path.push("TS4_x64.exe");

    if !exe_path.exists() {
        exe_path.pop();
        exe_path.push("TS4_DX9_x64.exe");

        if !exe_path.exists() {
            return Err("🛑 EXECUTABLE NOT FOUND: Verify System Coordinates.".to_string());
        }
    }

    let parent_dir = exe_path.parent().unwrap();

    match std::process::Command::new(&exe_path)
        .current_dir(parent_dir)
        .spawn()
    {
        Ok(_) => Ok("🚀 IGNITION SEQUENCE STARTED...".to_string()),
        Err(e) => Err(format!("🛑 LAUNCH FAILED: {}", e)),
    }
}

#[tauri::command]
fn rip_game_version(live_path: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;

    let mut bin_path = PathBuf::from(live_path);
    
    if bin_path.is_file() {
        bin_path.pop();
    } else if !bin_path.ends_with("Bin") && !bin_path.ends_with("bin") {
        bin_path.push("Game");
        bin_path.push("Bin");
    }

    let default_ini = bin_path.join("Default.ini");

    if !default_ini.exists() {
        return Err("DEFAULT_INI_MISSING".into());
    }

    if let Ok(content) = fs::read_to_string(&default_ini) {
        for line in content.lines() {
            if line.to_lowercase().starts_with("gameversion") {
                if let Some(idx) = line.find('=') {
                    let raw_version = line[idx + 1..].trim();
                    let version: String = raw_version.chars()
                        .filter(|c| c.is_ascii_digit() || *c == '.')
                        .collect();
                        
                    if !version.is_empty() {
                        return Ok(version);
                    }
                }
            }
        }
    }

    Err("VERSION_STRING_EMPTY".into())
}

#[tauri::command]
fn get_saved_coordinates() -> SolderConfig {
    let path = get_config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            return SolderConfig {
                live_path: v["live_path"]
                    .as_str()
                    .or(v["live_library_path"].as_str())
                    .unwrap_or("")
                    .to_string(),
                mods_path: v["mods_path"].as_str().unwrap_or("").to_string(),
                vault_path: v["vault_path"].as_str().unwrap_or("").to_string(),
                engine_agency_level: v["engine_agency_level"].as_u64().map(|n| n as u32),
                backup_preference: v["backup_preference"].as_u64().map(|n| n as u32),
                backup_retention_cycles: v["backup_retention_cycles"].as_u64().map(|n| n as u32),
            };
        }
    }
    SolderConfig::default()
}

#[tauri::command]
fn save_coordinates(
    live_path: String,
    mods_path: String,
    vault_path: String,
    engine_agency_level: Option<u32>,
    backup_preference: Option<u32>,
    backup_retention_cycles: Option<u32>,
) -> Result<String, String> {
    let json = serde_json::to_string_pretty(&SolderConfig {
        live_path,
        mods_path,
        vault_path,
        engine_agency_level,
        backup_preference,
        backup_retention_cycles,
    })
    .map_err(|e| e.to_string())?;
    fs::write(get_config_path(), json).map_err(|e| e.to_string())?;
    Ok("Locked".into())
}

fn deploy_air_gap(source: &Path, target: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(target)?;
    if let Ok(entries) = std::fs::read_dir(source) {
        for entry in entries.flatten() {
            let file_type = entry.file_type()?;
            let dest = target.join(entry.file_name());
            if file_type.is_dir() {
                deploy_air_gap(&entry.path(), &dest)?;
            } else {
                let _ = std::fs::hard_link(&entry.path(), &dest)
                    .or_else(|_| create_symlink_file(&entry.path(), &dest))
                    .or_else(|_| std::fs::copy(&entry.path(), &dest).map(|_| ()));
            }
        }
    }
    Ok(())
}

fn deploy_junction(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        let cmd_str = format!(
            "mklink /J \"{}\" \"{}\"",
            target.to_str().unwrap(),
            source.to_str().unwrap()
        );
        let status = std::process::Command::new("cmd")
            .args(&["/C", &cmd_str])
            .status()?;
            
        if let Ok(mut log_file) = std::fs::OpenOptions::new().create(true).append(true).open("C:\\Users\\Jesse\\Desktop\\Solder Republic\\deploy_debug.log") {
            use std::io::Write;
            let _ = writeln!(log_file, "Junction cmd: {}, success: {}", cmd_str, status.success());
        }
            
        if !status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Junction failed",
            ));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::os::unix::fs::symlink(source, target)?;
    }
    Ok(())
}

fn create_symlink_file(source: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::os::windows::fs::symlink_file(source, target)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::os::unix::fs::symlink(source, target)
    }
}

#[tauri::command]
async fn deploy_playset_bulk(
    mods: Vec<DeployMod>,
    mods_path: String,
    vault_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mods_dir = PathBuf::from(&mods_path);
        let vault_dir = PathBuf::from(&vault_path);
        
        if let Ok(mut log_file) = std::fs::OpenOptions::new().create(true).append(true).open("C:\\Users\\Jesse\\Desktop\\Solder Republic\\deploy_debug.log") {
            use std::io::Write;
            let _ = writeln!(log_file, "--- NEW DEPLOYMENT ---");
            for m in &mods {
                let _ = writeln!(log_file, "Deploying: {}", m.path);
            }
        }

        let vault_mods_lane = if vault_dir.ends_with("Mods") {
            vault_dir.clone()
        } else {
            vault_dir.join("Mods")
        };

        if !mods_dir.exists() {
            return Err("Mods folder missing.".into());
        }

        if let Ok(entries) = std::fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.file_name().map_or(false, |n| n == "Resource.cfg") {
                    continue;
                }
                if path.is_dir() {
                    if std::fs::remove_dir(&path).is_err() {
                        let _ = std::fs::remove_dir_all(&path);
                    }
                } else {
                    let _ = std::fs::remove_file(path);
                }
            }
        }

        let config_content = "Priority 500\nPackedFile *.package\nPackedFile */*.package\nPackedFile */*/*.package\nPackedFile */*/*/*.package\nPackedFile */*/*/*/*.package\nPackedFile */Delta/tmscenario1.tmdelta\nPackedFile Data/*Strings.tmcatalog\nPackedFile */Data/*Strings.tmcatalog\n\nPriority 1000\nPackedFile Sanctuary/*.package\nPackedFile Sanctuary/*/*.package\nPackedFile Sanctuary/*/*/*.package\n\nPriority 1500\nPackedFile Sanctuary2/*.package\nPackedFile Sanctuary2/*/*.package\nPackedFile Sanctuary2/*/*/*.package\n\nPriority 2000\nPackedFile Sanctuary3/*.package\nPackedFile Sanctuary3/*/*.package\nPackedFile Sanctuary3/*/*/*.package";
        let _ = std::fs::write(mods_dir.join("Resource.cfg"), config_content);

        let mut count = 0;
        for m in mods {
            let mut source = vault_mods_lane.join(&m.path);
            let folders_to_check = vec!["", "!Sanctuary", "!Sanctuary2", "!Sanctuary3", "Sanctuary", "Sanctuary2", "Sanctuary3"];
            let mut found = false;
            for f in &folders_to_check {
                let base_test = if f.is_empty() {
                    vault_mods_lane.join(&m.path)
                } else {
                    vault_mods_lane.join(f).join(&m.path)
                };
                
                if base_test.exists() {
                    source = base_test;
                    found = true;
                    break;
                } else if base_test.with_extension("package").exists() {
                    source = base_test.with_extension("package");
                    found = true;
                    break;
                } else if base_test.with_extension("ts4script").exists() {
                    source = base_test.with_extension("ts4script");
                    found = true;
                    break;
                }
            }

            if !found {
                continue;
            }

            let path_parts: Vec<_> = Path::new(&m.path).components().collect();
            if path_parts.len() < 1 {
                continue;
            }

            let file_name = Path::new(&m.path)
                .file_name()
                .unwrap_or_default();
            
            let target = mods_dir.join(file_name);

            if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            if m.allow_write {
                if source.is_dir() {
                    let _ = deploy_junction(&source, &target);
                } else {
                    let _ = create_symlink_file(&source, &target)
                        .or_else(|_| std::fs::hard_link(&source, &target))
                        .or_else(|_| std::fs::copy(&source, &target).map(|_| ()));
                }
            } else {
                if source.is_dir() {
                    let _ = deploy_air_gap(&source, &target);
                } else {
                    let _ = create_symlink_file(&source, &target)
                        .or_else(|_| std::fs::hard_link(&source, &target))
                        .or_else(|_| std::fs::copy(&source, &target).map(|_| ()));
                }
            }
            
            if !source.is_dir() {
                if let Some(ext) = source.extension().and_then(|e| e.to_str()) {
                    let target_ext = if ext.eq_ignore_ascii_case("package") {
                        Some("ts4script")
                    } else if ext.eq_ignore_ascii_case("ts4script") {
                        Some("package")
                    } else {
                        None
                    };
                    
                    if let Some(other_ext) = target_ext {
                        let twin_source = source.with_extension(other_ext);
                        if twin_source.exists() {
                            let twin_target = target.with_extension(other_ext);
                            let _ = create_symlink_file(&twin_source, &twin_target)
                                .or_else(|_| std::fs::hard_link(&twin_source, &twin_target))
                                .or_else(|_| std::fs::copy(&twin_source, &twin_target).map(|_| ()));
                        }
                    }
                }
            }

            if let Some(source_parent) = source.parent() {
                if let Some(target_parent) = target.parent() {
                    let mut is_top_level = source_parent == vault_mods_lane.as_path();
                    for f in &folders_to_check {
                        if !f.is_empty() {
                            let f_path = vault_mods_lane.join(f);
                            if source_parent == f_path.as_path() {
                                is_top_level = true;
                                break;
                            }
                        }
                    }
                    
                    if !is_top_level {
                        if let Ok(entries) = std::fs::read_dir(source_parent) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                            if path.is_dir() {
                                let dest = target_parent.join(entry.file_name());
                                if !dest.exists() {
                                    if m.allow_write {
                                        let _ = deploy_junction(&path, &dest);
                                    } else {
                                        let _ = deploy_air_gap(&path, &dest);
                                    }
                                }
                            } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                                let ext_lower = ext.to_lowercase();
                                if ext_lower != "package" && ext_lower != "ts4script" {
                                    let dest = target_parent.join(entry.file_name());
                                    if !dest.exists() {
                                        let _ = create_symlink_file(&path, &dest)
                                            .or_else(|_| std::fs::hard_link(&path, &dest))
                                            .or_else(|_| std::fs::copy(&path, &dest).map(|_| ()));
                                    }
                                }
                            }
                        }
                    }
                    }
                }
            }

            count += 1;
        }

        Ok(format!(
            "Deployed {} artifacts to Root. Load order integrity maintained.",
            count
        ))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn sanitize_vault(vault_path: String) -> Result<String, String> {
    let vault_root = PathBuf::from(&vault_path);
    let backups_dir = vault_root.join("Backups");
    let backups_world = backups_dir.join("World");
    let backups_engine = backups_dir.join("Engine");
    let backups_mods = backups_dir.join("Mods");
    let data_dir = vault_root.join("Data");
    let data_cache = data_dir.join("cache");
    let blueprints_dir = vault_root.join("Blueprints");
    let mods_lane = vault_root.join("Mods");
    let quarantine_dir = vault_root.join("Quarantine");
    let theme_dir = vault_root.join("Theme");
    let theme_chameleon = theme_dir.join("Chameleon");
    let theme_lexicon = theme_dir.join("Lexicon");

    let _ = std::fs::create_dir_all(&backups_world);
    let _ = std::fs::create_dir_all(&backups_engine);
    let _ = std::fs::create_dir_all(&backups_mods);
    let _ = std::fs::create_dir_all(&data_cache);
    let _ = std::fs::create_dir_all(&blueprints_dir);
    let _ = std::fs::create_dir_all(&mods_lane);
    let _ = std::fs::create_dir_all(&quarantine_dir);
    let _ = std::fs::create_dir_all(&theme_chameleon);
    let _ = std::fs::create_dir_all(&theme_lexicon);

    let mut moved = 0;

    if let Ok(entries) = std::fs::read_dir(&vault_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "zst") {
                let dest = backups_world.join(path.file_name().unwrap());
                if std::fs::rename(&path, &dest).is_err() {
                    if std::fs::copy(&path, &dest).is_ok() {
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
        }
    }

    if let Ok(entries) = std::fs::read_dir(&mods_lane) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ext_lower == "package" || ext_lower == "ts4script" {
                        if let Some(file_stem) = path.file_stem() {
                            let folder_name = file_stem.to_string_lossy().to_string();
                            let target_dir = mods_lane.join(&folder_name);
                            let _ = std::fs::create_dir_all(&target_dir);

                            let target_path = target_dir.join(path.file_name().unwrap());
                            let _ = std::fs::rename(&path, &target_path);
                            moved += 1;
                        }
                    }
                }
            }
        }
    }

    Ok(format!(
        "Sanitization Complete: {} files reorganized into strict Folders.",
        moved
    ))
}

#[tauri::command]
fn purge_from_shelter(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if path.exists() {
        if path.is_dir() {
            std::fs::remove_dir_all(path).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        return Ok("PURGED".into());
    }
    Err("NOT_FOUND".into())
}

#[tauri::command]
async fn scan_installed_dlc(live_path: String) -> Result<Vec<String>, String> {
    let mut installed_packs = Vec::new();
    let mut base_path = std::path::PathBuf::from(&live_path);

    if base_path.is_file() {
        base_path.pop();
    }

    let root = if base_path.ends_with("Bin") || base_path.ends_with("bin") || base_path.ends_with("Bin_LE") || base_path.ends_with("bin_le") {
        base_path
            .parent()
            .and_then(|p| p.parent())
            .unwrap_or(base_path.as_path())
    } else {
        base_path.as_path()
    };

    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            if let Ok(name) = entry.file_name().into_string() {
                let name_up = name.to_uppercase();
                if name_up.starts_with("EP")
                    || name_up.starts_with("GP")
                    || name_up.starts_with("SP")
                    || name_up.starts_with("FP")
                {
                    installed_packs.push(name_up);
                }
            }
        }
    }
    installed_packs.sort();
    Ok(installed_packs)
}

#[tauri::command]
fn generate_full_dna_hash(file_path: PathBuf) -> String {
    let file = match std::fs::File::open(&file_path) {
        Ok(f) => f,
        Err(_) => return "0".into(),
    };
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];

    while let Ok(count) = reader.read(&mut buffer) {
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect()
}

fn check_is_explicitly_local(path: &Path, is_script: bool) -> bool {
    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
    
    if file_name.contains("customchallenge") {
        return true;
    }

    if file_name.contains("simmattic") || file_name.contains("simmatic") {
        return false;
    }

    if is_script {
        if let Ok(file) = std::fs::File::open(path) {
            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                for i in 0..archive.len() {
                    if let Ok(file) = archive.by_index(i) {
                        let name = file.name().to_lowercase();
                        if name.contains("__pycache__") {
                            return true;
                        }
                        if name.ends_with(".pyc") && name.contains('/') {
                            return true;
                        }
                    }
                }
            }
        }
    } else {
        if let Ok(mut file) = std::fs::File::open(path) {
            let mut reader = BufReader::new(file);
            let mut buffer = [0u8; 72];
            if reader.read_exact(&mut buffer).is_ok() && &buffer[0..4] == b"DBPF" {
                let major = u32::from_le_bytes(buffer[4..8].try_into().unwrap());
                let minor = u32::from_le_bytes(buffer[8..12].try_into().unwrap());
                
                if minor > 1 { 
                    return true;
                }

                let index_count = u32::from_le_bytes(buffer[36..40].try_into().unwrap());

                let (index_size, index_offset) = if major == 2 && minor == 0 {
                    let offset = u32::from_le_bytes(buffer[40..44].try_into().unwrap()) as u64;
                    let size = u32::from_le_bytes(buffer[44..48].try_into().unwrap());
                    (size, offset)
                } else {
                    let size = u32::from_le_bytes(buffer[40..44].try_into().unwrap());
                    let offset = u64::from_le_bytes(buffer[64..72].try_into().unwrap());
                    (size, offset)
                };

                if index_count > 0 && index_count < 1_000_000 {
                    if reader.seek(SeekFrom::Start(index_offset)).is_ok() {
                        let mut flags_buf = [0u8; 4];
                        if reader.read_exact(&mut flags_buf).is_ok() {
                            let flags = u32::from_le_bytes(flags_buf);
                            let mut const_bytes = 4;
                            let mut const_type = 0u32;
                            let mut const_group = 0u32;
                            let mut const_inst_ex = 0u32;

                            if flags & 0x01 != 0 {
                                let mut b = [0u8; 4];
                                if reader.read_exact(&mut b).is_ok() {
                                    const_type = u32::from_le_bytes(b);
                                    const_bytes += 4;
                                }
                            }
                            if flags & 0x02 != 0 {
                                let mut b = [0u8; 4];
                                if reader.read_exact(&mut b).is_ok() {
                                    const_group = u32::from_le_bytes(b);
                                    const_bytes += 4;
                                }
                            }
                            if flags & 0x04 != 0 {
                                let mut b = [0u8; 4];
                                if reader.read_exact(&mut b).is_ok() {
                                    const_inst_ex = u32::from_le_bytes(b);
                                    const_bytes += 4;
                                }
                            }

                            let entry_size = 32 - const_bytes;
                            let mut entries_buf = vec![0u8; (index_count * entry_size) as usize];
                            if reader.read_exact(&mut entries_buf).is_ok() {
                                let mut casp_count = 0;
                                let mut objd_count = 0;
                                let mut offset = 0;

                                for _ in 0..index_count {
                                    if offset + 4 > entries_buf.len() { break; }
                                    let mut t = const_type;
                                    if flags & 0x01 == 0 {
                                        let b: [u8; 4] = entries_buf[offset..offset + 4].try_into().unwrap();
                                        t = u32::from_le_bytes(b);
                                        offset += 4;
                                    }
                                    if flags & 0x02 == 0 { offset += 4; } 
                                    if flags & 0x04 == 0 { offset += 4; } 
                                    offset += 8; 
                                    offset += 4; 
                                    offset += 4; 

                                    if t == 0x54533453 { return true; } 
                                    if t == 0x01357924 { return true; } 
                                    if t == 0x034AEECB { casp_count += 1; }
                                    if t == 0x319E4F1D { objd_count += 1; }
                                }

                                if casp_count > 50 || objd_count > 50 {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

#[tauri::command]
fn scan_bunker(
    app: tauri::AppHandle,
    vault_path: String,
    _shelter_active: bool,
    state: tauri::State<'_, SecurityState>,
) -> Result<Vec<ModData>, String> {
    let vault_dir = PathBuf::from(&vault_path);
    let mods_lane = if vault_dir.ends_with("Mods") {
        vault_dir.clone()
    } else {
        vault_dir.join("Mods")
    };

    let mut cache = load_cache(&vault_path);
    let mut cache_updated = false;
    if !mods_lane.exists() {
        let _ = fs::create_dir_all(&mods_lane);
        return Ok(vec![]);
    }

   
    if let Ok(entries) = std::fs::read_dir(&mods_lane) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ext_lower == "package" || ext_lower == "ts4script" {
                        if let Some(file_stem) = path.file_stem() {
                            let folder_name = file_stem.to_string_lossy().to_string();
                            let target_dir = mods_lane.join(&folder_name);
                            let _ = std::fs::create_dir_all(&target_dir);

                            let target_path = target_dir.join(path.file_name().unwrap());
                            let _ = std::fs::rename(&path, &target_path);
                        }
                    }
                }
            }
        }
    }

    let mut paths = Vec::new();
    walk_packages(&mods_lane, &mut paths);
    let total = paths.len();

    let progress_counter = Arc::new(AtomicUsize::new(0));
    let mut results = Vec::new();
    let mut last_emit = std::time::Instant::now();

    for path in paths {
        let path_str = path.to_string_lossy().to_string();
        let rel = path
            .strip_prefix(&mods_lane)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        let current = progress_counter.fetch_add(1, Ordering::SeqCst) + 1;
        if last_emit.elapsed() > std::time::Duration::from_millis(50) || current == total {
            let _ = app.emit(
                "scan-progress",
                serde_json::json!({
                    "current": current,
                    "total": total,
                    "message": format!("ANALYZING DNA: {}/{}", current, total)
                }),
            );
            last_emit = std::time::Instant::now();
        }

        let mtime = fs::metadata(&path)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let is_script = path.extension().map_or(false, |ext| ext == "ts4script");
        
        let (dna_hash, explicitly_local) = if let Some(cached) = cache.get(&path_str) {
            if cached.mtime == mtime {
                (cached.dna_hash.clone(), cached.explicitly_local)
            } else {
                let hash = calculate_hash(&path).unwrap_or_default();
                let explicit = check_is_explicitly_local(&path, is_script);
                cache.insert(
                    path_str.clone(),
                    CacheEntry {
                        mtime,
                        dna_hash: hash.clone(),
                        explicitly_local: explicit,
                    },
                );
                cache_updated = true;
                (hash, explicit)
            }
        } else {
            let hash = calculate_hash(&path).unwrap_or_default();
            let explicit = check_is_explicitly_local(&path, is_script);
            cache.insert(
                path_str.clone(),
                CacheEntry {
                    mtime,
                    dna_hash: hash.clone(),
                    explicitly_local: explicit,
                },
            );
            cache_updated = true;
            (hash, explicit)
        };



        // We no longer block startup with a DNA match popup.
        // Duplicates will just be indexed normally, which is far less annoying for the user.

        let is_malware = {
            if let Ok(m) = state.malware_hashes.lock() {
                m.contains(&dna_hash)
            } else {
                false
            }
        };

        if is_malware {
            let quarantine_dir = vault_dir.join(".sanctuary_quarantine");
            let _ = fs::create_dir_all(&quarantine_dir);
            let target = quarantine_dir.join(path.file_name().unwrap_or_default());
            let _ = fs::rename(&path, &target);
            results.push(ModData {
                name: rel.replace("\\", "/"),
                hash: dna_hash,
                status: "☣️ QUARANTINED".to_string(),
                color: "var(--danger)".to_string(),
                is_script: path.extension().map_or(false, |ext| ext == "ts4script"),
            });
            continue;
        }

        let status_string = if explicitly_local {
            "🚫 EXPLICIT LOCAL".to_string()
        } else {
            "🔘 LOCAL_ONLY".to_string()
        };

        results.push(ModData {
            name: rel.replace("\\", "/"),
            hash: dna_hash,
            status: status_string,
            color: "var(--text-sub)".to_string(),
            is_script,
        });
    }

    if cache_updated {
        save_cache(&vault_path, &cache);
    }
    Ok(results)
}

#[tauri::command]
async fn run_conflict_radar(
    mods_path: String,
    target_files: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let mut resource_map: HashMap<(u32, u32, u64), String> = HashMap::new();
    let mut conflicts: HashMap<String, Conflict> = HashMap::new();
    let mods_dir = Path::new(&mods_path);
    let mut packages = Vec::new();
    walk_packages(mods_dir, &mut packages);

    if let Some(targets) = target_files {
        packages.retain(|p| {
            if let Ok(rel) = p.strip_prefix(mods_dir) {
                let name = rel.to_string_lossy().replace("\\", "/");
                targets.contains(&name)
            } else {
                false
            }
        });
    }

    let mut installed_files = Vec::new();
    for path in packages {
        let file_name = path
            .strip_prefix(mods_dir)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace("\\", "/");
        installed_files.push(file_name.clone());

        if let Ok(file) = std::fs::File::open(&path) {
            let mut reader = BufReader::new(file);
            let mut buffer = [0u8; 72];
            if reader.read_exact(&mut buffer).is_ok() && &buffer[0..4] == b"DBPF" {
                let major = u32::from_le_bytes(buffer[4..8].try_into().unwrap());
                let minor = u32::from_le_bytes(buffer[8..12].try_into().unwrap());
                let index_count = u32::from_le_bytes(buffer[36..40].try_into().unwrap());

                let (index_size, index_offset) = if major == 2 && minor == 0 {
                    let offset = u32::from_le_bytes(buffer[40..44].try_into().unwrap()) as u64;
                    let size = u32::from_le_bytes(buffer[44..48].try_into().unwrap());
                    (size, offset)
                } else {
                    let size = u32::from_le_bytes(buffer[40..44].try_into().unwrap());
                    let offset = u64::from_le_bytes(buffer[64..72].try_into().unwrap());
                    (size, offset)
                };

                if index_count > 0 && index_count < 1_000_000 {
                    if reader.seek(SeekFrom::Start(index_offset)).is_ok() {
                        let mut flags_buf = [0u8; 4];
                        if reader.read_exact(&mut flags_buf).is_ok() {
                            let flags = u32::from_le_bytes(flags_buf);
                            let mut const_bytes = 4;
                            let mut const_type = 0u32;
                            let mut const_group = 0u32;
                            let mut const_inst_ex = 0u32;

                            if flags & 0x01 != 0 {
                                let mut b = [0u8; 4];
                                reader.read_exact(&mut b).unwrap_or_default();
                                const_type = u32::from_le_bytes(b);
                                const_bytes += 4;
                            }
                            if flags & 0x02 != 0 {
                                let mut b = [0u8; 4];
                                reader.read_exact(&mut b).unwrap_or_default();
                                const_group = u32::from_le_bytes(b);
                                const_bytes += 4;
                            }
                            if flags & 0x04 != 0 {
                                let mut b = [0u8; 4];
                                reader.read_exact(&mut b).unwrap_or_default();
                                const_inst_ex = u32::from_le_bytes(b);
                                const_bytes += 4;
                            }

                            let record_size = if index_count > 0 {
                                index_size.saturating_sub(const_bytes) / index_count
                            } else {
                                0
                            };

                            for _ in 0..index_count {
                                let mut bytes_read = 0;
                                let mut t = const_type;
                                let mut g = const_group;
                                let mut i_ex = const_inst_ex;

                                if flags & 0x01 == 0 {
                                    let mut b = [0u8; 4];
                                    if reader.read_exact(&mut b).is_err() {
                                        break;
                                    }
                                    t = u32::from_le_bytes(b);
                                    bytes_read += 4;
                                }
                                if flags & 0x02 == 0 {
                                    let mut b = [0u8; 4];
                                    if reader.read_exact(&mut b).is_err() {
                                        break;
                                    }
                                    g = u32::from_le_bytes(b);
                                    bytes_read += 4;
                                }
                                if flags & 0x04 == 0 {
                                    let mut b = [0u8; 4];
                                    if reader.read_exact(&mut b).is_err() {
                                        break;
                                    }
                                    i_ex = u32::from_le_bytes(b);
                                    bytes_read += 4;
                                }

                                let mut b4 = [0u8; 4];
                                if reader.read_exact(&mut b4).is_err() {
                                    break;
                                }
                                let i_low = u32::from_le_bytes(b4);
                                bytes_read += 4;

                                let skip_bytes = record_size.saturating_sub(bytes_read);
                                if skip_bytes > 0 {
                                    if reader.seek(SeekFrom::Current(skip_bytes as i64)).is_err() {
                                        break;
                                    }
                                }

                                let i = ((i_ex as u64) << 32) | (i_low as u64);
                                let key = (t, g, i);

                                let is_harmless = match t {
                                    0x00B2D882 | 0x034AEECB | 0x220557DA | 0x00000000 => true,
                                    _ => false,
                                };

                                if is_harmless {
                                    continue;
                                }

                                if let Some(clash) = resource_map.get(&key) {
                                    if clash != &file_name {
                                        let mut pair = vec![clash.clone(), file_name.clone()];
                                        pair.sort();
                                        let pair_key = format!("{}  ⚔️  {}", pair[0], pair[1]);

                                        let entry =
                                            conflicts.entry(pair_key.clone()).or_insert(Conflict {
                                                mod_pair: pair_key,
                                                shared_assets: 0,
                                                severity_rank: 0,
                                            });
                                        entry.shared_assets += 1;

                                        let rank = match t {
                                            0x02D5DF13 => 4,
                                            0x03B33DDF | 0x545AC67A | 0x62E94D38 => 3,
                                            _ => 1,
                                        };
                                        if rank > entry.severity_rank {
                                            entry.severity_rank = rank;
                                        }
                                    }
                                } else {
                                    resource_map.insert(key, file_name.clone());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "total_packages": installed_files.len(),
        "installed_mods": installed_files,
        "conflicts": conflicts.into_values().collect::<Vec<Conflict>>()
    }))
}

#[tauri::command]
fn move_to_vault(
    app: tauri::AppHandle,
    file_name: String,
    mods_path: String,
    vault_path: String,
    force_replace: bool,
) -> Result<String, String> {
    let source = PathBuf::from(&mods_path).join(&file_name);
    let dest = PathBuf::from(&vault_path).join("Mods").join(&file_name);

    if !source.is_dir() && !force_replace {
        let hash = calculate_hash(&source).unwrap_or_default();
        let cache = load_cache(&vault_path);
        let mut exists = false;
        let mut existing_name = String::new();
        for (k, v) in cache.iter() {
            if v.dna_hash == hash && !hash.is_empty() {
                exists = true;
                existing_name = k.clone();
                break;
            }
        }
        if exists {
            let _ = app.emit("dna_match_detected", serde_json::json!({ "path": source.to_string_lossy().to_string(), "hash": hash, "existing_name": existing_name, "file_name": file_name, "source_action": "move_to_vault" }));
            return Err("DNA_MATCH".into());
        }
    }

    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::rename(&source, &dest)
        .or_else(|_| fs::copy(&source, &dest).and_then(|_| fs::remove_file(&source)))
        .map_err(|e| format!("Failed to move {}: {}", file_name, e))?;
    Ok("Vaulted".into())
}

#[tauri::command]
fn set_mod_override(file_name: String, mods_path: String) -> Result<String, String> {
    let mods_dir = PathBuf::from(&mods_path);
    let config_content = "Priority 500\nPackedFile *.package\nPackedFile */*.package\nPackedFile */*/*.package\nPackedFile */*/*/*.package\nPackedFile */*/*/*/*.package\nPackedFile */Delta/tmscenario1.tmdelta\nPackedFile Data/*Strings.tmcatalog\nPackedFile */Data/*Strings.tmcatalog\n\nPriority 1000\nPackedFile Sanctuary/*.package\nPackedFile Sanctuary/*/*.package\nPackedFile Sanctuary/*/*/*.package\n\nPriority 1500\nPackedFile Sanctuary2/*.package\nPackedFile Sanctuary2/*/*.package\nPackedFile Sanctuary2/*/*/*.package\n\nPriority 2000\nPackedFile Sanctuary3/*.package\nPackedFile Sanctuary3/*/*.package\nPackedFile Sanctuary3/*/*/*.package";
    let _ = fs::write(mods_dir.join("Resource.cfg"), config_content);

    let source = mods_dir.join(&file_name);
    if let Some(parent) = source.parent() {
        let override_dir = parent.join("Sanctuary");
        let _ = fs::create_dir_all(&override_dir);
        let dest = override_dir.join(source.file_name().unwrap());
        fs::rename(&source, &dest)
            .or_else(|_| fs::copy(&source, &dest).and_then(|_| fs::remove_file(&source)))
            .map_err(|e| format!("Failed to set override {}: {}", file_name, e))?;
    }
    Ok("Override Applied".into())
}

fn find_backup(vault_path: &str, file_name: &str) -> Option<PathBuf> {
    let base = PathBuf::from(vault_path).join("Backups");
    let p = base.join(file_name);
    if p.exists() {
        return Some(p);
    }
    for sub in &["World", "Engine", "Mods"] {
        let p2 = base.join(sub).join(file_name);
        if p2.exists() {
            return Some(p2);
        }
    }
    None
}

#[tauri::command]
fn get_backups(vault_path: String) -> Result<Vec<String>, String> {
    let mut files = vec![];
    let base = PathBuf::from(&vault_path).join("Backups");
    for sub in &["World", "Engine", "Mods"] {
        if let Ok(entries) = fs::read_dir(base.join(sub)) {
            for e in entries.flatten() {
                if e.path().extension() == Some("zst".as_ref()) {
                    files.push(e.file_name().to_string_lossy().into_owned());
                }
            }
        }
    }
    if let Ok(entries) = fs::read_dir(&base) {
        for e in entries.flatten() {
            if e.path().is_file() && e.path().extension() == Some("zst".as_ref()) {
                files.push(e.file_name().to_string_lossy().into_owned());
            }
        }
    }
    Ok(files)
}

#[tauri::command]
fn delete_backup(file_name: String) -> Result<String, String> {
    let config = get_saved_coordinates();
    if let Some(path) = find_backup(&config.vault_path, &file_name) {
        fs::remove_file(path).map_err(|e| e.to_string())?;
        Ok("Deleted.".into())
    } else {
        Err("Not found.".into())
    }
}

#[tauri::command]
fn rename_backup(old_name: String, new_name: String) -> Result<String, String> {
    let config = get_saved_coordinates();
    if let Some(old_path) = find_backup(&config.vault_path, &old_name) {
        let mut final_name = new_name.trim().to_string();
        if !final_name.ends_with(".zst") {
            final_name = format!("{}.tar.zst", final_name);
        }
        let new_path = old_path.with_file_name(&final_name);
        fs::rename(old_path, new_path).map_err(|e| e.to_string())?;
        Ok(final_name)
    } else {
        Err("Not found.".into())
    }
}

#[derive(Serialize, Clone)]
struct BackupProgress {
    current: usize,
    total: usize,
    action: String,
}

fn get_all_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if dir.is_file() {
        files.push(dir.to_path_buf());
        return files;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files.extend(get_all_files(&path));
            } else {
                files.push(path);
            }
        }
    }
    files
}

#[tauri::command]
async fn backup_universe(
    app: tauri::AppHandle,
    docs_path: String,
    version: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let sims_docs_path = PathBuf::from(&docs_path);
        let backup_name = format!(
            "World_State_{}_{}.tar.zst",
            version,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        let backup_path = PathBuf::from(&config.vault_path)
            .join("Backups")
            .join("World")
            .join(&backup_name);
        if let Some(parent) = backup_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let tar_file = std::fs::File::create(&backup_path).map_err(|e| e.to_string())?;
        let mut enc = zstd::Encoder::new(tar_file, 3).map_err(|e| e.to_string())?;
        enc.multithread(0).map_err(|e| e.to_string())?;
        let mut builder = tar::Builder::new(enc);
        let targets = vec![
            ("Saves", sims_docs_path.join("Saves")),
            ("Tray", sims_docs_path.join("Tray")),
            ("Options.ini", sims_docs_path.join("Options.ini")),
        ];

        let mut files_to_backup = Vec::new();
        for (_name, path) in &targets {
            if path.exists() {
                files_to_backup.extend(get_all_files(path));
            }
        }

        let total = files_to_backup.len();
        if total == 0 {
            return Ok(backup_name);
        }
        let _ = app.emit(
            "backup-progress",
            BackupProgress {
                current: 0,
                total,
                action: "Archiving World State...".into(),
            },
        );

        let mut last_emit = std::time::Instant::now();
        for (i, file_path) in files_to_backup.iter().enumerate() {
            if let Ok(stripped) = file_path.strip_prefix(&sims_docs_path) {
                if let Ok(mut f) = std::fs::File::open(file_path) {
                    let _ = builder.append_file(stripped, &mut f);
                }
            }
            if last_emit.elapsed() > std::time::Duration::from_millis(50) || i == total - 1 {
                let _ = app.emit(
                    "backup-progress",
                    BackupProgress {
                        current: i + 1,
                        total,
                        action: format!("Archiving World State..."),
                    },
                );
                last_emit = std::time::Instant::now();
            }
        }

        builder.finish().map_err(|e| e.to_string())?;
        builder
            .into_inner()
            .map_err(|e| e.to_string())?
            .finish()
            .map_err(|e| e.to_string())?;
        let _ = app.emit(
            "backup-progress",
            BackupProgress {
                current: total,
                total,
                action: "World Archive Complete!".into(),
            },
        );
        Ok(backup_name)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn backup_engine_full(
    app: tauri::AppHandle,
    live_path: String,
    version: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let base_path = PathBuf::from(&live_path)
            .parent()
            .and_then(|p| p.parent())
            .ok_or("Invalid path")?
            .to_path_buf();
        let backup_name = format!(
            "Engine_Full--{}--{}.tar.zst",
            version,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
        );
        let backup_path = PathBuf::from(&config.vault_path)
            .join("Backups")
            .join("Engine")
            .join(&backup_name);
        if let Some(parent) = backup_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let tar_file = std::fs::File::create(&backup_path).map_err(|e| e.to_string())?;
        let mut enc = zstd::Encoder::new(tar_file, 1).map_err(|e| e.to_string())?;
        enc.multithread(0).map_err(|e| e.to_string())?;
        let mut builder = tar::Builder::new(enc);
        let targets = vec![
            ("Game/Bin", base_path.join("Game/Bin")),
            ("Data", base_path.join("Data")),
            ("Delta", base_path.join("Delta")),
        ];

        let mut files_to_backup = Vec::new();
        for (_name, path) in &targets {
            if path.exists() {
                files_to_backup.extend(get_all_files(path));
            }
        }

        let total = files_to_backup.len();
        if total == 0 {
            return Ok(backup_name);
        }
        let _ = app.emit(
            "backup-progress",
            BackupProgress {
                current: 0,
                total,
                action: "Sealing Engine Core...".into(),
            },
        );

        let mut last_emit = std::time::Instant::now();
        for (i, file_path) in files_to_backup.iter().enumerate() {
            if let Ok(stripped) = file_path.strip_prefix(&base_path) {
                if let Ok(mut f) = std::fs::File::open(file_path) {
                    let _ = builder.append_file(stripped, &mut f);
                }
            }
            if last_emit.elapsed() > std::time::Duration::from_millis(50) || i == total - 1 {
                let _ = app.emit(
                    "backup-progress",
                    BackupProgress {
                        current: i + 1,
                        total,
                        action: format!("Sealing Engine Core..."),
                    },
                );
                last_emit = std::time::Instant::now();
            }
        }

        builder.finish().map_err(|e| e.to_string())?;
        builder
            .into_inner()
            .map_err(|e| e.to_string())?
            .finish()
            .map_err(|e| e.to_string())?;
        let _ = app.emit(
            "backup-progress",
            BackupProgress {
                current: total,
                total,
                action: "Engine Vault Sealed!".into(),
            },
        );
        Ok(format!("Secured: {}", backup_name))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn restore_game_data(
    docs_path: String,
    live_path: String,
    backup_name: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let arc =
            find_backup(&config.vault_path, &backup_name).ok_or("Backup not found in Vault")?;
        let target = if backup_name.contains("Engine") {
            PathBuf::from(live_path)
                .parent()
                .and_then(|p| p.parent())
                .unwrap()
                .to_path_buf()
        } else {
            PathBuf::from(docs_path)
        };
        let tar_file = std::fs::File::open(arc).map_err(|e| e.to_string())?;
        let mut archive =
            tar::Archive::new(zstd::Decoder::new(tar_file).map_err(|e| e.to_string())?);
        archive.unpack(target).map_err(|e| e.to_string())?;
        Ok("Restored".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_game_version(mods_path: String) -> String {
    let version_path = PathBuf::from(mods_path)
        .parent()
        .map(|p| p.join("GameVersion.txt"))
        .unwrap_or_default();
    match fs::read_to_string(version_path) {
        Ok(v) => v
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '.')
            .collect::<String>(),
        Err(_) => "v.Unknown".into(),
    }
}

#[tauri::command]
fn read_blueprint(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_blueprint(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn wipe_symlinks() -> Result<String, String> {
    let config = get_saved_coordinates();
    let mods_dir = std::path::PathBuf::from(&config.live_path);
    if !mods_dir.exists() {
        return Ok("No Mods folder".into());
    }
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.filter_map(Result::ok) {
            if let Ok(meta) = std::fs::symlink_metadata(&entry.path()) {
                if meta.file_type().is_symlink() || entry.path().read_link().is_ok() {
                    if entry.path().is_dir() {
                        let _ = std::fs::remove_dir(&entry.path());
                    } else {
                        let _ = std::fs::remove_file(&entry.path());
                    }
                    count += 1;
                }
            }
        }
    }
    Ok(format!("{} active links severed.", count))
}

#[tauri::command]
async fn evacuate_to_shelter() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let mods_dir = PathBuf::from(&config.mods_path);
        let vault_mods_lane = PathBuf::from(&config.vault_path).join("Mods");
        if !mods_dir.exists() {
            return Err("Mods path not found.".into());
        }
        let mut items = Vec::new();
        
        fn walk_physical_items(dir: &Path, items: &mut Vec<PathBuf>) {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let is_symlink_or_junction = fs::read_link(&path).is_ok() || 
                        fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false);
                    
                    if is_symlink_or_junction {
                        items.push(path);
                    } else if path.is_dir() {
                        items.push(path.clone());
                        walk_physical_items(&path, items);
                    } else {
                        items.push(path);
                    }
                }
            }
        }
        
        walk_physical_items(&mods_dir, &mut items);
        
        let mut moved = 0;
        let mut exorcised = 0;
        
        items.sort_by_key(|p| p.to_string_lossy().len());
        items.reverse();

        for path in items {
            if path.file_name().map_or(false, |n| n == "Resource.cfg") {
                continue;
            }
            if let Ok(rel_path) = path.strip_prefix(&mods_dir) {
                let dest = vault_mods_lane.join(rel_path);
                
                let is_symlink_or_junction = fs::read_link(&path).is_ok() || 
                    fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false);
                
                if is_symlink_or_junction {
                    if fs::remove_file(&path).is_ok() || fs::remove_dir(&path).is_ok() {
                        exorcised += 1;
                    }
                } else if path.is_dir() {
                    let _ = fs::remove_dir(&path);
                } else {
                        if let Some(parent) = dest.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                        if fs::rename(&path, &dest).is_ok() || fs::copy(&path, &dest).is_ok() {
                            let _ = fs::remove_file(&path);
                            moved += 1;
                        }
                    }
                }
            }

        
        Ok(format!(
            "{} ghosts busted, {} physical moved.",
            exorcised, moved
        ))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn repopulate_from_shelter() -> Result<String, String> {
    let config = get_saved_coordinates();
    let vault_mods_lane = PathBuf::from(&config.vault_path).join("Mods");
    let mut packages = Vec::new();
    walk_packages(&vault_mods_lane, &mut packages);

    let mod_names: Vec<String> = packages
        .into_iter()
        .filter_map(|p| {
            p.strip_prefix(&vault_mods_lane)
                .ok()
                .map(|n| n.to_string_lossy().replace("\\", "/"))
        })
        .collect();

    let deploy_mods: Vec<DeployMod> = mod_names
        .into_iter()
        .map(|name| DeployMod {
            path: name,
            allow_write: false,
        })
        .collect();

    deploy_playset_bulk(deploy_mods, config.mods_path, config.vault_path).await
}

#[tauri::command]
fn get_suggested_paths() -> SolderConfig {
    let mut config = SolderConfig::default();

    if let Ok(profile) = std::env::var("USERPROFILE") {
        let docs_path = Path::new(&profile)
            .join("Documents")
            .join("Electronic Arts")
            .join("The Sims 4")
            .join("Mods");
        config.mods_path = docs_path.to_string_lossy().to_string();
    }

    let possible_bins = vec![
        "C:\\Program Files\\EA Games\\The Sims 4",
        "C:\\Program Files\\EA\\Origin Games\\The Sims 4\\Bin",
        "C:\\Program Files (x86)\\Origin Games\\The Sims 4\\Game\\Bin",
        "C:\\Program Files\\EA Games\\The Sims 4\\Game\\Bin",
    ];

    for bin in possible_bins {
        if Path::new(bin).exists() {
            config.live_path = bin.to_string();
            break;
        }
    }

    if config.live_path.is_empty() {
        config.live_path = "C:\\Program Files\\EA Games\\The Sims 4".to_string();
    }

    config
}
#[tauri::command]
fn reset_coordinates() -> String {
    "Reset".into()
}
#[tauri::command]
fn initialize_vault_watch(app_handle: tauri::AppHandle) {
    let config = get_saved_coordinates();
    let path_to_watch = PathBuf::from(&config.vault_path);
    if !path_to_watch.exists() {
        return;
    }
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::RecommendedWatcher::new(tx, notify::Config::default()).unwrap();
    watcher
        .watch(&path_to_watch, notify::RecursiveMode::NonRecursive)
        .unwrap();
    std::thread::spawn(move || {
        let _keep_alive = watcher;
        for res in rx {
            if res.is_ok() {
                let _ = app_handle.emit("vault_changed", "UPDATE");
            }
        }
    });
}

#[tauri::command]
fn initialize_airgap_watch(app_handle: tauri::AppHandle, docs_path: String, vault_path: String) {
    let path_to_watch = std::path::PathBuf::from(&docs_path);
    if !path_to_watch.exists() {
        return;
    }
    let v_path = std::path::PathBuf::from(&vault_path).join("Airgap");
    let _ = std::fs::create_dir_all(&v_path);

    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        use notify::Watcher;
        let mut watcher = notify::RecommendedWatcher::new(tx, notify::Config::default()).unwrap();
        if watcher
            .watch(&path_to_watch, notify::RecursiveMode::NonRecursive)
            .is_ok()
        {
            let _keep_alive = watcher;
            for res in rx {
                if let Ok(event) = res {
                    for path in event.paths {
                        if let Some(ext) = path.extension() {
                            if ext == "cfg" || ext == "ini" || ext == "json" {
                                if let Some(filename) = path.file_name() {
                                    let backup_dest = v_path.join(filename);
                                    let _ = std::fs::copy(&path, &backup_dest);
                                    let _ = app_handle.emit(
                                        "airgap_secured",
                                        filename.to_string_lossy().to_string(),
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}
#[tauri::command]
fn scan_game_logs(docs_path: String) -> Result<String, String> {
    let path = PathBuf::from(docs_path);

    let crash_path = path.join("lastCrash.txt");
    if crash_path.exists() {
        return Ok("🛑 CRASH DETECTED: System instability confirmed.".into());
    }

    let mut exceptions = Vec::new();
    if let Ok(entries) = fs::read_dir(&path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("lastException") && name.ends_with(".txt") {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(mtime) = meta.modified() {
                        exceptions.push((mtime, entry.path()));
                    }
                }
            }
        }
    }

    if exceptions.is_empty() {
        return Ok("Clean".into());
    }

    exceptions.sort_by(|a, b| b.0.cmp(&a.0));
    let latest = &exceptions[0].1;

    match fs::read_to_string(latest) {
        Ok(content) => {
            let snippet = content.chars().take(1000).collect::<String>();
            Ok(format!("⚠️ EXCEPTION DETECTED: {}", snippet))
        }
        Err(e) => Err(format!("Failed to read log: {}", e)),
    }
}

#[tauri::command]
fn clear_old_logs(docs_path: String) {
    let path = PathBuf::from(docs_path);
    let _ = fs::remove_file(path.join("lastCrash.txt"));

    if let Ok(entries) = fs::read_dir(&path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("lastException") && name.ends_with(".txt") {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

#[tauri::command]
async fn move_to_lab(filename: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config = get_saved_coordinates();
        let vault_mods_lane = PathBuf::from(&config.vault_path).join("Mods");
        
        let mut vault_path = vault_mods_lane.join(&filename);
        let folders_to_check = vec!["", "!Sanctuary", "!Sanctuary2", "!Sanctuary3", "Sanctuary", "Sanctuary2", "Sanctuary3"];
        let mut found = false;
        
        for f in &folders_to_check {
            let base_test = if f.is_empty() {
                vault_mods_lane.join(&filename)
            } else {
                vault_mods_lane.join(f).join(&filename)
            };
            
            if base_test.exists() {
                vault_path = base_test;
                found = true;
                break;
            } else if base_test.with_extension("package").exists() {
                vault_path = base_test.with_extension("package");
                found = true;
                break;
            } else if base_test.with_extension("ts4script").exists() {
                vault_path = base_test.with_extension("ts4script");
                found = true;
                break;
            }
        }

        if !found {
            return Err("Artifact not found in Vault.".into());
        }
        
        let mods_path = PathBuf::from(config.mods_path).join(&filename);

        if let Some(parent) = mods_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        if vault_path.is_dir() {
            deploy_air_gap(&vault_path, &mods_path).map_err(|e| e.to_string())?;
        } else {
            fs::copy(&vault_path, &mods_path).map_err(|e| e.to_string())?;
        }

        Ok("Injected".into())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
#[tauri::command]
fn get_quarantine_list() -> Vec<String> {
    let config = get_saved_coordinates();
    let q_path = PathBuf::from(config.vault_path).join("Quarantine");
    if !q_path.exists() {
        return vec![];
    }
    fs::read_dir(q_path)
        .ok()
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn restore_quarantined_file(filename: String) -> String {
    let config = get_saved_coordinates();
    let q_path = PathBuf::from(&config.vault_path)
        .join("Quarantine")
        .join(&filename);
    let m_path = PathBuf::from(&config.vault_path)
        .join("Mods")
        .join(&filename);
    if q_path.exists() {
        let _ = fs::rename(q_path, m_path);
        "Restored".into()
    } else {
        "Error: File missing".into()
    }
}

#[tauri::command]
fn purge_quarantined_file(filename: String) -> String {
    let config = get_saved_coordinates();

    let paths_to_check = vec![
        PathBuf::from(&config.vault_path)
            .join("Quarantine")
            .join(&filename),
        PathBuf::from(&config.vault_path)
            .join(".sanctuary_quarantine")
            .join(&filename),
    ];

    for q_path in paths_to_check {
        if q_path.exists() {
            if let Ok(mut f) = fs::OpenOptions::new().write(true).open(&q_path) {
                if let Ok(meta) = f.metadata() {
                    let zeros = vec![0u8; 1024 * 1024];
                    let mut remaining = meta.len();
                    while remaining > 0 {
                        let write_size = std::cmp::min(remaining, zeros.len() as u64);
                        if std::io::Write::write_all(&mut f, &zeros[..write_size as usize]).is_err()
                        {
                            break;
                        }
                        remaining -= write_size;
                    }
                    let _ = f.sync_all();
                }
            }
            let _ = fs::remove_file(q_path);
            return "Purged".into();
        }
    }

    "Error: File missing".into()
}

#[tauri::command]
fn get_shelter_list() -> Vec<String> {
    let config = get_saved_coordinates();
    let s_path = PathBuf::from(config.vault_path).join("Shelter");
    if !s_path.exists() {
        return vec![];
    }
    let mut packages = Vec::new();
    walk_packages(&s_path, &mut packages);
    packages
        .into_iter()
        .filter_map(|p| {
            p.strip_prefix(&s_path)
                .ok()
                .map(|n| n.to_string_lossy().replace("\\", "/"))
        })
        .collect()
}

#[tauri::command]
fn read_config_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}
#[tauri::command]
fn save_config_file(path: String, content: String) -> Result<String, String> {
    fs::write(path, content)
        .map(|_| "Saved".into())
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn test_package_scanner(_: String) -> Result<String, String> {
    Ok("Done".into())
}
#[tauri::command]
fn commission_mod(_: String) -> serde_json::Value {
    serde_json::json!({"success": true})
}
#[tauri::command]
fn get_config() -> serde_json::Value {
    serde_json::json!({})
}
#[tauri::command]
fn update_config(_: serde_json::Value) -> Result<String, String> {
    Ok("Done".into())
}
#[tauri::command]
fn trigger_emp(_: bool, _: String) -> String {
    "Done".into()
}
#[tauri::command]
fn ingest_dropped_file(
    app: tauri::AppHandle,
    path: String,
    force_replace: bool,
) -> Result<String, String> {
    let config = get_saved_coordinates();
    if config.vault_path.is_empty() {
        return Err("VAULT_NOT_CONFIGURED".into());
    }

    let source = Path::new(&path);
    if !source.exists() {
        return Err("FILE_NOT_FOUND".into());
    }

    if !source.is_dir() && !force_replace {
        let source_file_name = source.file_name().unwrap_or_default();
        let cache = load_cache(&config.vault_path);
        let mut exists = false;
        let mut existing_name = String::new();
        let mut match_reason = String::new();
        let mut hash = String::new();
        let mut needs_hash = true;

        for (k, _) in cache.iter() {
            if Path::new(k).exists() && Path::new(k).file_name() == Some(source_file_name) {
                exists = true;
                existing_name = k.clone();
                match_reason = "NAME_MATCH".to_string();
                needs_hash = false;
                break;
            }
        }

        if needs_hash {
            hash = calculate_hash(&source).unwrap_or_default();
            for (k, v) in cache.iter() {
                if Path::new(k).exists() && v.dna_hash == hash && !hash.is_empty() {
                    exists = true;
                    existing_name = k.clone();
                    match_reason = "DNA_MATCH".to_string();
                    break;
                }
            }
        }

        if exists {
            let _ = app.emit("dna_match_detected", serde_json::json!({ "path": path, "hash": hash, "existing_name": existing_name, "source_action": "ingest_dropped_file", "reason": match_reason }));
            return Err("DNA_MATCH".into());
        }
    }

    let file_name = source.file_name().ok_or("INVALID_FILENAME")?;
    let ext = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut target_dir = Path::new(&config.vault_path).join("Mods");
    if source.is_file() && (ext == "package" || ext == "ts4script") {
        if let Some(stem) = source.file_stem() {
            target_dir = target_dir.join(stem);
        }
    }

    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let target = target_dir.join(file_name);

    if source.is_dir() {

        let _ = deploy_air_gap(source, &target);
    } else {
        let ext = source
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext == "package" || ext == "ts4script" || ext == "zip" || ext == "7z" || ext == "rar" || ext == "dat" || ext == "cfg" || ext == "ini" || ext == "json" {
            std::fs::copy(source, &target).map_err(|e| e.to_string())?;
        } else {
            return Err("UNSUPPORTED_ARTIFACT_TYPE".into());
        }
    }

    Ok("Ingested".into())
}

#[tauri::command]
fn resolve_dna_match(
    path: String,
    existing_name: String,
    action: String,
) -> Result<String, String> {
    let source = Path::new(&path);
    let existing = Path::new(&existing_name);

    if action == "replace" {
        let s_canon = source.canonicalize().unwrap_or_else(|_| source.to_path_buf());
        let e_canon = existing.canonicalize().unwrap_or_else(|_| existing.to_path_buf());
        
        if source.exists() && s_canon != e_canon {
            if let Some(parent) = existing.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if std::fs::copy(source, existing).is_ok() {
                let now = filetime::FileTime::now();
                let _ = filetime::set_file_times(existing, now, now);
                let _ = std::fs::remove_file(source); // <--- delete source after replacing
            } else {
                return Err("FAILED_TO_COPY".into());
            }
        }
    } else if action == "discard" || action == "ignore" {
        let s_canon = source.canonicalize().unwrap_or_else(|_| source.to_path_buf());
        let e_canon = existing.canonicalize().unwrap_or_else(|_| existing.to_path_buf());
        if source.exists() && s_canon != e_canon {
            let _ = std::fs::remove_file(source); // <--- always delete source if discarding
        }
    }

    Ok("Resolved".into())
}

#[tauri::command]
fn save_master_cache(vault_path: String, content: String) -> Result<String, String> {
    let data_dir = Path::new(&vault_path).join("Data");
    let _ = std::fs::create_dir_all(&data_dir);
    let path = data_dir.join(".sanctuary_master_cache.json");
    std::fs::write(path, content)
        .map(|_| "Saved".into())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn load_master_cache(vault_path: String) -> Result<String, String> {
    let data_dir = Path::new(&vault_path).join("Data");
    let path = data_dir.join(".sanctuary_master_cache.json");
    if path.exists() {
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    } else {
        Ok("[]".into())
    }
}

#[tauri::command]
fn purge_vault_artifacts(vault_path: String, filenames: Vec<String>) -> Result<String, String> {
    let mut deleted = 0;
    for filename in filenames {
        let mut path = std::path::PathBuf::from(&vault_path);
        path.push(&filename);
        if path.exists() {
            if path.is_dir() {
                let _ = std::fs::remove_dir_all(&path);
            } else {
                let _ = std::fs::remove_file(&path);
            }
            deleted += 1;
        }
    }
    Ok(format!("Purged {} artifacts.", deleted))
}

#[tauri::command]
fn auto_detect_paths() -> serde_json::Value {
    let mut live_path = String::new();
    let mut mods_path = String::new();
    let mut vault_path = String::new();

    if let Some(docs) = dirs::document_dir() {
        let ts4_mods = docs.join("Electronic Arts").join("The Sims 4").join("Mods");
        if ts4_mods.exists() {
            mods_path = ts4_mods.to_string_lossy().to_string();
        }
        let sanctuary_vault = docs.join("Sanctuary OS");
        vault_path = sanctuary_vault.to_string_lossy().to_string();
    }

    let possible_bins = vec![
        r"C:\Program Files\EA Games\The Sims 4\Game\Bin",
        r"C:\Program Files (x86)\Origin Games\The Sims 4\Game\Bin",
        r"C:\Program Files (x86)\Steam\steamapps\common\The Sims 4\Game\Bin",
        r"D:\SteamLibrary\steamapps\common\The Sims 4\Game\Bin",
        r"E:\SteamLibrary\steamapps\common\The Sims 4\Game\Bin",
    ];
    for pb in possible_bins {
        if std::path::Path::new(pb).exists() {
            live_path = pb.to_string();
            break;
        }
    }

    serde_json::json!({
        "live_path": live_path,
        "mods_path": mods_path,
        "vault_path": vault_path
    })
}

#[tauri::command]
async fn move_mod_to_priority_folder(vault_path: String, mod_name: String, target_folder: String) -> Result<String, String> {
    let vault_mods_lane = if vault_path.ends_with("Mods") {
        PathBuf::from(&vault_path)
    } else {
        PathBuf::from(&vault_path).join("Mods")
    };

    let mut current_path = vault_mods_lane.join(&mod_name);
    let folders_to_check = vec!["", "!Sanctuary", "!Sanctuary2", "!Sanctuary3", "Sanctuary", "Sanctuary2", "Sanctuary3"];
    let mut found = false;
    for f in &folders_to_check {
        let test_path = if f.is_empty() {
            vault_mods_lane.join(&mod_name)
        } else {
            vault_mods_lane.join(f).join(&mod_name)
        };
        if test_path.exists() {
            current_path = test_path;
            found = true;
            break;
        }
    }

    if !found {
        return Err("Mod folder not found in Vault".into());
    }

    let dest_path = if target_folder.is_empty() {
        vault_mods_lane.join(&mod_name)
    } else {
        let t_folder = vault_mods_lane.join(&target_folder);
        let _ = std::fs::create_dir_all(&t_folder);
        t_folder.join(&mod_name)
    };

    if current_path == dest_path {
        return Ok("Already in target folder".into());
    }

    if dest_path.exists() {
        return Err("Target folder already exists".into());
    }

    std::fs::rename(&current_path, &dest_path).map_err(|e| e.to_string())?;
    Ok("Moved successfully".into())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(SecurityState {
            malware_hashes: std::sync::Mutex::new(Vec::new()),
            tier2_hashes: std::sync::Mutex::new(Vec::new()),
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_bunker,
            get_saved_coordinates,
            save_coordinates,
            sanitize_vault,
            auto_detect_paths,
            launch_game,
            get_backups,
            delete_backup,
            deploy_playset_bulk,
            initialize_vault_watch,
            run_conflict_radar,
            rename_backup,
            backup_universe,
            backup_engine_full,
            restore_game_data,
            get_game_version,
            evacuate_to_shelter,
            repopulate_from_shelter,
            wipe_symlinks,
            reset_coordinates,
            get_suggested_paths,
            get_quarantine_list,
            purge_quarantined_file,
            restore_quarantined_file,
            trigger_emp,
            move_to_lab,
            purge_from_shelter,
            get_shelter_list,
            read_config_file,
            save_config_file,
            test_package_scanner,
            commission_mod,
            move_to_vault,
            set_mod_override,
            get_config,
            update_config,
            scan_game_logs,
            clear_old_logs,
            generate_full_dna_hash,
            scan_installed_dlc,
            rip_game_version,
            read_blueprint,
            save_blueprint,
            ingest_dropped_file,
            resolve_dna_match,
            save_master_cache,
            load_master_cache,
            sync_security_definitions,
            purge_vault_artifacts,
            initialize_airgap_watch,
            mark_explicitly_local,
            move_mod_to_priority_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
