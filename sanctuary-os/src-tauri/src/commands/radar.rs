use crate::schema::SchemaConflictAnalyzer;
use crate::state::*;
use crate::utils::*;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const MAX_RADAR_FILES: usize = 50_000;
const MAX_ARCHIVE_MEMBERS: usize = 8_192;
const MAX_BINARY_INDEX_ENTRIES: u64 = 65_536;

fn is_non_conflicting_doc_or_meta_file(file_name_lower: &str, manifest_lower: &str) -> bool {
    if file_name_lower == SANCTUARY_EDGE_MANIFEST_FILE
        || file_name_lower == SANCTUARY_EDGE_OVERRIDE_FILE
        || file_name_lower == ".sanctuary_deployed_links.json"
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

    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };
    let file_len = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => return Vec::new(),
    };

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
}

fn record_resource_collisions(
    resource_owners: &BTreeMap<String, BTreeSet<String>>,
    conflict_type: &str,
    analyzer_id: &str,
    is_binary: bool,
    pair_map: &mut BTreeMap<(String, String), PairCollisionAccumulator>,
) {
    for (resource_key, owners) in resource_owners {
        if owners.len() < 2 {
            continue;
        }
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
            }
        }
    }
}

#[tauri::command]
pub async fn run_conflict_radar(
    mods_path: String,
    target_files: Option<Vec<String>>,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let game_schema = state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mods_dir = Path::new(&mods_path);
        if !mods_dir.exists() {
            return Ok(serde_json::json!({
                "total_packages": 0,
                "installed_mods": Vec::<String>::new(),
                "conflicts": Vec::<Conflict>::new()
            }));
        }

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

        let target_filter: Option<HashSet<String>> = target_files.map(|list| {
            list.into_iter()
                .map(|item| item.replace('\\', "/").trim_matches('/').to_string())
                .collect()
        });

        let mut discovered_files: Vec<(PathBuf, PathBuf, String)> = Vec::new();
        let mut visited_dirs: HashSet<PathBuf> = HashSet::new();

        let walker = WalkDir::new(mods_dir)
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
            if discovered_files.len() >= MAX_RADAR_FILES {
                break;
            }
            if !entry.file_type().is_file() {
                continue;
            }
            let full_path = entry.path().to_path_buf();
            let rel_path = match full_path.strip_prefix(mods_dir) {
                Ok(r) => r.to_path_buf(),
                Err(_) => continue,
            };
            let file_name_lower = entry.file_name().to_string_lossy().to_lowercase();
            if is_non_conflicting_doc_or_meta_file(&file_name_lower, &manifest_lower) {
                continue;
            }

            let rel_norm = rel_path.to_string_lossy().replace('\\', "/");
            if let Some(targets) = &target_filter {
                let (owner, _) =
                    resolve_mod_owner_and_virtual_path(&rel_path, &tier_folders_lower);
                let mut matched = targets.contains(&rel_norm) || targets.contains(&owner);
                if !matched {
                    for tf in &tier_folders {
                        if targets.contains(&format!("{}/{}", tf, rel_norm)) {
                            matched = true;
                            break;
                        }
                    }
                }
                if !matched {
                    continue;
                }
            }

            discovered_files.push((full_path, rel_path, rel_norm));
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

        let configured_analyzers: Vec<SchemaConflictAnalyzer> = game_schema
            .as_ref()
            .and_then(|s| s.conflict_analyzers.clone())
            .unwrap_or_default();

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

        let mut vfs_owners: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut archive_owners: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut binary_owners_by_analyzer: HashMap<String, BTreeMap<String, BTreeSet<String>>> =
            HashMap::new();
        let mut json_key_owners_by_analyzer: HashMap<String, BTreeMap<String, BTreeSet<String>>> =
            HashMap::new();

        for (full_path, rel_path, _) in &discovered_files {
            let (mod_owner, opt_vpath) =
                resolve_mod_owner_and_virtual_path(rel_path, &tier_folders_lower);
            if mod_owner.is_empty() {
                continue;
            }

            let ext_lower = full_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();

            // 1. Virtual FS relative path collisions across distinct mod owners
            if let Some(vpath) = opt_vpath {
                let include_vfs = match &vfs_ext_filter {
                    Some(allowed) => allowed.contains(&ext_lower),
                    None => true,
                };
                if include_vfs && !vpath.is_empty() {
                    vfs_owners
                        .entry(vpath)
                        .or_default()
                        .insert(mod_owner.clone());
                }
            }

            // 2. Archive internal member collisions (.zip / .jar / schema archive_member)
            if archive_exts.contains(&ext_lower) {
                for member in extract_archive_member_keys(full_path, &manifest_lower) {
                    archive_owners
                        .entry(member)
                        .or_default()
                        .insert(mod_owner.clone());
                }
            }

            // 3. Declarative binary_chunk_index & json_xml_key analyzers from GameSchema
            for analyzer in &configured_analyzers {
                let ext_matches = analyzer.extensions.is_empty()
                    || analyzer
                        .extensions
                        .iter()
                        .any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(&ext_lower));
                if !ext_matches {
                    continue;
                }

                match analyzer.analyzer_type.as_str() {
                    "binary_chunk_index" => {
                        let analyzer_id = if analyzer.id.trim().is_empty() {
                            "binary_chunk_index".to_string()
                        } else {
                            analyzer.id.clone()
                        };
                        let keys = extract_binary_chunk_keys(full_path, analyzer);
                        if !keys.is_empty() {
                            let bucket = binary_owners_by_analyzer
                                .entry(analyzer_id)
                                .or_default();
                            for key in keys {
                                bucket.entry(key).or_default().insert(mod_owner.clone());
                            }
                        }
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
                        let keys = extract_json_top_level_keys(full_path);
                        if !keys.is_empty() {
                            let bucket = json_key_owners_by_analyzer
                                .entry(analyzer_id)
                                .or_default();
                            for key in keys {
                                bucket
                                    .entry(format!("{}#{}", vprefix, key))
                                    .or_default()
                                    .insert(mod_owner.clone());
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        let mut pair_map: BTreeMap<(String, String), PairCollisionAccumulator> = BTreeMap::new();
        record_resource_collisions(
            &vfs_owners,
            "virtual_fs_path",
            "virtual_fs_path",
            false,
            &mut pair_map,
        );
        record_resource_collisions(
            &archive_owners,
            "archive_member",
            "archive_member",
            false,
            &mut pair_map,
        );
        for (analyzer_id, bucket) in &binary_owners_by_analyzer {
            record_resource_collisions(
                bucket,
                "binary_chunk_index",
                analyzer_id,
                true,
                &mut pair_map,
            );
        }
        for (analyzer_id, bucket) in &json_key_owners_by_analyzer {
            record_resource_collisions(
                bucket,
                "json_xml_key",
                analyzer_id,
                false,
                &mut pair_map,
            );
        }

        let mut conflicts: Vec<Conflict> = pair_map
            .into_iter()
            .map(|((mod_a, mod_b), acc)| {
                let shared_assets = acc.resources.len();
                let severity_rank = if shared_assets >= 10
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

        Ok(serde_json::json!({
            "total_packages": installed_files.len(),
            "installed_mods": installed_files,
            "conflicts": conflicts
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}
