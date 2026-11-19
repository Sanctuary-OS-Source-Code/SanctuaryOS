use crate::schema::SchemaConflictAnalyzer;
use crate::state::*;
use crate::utils::*;
use rayon::prelude::*;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const MAX_RADAR_FILES: usize = 50_000;
const MAX_ARCHIVE_MEMBERS: usize = 8_192;
const MAX_BINARY_INDEX_ENTRIES: u64 = 65_536;

pub(crate) fn compute_analyzer_sig(analyzer: &SchemaConflictAnalyzer) -> String {
    let serialized = serde_json::to_vec(analyzer).unwrap_or_default();
    let digest = Sha256::digest(&serialized);
    hex::encode(&digest[..12])
}

struct ActiveRadarFile<'a> {
    full_path: &'a PathBuf,
    rel_path: &'a PathBuf,
    rel_norm: &'a str,
    mod_owner: String,
    opt_vpath: Option<String>,
    ext_lower: String,
}

struct RadarFileEval {
    mod_owner: String,
    file_mtime: u64,
    file_size: u64,
    route_key: Option<String>,
    vfs_key: Option<String>,
    archive_keys: Vec<String>,
    binary_hits: Vec<(String, Vec<String>)>,
    json_hits: Vec<(String, String, Vec<String>)>,
    cache_misses: Vec<(String, String, u64, u64, Vec<String>)>,
    cache_hits_count: usize,
}

fn evaluate_single_radar_file(
    item: &ActiveRadarFile<'_>,
    install_routes: &[crate::schema::SchemaInstallRoute],
    live_root: &Path,
    docs_root: &Path,
    mods_dir: &Path,
    vfs_ext_filter: &Option<HashSet<String>>,
    archive_exts: &HashSet<String>,
    manifest_lower: &str,
    configured_analyzers: &[SchemaConflictAnalyzer],
    analyzer_sigs: &[String],
    existing_cache: &HashMap<(String, String), crate::utils::RadarCachedKeys>,
) -> RadarFileEval {
    let full_path = item.full_path;
    let rel_path = item.rel_path;
    let rel_norm = item.rel_norm;
    let ext_lower = &item.ext_lower;

    let (mtime_secs, file_size) = std::fs::metadata(full_path)
        .map(|m| {
            let mt = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            (mt, m.len())
        })
        .unwrap_or((0, 0));
    let norm_fp = crate::utils::normalize_path_key(full_path);

    let mut route_key = None;
    if !install_routes.is_empty() {
        if let Some((routed_dest, _, _, _)) = crate::commands::deployment::resolve_route_for_file(
            full_path,
            rel_norm,
            install_routes,
            live_root,
            docs_root,
            mods_dir,
        ) {
            let rk = routed_dest.to_string_lossy().replace('\\', "/").to_lowercase();
            if !rk.is_empty() {
                route_key = Some(rk);
            }
        }
    }

    let mut vfs_key = None;
    if let Some(ref vpath) = item.opt_vpath {
        let include_vfs = match vfs_ext_filter {
            Some(allowed) => allowed.contains(ext_lower),
            None => true,
        };
        if include_vfs && !vpath.is_empty() {
            vfs_key = Some(vpath.clone());
        }
    }

    let mut cache_misses = Vec::new();
    let mut cache_hits_count = 0usize;

    let mut archive_keys = Vec::new();
    if archive_exts.contains(ext_lower) {
        let arch_sig = format!("__archive_member__:{}", manifest_lower);
        if let Some(cached) = existing_cache.get(&(norm_fp.clone(), arch_sig.clone())) {
            if cached.mtime == mtime_secs && cached.file_size == file_size {
                archive_keys = cached.keys.clone();
                cache_hits_count += 1;
            }
        }
        if archive_keys.is_empty() && cache_hits_count == 0 {
            let extracted = extract_archive_member_keys(full_path, manifest_lower);
            cache_misses.push((
                norm_fp.clone(),
                arch_sig,
                mtime_secs,
                file_size,
                extracted.clone(),
            ));
            archive_keys = extracted;
        }
    }

    let mut binary_hits = Vec::new();
    let mut json_hits = Vec::new();
    for (idx, analyzer) in configured_analyzers.iter().enumerate() {
        let ext_matches = analyzer.extensions.is_empty()
            || analyzer
                .extensions
                .iter()
                .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(ext_lower));
        if !ext_matches {
            continue;
        }
        let a_sig = &analyzer_sigs[idx];
        let cache_lookup = existing_cache
            .get(&(norm_fp.clone(), a_sig.clone()))
            .filter(|c| c.mtime == mtime_secs && c.file_size == file_size);

        let keys = if let Some(cached) = cache_lookup {
            cache_hits_count += 1;
            cached.keys.clone()
        } else {
            let parsed = match analyzer.analyzer_type.as_str() {
                "binary_chunk_index" => extract_binary_chunk_keys(full_path, analyzer),
                "container_toc" => {
                    crate::commands::radar_containers::extract_container_toc_keys(
                        full_path, analyzer,
                    )
                }
                "chunked_record_stream" => {
                    crate::commands::radar_containers::extract_chunked_record_keys(
                        full_path, analyzer,
                    )
                }
                "selector_path" => {
                    crate::commands::radar_containers::extract_selector_path_keys(
                        full_path, analyzer,
                    )
                }
                "json_xml_key" => extract_json_top_level_keys(full_path),
                _ => Vec::new(),
            };
            cache_misses.push((
                norm_fp.clone(),
                a_sig.clone(),
                mtime_secs,
                file_size,
                parsed.clone(),
            ));
            parsed
        };

        if keys.is_empty() {
            continue;
        }

        match analyzer.analyzer_type.as_str() {
            "binary_chunk_index" | "container_toc" | "chunked_record_stream" => {
                let analyzer_id = if analyzer.id.trim().is_empty() {
                    analyzer.analyzer_type.clone()
                } else {
                    analyzer.id.clone()
                };
                binary_hits.push((analyzer_id, keys));
            }
            "selector_path" => {
                let analyzer_id = if analyzer.id.trim().is_empty() {
                    "selector_path".to_string()
                } else {
                    analyzer.id.clone()
                };
                json_hits.push((analyzer_id, String::new(), keys));
            }
            "json_xml_key" => {
                let analyzer_id = if analyzer.id.trim().is_empty() {
                    "json_xml_key".to_string()
                } else {
                    analyzer.id.clone()
                };
                let vprefix = rel_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                json_hits.push((analyzer_id, vprefix, keys));
            }
            _ => {}
        }
    }

    RadarFileEval {
        mod_owner: item.mod_owner.clone(),
        file_mtime: mtime_secs,
        file_size,
        route_key,
        vfs_key,
        archive_keys,
        binary_hits,
        json_hits,
        cache_misses,
        cache_hits_count,
    }
}

fn is_non_conflicting_doc_or_meta_file(file_name_lower: &str, manifest_lower: &str) -> bool {
    if file_name_lower == SANCTUARY_EDGE_MANIFEST_FILE
        || file_name_lower == SANCTUARY_EDGE_OVERRIDE_FILE
        || file_name_lower == ".sanctuary_deployed_links.json"
        || file_name_lower == ".sanctuary_hidden.json"
        || (!manifest_lower.is_empty() && file_name_lower == manifest_lower)
    {
        return true;
    }

    matches!(
        file_name_lower,
        "readme"
            | "readme.txt"
            | "readme.md"
            | "license"
            | "license.txt"
            | "license.md"
            | "changelog"
            | "changelog.txt"
            | "changelog.md"
            | "credits.txt"
            | "credits.md"
            | ".ds_store"
            | "thumbs.db"
            | "desktop.ini"
    )
}

fn parse_magic_candidates(spec: &str) -> Vec<Vec<u8>> {
    let trimmed = spec.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut out = Vec::new();
    if let Some(hex_body) = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
    {
        let compact: String = hex_body.chars().filter(|c| !c.is_whitespace()).collect();
        if compact.len() % 2 == 0 {
            if let Ok(decoded) = hex::decode(&compact) {
                if !decoded.is_empty() {
                    out.push(decoded);
                }
            }
        }
        return out;
    }

    let compact: String = trimmed.chars().filter(|c| !c.is_whitespace()).collect();
    if compact.len() >= 8 && compact.len() % 2 == 0 && compact.chars().all(|c| c.is_ascii_hexdigit())
    {
        if let Ok(decoded) = hex::decode(&compact) {
            out.push(decoded);
        }
    } else if compact.len() % 2 == 0 && compact.chars().all(|c| c.is_ascii_hexdigit()) {
        if let Ok(decoded) = hex::decode(&compact) {
            out.push(decoded);
        }
        out.push(trimmed.as_bytes().to_vec());
    } else {
        out.push(trimmed.as_bytes().to_vec());
    }

    out
}

fn read_u32_endian(bytes: &[u8], big_endian: bool) -> u32 {
    let arr: [u8; 4] = [bytes[0], bytes[1], bytes[2], bytes[3]];
    if big_endian {
        u32::from_be_bytes(arr)
    } else {
        u32::from_le_bytes(arr)
    }
}

fn read_u64_endian(bytes: &[u8], big_endian: bool) -> u64 {
    let arr: [u8; 8] = [
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ];
    if big_endian {
        u64::from_be_bytes(arr)
    } else {
        u64::from_le_bytes(arr)
    }
}

fn extract_binary_chunk_keys(path: &Path, analyzer: &SchemaConflictAnalyzer) -> Vec<String> {
    let entry_size = match analyzer.entry_size {
        Some(v) if (1..=4096).contains(&v) => v,
        _ => return Vec::new(),
    };
    let key_size = match analyzer.key_size {
        Some(v) if (1..=64).contains(&v) && v <= entry_size => v as usize,
        _ => return Vec::new(),
    };
    let count_offset = match analyzer.index_count_offset {
        Some(v) => v,
        None => return Vec::new(),
    };
    let table_offset_pos = match analyzer.index_offset_pos {
        Some(v) => v,
        None => return Vec::new(),
    };

    let raw_file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };
    let file_len = match raw_file.metadata() {
        Ok(m) => m.len(),
        Err(_) => return Vec::new(),
    };
    let mut file = BufReader::with_capacity(64 * 1024, raw_file);

    let header_offset = analyzer.header_offset.unwrap_or(0);
    if let Some(magic_spec) = analyzer.magic_bytes.as_deref().filter(|s| !s.trim().is_empty()) {
        let candidates = parse_magic_candidates(magic_spec);
        let max_magic_len = candidates.iter().map(|c| c.len()).max().unwrap_or(0);
        if max_magic_len == 0 || header_offset.saturating_add(max_magic_len as u64) > file_len {
            return Vec::new();
        }
        if file.seek(SeekFrom::Start(header_offset)).is_err() {
            return Vec::new();
        }
        let mut magic_buf = vec![0u8; max_magic_len];
        if file.read_exact(&mut magic_buf).is_err() {
            return Vec::new();
        }
        let matched = candidates
            .iter()
            .any(|cand| magic_buf.starts_with(cand.as_slice()));
        if !matched {
            return Vec::new();
        }
    }

    let big_endian = analyzer
        .endian
        .as_deref()
        .map(|e| e.trim().eq_ignore_ascii_case("big") || e.trim().eq_ignore_ascii_case("be"))
        .unwrap_or(false);

    if count_offset.saturating_add(4) > file_len || table_offset_pos.saturating_add(4) > file_len {
        return Vec::new();
    }

    let mut u32_buf = [0u8; 4];
    if file.seek(SeekFrom::Start(count_offset)).is_err()
        || file.read_exact(&mut u32_buf).is_err()
    {
        return Vec::new();
    }
    let raw_count = read_u32_endian(&u32_buf, big_endian) as u64;
    if raw_count == 0 {
        return Vec::new();
    }
    let bounded_count = raw_count.min(MAX_BINARY_INDEX_ENTRIES);

    let mut table_offset: u64 = 0;
    if file.seek(SeekFrom::Start(table_offset_pos)).is_ok()
        && file.read_exact(&mut u32_buf).is_ok()
    {
        table_offset = read_u32_endian(&u32_buf, big_endian) as u64;
    }
    if table_offset == 0 && table_offset_pos.saturating_add(8) <= file_len {
        let mut u64_buf = [0u8; 8];
        if file.seek(SeekFrom::Start(table_offset_pos)).is_ok()
            && file.read_exact(&mut u64_buf).is_ok()
        {
            table_offset = read_u64_endian(&u64_buf, big_endian);
        }
    }

    if table_offset == 0 || table_offset >= file_len {
        return Vec::new();
    }

    if analyzer.bitmask_constant_header == Some(true) && key_size % 4 == 0 {
        if table_offset.saturating_add(4) > file_len {
            return Vec::new();
        }
        if file.seek(SeekFrom::Start(table_offset)).is_err()
            || file.read_exact(&mut u32_buf).is_err()
        {
            return Vec::new();
        }
        let flags = read_u32_endian(&u32_buf, big_endian);
        let key_slots = key_size / 4;
        let mut const_slots: Vec<Option<[u8; 4]>> = vec![None; key_slots];
        let mut const_count: u64 = 0;
        for slot in 0..key_slots.min(8) {
            if (flags & (1u32 << slot)) != 0 {
                if file.read_exact(&mut u32_buf).is_err() {
                    return Vec::new();
                }
                const_slots[slot] = Some(u32_buf);
                const_count += 1;
            }
        }
        let dynamic_entry_size = match entry_size.checked_sub(const_count * 4) {
            Some(sz) if sz >= (key_size as u64).saturating_sub(const_count * 4) && sz > 0 => sz,
            _ => return Vec::new(),
        };
        let entries_start = table_offset.saturating_add(4 + const_count * 4);
        let total_dynamic_bytes = match bounded_count.checked_mul(dynamic_entry_size) {
            Some(b) => b,
            None => return Vec::new(),
        };
        if entries_start.saturating_add(total_dynamic_bytes) > file_len {
            return Vec::new();
        }

        let mut keys = Vec::with_capacity(bounded_count.min(1024) as usize);
        let mut entry_buf = vec![0u8; dynamic_entry_size as usize];
        let mut full_key = vec![0u8; key_size];
        for _ in 0..bounded_count {
            if file.read_exact(&mut entry_buf).is_err() {
                break;
            }
            let mut cursor = 0usize;
            for slot in 0..key_slots {
                let dst = &mut full_key[slot * 4..(slot + 1) * 4];
                if let Some(fixed) = const_slots[slot] {
                    dst.copy_from_slice(&fixed);
                } else {
                    if cursor + 4 > entry_buf.len() {
                        return keys;
                    }
                    dst.copy_from_slice(&entry_buf[cursor..cursor + 4]);
                    cursor += 4;
                }
            }
            if full_key.iter().all(|&b| b == 0) {
                continue;
            }
            keys.push(hex::encode(&full_key));
        }
        return keys;
    }

    let total_table_bytes = match bounded_count.checked_mul(entry_size) {
        Some(b) => b,
        None => return Vec::new(),
    };
    if table_offset.saturating_add(total_table_bytes) > file_len {
        return Vec::new();
    }

    if file.seek(SeekFrom::Start(table_offset)).is_err() {
        return Vec::new();
    }

    let mut keys = Vec::with_capacity(bounded_count.min(1024) as usize);
    let mut entry_buf = vec![0u8; entry_size as usize];
    for _ in 0..bounded_count {
        if file.read_exact(&mut entry_buf).is_err() {
            break;
        }
        let key_slice = &entry_buf[..key_size];
        if key_slice.iter().all(|&b| b == 0) {
            continue;
        }
        keys.push(hex::encode(key_slice));
    }

    keys
}

fn extract_archive_member_keys(path: &Path, manifest_lower: &str) -> Vec<String> {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return Vec::new(),
    };

    let limit = archive.len().min(MAX_ARCHIVE_MEMBERS);
    let mut members = Vec::new();
    for idx in 0..limit {
        let entry = match archive.by_index_raw(idx) {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.is_dir() {
            continue;
        }
        let norm = entry
            .name()
            .replace('\\', "/")
            .trim_matches('/')
            .to_lowercase();
        if norm.is_empty() || norm == "meta-inf/manifest.mf" {
            continue;
        }
        let base = norm.rsplit('/').next().unwrap_or(&norm);
        if is_non_conflicting_doc_or_meta_file(base, manifest_lower) {
            continue;
        }
        members.push(norm);
    }
    members
}

fn extract_json_top_level_keys(path: &Path) -> Vec<String> {
    let meta = match std::fs::metadata(path) {
        Ok(m) if m.len() <= 2 * 1024 * 1024 => m,
        _ => return Vec::new(),
    };
    if meta.len() == 0 {
        return Vec::new();
    }
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    if let Ok(serde_json::Value::Object(map)) = serde_json::from_str::<serde_json::Value>(&content) {
        return map.keys().map(|k| k.to_string()).collect();
    }
    Vec::new()
}

fn resolve_mod_owner_and_virtual_path(
    rel_path: &Path,
    tier_folders_lower: &HashSet<String>,
) -> (String, Option<String>) {
    let components: Vec<String> = rel_path
        .components()
        .filter_map(|c| match c {
            std::path::Component::Normal(os) => Some(os.to_string_lossy().to_string()),
            _ => None,
        })
        .collect();

    if components.is_empty() {
        return (String::new(), None);
    }

    let start_idx = if components.len() >= 2
        && tier_folders_lower.contains(&components[0].to_lowercase())
    {
        1
    } else {
        0
    };

    let remaining = &components[start_idx..];
    if remaining.is_empty() {
        return (components[0].clone(), None);
    }

    if remaining.len() == 1 {
        // Loose file directly inside mods_dir or inside a priority tier folder
        let owner = components.join("/");
        let vpath = remaining[0].to_lowercase();
        (owner, Some(vpath))
    } else {
        // Folder-wrapped mod: owner is [Tier/]ModFolder, virtual path is subpath beneath ModFolder
        let owner = components[..=start_idx].join("/");
        let vpath = remaining[1..].join("/").to_lowercase();
        (owner, Some(vpath))
    }
}

#[derive(Default)]
struct PairCollisionAccumulator {
    resources: BTreeSet<String>,
    conflict_types: BTreeSet<String>,
    analyzer_ids: BTreeSet<String>,
    has_binary_collision: bool,
    has_fatal_collision: bool,
}

fn record_resource_collisions(
    resource_owners: &BTreeMap<String, BTreeSet<String>>,
    conflict_type: &str,
    analyzer_id: &str,
    is_binary: bool,
    is_fatal: bool,
    fatal_exts: &HashSet<String>,
    pair_map: &mut BTreeMap<(String, String), PairCollisionAccumulator>,
) {
    for (resource_key, owners) in resource_owners {
        if owners.len() < 2 {
            continue;
        }
        let res_ext = Path::new(resource_key.split('#').next().unwrap_or(resource_key))
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        let entry_is_fatal = is_fatal || (!res_ext.is_empty() && fatal_exts.contains(&res_ext));
        let owner_vec: Vec<&String> = owners.iter().collect();
        for i in 0..owner_vec.len() {
            for j in (i + 1)..owner_vec.len() {
                let a = owner_vec[i].clone();
                let b = owner_vec[j].clone();
                let entry = pair_map.entry((a, b)).or_default();
                entry.resources.insert(resource_key.clone());
                entry.conflict_types.insert(conflict_type.to_string());
                entry.analyzer_ids.insert(analyzer_id.to_string());
                if is_binary {
                    entry.has_binary_collision = true;
                }
                if entry_is_fatal {
                    entry.has_fatal_collision = true;
                }
            }
        }
    }
}

#[tauri::command]
pub async fn run_conflict_radar(
    mods_path: String,
    target_files: Option<Vec<String>>,
    hidden_overrides: Option<HashMap<String, Vec<String>>>,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || {
        let saved_coords = crate::commands::state_ops::get_saved_coordinates();
        let mods_dir = Path::new(&mods_path);
        let vault_mods_lane = if !saved_coords.vault_path.trim().is_empty() {
            crate::utils::get_vault_mods_lane(&saved_coords.vault_path)
        } else {
            PathBuf::new()
        };

        let tier_folders: Vec<String> = game_schema
            .as_ref()
            .and_then(|s| s.load_order.as_ref())
            .map(|lo| {
                lo.priority_tiers
                    .as_deref()
                    .unwrap_or(&[])
                    .iter()
                    .filter(|pt| !pt.folder.trim().is_empty())
                    .map(|pt| pt.folder.trim().to_string())
                    .collect()
            })
            .unwrap_or_default();
        let tier_folders_lower: HashSet<String> =
            tier_folders.iter().map(|t| t.to_lowercase()).collect();

        let manifest_lower = crate::game_logic::resolve_manifest_filename(&game_schema)
            .unwrap_or_default()
            .to_lowercase();

        let supported_exts: HashSet<String> =
            crate::game_logic::get_supported_extensions(&game_schema)
                .into_iter()
                .map(|e| e.trim_start_matches('.').to_lowercase())
                .collect();

        let mut fatal_exts: HashSet<String> = ["dll", "asi", "so", "dylib", "exe"]
            .into_iter()
            .map(String::from)
            .collect();
        if let Some(script_exts) = game_schema
            .as_ref()
            .and_then(|s| s.extensions.script_extensions.as_ref())
        {
            for se in script_exts {
                let clean = se.trim_start_matches('.').to_lowercase();
                if !clean.is_empty() {
                    fatal_exts.insert(clean);
                }
            }
        }

        let target_filter: Option<HashSet<String>> = target_files.map(|list| {
            list.into_iter()
                .map(|item| item.replace('\\', "/").trim_matches('/').to_string())
                .collect()
        });
        let target_filter_lower: Option<HashSet<String>> = target_filter.as_ref().map(|set| {
            set.iter().map(|s| s.to_lowercase()).collect()
        });
        let target_leaf_lower: Option<HashSet<String>> = target_filter_lower.as_ref().map(|set| {
            set.iter()
                .filter_map(|s| s.rsplit('/').next().map(String::from))
                .collect()
        });

        let mut discovered_files: Vec<(PathBuf, PathBuf, String)> = Vec::new();
        let mut seen_rel_norm: HashSet<String> = HashSet::new();

        let scan_root_for_radar = |scan_root: &Path,
                                   discovered: &mut Vec<(PathBuf, PathBuf, String)>,
                                   seen_rel: &mut HashSet<String>| {
            if !scan_root.exists() {
                return;
            }
            let mut visited_dirs: HashSet<PathBuf> = HashSet::new();
            let walker = WalkDir::new(scan_root)
                .max_depth(8)
                .follow_links(true)
                .into_iter()
                .filter_entry(|e| {
                    let name = e.file_name().to_string_lossy();
                    let lower = name.to_lowercase();
                    if e.depth() > 0 && (lower.starts_with(".sanctuary") || lower == ".git") {
                        return false;
                    }
                    if e.file_type().is_dir() {
                        if let Ok(canon) = std::fs::canonicalize(e.path()) {
                            if !visited_dirs.insert(canon) {
                                return false;
                            }
                        }
                    }
                    true
                });

            for entry in walker.flatten() {
                if discovered.len() >= MAX_RADAR_FILES {
                    break;
                }
                if !entry.file_type().is_file() {
                    continue;
                }
                let full_path = entry.path().to_path_buf();
                let rel_path = match full_path.strip_prefix(scan_root) {
                    Ok(r) => r.to_path_buf(),
                    Err(_) => continue,
                };
                let file_name_lower = entry.file_name().to_string_lossy().to_lowercase();
                if is_non_conflicting_doc_or_meta_file(&file_name_lower, &manifest_lower) {
                    continue;
                }

                let rel_norm = rel_path.to_string_lossy().replace('\\', "/");
                let rel_low = rel_norm.to_lowercase();
                if let (Some(targets), Some(targets_low)) = (&target_filter, &target_filter_lower) {
                    let (owner, _) =
                        resolve_mod_owner_and_virtual_path(&rel_path, &tier_folders_lower);
                    let owner_low = owner.to_lowercase();
                    let mut matched = targets.contains(&rel_norm)
                        || targets_low.contains(&rel_low)
                        || targets.contains(&owner)
                        || targets_low.contains(&owner_low)
                        || target_leaf_lower
                            .as_ref()
                            .map_or(false, |leaves| leaves.contains(&file_name_lower));
                    if !matched {
                        for tf in &tier_folders {
                            if targets.contains(&format!("{}/{}", tf, rel_norm))
                                || targets_low.contains(&format!("{}/{}", tf.to_lowercase(), rel_low))
                            {
                                matched = true;
                                break;
                            }
                        }
                    }
                    if !matched {
                        continue;
                    }
                }

                if seen_rel.insert(rel_low) {
                    discovered.push((full_path, rel_path, rel_norm));
                }
            }
        };

        scan_root_for_radar(mods_dir, &mut discovered_files, &mut seen_rel_norm);

        // Vault Blueprint Projection: when Blueprint targets aren't deployed in live mods_dir, project directly from <Vault>/Mods
        if let Some(tf) = &target_filter {
            if !tf.is_empty()
                && vault_mods_lane.exists()
                && vault_mods_lane != mods_dir
                && discovered_files.len() < tf.len()
            {
                scan_root_for_radar(&vault_mods_lane, &mut discovered_files, &mut seen_rel_norm);
            }
        } else if discovered_files.is_empty() && vault_mods_lane.exists() && vault_mods_lane != mods_dir {
            scan_root_for_radar(&vault_mods_lane, &mut discovered_files, &mut seen_rel_norm);
        }

        // Steam Workshop Read-Only Coexistence: discover subscribed Workshop directories without copying
        if game_schema
            .as_ref()
            .map_or(false, |s| s.paths.discover_steam_workshop == Some(true))
        {
            for ws_mod in crate::commands::deployment::discover_steam_workshop_items(&game_schema) {
                let ws_root = PathBuf::from(&ws_mod.path);
                if !ws_root.is_dir() {
                    continue;
                }
                let raw_label = ws_mod
                    .metadata
                    .mod_name
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or(&ws_mod.folder_name);
                let safe_label: String = raw_label
                    .trim()
                    .chars()
                    .map(|c| if matches!(c, '/' | '\\' | ':') { '_' } else { c })
                    .take(48)
                    .collect();
                let ws_owner = format!("[Workshop:{}] {}", ws_mod.workshop_id, safe_label);

                let walker = WalkDir::new(&ws_root).max_depth(6).follow_links(false);
                for entry in walker.into_iter().flatten() {
                    if discovered_files.len() >= MAX_RADAR_FILES {
                        break;
                    }
                    if !entry.file_type().is_file() {
                        continue;
                    }
                    let full_path = entry.path().to_path_buf();
                    let Ok(rel_in_ws) = full_path.strip_prefix(&ws_root) else {
                        continue;
                    };
                    let fname_low = entry.file_name().to_string_lossy().to_lowercase();
                    if is_non_conflicting_doc_or_meta_file(&fname_low, &manifest_lower) {
                        continue;
                    }
                    let virtual_rel = PathBuf::from(&ws_owner).join(rel_in_ws);
                    let virtual_rel_norm = virtual_rel.to_string_lossy().replace('\\', "/");
                    let virtual_rel_low = virtual_rel_norm.to_ascii_lowercase();
                    if seen_rel_norm.insert(virtual_rel_low) {
                        discovered_files.push((full_path, virtual_rel, virtual_rel_norm));
                    }
                }
            }
        }

        if discovered_files.is_empty() {
            return Ok(serde_json::json!({
                "total_packages": 0,
                "installed_mods": Vec::<String>::new(),
                "conflicts": Vec::<Conflict>::new()
            }));
        }

        let installed_files: Vec<String> = discovered_files
            .iter()
            .filter(|(full_path, _, _)| {
                if supported_exts.is_empty() {
                    return true;
                }
                full_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| supported_exts.contains(&e.to_lowercase()))
                    .unwrap_or(false)
            })
            .map(|(_, _, rel_norm)| rel_norm.clone())
            .collect();

        let mut configured_analyzers: Vec<SchemaConflictAnalyzer> = game_schema
            .as_ref()
            .and_then(|s| s.conflict_analyzers.clone())
            .unwrap_or_default();

        // Synthesize fallback conflict analyzers from `extensions.parsers` when not explicitly declared in `conflict_analyzers`
        if let Some(parsers_val) = game_schema.as_ref().and_then(|s| s.extensions.parsers.as_ref()) {
            let mut register_parser = |ext_raw: &str, parser_type: &str| {
                let clean = ext_raw.trim().trim_start_matches('.').to_ascii_lowercase();
                let p_type = parser_type.trim().to_string();
                if clean.is_empty() || p_type.is_empty() {
                    return;
                }
                let dot_ext = format!(".{}", clean);
                let already_covered = configured_analyzers.iter().any(|a| {
                    a.extensions
                        .iter()
                        .any(|ae| ae.trim().trim_start_matches('.').eq_ignore_ascii_case(&clean))
                });
                if !already_covered {
                    let magic_bytes =
                        crate::game_logic::lookup_schema_magic_bytes_for_ext(&game_schema, &clean);
                    configured_analyzers.push(SchemaConflictAnalyzer {
                        id: format!("ext_parser_{}", clean),
                        analyzer_type: p_type,
                        extensions: vec![dot_ext],
                        magic_bytes,
                        ..Default::default()
                    });
                }
            };
            if let Some(map) = parsers_val.as_object() {
                for (k, v) in map {
                    if let Some(pt) = v.as_str() {
                        register_parser(k, pt);
                    }
                }
            } else if let Some(arr) = parsers_val.as_array() {
                for item in arr {
                    if let Some(obj) = item.as_object() {
                        let k = obj
                            .get("ext")
                            .or_else(|| obj.get("extension"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let pt = obj
                            .get("parser")
                            .or_else(|| obj.get("type"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        register_parser(k, pt);
                    }
                }
            }
        }

        // Filter extensions for virtual_fs_path if explicitly restricted by schema analyzer
        let vfs_ext_filter: Option<HashSet<String>> = configured_analyzers
            .iter()
            .find(|a| a.analyzer_type == "virtual_fs_path" && !a.extensions.is_empty())
            .map(|a| {
                a.extensions
                    .iter()
                    .map(|e| e.trim_start_matches('.').to_lowercase())
                    .collect()
            });

        let mut archive_exts: HashSet<String> = ["zip", "jar"]
            .into_iter()
            .map(|s| s.to_string())
            .collect();
        for a in configured_analyzers
            .iter()
            .filter(|a| a.analyzer_type == "archive_member")
        {
            for ext in &a.extensions {
                let clean = ext.trim_start_matches('.').to_lowercase();
                if !clean.is_empty() {
                    archive_exts.insert(clean);
                }
            }
        }

        let install_routes = crate::game_logic::get_install_routes(&game_schema);
        let live_root =
            crate::game_logic::resolve_game_engine_root(&saved_coords.live_path, &game_schema);
        let docs_root = PathBuf::from(crate::utils::resolve_effective_docs_path(
            &saved_coords,
            &game_schema,
        ));

        let mut override_hidden_by_owner: HashMap<String, HashSet<String>> = HashMap::new();
        if let Some(ov_map) = hidden_overrides {
            for (raw_owner, files) in ov_map {
                let owner_norm = raw_owner.trim().replace('\\', "/").to_ascii_lowercase();
                if owner_norm.is_empty() {
                    continue;
                }
                let leaf = owner_norm.rsplit('/').next().unwrap_or(&owner_norm).to_string();
                for f in files {
                    let f_norm = f
                        .trim()
                        .replace('\\', "/")
                        .trim_matches('/')
                        .to_ascii_lowercase();
                    if f_norm.is_empty() {
                        continue;
                    }
                    override_hidden_by_owner
                        .entry(owner_norm.clone())
                        .or_default()
                        .insert(f_norm.clone());
                    if leaf != owner_norm {
                        override_hidden_by_owner
                            .entry(leaf.clone())
                            .or_default()
                            .insert(f_norm);
                    }
                }
            }
        }
        let mut sidecar_hidden_cache: HashMap<String, HashSet<String>> = HashMap::new();

        let mut vfs_owners: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut route_owners: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut archive_owners: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut binary_owners_by_analyzer: HashMap<String, BTreeMap<String, BTreeSet<String>>> =
            HashMap::new();
        let mut json_key_owners_by_analyzer: HashMap<String, BTreeMap<String, BTreeSet<String>>> =
            HashMap::new();

        let mut active_files: Vec<ActiveRadarFile<'_>> = Vec::with_capacity(discovered_files.len());
        for (full_path, rel_path, rel_norm) in &discovered_files {
            let (mod_owner, opt_vpath) =
                resolve_mod_owner_and_virtual_path(rel_path, &tier_folders_lower);
            if mod_owner.is_empty() {
                continue;
            }

            if let Some(ref vpath) = opt_vpath {
                let owner_low = mod_owner.to_ascii_lowercase();
                let owner_leaf = owner_low.rsplit('/').next().unwrap_or(&owner_low);
                if let Some(ovr_set) = override_hidden_by_owner
                    .get(&owner_low)
                    .or_else(|| override_hidden_by_owner.get(owner_leaf))
                {
                    if ovr_set.contains(vpath) {
                        continue;
                    }
                }
                let sidecar_set = sidecar_hidden_cache.entry(owner_low.clone()).or_insert_with(|| {
                    let mut merged = HashSet::new();
                    let in_mods = mods_dir.join(&mod_owner);
                    if in_mods.is_dir() {
                        merged.extend(crate::commands::library::read_mod_hidden_sidecar(&in_mods));
                    }
                    if !vault_mods_lane.as_os_str().is_empty() {
                        let in_vault = vault_mods_lane.join(&mod_owner);
                        if in_vault.is_dir() {
                            merged.extend(crate::commands::library::read_mod_hidden_sidecar(&in_vault));
                        } else if owner_leaf != owner_low {
                            let in_vault_leaf = vault_mods_lane.join(owner_leaf);
                            if in_vault_leaf.is_dir() {
                                merged.extend(crate::commands::library::read_mod_hidden_sidecar(&in_vault_leaf));
                            }
                        }
                    }
                    merged
                });
                if sidecar_set.contains(vpath) {
                    continue;
                }
            }

            let ext_lower = full_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();

            active_files.push(ActiveRadarFile {
                full_path,
                rel_path,
                rel_norm: rel_norm.as_str(),
                mod_owner,
                opt_vpath,
                ext_lower,
            });
        }

        let cache_root = if !saved_coords.vault_path.trim().is_empty() {
            saved_coords.vault_path.clone()
        } else {
            mods_dir.to_string_lossy().to_string()
        };
        let existing_cache = if !cache_root.trim().is_empty() && Path::new(&cache_root).exists() {
            crate::utils::load_radar_analyzer_cache_map(&cache_root)
        } else {
            HashMap::new()
        };
        let analyzer_sigs: Vec<String> = configured_analyzers
            .iter()
            .map(compute_analyzer_sig)
            .collect();

        // Parse cache-miss containers, binary chunk tables, TOCs, and JSON selectors in parallel via Rayon
        let evaluated: Vec<RadarFileEval> = active_files
            .par_iter()
            .map(|item| {
                evaluate_single_radar_file(
                    item,
                    &install_routes,
                    &live_root,
                    &docs_root,
                    mods_dir,
                    &vfs_ext_filter,
                    &archive_exts,
                    &manifest_lower,
                    &configured_analyzers,
                    &analyzer_sigs,
                    &existing_cache,
                )
            })
            .collect();

        let mut cache_misses_batch: Vec<(String, String, u64, u64, Vec<String>)> = Vec::new();
        let mut sig_hasher = Sha256::new();
        for a_sig in &analyzer_sigs {
            sig_hasher.update(a_sig.as_bytes());
            sig_hasher.update(b";");
        }
        for ev in evaluated {
            sig_hasher.update(ev.mod_owner.as_bytes());
            sig_hasher.update(ev.file_mtime.to_le_bytes());
            sig_hasher.update(ev.file_size.to_le_bytes());
            if !ev.cache_misses.is_empty() {
                cache_misses_batch.extend(ev.cache_misses);
            }
            if let Some(rk) = ev.route_key {
                route_owners
                    .entry(rk)
                    .or_default()
                    .insert(ev.mod_owner.clone());
            }
            if let Some(vk) = ev.vfs_key {
                vfs_owners
                    .entry(vk)
                    .or_default()
                    .insert(ev.mod_owner.clone());
            }
            for member in ev.archive_keys {
                archive_owners
                    .entry(member)
                    .or_default()
                    .insert(ev.mod_owner.clone());
            }
            for (analyzer_id, keys) in ev.binary_hits {
                let bucket = binary_owners_by_analyzer
                    .entry(analyzer_id)
                    .or_default();
                for key in keys {
                    bucket.entry(key).or_default().insert(ev.mod_owner.clone());
                }
            }
            for (analyzer_id, vprefix, keys) in ev.json_hits {
                let bucket = json_key_owners_by_analyzer
                    .entry(analyzer_id)
                    .or_default();
                for key in keys {
                    let formatted = if vprefix.is_empty() {
                        key
                    } else {
                        format!("{}#{}", vprefix, key)
                    };
                    bucket
                        .entry(formatted)
                        .or_default()
                        .insert(ev.mod_owner.clone());
                }
            }
        }

        if !cache_misses_batch.is_empty()
            && !cache_root.trim().is_empty()
            && Path::new(&cache_root).exists()
        {
            crate::utils::save_radar_analyzer_cache_batch(&cache_root, &cache_misses_batch);
        }

        let mut pair_map: BTreeMap<(String, String), PairCollisionAccumulator> = BTreeMap::new();
        record_resource_collisions(
            &route_owners,
            "routed_destination_overwrite",
            "install_routes",
            true,
            true,
            &fatal_exts,
            &mut pair_map,
        );
        record_resource_collisions(
            &vfs_owners,
            "virtual_fs_path",
            "virtual_fs_path",
            false,
            false,
            &fatal_exts,
            &mut pair_map,
        );
        record_resource_collisions(
            &archive_owners,
            "archive_member",
            "archive_member",
            false,
            false,
            &fatal_exts,
            &mut pair_map,
        );
        for (analyzer_id, bucket) in &binary_owners_by_analyzer {
            record_resource_collisions(
                bucket,
                "binary_chunk_index",
                analyzer_id,
                true,
                false,
                &fatal_exts,
                &mut pair_map,
            );
        }
        for (analyzer_id, bucket) in &json_key_owners_by_analyzer {
            record_resource_collisions(
                bucket,
                "json_xml_key",
                analyzer_id,
                false,
                false,
                &fatal_exts,
                &mut pair_map,
            );
        }

        let mut conflicts: Vec<Conflict> = pair_map
            .into_iter()
            .map(|((mod_a, mod_b), acc)| {
                let shared_assets = acc.resources.len();
                let severity_rank = if acc.has_fatal_collision {
                    4
                } else if shared_assets >= 10
                    || (acc.has_binary_collision && shared_assets >= 3)
                {
                    3
                } else if shared_assets >= 3 || acc.has_binary_collision {
                    2
                } else {
                    1
                };
                let conflict_type = if acc.conflict_types.len() == 1 {
                    acc.conflict_types.into_iter().next().unwrap_or_default()
                } else {
                    acc.conflict_types
                        .into_iter()
                        .collect::<Vec<_>>()
                        .join("+")
                };
                let analyzer_id = acc
                    .analyzer_ids
                    .into_iter()
                    .collect::<Vec<_>>()
                    .join("+");
                let sample_resources: Vec<String> =
                    acc.resources.into_iter().take(10).collect();

                Conflict {
                    mod_pair: format!("{} ⚡ {}", mod_a, mod_b),
                    shared_assets,
                    severity_rank,
                    mod_a,
                    mod_b,
                    conflict_type,
                    analyzer_id,
                    sample_resources,
                }
            })
            .collect();

        conflicts.sort_by(|a, b| {
            b.severity_rank
                .cmp(&a.severity_rank)
                .then_with(|| b.shared_assets.cmp(&a.shared_assets))
                .then_with(|| a.mod_pair.cmp(&b.mod_pair))
        });

        // Persist canonical resource keys into `.sanctuary_cache.db` for <10ms crash autopsy correlation
        // Skip SQLite DELETE+INSERT rewrite completely when active files & analyzer signatures are unchanged
        let chunk_index_sig = hex::encode(&sig_hasher.finalize()[..16]);
        let index_already_current = cache_misses_batch.is_empty()
            && !saved_coords.vault_path.trim().is_empty()
            && crate::utils::get_vault_kv(&saved_coords.vault_path, "radar_chunk_index_sig")
                .map(|(stored, _)| stored == chunk_index_sig)
                .unwrap_or(false);

        if !saved_coords.vault_path.trim().is_empty() && !index_already_current {
            let mut chunk_rows: Vec<(String, String)> = Vec::new();
            let mut seen_pairs: HashSet<(String, String)> = HashSet::new();
            let mut push_canon_token = |tok: &str, owners: &BTreeSet<String>| {
                let low = tok.trim().to_ascii_lowercase();
                if low.len() < 4 {
                    return;
                }
                for owner in owners {
                    if seen_pairs.insert((low.clone(), owner.clone())) {
                        chunk_rows.push((low.clone(), owner.clone()));
                    }
                }
            };
            for (_, bucket) in &binary_owners_by_analyzer {
                for (key, owners) in bucket {
                    push_canon_token(key, owners);
                }
            }
            for (vpath, owners) in &vfs_owners {
                push_canon_token(vpath, owners);
            }
            for (member, owners) in &archive_owners {
                push_canon_token(member, owners);
            }
            for (_, bucket) in &json_key_owners_by_analyzer {
                for (key, owners) in bucket {
                    push_canon_token(key, owners);
                }
            }
            if !chunk_rows.is_empty() {
                crate::utils::replace_radar_chunk_index(&saved_coords.vault_path, &chunk_rows);
                crate::utils::set_vault_kv(
                    &saved_coords.vault_path,
                    "radar_chunk_index_sig",
                    &chunk_index_sig,
                );
            }
        }

        Ok(serde_json::json!({
            "total_packages": installed_files.len(),
            "installed_mods": installed_files,
            "conflicts": conflicts
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_radar_analyzer_sqlite_cache_hit_and_mtime_invalidation() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_radar_cache_test_{}",
            uuid::Uuid::new_v4()
        ));
        let vault_dir = base.join("Vault");
        let mods_dir = base.join("LiveMods");
        let mod_folder = mods_dir.join("JsonMod");
        std::fs::create_dir_all(&vault_dir).unwrap();
        std::fs::create_dir_all(&mod_folder).unwrap();

        let json_file = mod_folder.join("tuning.json");
        std::fs::write(&json_file, br#"{"alpha_key":1,"beta_key":2}"#).unwrap();

        let analyzer = SchemaConflictAnalyzer {
            id: "json_rules".into(),
            analyzer_type: "json_xml_key".into(),
            extensions: vec![".json".into()],
            ..Default::default()
        };
        let sig = compute_analyzer_sig(&analyzer);
        let configured = vec![analyzer];
        let sigs = vec![sig.clone()];

        let item = ActiveRadarFile {
            full_path: &json_file,
            rel_path: &PathBuf::from("JsonMod/tuning.json"),
            rel_norm: "JsonMod/tuning.json",
            mod_owner: "JsonMod".to_string(),
            opt_vpath: Some("tuning.json".to_string()),
            ext_lower: "json".to_string(),
        };

        // Pass 1: empty SQLite cache -> cache miss parses & populates batch
        let vault_str = vault_dir.to_string_lossy().to_string();
        let cache1 = crate::utils::load_radar_analyzer_cache_map(&vault_str);
        let ev1 = evaluate_single_radar_file(
            &item,
            &[],
            base.as_path(),
            base.as_path(),
            &mods_dir,
            &None,
            &HashSet::new(),
            "",
            &configured,
            &sigs,
            &cache1,
        );
        assert_eq!(ev1.cache_hits_count, 0);
        assert_eq!(ev1.cache_misses.len(), 1);
        crate::utils::save_radar_analyzer_cache_batch(&vault_str, &ev1.cache_misses);

        // Pass 2: unchanged mtime + size + analyzer sig -> instant SQLite cache hit!
        let cache2 = crate::utils::load_radar_analyzer_cache_map(&vault_str);
        let ev2 = evaluate_single_radar_file(
            &item,
            &[],
            base.as_path(),
            base.as_path(),
            &mods_dir,
            &None,
            &HashSet::new(),
            "",
            &configured,
            &sigs,
            &cache2,
        );
        assert_eq!(ev2.cache_hits_count, 1);
        assert!(ev2.cache_misses.is_empty());
        assert_eq!(ev2.json_hits[0].2.len(), 2);

        // Pass 3: file size changes -> cache invalidated automatically!
        std::fs::write(&json_file, br#"{"alpha_key":1,"beta_key":2,"gamma_key":3}"#).unwrap();
        let ev3 = evaluate_single_radar_file(
            &item,
            &[],
            base.as_path(),
            base.as_path(),
            &mods_dir,
            &None,
            &HashSet::new(),
            "",
            &configured,
            &sigs,
            &cache2,
        );
        assert_eq!(ev3.cache_hits_count, 0);
        assert_eq!(ev3.cache_misses.len(), 1);
        assert_eq!(ev3.json_hits[0].2.len(), 3);

        let _ = crate::utils::remove_dir_all_clearing_readonly(&base);
    }
}
