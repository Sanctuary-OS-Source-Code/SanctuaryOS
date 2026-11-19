use super::airgap_journal::RoutedFileRecord;
use crate::state::StructureNode;
use rayon::prelude::*;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Clone, Debug)]
pub enum PlannedVfsOp {
    File {
        source: PathBuf,
        dest: PathBuf,
        allow_write: bool,
        is_mutable_cfg: bool,
    },
    Junction {
        source: PathBuf,
        dest: PathBuf,
    },
}

impl PlannedVfsOp {
    pub fn dest(&self) -> &Path {
        match self {
            PlannedVfsOp::File { dest, .. } | PlannedVfsOp::Junction { dest, .. } => dest,
        }
    }

    pub fn source(&self) -> &Path {
        match self {
            PlannedVfsOp::File { source, .. } | PlannedVfsOp::Junction { source, .. } => source,
        }
    }

    pub fn is_junction(&self) -> bool {
        matches!(self, PlannedVfsOp::Junction { .. })
    }
}

#[derive(Clone, Debug)]
pub struct PlannedRouteOp {
    pub source: PathBuf,
    pub target_file: PathBuf,
    pub preserve_vanilla: bool,
    pub allow_write: bool,
    pub is_mutable_cfg: bool,
}

#[derive(Default)]
pub struct DeploymentPlan {
    pub vfs_ops: Vec<Option<PlannedVfsOp>>,
    pub vfs_by_key: HashMap<String, usize>,
    pub vfs_file_names_lower: HashSet<String>,
    pub ancestor_dirs: HashMap<String, PathBuf>,
    pub routes: Vec<Option<PlannedRouteOp>>,
    pub routes_by_key: HashMap<String, usize>,
}

impl DeploymentPlan {
    pub fn record_ancestor_dirs(&mut self, dir: &Path, mods_dir: &Path) {
        let mut cur = Some(dir);
        while let Some(dir_anc) = cur {
            if dir_anc == mods_dir || !dir_anc.starts_with(mods_dir) {
                break;
            }
            let key = crate::utils::normalize_path_key(dir_anc);
            if !key.is_empty() {
                self.ancestor_dirs
                    .entry(key)
                    .or_insert_with(|| dir_anc.to_path_buf());
            }
            cur = dir_anc.parent();
        }
    }

    pub fn contains_vfs_target(&self, dest: &Path) -> bool {
        let key = crate::utils::normalize_path_key(dest);
        self.vfs_by_key.contains_key(&key)
    }

    pub fn contains_vfs_filename(&self, file_name: &str) -> bool {
        self.vfs_file_names_lower
            .contains(&file_name.to_ascii_lowercase())
    }

    pub fn record_vfs_file(
        &mut self,
        source: PathBuf,
        dest: PathBuf,
        allow_write: bool,
        is_mutable_cfg: bool,
        asset_last_wins: bool,
        mods_dir: &Path,
    ) -> bool {
        let key = crate::utils::normalize_path_key(&dest);
        if key.is_empty() {
            return false;
        }
        if let Some(&idx) = self.vfs_by_key.get(&key) {
            if !asset_last_wins {
                return false;
            }
            self.vfs_ops[idx] = Some(PlannedVfsOp::File {
                source,
                dest,
                allow_write,
                is_mutable_cfg,
            });
            return true;
        }
        if let Some(parent) = dest.parent() {
            self.record_ancestor_dirs(parent, mods_dir);
        }
        if let Some(fname) = dest.file_name().and_then(|n| n.to_str()) {
            self.vfs_file_names_lower.insert(fname.to_ascii_lowercase());
        }
        let idx = self.vfs_ops.len();
        self.vfs_ops.push(Some(PlannedVfsOp::File {
            source,
            dest,
            allow_write,
            is_mutable_cfg,
        }));
        self.vfs_by_key.insert(key, idx);
        true
    }

    pub fn record_vfs_junction(
        &mut self,
        source: PathBuf,
        dest: PathBuf,
        asset_last_wins: bool,
        mods_dir: &Path,
    ) -> bool {
        let key = crate::utils::normalize_path_key(&dest);
        if key.is_empty() {
            return false;
        }
        if let Some(&idx) = self.vfs_by_key.get(&key) {
            if !asset_last_wins {
                return false;
            }
            self.vfs_ops[idx] = Some(PlannedVfsOp::Junction { source, dest });
            return true;
        }
        self.record_ancestor_dirs(&dest, mods_dir);
        let idx = self.vfs_ops.len();
        self.vfs_ops
            .push(Some(PlannedVfsOp::Junction { source, dest }));
        self.vfs_by_key.insert(key, idx);
        true
    }

    pub fn record_route(
        &mut self,
        source: PathBuf,
        target_file: PathBuf,
        preserve_vanilla: bool,
        allow_write: bool,
        is_mutable_cfg: bool,
        asset_last_wins: bool,
    ) -> bool {
        let key = crate::utils::normalize_path_key(&target_file);
        if key.is_empty() {
            return false;
        }
        if let Some(&idx) = self.routes_by_key.get(&key) {
            if !asset_last_wins {
                return false;
            }
            self.routes[idx] = Some(PlannedRouteOp {
                source,
                target_file,
                preserve_vanilla,
                allow_write,
                is_mutable_cfg,
            });
            return true;
        }
        let idx = self.routes.len();
        self.routes.push(Some(PlannedRouteOp {
            source,
            target_file,
            preserve_vanilla,
            allow_write,
            is_mutable_cfg,
        }));
        self.routes_by_key.insert(key, idx);
        true
    }
}

pub fn plan_structure_nodes(
    plan: &mut DeploymentPlan,
    schema: &Option<crate::schema::GameSchema>,
    nodes: &[StructureNode],
    current_target_dir: &Path,
    mods_dir: &Path,
    vault_mods_lane: &Path,
    folders_to_check: &[&str],
    allow_write: bool,
    asset_last_wins: bool,
) -> usize {
    let target_roots = [current_target_dir.to_path_buf()];
    let vault_roots = [vault_mods_lane.to_path_buf()];
    let exts = crate::game_logic::get_supported_extensions(schema);
    let config_exts = crate::game_logic::get_config_extensions(schema);
    let editable_exts = crate::game_logic::get_editable_config_extensions(schema);
    let mut planned_count = 0usize;

    for node in nodes {
        if node.node_type == "folder" {
            if !crate::utils::is_safe_single_node_component(&node.name) {
                continue;
            }
            let next_target_dir = current_target_dir.join(node.name.trim());
            if crate::utils::ensure_strict_descendant_of_roots(&next_target_dir, &target_roots)
                .is_err()
            {
                continue;
            }
            plan.record_ancestor_dirs(&next_target_dir, mods_dir);
            if let Some(children) = &node.children {
                planned_count += plan_structure_nodes(
                    plan,
                    schema,
                    children,
                    &next_target_dir,
                    mods_dir,
                    vault_mods_lane,
                    folders_to_check,
                    allow_write,
                    asset_last_wins,
                );
            }
        } else if node.node_type == "file" {
            let mod_name = node
                .assigned_mod_name
                .as_ref()
                .unwrap_or(&node.name)
                .trim();
            if !crate::utils::is_safe_relative_node_subpath(mod_name) {
                continue;
            }
            let mut source = vault_mods_lane.join(mod_name);
            let mut found = false;
            let mod_stem = Path::new(mod_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(mod_name);

            for f in folders_to_check {
                let dir_root = if f.is_empty() {
                    vault_mods_lane.to_path_buf()
                } else {
                    vault_mods_lane.join(f)
                };
                let candidates = [
                    dir_root.join(mod_name),
                    dir_root.join(mod_stem).join(mod_name),
                ];
                for base_test in candidates {
                    if base_test.is_file() {
                        source = base_test;
                        found = true;
                        break;
                    } else {
                        for ext in &exts {
                            if base_test.with_extension(ext).is_file() {
                                source = base_test.with_extension(ext);
                                found = true;
                                break;
                            }
                        }
                        if found {
                            break;
                        }
                    }
                }
                if found {
                    break;
                }
            }
            if !found {
                continue;
            }
            if crate::utils::ensure_strict_descendant_of_roots(&source, &vault_roots).is_err() {
                continue;
            }
            let mut final_name = node.name.trim().to_string();
            if final_name.starts_with("*.") {
                final_name = source
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
            }
            if !crate::utils::is_safe_single_node_component(&final_name) {
                continue;
            }
            let target_path = current_target_dir.join(&final_name);
            if crate::utils::ensure_strict_descendant_of_roots(&target_path, &target_roots).is_err()
            {
                continue;
            }
            if source.is_dir() {
                if plan.record_vfs_junction(source, target_path, asset_last_wins, mods_dir) {
                    planned_count += 1;
                }
            } else {
                let ext_low = source
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_ascii_lowercase())
                    .unwrap_or_default();
                let is_mutable =
                    config_exts.contains(&ext_low) || editable_exts.contains(&ext_low);
                if plan.record_vfs_file(
                    source,
                    target_path,
                    allow_write,
                    is_mutable,
                    asset_last_wins,
                    mods_dir,
                ) {
                    planned_count += 1;
                }
            }
        }
    }
    planned_count
}

fn normalized_canonical_key(path: &Path) -> Option<String> {
    let canon = std::fs::canonicalize(path).ok()?;
    let stripped = crate::utils::strip_windows_verbatim_prefix(&canon);
    Some(crate::utils::normalize_path_key(&stripped))
}

#[cfg(target_os = "windows")]
fn files_share_same_inode(src: &Path, dst: &Path) -> bool {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };

    let Ok(f_src) = std::fs::File::open(src) else {
        return false;
    };
    let Ok(f_dst) = std::fs::File::open(dst) else {
        return false;
    };
    let mut info_src = BY_HANDLE_FILE_INFORMATION::default();
    let mut info_dst = BY_HANDLE_FILE_INFORMATION::default();
    let ok = unsafe {
        GetFileInformationByHandle(HANDLE(f_src.as_raw_handle()), &mut info_src).is_ok()
            && GetFileInformationByHandle(HANDLE(f_dst.as_raw_handle()), &mut info_dst).is_ok()
    };
    ok && info_src.dwVolumeSerialNumber == info_dst.dwVolumeSerialNumber
        && info_src.nFileIndexHigh == info_dst.nFileIndexHigh
        && info_src.nFileIndexLow == info_dst.nFileIndexLow
}

#[cfg(unix)]
fn files_share_same_inode(src: &Path, dst: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    let Ok(m_src) = std::fs::metadata(src) else {
        return false;
    };
    let Ok(m_dst) = std::fs::symlink_metadata(dst) else {
        return false;
    };
    m_src.dev() == m_dst.dev() && m_src.ino() == m_dst.ino()
}

pub fn existing_link_matches_source(
    source: &Path,
    dest: &Path,
    is_junction: bool,
    allow_write: bool,
    is_mutable_cfg: bool,
) -> bool {
    let Ok(dst_meta) = std::fs::symlink_metadata(dest) else {
        return false;
    };
    let is_reparse = crate::utils::is_symlink_or_reparse_point(dest);

    if is_junction {
        if !is_reparse {
            return false;
        }
        return match (normalized_canonical_key(source), normalized_canonical_key(dest)) {
            (Some(s), Some(d)) => s == d,
            _ => false,
        };
    }

    // Tracked read-only mutable config copies intentionally refresh from the Vault
    if is_mutable_cfg && !allow_write {
        return false;
    }

    if is_reparse {
        if dst_meta.is_dir() {
            return false;
        }
        return match (normalized_canonical_key(source), normalized_canonical_key(dest)) {
            (Some(s), Some(d)) => s == d,
            _ => false,
        };
    }

    if dst_meta.is_dir() {
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        let expected_ro = !allow_write && !is_mutable_cfg;
        if dst_meta.permissions().readonly() != expected_ro {
            return false;
        }
    }

    files_share_same_inode(source, dest)
}

fn load_prior_routed_records(vault_path: &str) -> Vec<RoutedFileRecord> {
    if vault_path.trim().is_empty() {
        return Vec::new();
    }
    let mut records_all: Vec<RoutedFileRecord> = Vec::new();
    let mut seen_targets: HashSet<String> = HashSet::new();

    if let Some((raw, _)) = crate::utils::get_vault_kv(vault_path, "routed_links") {
        if let Ok(records) = serde_json::from_str::<Vec<RoutedFileRecord>>(&raw) {
            for r in records {
                let k = crate::utils::normalize_path_key(Path::new(&r.target_path));
                if !k.is_empty() && seen_targets.insert(k) {
                    records_all.push(r);
                }
            }
        }
    }
    let manifest_file = PathBuf::from(vault_path).join(".sanctuary_routed_links.json");
    if manifest_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&manifest_file) {
            if let Ok(records) = serde_json::from_str::<Vec<RoutedFileRecord>>(&content) {
                for r in records {
                    let k = crate::utils::normalize_path_key(Path::new(&r.target_path));
                    if !k.is_empty() && seen_targets.insert(k) {
                        records_all.push(r);
                    }
                }
            }
        }
        let _ = std::fs::remove_file(&manifest_file);
    }

    let wal_file = PathBuf::from(vault_path).join(".sanctuary_routed_links.jsonl");
    if wal_file.exists() {
        if let Ok(wal_content) = std::fs::read_to_string(&wal_file) {
            for line in wal_content.lines() {
                if let Ok(rec) = serde_json::from_str::<RoutedFileRecord>(line.trim()) {
                    let k = crate::utils::normalize_path_key(Path::new(&rec.target_path));
                    if !k.is_empty() && seen_targets.insert(k) {
                        records_all.push(rec);
                    }
                }
            }
        }
    }
    records_all
}

pub fn reconcile_routed_deployment(
    vault_path: &str,
    plan: &DeploymentPlan,
    wal_path: Option<&Path>,
) -> Vec<RoutedFileRecord> {
    let prior_records = load_prior_routed_records(vault_path);
    let mut prior_by_key: HashMap<String, RoutedFileRecord> =
        HashMap::with_capacity(prior_records.len());
    let mut stale_records: Vec<RoutedFileRecord> = Vec::new();

    for rec in prior_records {
        let key = crate::utils::normalize_path_key(Path::new(&rec.target_path));
        if plan.routes_by_key.contains_key(&key) {
            prior_by_key.insert(key, rec);
        } else {
            stale_records.push(rec);
        }
    }

    // Remove only routes that are no longer part of the desired DeploymentPlan
    stale_records.into_par_iter().for_each(|rec| {
        let target = PathBuf::from(&rec.target_path);
        if target.exists() || std::fs::symlink_metadata(&target).is_ok() {
            let _ = crate::utils::remove_file_clearing_readonly(&target);
        }
        if let Some(bak_str) = rec.backup_path {
            let bak = PathBuf::from(&bak_str);
            if bak.exists() {
                let _ = std::fs::rename(&bak, &target);
            }
        } else {
            crate::utils::restore_vanilla_backup_if_present(&target);
        }
    });

    let planned_ops: Vec<&PlannedRouteOp> = plan.routes.iter().flatten().collect();
    if planned_ops.is_empty() {
        if !vault_path.trim().is_empty() {
            crate::utils::delete_vault_kv(vault_path, "routed_links");
        }
        return Vec::new();
    }

    // Write all planned routed targets to a single buffered WAL handle before parallel materialization
    if let Some(wpath) = wal_path {
        if let Some(parent) = wpath.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(f) = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(wpath)
        {
            let mut writer = BufWriter::with_capacity(128 * 1024, f);
            for op in &planned_ops {
                let key = crate::utils::normalize_path_key(&op.target_file);
                let bak_str = prior_by_key
                    .get(&key)
                    .and_then(|r| r.backup_path.clone())
                    .or_else(|| {
                        let bak = PathBuf::from(format!(
                            "{}.sanctuary_vanilla_bak",
                            op.target_file.to_string_lossy()
                        ));
                        bak.exists().then(|| bak.to_string_lossy().to_string())
                    });
                let rec = RoutedFileRecord {
                    target_path: op.target_file.to_string_lossy().to_string(),
                    backup_path: bak_str,
                    source_path: op.source.to_string_lossy().to_string(),
                };
                if let Ok(json_line) = serde_json::to_string(&rec) {
                    let _ = writeln!(writer, "{}", json_line);
                }
            }
            let _ = writer.flush();
        }
    }

    let results: Vec<Option<RoutedFileRecord>> = planned_ops
        .into_par_iter()
        .map(|op| {
            let key = crate::utils::normalize_path_key(&op.target_file);
            let bak_path = PathBuf::from(format!(
                "{}.sanctuary_vanilla_bak",
                op.target_file.to_string_lossy()
            ));
            let existing_bak = prior_by_key
                .get(&key)
                .and_then(|r| r.backup_path.clone())
                .or_else(|| {
                    bak_path
                        .exists()
                        .then(|| bak_path.to_string_lossy().to_string())
                });

            if existing_link_matches_source(
                &op.source,
                &op.target_file,
                false,
                op.allow_write,
                op.is_mutable_cfg,
            ) {
                return Some(RoutedFileRecord {
                    target_path: op.target_file.to_string_lossy().to_string(),
                    backup_path: existing_bak,
                    source_path: op.source.to_string_lossy().to_string(),
                });
            }

            if let Some(parent_dir) = op.target_file.parent() {
                let _ = std::fs::create_dir_all(parent_dir);
            }

            let mut recorded_bak = existing_bak;
            if op.target_file.exists() || std::fs::symlink_metadata(&op.target_file).is_ok() {
                let is_symlink = crate::utils::is_symlink_or_reparse_point(&op.target_file);
                if op.preserve_vanilla && !is_symlink && !bak_path.exists() {
                    if std::fs::rename(&op.target_file, &bak_path).is_ok() {
                        recorded_bak = Some(bak_path.to_string_lossy().to_string());
                    } else {
                        let _ = crate::utils::remove_file_clearing_readonly(&op.target_file);
                    }
                } else {
                    let _ = crate::utils::remove_file_clearing_readonly(&op.target_file);
                }
            }

            if crate::utils::deploy_file_link_batched(
                &op.source,
                &op.target_file,
                op.allow_write,
                op.is_mutable_cfg,
                false,
            )
            .is_ok()
            {
                Some(RoutedFileRecord {
                    target_path: op.target_file.to_string_lossy().to_string(),
                    backup_path: recorded_bak,
                    source_path: op.source.to_string_lossy().to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    let records: Vec<RoutedFileRecord> = results.into_iter().flatten().collect();
    if !vault_path.trim().is_empty() {
        if records.is_empty() {
            crate::utils::delete_vault_kv(vault_path, "routed_links");
        } else if let Ok(json) = serde_json::to_string_pretty(&records) {
            crate::utils::set_vault_kv(vault_path, "routed_links", &json);
        }
    }
    records
}

fn collect_prior_tracked_vfs_set(mods_dir: &Path, vault_path: &str) -> HashSet<String> {
    let mut tracked_set: HashSet<String> = HashSet::new();
    let wipe_roots = [mods_dir.to_path_buf()];
    let mut record_if_inside = |item: &str| {
        let p = PathBuf::from(item);
        if crate::utils::ensure_strict_descendant_of_roots(&p, &wipe_roots).is_ok() {
            let norm = crate::utils::normalize_path_key(&p);
            if !norm.is_empty() {
                tracked_set.insert(norm);
            }
        }
    };

    let mut manifest_locations = vec![mods_dir.join(".sanctuary_deployed_links.json")];
    let mut journal_locations = vec![mods_dir.join(".sanctuary_deploy_journal.jsonl")];

    if !vault_path.trim().is_empty() {
        if let Some((raw, _)) = crate::utils::get_vault_kv(vault_path, "deployed_links") {
            if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
                for item in list {
                    record_if_inside(&item);
                }
            }
        }
        let vp = PathBuf::from(vault_path);
        manifest_locations.push(vp.join(".sanctuary_deployed_links.json"));
        journal_locations.push(vp.join(".sanctuary_deploy_journal.jsonl"));
    }

    for loc in &manifest_locations {
        if loc.exists() {
            if let Ok(raw) = std::fs::read_to_string(loc) {
                if let Ok(list) = serde_json::from_str::<Vec<String>>(&raw) {
                    for item in list {
                        record_if_inside(&item);
                    }
                }
            }
        }
    }

    for jloc in &journal_locations {
        if jloc.exists() {
            if let Ok(raw) = std::fs::read_to_string(jloc) {
                for line in raw.lines() {
                    let clean = line.trim();
                    if !clean.is_empty() {
                        record_if_inside(clean);
                    }
                }
            }
        }
    }

    tracked_set
}

fn write_single_wal_handle(wal_path: &Path, paths: &[&Path]) {
    if let Some(parent) = wal_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(f) = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(wal_path)
    {
        let mut writer = BufWriter::with_capacity(256 * 1024, f);
        for p in paths {
            let _ = writeln!(writer, "{}", p.to_string_lossy());
        }
        let _ = writer.flush();
    }
}

pub fn reconcile_vfs_deployment(
    mods_dir: &Path,
    vault_path: &str,
    vault_mods_lane: &Path,
    game_schema: &Option<crate::schema::GameSchema>,
    shared_with_vanilla: bool,
    plan: &DeploymentPlan,
) -> Vec<String> {
    let prior_tracked_set = collect_prior_tracked_vfs_set(mods_dir, vault_path);
    let manifest_leaf = crate::game_logic::resolve_manifest_leaf_lower(game_schema);
    let supported_exts = crate::game_logic::get_supported_extensions(game_schema);
    let rescue_lane = (!vault_mods_lane.as_os_str().is_empty()).then(|| vault_mods_lane.to_path_buf());

    let mut stale_links_and_files: Vec<PathBuf> = Vec::new();
    let mut untracked_dedicated_files: Vec<PathBuf> = Vec::new();
    let mut candidate_stale_dirs: Vec<PathBuf> = Vec::new();
    let mut already_matched_keys: HashSet<String> = HashSet::new();

    // Walk mods_dir without descending into junctions/directory symlinks
    let mut it = WalkDir::new(mods_dir).follow_links(false).into_iter();
    while let Some(entry_res) = it.next() {
        let Ok(entry) = entry_res else {
            continue;
        };
        let path = entry.path().to_path_buf();
        if path == mods_dir {
            continue;
        }

        let is_reparse = crate::utils::is_symlink_or_reparse_point(&path);
        if is_reparse && entry.file_type().is_dir() {
            it.skip_current_dir();
        }

        let fname_lower = entry.file_name().to_string_lossy().to_lowercase();
        let parent_is_root = path.parent() == Some(mods_dir);
        if parent_is_root && !manifest_leaf.is_empty() && fname_lower == manifest_leaf {
            continue;
        }
        if fname_lower.starts_with(".sanctuary_")
            && fname_lower != ".sanctuary_deploy_journal.jsonl"
            && fname_lower != ".sanctuary_deployed_links.json"
        {
            continue;
        }
        if fname_lower == ".sanctuary_deployed_links.json" {
            continue;
        }

        let norm = crate::utils::normalize_path_key(&path);

        if is_reparse {
            if let Some(&idx) = plan.vfs_by_key.get(&norm) {
                if let Some(op) = plan.vfs_ops.get(idx).and_then(|o| o.as_ref()) {
                    if existing_link_matches_source(
                        op.source(),
                        op.dest(),
                        op.is_junction(),
                        matches!(op, PlannedVfsOp::File { allow_write: true, .. }),
                        matches!(
                            op,
                            PlannedVfsOp::File {
                                is_mutable_cfg: true,
                                ..
                            }
                        ),
                    ) {
                        already_matched_keys.insert(norm);
                        continue;
                    }
                }
            }
            stale_links_and_files.push(path);
            continue;
        }

        if entry.file_type().is_dir() {
            if plan.vfs_by_key.contains_key(&norm) {
                // Target replaced a regular folder with a planned file or junction
                candidate_stale_dirs.push(path);
                continue;
            }
            if !plan.ancestor_dirs.contains_key(&norm)
                && (!shared_with_vanilla || prior_tracked_set.contains(&norm))
            {
                candidate_stale_dirs.push(path);
            }
            continue;
        }

        // Regular file
        if let Some(&idx) = plan.vfs_by_key.get(&norm) {
            if let Some(op) = plan.vfs_ops.get(idx).and_then(|o| o.as_ref()) {
                let (allow_write, is_mutable_cfg) = match op {
                    PlannedVfsOp::File {
                        allow_write,
                        is_mutable_cfg,
                        ..
                    } => (*allow_write, *is_mutable_cfg),
                    PlannedVfsOp::Junction { .. } => {
                        stale_links_and_files.push(path);
                        continue;
                    }
                };
                if existing_link_matches_source(
                    op.source(),
                    op.dest(),
                    false,
                    allow_write,
                    is_mutable_cfg,
                ) {
                    already_matched_keys.insert(norm);
                } else if !shared_with_vanilla || prior_tracked_set.contains(&norm) {
                    stale_links_and_files.push(path);
                }
                // If shared_with_vanilla && !prior_tracked_set: keep on disk until to_apply renames it to .sanctuary_vanilla_bak
                continue;
            }
        }

        if fname_lower == "desktop.ini"
            || fname_lower == "thumbs.db"
            || fname_lower == ".ds_store"
            || prior_tracked_set.contains(&norm)
        {
            stale_links_and_files.push(path);
            continue;
        }

        if !shared_with_vanilla {
            let rel_str = path
                .strip_prefix(mods_dir)
                .map(|r| r.to_string_lossy().into_owned())
                .unwrap_or_else(|_| fname_lower.clone());
            if crate::game_logic::is_cache_file(game_schema, &rel_str) {
                stale_links_and_files.push(path);
            } else {
                untracked_dedicated_files.push(path);
            }
        }
    }

    // Rescue any user-dropped untracked files inside a dedicated (non-vanilla-shared) mods dir
    if let Some(ref lane) = rescue_lane {
        for path in untracked_dedicated_files {
            if crate::utils::rescue_untracked_mod_file(
                &path,
                mods_dir,
                lane,
                &supported_exts,
                game_schema,
            ) {
                continue;
            }
            let fname_lower = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_ascii_lowercase())
                .unwrap_or_default();
            let rel_path = path
                .strip_prefix(mods_dir)
                .unwrap_or_else(|_| Path::new(&fname_lower));
            let dest = lane.join(rel_path);
            if let Some(parent) = dest.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if std::fs::rename(&path, &dest).is_err() {
                if std::fs::copy(&path, &dest).is_ok() {
                    let _ = crate::utils::remove_file_clearing_readonly(&path);
                }
            }
        }
    }

    // Step 1: Parallel unlink of only stale/changed files & symlinks
    stale_links_and_files.into_par_iter().for_each(|path| {
        if crate::utils::is_symlink_or_reparse_point(&path) {
            let _ = crate::utils::remove_symlink_or_junction(&path);
            crate::utils::restore_vanilla_backup_if_present(&path);
        } else {
            let _ = crate::utils::remove_file_clearing_readonly(&path);
            crate::utils::restore_vanilla_backup_if_present(&path);
        }
    });

    // Step 2: Remove stale empty directories deepest-first
    candidate_stale_dirs.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
    for dir in &candidate_stale_dirs {
        if let Ok(meta) = std::fs::symlink_metadata(dir) {
            let mut perms = meta.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = std::fs::set_permissions(dir, perms);
            }
        }
        let _ = std::fs::remove_dir(dir);
    }

    // Step 3: Create missing ancestor directories in parallel per tree depth
    let mut dirs_by_depth: BTreeMap<usize, Vec<&PathBuf>> = BTreeMap::new();
    for dir in plan.ancestor_dirs.values() {
        let depth = dir.components().count();
        dirs_by_depth.entry(depth).or_default().push(dir);
    }
    for (_depth, level_dirs) in dirs_by_depth {
        level_dirs.into_par_iter().for_each(|d| {
            if !d.is_dir() {
                let _ = std::fs::create_dir_all(d);
            }
        });
    }

    // Step 4: Write full planned deploy journal through a single BufWriter WAL handle
    let planned_ops: Vec<&PlannedVfsOp> = plan.vfs_ops.iter().flatten().collect();
    let mut all_wal_paths: Vec<&Path> =
        Vec::with_capacity(planned_ops.len() + plan.ancestor_dirs.len());
    for dir in plan.ancestor_dirs.values() {
        all_wal_paths.push(dir.as_path());
    }
    for op in &planned_ops {
        all_wal_paths.push(op.dest());
    }

    let mods_journal = mods_dir.join(".sanctuary_deploy_journal.jsonl");
    write_single_wal_handle(&mods_journal, &all_wal_paths);
    if !vault_path.trim().is_empty() {
        let vault_journal = PathBuf::from(vault_path).join(".sanctuary_deploy_journal.jsonl");
        write_single_wal_handle(&vault_journal, &all_wal_paths);
    }

    // Step 5: Materialize only missing or changed links in parallel via Rayon
    let to_apply: Vec<&PlannedVfsOp> = planned_ops
        .iter()
        .copied()
        .filter(|op| {
            let k = crate::utils::normalize_path_key(op.dest());
            !already_matched_keys.contains(&k)
        })
        .collect();

    let applied_results: Vec<Option<String>> = to_apply
        .into_par_iter()
        .map(|op| {
            let dest = op.dest();
            if let Some(parent) = dest.parent() {
                if !parent.is_dir() {
                    let _ = std::fs::create_dir_all(parent);
                }
            }
            let key = crate::utils::normalize_path_key(dest);
            let dst_exists = dest.exists() || std::fs::symlink_metadata(dest).is_ok();
            if dst_exists {
                let is_link = crate::utils::is_symlink_or_reparse_point(dest);
                let bak_path = PathBuf::from(format!("{}.sanctuary_vanilla_bak", dest.to_string_lossy()));
                if shared_with_vanilla
                    && !is_link
                    && !prior_tracked_set.contains(&key)
                    && !bak_path.exists()
                {
                    let _ = std::fs::rename(dest, &bak_path);
                } else if is_link {
                    let _ = crate::utils::remove_symlink_or_junction(dest);
                } else {
                    let _ = crate::utils::remove_file_clearing_readonly(dest);
                }
            }

            let ok = match op {
                PlannedVfsOp::Junction { source, dest } => {
                    crate::utils::deploy_junction(source, dest).is_ok()
                }
                PlannedVfsOp::File {
                    source,
                    dest,
                    allow_write,
                    is_mutable_cfg,
                } => crate::utils::deploy_file_link_batched(
                    source,
                    dest,
                    *allow_write,
                    *is_mutable_cfg,
                    false,
                )
                .is_ok(),
            };
            ok.then(|| dest.to_string_lossy().to_string())
        })
        .collect();

    let mut deployed_set: HashSet<String> = HashSet::new();
    let mut deployed_out: Vec<String> = Vec::new();
    for dir in plan.ancestor_dirs.values() {
        let s = dir.to_string_lossy().to_string();
        if deployed_set.insert(crate::utils::normalize_path_key(dir)) {
            deployed_out.push(s);
        }
    }
    for op in &planned_ops {
        let k = crate::utils::normalize_path_key(op.dest());
        if already_matched_keys.contains(&k) && deployed_set.insert(k) {
            deployed_out.push(op.dest().to_string_lossy().to_string());
        }
    }
    for s in applied_results.into_iter().flatten() {
        let k = crate::utils::normalize_path_key(Path::new(&s));
        if deployed_set.insert(k) {
            deployed_out.push(s);
        }
    }
    deployed_out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_differential_vfs_keeps_unchanged_hardlinks_and_removes_stale() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_diff_vfs_test_{}",
            uuid::Uuid::new_v4()
        ));
        let vault_dir = base.join("Vault");
        let vault_mods = vault_dir.join("Mods");
        let mods_dir = base.join("LiveMods");
        std::fs::create_dir_all(&vault_mods).unwrap();
        std::fs::create_dir_all(&mods_dir).unwrap();

        let total = 250usize;
        let mut sources = Vec::with_capacity(total);
        for i in 0..total {
            let p = vault_mods.join(format!("Mod_{:04}.dat", i));
            std::fs::write(&p, format!("payload-{}", i)).unwrap();
            sources.push(p);
        }
        let replacement_src = vault_mods.join("Mod_0005_updated.dat");
        std::fs::write(&replacement_src, b"payload-5-v2").unwrap();

        // Pass 1: deploy all 250 mods
        let mut plan1 = DeploymentPlan::default();
        for (i, src) in sources.iter().enumerate() {
            let dst = mods_dir.join("SubTier").join(format!("Mod_{:04}.dat", i));
            plan1.record_vfs_file(src.clone(), dst, false, false, true, &mods_dir);
        }
        let deployed1 = reconcile_vfs_deployment(
            &mods_dir,
            &vault_dir.to_string_lossy(),
            &vault_mods,
            &None,
            false,
            &plan1,
        );
        crate::utils::atomic_write_bytes(
            &mods_dir.join(".sanctuary_deployed_links.json"),
            serde_json::to_string(&deployed1).unwrap().as_bytes(),
        )
        .unwrap();
        assert_eq!(
            std::fs::read(mods_dir.join("SubTier/Mod_0005.dat")).unwrap(),
            b"payload-5"
        );
        assert!(mods_dir.join(".sanctuary_deploy_journal.jsonl").exists());

        // Verify unchanged links on disk report true via existing_link_matches_source
        assert!(existing_link_matches_source(
            &sources[0],
            &mods_dir.join("SubTier/Mod_0000.dat"),
            false,
            false,
            false
        ));

        // Pass 2: remove Mod_0009, swap Mod_0005 to v2, keep the other 248 untouched!
        let mut plan2 = DeploymentPlan::default();
        for (i, src) in sources.iter().enumerate() {
            if i == 9 {
                continue;
            }
            let effective_src = if i == 5 { &replacement_src } else { src };
            let dst = mods_dir.join("SubTier").join(format!("Mod_{:04}.dat", i));
            plan2.record_vfs_file(effective_src.clone(), dst, false, false, true, &mods_dir);
        }
        let deployed2 = reconcile_vfs_deployment(
            &mods_dir,
            &vault_dir.to_string_lossy(),
            &vault_mods,
            &None,
            false,
            &plan2,
        );
        assert!(deployed2.iter().any(|p| p.ends_with("Mod_0000.dat")));
        assert!(!mods_dir.join("SubTier/Mod_0009.dat").exists());
        assert_eq!(
            std::fs::read(mods_dir.join("SubTier/Mod_0005.dat")).unwrap(),
            b"payload-5-v2"
        );
        // Unchanged file 0000 still points to exact same link/inode as Pass 1
        assert!(existing_link_matches_source(
            &sources[0],
            &mods_dir.join("SubTier/Mod_0000.dat"),
            false,
            false,
            false
        ));

        let _ = crate::utils::remove_dir_all_clearing_readonly(&base);
    }

    #[test]
    fn test_deployment_plan_collision_order_last_vs_first_wins() {
        let mods_dir = PathBuf::from("/tmp/mods");
        let a = PathBuf::from("/tmp/vault/A/override.dat");
        let b = PathBuf::from("/tmp/vault/B/override.dat");
        let dst = mods_dir.join("override.dat");

        let mut plan_last = DeploymentPlan::default();
        assert!(plan_last.record_vfs_file(a.clone(), dst.clone(), false, false, true, &mods_dir));
        assert!(plan_last.record_vfs_file(b.clone(), dst.clone(), false, false, true, &mods_dir));
        assert_eq!(plan_last.vfs_ops[0].as_ref().unwrap().source(), b.as_path());

        let mut plan_first = DeploymentPlan::default();
        assert!(plan_first.record_vfs_file(a.clone(), dst.clone(), false, false, false, &mods_dir));
        assert!(!plan_first.record_vfs_file(b.clone(), dst.clone(), false, false, false, &mods_dir));
        assert_eq!(plan_first.vfs_ops[0].as_ref().unwrap().source(), a.as_path());
    }

    #[test]
    fn test_differential_routed_deployment_reconciles_multi_root_and_prunes_removed_routes() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_routed_vfs_test_{}",
            uuid::Uuid::new_v4()
        ));
        let vault_dir = base.join("vault");
        let appdata_root = base.join("appdata_target");
        let docs_root = base.join("docs_target");
        std::fs::create_dir_all(&vault_dir).unwrap();
        std::fs::create_dir_all(&appdata_root).unwrap();
        std::fs::create_dir_all(&docs_root).unwrap();

        let src_a = base.join("src_route_a.bin");
        let src_bak = base.join("src_route_bak.cfg");
        let src_b_v1 = base.join("src_route_b_v1.cfg");
        let src_b_v2 = base.join("src_route_b_v2.cfg");
        std::fs::write(&src_a, b"ROUTE_A_PAYLOAD").unwrap();
        std::fs::write(&src_bak, b"MODDED_CFG").unwrap();
        std::fs::write(&src_b_v1, b"ROUTE_B_V1").unwrap();
        std::fs::write(&src_b_v2, b"ROUTE_B_V2").unwrap();

        let vanilla_untouched = appdata_root.join("vanilla_unrelated.txt");
        let target_bak = appdata_root.join("route_bak.cfg");
        let target_a = appdata_root.join("sub").join("route_a.bin");
        let target_b = docs_root.join("route_b.cfg");
        std::fs::write(&vanilla_untouched, b"VANILLA_UNTOUCHED").unwrap();
        std::fs::write(&target_bak, b"VANILLA_BAK").unwrap();

        let wal_path = vault_dir.join(".sanctuary_routed_links.jsonl");
        let vault_str = vault_dir.to_string_lossy().to_string();

        // Pass 1: route across two separate roots preserving target_bak vanilla file
        let mut plan1 = DeploymentPlan::default();
        assert!(plan1.record_route(src_a.clone(), target_a.clone(), false, false, false, true));
        assert!(plan1.record_route(src_bak.clone(), target_bak.clone(), true, false, false, true));
        assert!(plan1.record_route(src_b_v1.clone(), target_b.clone(), false, true, true, true));

        let recs1 = reconcile_routed_deployment(&vault_str, &plan1, Some(&wal_path));
        assert_eq!(recs1.len(), 3);
        assert!(wal_path.exists());
        assert_eq!(std::fs::read(&target_a).unwrap(), b"ROUTE_A_PAYLOAD");
        assert_eq!(std::fs::read(&target_bak).unwrap(), b"MODDED_CFG");
        assert_eq!(std::fs::read(&target_b).unwrap(), b"ROUTE_B_V1");
        assert_eq!(
            std::fs::read(format!("{}.sanctuary_vanilla_bak", target_bak.to_string_lossy())).unwrap(),
            b"VANILLA_BAK"
        );
        assert!(existing_link_matches_source(&src_a, &target_a, false, false, false));

        // Pass 2: drop route_bak (should restore vanilla), update route_b to v2, keep route_a
        let mut plan2 = DeploymentPlan::default();
        assert!(plan2.record_route(src_a.clone(), target_a.clone(), false, false, false, true));
        assert!(plan2.record_route(src_b_v2.clone(), target_b.clone(), false, true, true, true));

        let recs2 = reconcile_routed_deployment(&vault_str, &plan2, Some(&wal_path));
        assert_eq!(recs2.len(), 2);
        assert!(existing_link_matches_source(&src_a, &target_a, false, false, false));
        assert_eq!(std::fs::read(&target_b).unwrap(), b"ROUTE_B_V2");
        assert_eq!(std::fs::read(&target_bak).unwrap(), b"VANILLA_BAK");
        assert_eq!(std::fs::read(&vanilla_untouched).unwrap(), b"VANILLA_UNTOUCHED");

        let _ = crate::utils::remove_dir_all_clearing_readonly(&base);
    }
}
