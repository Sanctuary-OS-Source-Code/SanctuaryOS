use crate::state::*;
use crate::utils::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;
use super::scanner::TempStagingGuard;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FomodFileMapping {
    pub source: String,
    pub destination: String,
    pub is_folder: bool,
    pub priority: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FomodConditionNode {
    Composite {
        operator: String,
        children: Vec<FomodConditionNode>,
    },
    FlagDependency {
        flag: String,
        value: String,
    },
    FileDependency {
        file: String,
        state: String,
        resolved_state: String,
    },
    VersionDependency {
        target: String,
        required_version: String,
        detected_version: String,
        satisfied: bool,
    },
}

fn default_true_bool() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FomodConditionalTypePattern {
    pub condition: FomodConditionNode,
    pub plugin_type: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FomodPluginOption {
    pub id: String,
    pub name: String,
    pub description: String,
    pub image_data_url: Option<String>,
    pub default_type: String,
    pub dependency_patterns: Vec<FomodConditionalTypePattern>,
    pub condition_flags: Vec<(String, String)>,
    pub files: Vec<FomodFileMapping>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FomodOptionGroup {
    pub id: String,
    pub name: String,
    pub group_type: String,
    pub options: Vec<FomodPluginOption>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FomodInstallStep {
    pub id: String,
    pub name: String,
    pub visible: Option<FomodConditionNode>,
    pub groups: Vec<FomodOptionGroup>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FomodConditionalInstallPattern {
    pub condition: FomodConditionNode,
    pub files: Vec<FomodFileMapping>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstallerWizardPlan {
    pub session_id: String,
    pub wizard_kind: String,
    pub mod_name: String,
    pub author: String,
    pub version: String,
    pub description: String,
    pub module_image_data_url: Option<String>,
    pub suggested_target_folder: String,
    #[serde(default)]
    pub content_root_rel: String,
    #[serde(default = "default_true_bool")]
    pub module_dependencies_satisfied: bool,
    #[serde(default)]
    pub saved_selections: Vec<String>,
    pub required_files: Vec<FomodFileMapping>,
    pub steps: Vec<FomodInstallStep>,
    pub conditional_file_installs: Vec<FomodConditionalInstallPattern>,
}

pub(crate) fn read_saved_fomod_choices_doc(
    mod_dir: &Path,
) -> Option<serde_json::Value> {
    let candidate = mod_dir.join(".sanctuary_fomod_choices.json");
    let raw = fs::read_to_string(&candidate).ok()?;
    serde_json::from_str::<serde_json::Value>(&raw).ok()
}

pub(crate) fn read_saved_fomod_choices(mod_dir: &Path) -> Vec<String> {
    read_saved_fomod_choices_doc(mod_dir)
        .and_then(|val| {
            val.get("selected_option_ids")
                .and_then(|arr| arr.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|v| {
                            v.as_str()
                                .map(str::trim)
                                .filter(|s| !s.is_empty())
                                .map(str::to_string)
                        })
                        .collect()
                })
        })
        .unwrap_or_default()
}

pub(crate) fn load_saved_fomod_choices(vault_mods_lane: &Path, folder_rel: &str) -> Vec<String> {
    let trimmed = folder_rel.trim().trim_matches('/').trim_matches('\\');
    if trimmed.is_empty() {
        return Vec::new();
    }
    read_saved_fomod_choices(&vault_mods_lane.join(trimmed))
}

pub(crate) struct PendingInstallerSession {
    pub created_at_epoch: u64,
    pub stage_dir: PathBuf,
    pub source_path: PathBuf,
    pub should_move_original: bool,
    pub vault_path: String,
    pub zip_stem: String,
    pub sanctuary_manifest_json: Option<String>,
    pub sanctuary_override_json: Option<String>,
    pub extracted_hashes: Vec<String>,
    pub plan: InstallerWizardPlan,
}

static PENDING_INSTALLER_SESSIONS: OnceLock<Mutex<HashMap<String, PendingInstallerSession>>> =
    OnceLock::new();

fn session_store() -> &'static Mutex<HashMap<String, PendingInstallerSession>> {
    PENDING_INSTALLER_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn prune_stale_sessions_locked(map: &mut HashMap<String, PendingInstallerSession>, now: u64) {
    let expired: Vec<String> = map
        .iter()
        .filter(|(_, s)| now.saturating_sub(s.created_at_epoch) > 1800)
        .map(|(k, _)| k.clone())
        .collect();
    for id in expired {
        if let Some(sess) = map.remove(&id) {
            if sess.stage_dir.exists() {
                let _ = fs::remove_dir_all(&sess.stage_dir);
            }
        }
    }
}

/// Decodes FOMOD XML bytes supporting UTF-16LE/BE BOM, UTF-8 BOM, heuristic null-byte UTF-16LE,
/// and Windows-1252/Latin-1 single-byte fallback without throwing UTF-8 errors.
pub fn decode_xml_bytes_lossless(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let words: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&words);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let words: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&words);
    }
    let slice = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        bytes
    };
    if slice.len() >= 8 && slice.len() % 2 == 0 && slice[1] == 0 && slice[3] == 0 {
        let words: Vec<u16> = slice
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&words);
    }
    if let Ok(s) = std::str::from_utf8(slice) {
        return s.to_string();
    }
    slice.iter().map(|&b| b as char).collect()
}

fn find_child_ci<'a, 'input>(
    node: roxmltree::Node<'a, 'input>,
    tag: &str,
) -> Option<roxmltree::Node<'a, 'input>> {
    node.children()
        .find(|n| n.is_element() && n.tag_name().name().eq_ignore_ascii_case(tag))
}

fn children_ci<'a, 'input>(
    node: roxmltree::Node<'a, 'input>,
    tag: &str,
) -> Vec<roxmltree::Node<'a, 'input>> {
    node.children()
        .filter(|n| n.is_element() && n.tag_name().name().eq_ignore_ascii_case(tag))
        .collect()
}

fn attr_ci(node: roxmltree::Node<'_, '_>, name: &str) -> Option<String> {
    node.attributes()
        .find(|a| a.name().eq_ignore_ascii_case(name))
        .map(|a| a.value().to_string())
}

fn parse_files_block(node: roxmltree::Node<'_, '_>) -> Vec<FomodFileMapping> {
    let mut out = Vec::new();
    for child in node.children().filter(|n| n.is_element()) {
        let tag = child.tag_name().name().to_ascii_lowercase();
        if tag == "file" || tag == "folder" {
            let source = attr_ci(child, "source").unwrap_or_default().trim().to_string();
            if source.is_empty() {
                continue;
            }
            let destination = attr_ci(child, "destination")
                .unwrap_or_else(|| source.clone())
                .trim()
                .to_string();
            let priority = attr_ci(child, "priority")
                .and_then(|v| v.trim().parse::<i32>().ok())
                .unwrap_or(0);
            out.push(FomodFileMapping {
                source,
                destination,
                is_folder: tag == "folder",
                priority,
            });
        }
    }
    out
}

fn resolve_file_dependency_state(
    rel_file: &str,
    mods_dir: Option<&Path>,
    live_root: Option<&Path>,
    vault_mods_lane: &Path,
) -> String {
    let clean = rel_file.trim().trim_matches(&['/', '\\'][..]).replace('\\', "/");
    if clean.is_empty() {
        return "Missing".to_string();
    }
    for active_root in [mods_dir, live_root].into_iter().flatten() {
        if active_root.as_os_str().is_empty() {
            continue;
        }
        let exact = resolve_case_insensitive_path(active_root, &clean);
        if exact.exists() {
            return "Active".to_string();
        }
        if let Some(leaf) = Path::new(&clean).file_name().and_then(|n| n.to_str()) {
            let at_root = resolve_case_insensitive_path(active_root, leaf);
            if at_root.exists() {
                return "Active".to_string();
            }
        }
    }
    let staged_exact = resolve_case_insensitive_path(vault_mods_lane, &clean);
    if staged_exact.exists() {
        return "Inactive".to_string();
    }
    if let Ok(entries) = fs::read_dir(vault_mods_lane) {
        for ent in entries.flatten() {
            let ep = ent.path();
            if ep.is_dir() && resolve_case_insensitive_path(&ep, &clean).exists() {
                return "Inactive".to_string();
            }
        }
    }
    "Missing".to_string()
}

fn compare_fomod_versions(detected: &str, required: &str) -> Option<std::cmp::Ordering> {
    let parse_parts = |raw: &str| -> Vec<u64> {
        raw.trim()
            .trim_start_matches(|c: char| c == 'v' || c == 'V')
            .split(|c: char| !c.is_ascii_digit())
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse::<u64>().ok())
            .collect()
    };
    let mut a = parse_parts(detected);
    let mut b = parse_parts(required);
    if a.is_empty() || b.is_empty() {
        return None;
    }
    let len = a.len().max(b.len());
    a.resize(len, 0);
    b.resize(len, 0);
    Some(a.cmp(&b))
}

fn parse_condition_node(
    node: roxmltree::Node<'_, '_>,
    mods_dir: Option<&Path>,
    live_root: Option<&Path>,
    vault_mods_lane: &Path,
    detected_game_version: Option<&str>,
) -> Option<FomodConditionNode> {
    let tag = node.tag_name().name().to_ascii_lowercase();
    match tag.as_str() {
        "flagdependency" => {
            let flag = attr_ci(node, "flag").unwrap_or_default().trim().to_string();
            let value = attr_ci(node, "value").unwrap_or_default().trim().to_string();
            Some(FomodConditionNode::FlagDependency { flag, value })
        }
        "filedependency" => {
            let file = attr_ci(node, "file").unwrap_or_default().trim().to_string();
            let state = attr_ci(node, "state")
                .unwrap_or_else(|| "Active".to_string())
                .trim()
                .to_string();
            let resolved_state =
                resolve_file_dependency_state(&file, mods_dir, live_root, vault_mods_lane);
            Some(FomodConditionNode::FileDependency {
                file,
                state,
                resolved_state,
            })
        }
        "gamedependency" => {
            let req = attr_ci(node, "version").unwrap_or_default().trim().to_string();
            let det = detected_game_version.unwrap_or("").trim().to_string();
            let satisfied = if req.is_empty() {
                true
            } else {
                compare_fomod_versions(&det, &req)
                    .map_or(false, |ord| ord != std::cmp::Ordering::Less)
            };
            Some(FomodConditionNode::VersionDependency {
                target: "game".to_string(),
                required_version: req,
                detected_version: det,
                satisfied,
            })
        }
        "fommdependency" | "modmanagerdependency" | "sanctuarydependency" => {
            let req = attr_ci(node, "version").unwrap_or_default().trim().to_string();
            let det = env!("CARGO_PKG_VERSION").to_string();
            let satisfied = if req.is_empty() {
                true
            } else {
                compare_fomod_versions(&det, &req)
                    .map_or(false, |ord| ord != std::cmp::Ordering::Less)
            };
            Some(FomodConditionNode::VersionDependency {
                target: "mod_manager".to_string(),
                required_version: req,
                detected_version: det,
                satisfied,
            })
        }
        "dependencies" | "visible" | "moduledependencies" => {
            let operator = attr_ci(node, "operator")
                .unwrap_or_else(|| "And".to_string())
                .trim()
                .to_string();
            let mut children = Vec::new();
            for ch in node.children().filter(|n| n.is_element()) {
                if let Some(parsed) = parse_condition_node(
                    ch,
                    mods_dir,
                    live_root,
                    vault_mods_lane,
                    detected_game_version,
                ) {
                    children.push(parsed);
                }
            }
            if children.is_empty() {
                None
            } else {
                Some(FomodConditionNode::Composite { operator, children })
            }
        }
        _ => None,
    }
}

fn encode_bounded_fomod_image(
    stage_dir: &Path,
    content_root: &Path,
    raw_rel: &str,
) -> Option<String> {
    let clean = raw_rel.trim().trim_matches(&['/', '\\'][..]).replace('\\', "/");
    if clean.is_empty() || clean.contains("..") {
        return None;
    }
    let mut candidate = resolve_case_insensitive_path(content_root, &clean);
    if !candidate.is_file() && content_root != stage_dir {
        candidate = resolve_case_insensitive_path(stage_dir, &clean);
    }
    if ensure_strict_descendant_of_roots(&candidate, &[stage_dir.to_path_buf()]).is_err()
        || !candidate.is_file()
    {
        return None;
    }
    let meta = fs::metadata(&candidate).ok()?;
    if meta.len() == 0 || meta.len() > 4 * 1024 * 1024 {
        return None;
    }
    let bytes = fs::read(&candidate).ok()?;
    let mime = match candidate
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        _ => return None,
    };
    const B64: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity(((bytes.len() + 2) / 3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        encoded.push(B64[(n >> 18) & 63] as char);
        encoded.push(B64[(n >> 12) & 63] as char);
        encoded.push(if chunk.len() > 1 { B64[(n >> 6) & 63] as char } else { '=' });
        encoded.push(if chunk.len() > 2 { B64[n & 63] as char } else { '=' });
    }
    Some(format!("data:{};base64,{}", mime, encoded))
}

fn find_file_in_dir_ci(dir: &Path, target_name: &str) -> Option<PathBuf> {
    if !dir.is_dir() {
        return None;
    }
    let p = resolve_case_insensitive_path(dir, target_name);
    if p.is_file() { Some(p) } else { None }
}

fn is_bain_subpackage_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    let mut digits = 0usize;
    while digits < bytes.len() && digits < 4 && bytes[digits].is_ascii_digit() {
        digits += 1;
    }
    if !(2..=3).contains(&digits) || digits >= bytes.len() {
        return false;
    }
    let sep = bytes[digits];
    if !matches!(sep, b' ' | b'_' | b'-' | b'.') {
        return false;
    }
    !name[digits + 1..].trim().is_empty()
}

fn locate_fomod_root(stage_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    let root_fomod = resolve_case_insensitive_path(stage_dir, "fomod");
    if find_file_in_dir_ci(&root_fomod, "ModuleConfig.xml").is_some() {
        return Some((stage_dir.to_path_buf(), root_fomod));
    }
    let mut matches: Vec<(usize, PathBuf, PathBuf)> = Vec::new();
    for entry in walkdir::WalkDir::new(stage_dir)
        .min_depth(1)
        .max_depth(3)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let n = e.file_name().to_string_lossy().to_ascii_lowercase();
            n != "__macosx" && !n.starts_with('.')
        })
        .filter_map(Result::ok)
    {
        if entry.file_type().is_dir()
            && entry.file_name().to_string_lossy().eq_ignore_ascii_case("fomod")
        {
            let fdir = entry.path().to_path_buf();
            if find_file_in_dir_ci(&fdir, "ModuleConfig.xml").is_some() {
                if let Some(parent) = fdir.parent() {
                    matches.push((entry.depth(), parent.to_path_buf(), fdir));
                }
            }
        }
    }
    matches.sort_by_key(|m| m.0);
    matches.into_iter().next().map(|(_, p, f)| (p, f))
}

fn locate_bain_content_root(stage_dir: &Path) -> PathBuf {
    let mut top_dirs = Vec::new();
    if let Ok(rd) = fs::read_dir(stage_dir) {
        for ent in rd.flatten() {
            let name = ent.file_name().to_string_lossy().to_string();
            let low = name.to_ascii_lowercase();
            if low.starts_with('.') || low == "__macosx" {
                continue;
            }
            if ent.path().is_dir() {
                if is_bain_subpackage_name(&name) {
                    return stage_dir.to_path_buf();
                }
                top_dirs.push(ent.path());
            } else if ent.path().is_file() {
                return stage_dir.to_path_buf();
            }
        }
    }
    if top_dirs.len() == 1 {
        let candidate = &top_dirs[0];
        let mut sub_bain = 0usize;
        if let Ok(rd) = fs::read_dir(candidate) {
            for ent in rd.flatten() {
                if ent.path().is_dir()
                    && is_bain_subpackage_name(&ent.file_name().to_string_lossy())
                {
                    sub_bain += 1;
                }
            }
        }
        if sub_bain >= 2 {
            return candidate.clone();
        }
    }
    stage_dir.to_path_buf()
}

pub fn parse_fomod_or_bain_plan(
    stage_dir: &Path,
    zip_stem: &str,
    mods_dir: Option<&Path>,
    live_root: Option<&Path>,
    vault_mods_lane: &Path,
    detected_game_version: Option<&str>,
) -> Result<Option<InstallerWizardPlan>, String> {
    if let Some((content_root, fomod_dir)) = locate_fomod_root(stage_dir) {
        if let Some(module_cfg_path) = find_file_in_dir_ci(&fomod_dir, "ModuleConfig.xml") {
            let content_root_rel = content_root
                .strip_prefix(stage_dir)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            let raw_bytes = fs::read(&module_cfg_path)
                .map_err(|e| format!("Failed reading ModuleConfig.xml: {}", e))?;
            let xml_text = decode_xml_bytes_lossless(&raw_bytes);
            let doc = roxmltree::Document::parse(&xml_text)
                .map_err(|e| format!("Invalid FOMOD ModuleConfig.xml: {}", e))?;
            let root = doc.root_element();

            let mut mod_name = find_child_ci(root, "moduleName")
                .and_then(|n| n.text())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| zip_stem.to_string());
            let mut author = String::new();
            let mut version = String::new();
            let mut description = String::new();

            if let Some(info_path) = find_file_in_dir_ci(&fomod_dir, "info.xml") {
                if let Ok(info_bytes) = fs::read(&info_path) {
                    let info_xml = decode_xml_bytes_lossless(&info_bytes);
                    if let Ok(info_doc) = roxmltree::Document::parse(&info_xml) {
                        let info_root = info_doc.root_element();
                        if let Some(n) = find_child_ci(info_root, "Name").and_then(|x| x.text()) {
                            if !n.trim().is_empty() {
                                mod_name = n.trim().to_string();
                            }
                        }
                        if let Some(a) = find_child_ci(info_root, "Author").and_then(|x| x.text()) {
                            author = a.trim().to_string();
                        }
                        if let Some(v) = find_child_ci(info_root, "Version").and_then(|x| x.text()) {
                            version = v.trim().to_string();
                        }
                        if let Some(d) = find_child_ci(info_root, "Description").and_then(|x| x.text()) {
                            description = d.trim().to_string();
                        }
                    }
                }
            }

            let empty_flags = HashMap::new();
            let module_dependencies_satisfied = find_child_ci(root, "moduleDependencies")
                .and_then(|md| {
                    parse_condition_node(
                        md,
                        mods_dir,
                        live_root,
                        vault_mods_lane,
                        detected_game_version,
                    )
                })
                .map_or(true, |cond| evaluate_fomod_condition(&cond, &empty_flags));

            let module_image_data_url = find_child_ci(root, "moduleImage")
                .and_then(|n| attr_ci(n, "path"))
                .and_then(|rel| encode_bounded_fomod_image(stage_dir, &content_root, &rel));

            let required_files = find_child_ci(root, "requiredInstallFiles")
                .map(parse_files_block)
                .unwrap_or_default();

            let mut steps = Vec::new();
            if let Some(steps_node) = find_child_ci(root, "installSteps") {
                for (s_idx, step_node) in children_ci(steps_node, "installStep").into_iter().enumerate() {
                    let step_name = attr_ci(step_node, "name")
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or_else(|| format!("Step {}", s_idx + 1));
                    let visible = find_child_ci(step_node, "visible").and_then(|v| {
                        parse_condition_node(
                            v,
                            mods_dir,
                            live_root,
                            vault_mods_lane,
                            detected_game_version,
                        )
                    });

                    let mut groups = Vec::new();
                    if let Some(groups_node) = find_child_ci(step_node, "optionalFileGroups") {
                        for (g_idx, grp_node) in
                            children_ci(groups_node, "group").into_iter().enumerate()
                        {
                            let grp_name = attr_ci(grp_node, "name")
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or_else(|| format!("Group {}", g_idx + 1));
                            let group_type = attr_ci(grp_node, "type")
                                .filter(|s| !s.trim().is_empty())
                                .unwrap_or_else(|| "SelectAny".to_string());

                            let mut options = Vec::new();
                            if let Some(plugins_node) = find_child_ci(grp_node, "plugins") {
                                for (o_idx, plug_node) in
                                    children_ci(plugins_node, "plugin").into_iter().enumerate()
                                {
                                    let opt_id = format!("s{}_g{}_o{}", s_idx, g_idx, o_idx);
                                    let opt_name = attr_ci(plug_node, "name")
                                        .filter(|s| !s.trim().is_empty())
                                        .unwrap_or_else(|| format!("Option {}", o_idx + 1));
                                    let opt_desc = find_child_ci(plug_node, "description")
                                        .and_then(|n| n.text())
                                        .unwrap_or("")
                                        .trim()
                                        .to_string();
                                    let image_data_url = find_child_ci(plug_node, "image")
                                        .and_then(|n| attr_ci(n, "path"))
                                        .and_then(|rel| {
                                            encode_bounded_fomod_image(stage_dir, &content_root, &rel)
                                        });

                                    let files = find_child_ci(plug_node, "files")
                                        .map(parse_files_block)
                                        .unwrap_or_default();

                                    let mut condition_flags = Vec::new();
                                    if let Some(flags_node) = find_child_ci(plug_node, "conditionFlags")
                                    {
                                        for fn_node in children_ci(flags_node, "flag") {
                                            let fk = attr_ci(fn_node, "name")
                                                .unwrap_or_default()
                                                .trim()
                                                .to_string();
                                            let fv = fn_node.text().unwrap_or("").trim().to_string();
                                            if !fk.is_empty() {
                                                condition_flags.push((fk, fv));
                                            }
                                        }
                                    }

                                    let mut default_type = "Optional".to_string();
                                    let mut dependency_patterns = Vec::new();
                                    if let Some(td) = find_child_ci(plug_node, "typeDescriptor") {
                                        if let Some(tn) =
                                            find_child_ci(td, "type").and_then(|n| attr_ci(n, "name"))
                                        {
                                            default_type = tn;
                                        } else if let Some(dt) = find_child_ci(td, "dependencyType") {
                                            if let Some(dt_def) = find_child_ci(dt, "defaultType")
                                                .and_then(|n| attr_ci(n, "name"))
                                            {
                                                default_type = dt_def;
                                            }
                                            if let Some(pat_list) = find_child_ci(dt, "patterns") {
                                                for pat_node in children_ci(pat_list, "pattern") {
                                                    let cond = find_child_ci(pat_node, "dependencies")
                                                        .and_then(|d| {
                                                            parse_condition_node(
                                                                d,
                                                                mods_dir,
                                                                live_root,
                                                                vault_mods_lane,
                                                                detected_game_version,
                                                            )
                                                        });
                                                    let ptype = find_child_ci(pat_node, "type")
                                                        .and_then(|n| attr_ci(n, "name"));
                                                    if let (Some(condition), Some(plugin_type)) =
                                                        (cond, ptype)
                                                    {
                                                        dependency_patterns.push(
                                                            FomodConditionalTypePattern {
                                                                condition,
                                                                plugin_type,
                                                            },
                                                        );
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    options.push(FomodPluginOption {
                                        id: opt_id,
                                        name: opt_name,
                                        description: opt_desc,
                                        image_data_url,
                                        default_type,
                                        dependency_patterns,
                                        condition_flags,
                                        files,
                                    });
                                }
                            }

                            if !options.is_empty() {
                                groups.push(FomodOptionGroup {
                                    id: format!("s{}_g{}", s_idx, g_idx),
                                    name: grp_name,
                                    group_type,
                                    options,
                                });
                            }
                        }
                    }

                    steps.push(FomodInstallStep {
                        id: format!("s{}", s_idx),
                        name: step_name,
                        visible,
                        groups,
                    });
                }
            }

            let mut conditional_file_installs = Vec::new();
            if let Some(cond_root) = find_child_ci(root, "conditionalFileInstalls") {
                if let Some(pat_list) = find_child_ci(cond_root, "patterns") {
                    for pat_node in children_ci(pat_list, "pattern") {
                        let cond = find_child_ci(pat_node, "dependencies").and_then(|d| {
                            parse_condition_node(
                                d,
                                mods_dir,
                                live_root,
                                vault_mods_lane,
                                detected_game_version,
                            )
                        });
                        let files = find_child_ci(pat_node, "files")
                            .map(parse_files_block)
                            .unwrap_or_default();
                        if let Some(condition) = cond {
                            if !files.is_empty() {
                                conditional_file_installs.push(FomodConditionalInstallPattern {
                                    condition,
                                    files,
                                });
                            }
                        }
                    }
                }
            }

            if !steps.is_empty() || !conditional_file_installs.is_empty() || !required_files.is_empty()
            {
                let saved_selections = load_saved_fomod_choices(vault_mods_lane, zip_stem);
                return Ok(Some(InstallerWizardPlan {
                    session_id: uuid::Uuid::new_v4().to_string(),
                    wizard_kind: "fomod".to_string(),
                    mod_name,
                    author,
                    version,
                    description,
                    module_image_data_url,
                    suggested_target_folder: zip_stem.to_string(),
                    content_root_rel,
                    module_dependencies_satisfied,
                    saved_selections,
                    required_files,
                    steps,
                    conditional_file_installs,
                }));
            }
        }
    }

    // BAIN subpackage fallback: >= 2 top-level numbered dirs (e.g., `00 Core`, `01 Option`)
    let bain_root = locate_bain_content_root(stage_dir);
    let content_root_rel = bain_root
        .strip_prefix(stage_dir)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    let mut bain_dirs: Vec<String> = Vec::new();
    let mut non_bain_files: Vec<FomodFileMapping> = Vec::new();
    if let Ok(entries) = fs::read_dir(&bain_root) {
        for ent in entries.flatten() {
            let p = ent.path();
            let name = ent.file_name().to_string_lossy().to_string();
            let lower = name.to_ascii_lowercase();
            if lower.starts_with('.') || lower == "__macosx" || lower == "fomod" {
                continue;
            }
            if p.is_dir() && is_bain_subpackage_name(&name) {
                bain_dirs.push(name);
            } else if p.is_file() {
                non_bain_files.push(FomodFileMapping {
                    source: name.clone(),
                    destination: name,
                    is_folder: false,
                    priority: 0,
                });
            }
        }
    }

    if bain_dirs.len() >= 2 {
        bain_dirs.sort_by_key(|a| a.to_ascii_lowercase());
        let options: Vec<FomodPluginOption> = bain_dirs
            .into_iter()
            .enumerate()
            .map(|(idx, dir_name)| {
                let low = dir_name.to_ascii_lowercase();
                let is_core = low.starts_with("00")
                    || low.contains("core")
                    || low.contains("main")
                    || low.contains("required")
                    || low.contains("essential");
                FomodPluginOption {
                    id: format!("bain_{}", idx),
                    name: dir_name.clone(),
                    description: String::new(),
                    image_data_url: None,
                    default_type: if is_core {
                        "Recommended".to_string()
                    } else {
                        "Optional".to_string()
                    },
                    dependency_patterns: Vec::new(),
                    condition_flags: Vec::new(),
                    files: vec![FomodFileMapping {
                        source: dir_name,
                        destination: String::new(),
                        is_folder: true,
                        priority: idx as i32,
                    }],
                }
            })
            .collect();

        let saved_selections = load_saved_fomod_choices(vault_mods_lane, zip_stem);
        return Ok(Some(InstallerWizardPlan {
            session_id: uuid::Uuid::new_v4().to_string(),
            wizard_kind: "bain".to_string(),
            mod_name: zip_stem.to_string(),
            author: String::new(),
            version: String::new(),
            description: String::new(),
            module_image_data_url: None,
            suggested_target_folder: zip_stem.to_string(),
            content_root_rel,
            module_dependencies_satisfied: true,
            saved_selections,
            required_files: non_bain_files,
            steps: vec![FomodInstallStep {
                id: "bain_s0".to_string(),
                name: zip_stem.to_string(),
                visible: None,
                groups: vec![FomodOptionGroup {
                    id: "bain_g0".to_string(),
                    name: zip_stem.to_string(),
                    group_type: "SelectAny".to_string(),
                    options,
                }],
            }],
            conditional_file_installs: Vec::new(),
        }));
    }

    Ok(None)
}

pub(crate) fn evaluate_fomod_condition(
    node: &FomodConditionNode,
    flags: &HashMap<String, String>,
) -> bool {
    match node {
        FomodConditionNode::FlagDependency { flag, value } => {
            flags.get(flag).map_or(false, |v| v == value)
        }
        FomodConditionNode::FileDependency {
            state,
            resolved_state,
            ..
        } => state.eq_ignore_ascii_case(resolved_state),
        FomodConditionNode::VersionDependency { satisfied, .. } => *satisfied,
        FomodConditionNode::Composite { operator, children } => {
            if operator.eq_ignore_ascii_case("or") {
                children.iter().any(|c| evaluate_fomod_condition(c, flags))
            } else {
                children.iter().all(|c| evaluate_fomod_condition(c, flags))
            }
        }
    }
}

pub(crate) fn collect_wizard_mappings(
    plan: &InstallerWizardPlan,
    selected_ids: &HashSet<String>,
) -> Vec<FomodFileMapping> {
    let mut flags: HashMap<String, String> = HashMap::new();
    let mut indexed: Vec<(usize, FomodFileMapping)> = Vec::new();
    let mut seq = 0usize;

    for m in &plan.required_files {
        indexed.push((seq, m.clone()));
        seq += 1;
    }

    for step in &plan.steps {
        if let Some(ref vis) = step.visible {
            if !evaluate_fomod_condition(vis, &flags) {
                continue;
            }
        }
        for grp in &step.groups {
            for opt in &grp.options {
                if selected_ids.contains(&opt.id) {
                    for (fk, fv) in &opt.condition_flags {
                        flags.insert(fk.clone(), fv.clone());
                    }
                    for m in &opt.files {
                        indexed.push((seq, m.clone()));
                        seq += 1;
                    }
                }
            }
        }
    }

    for pat in &plan.conditional_file_installs {
        if evaluate_fomod_condition(&pat.condition, &flags) {
            for m in &pat.files {
                indexed.push((seq, m.clone()));
                seq += 1;
            }
        }
    }

    indexed.sort_by(|(idx_a, a), (idx_b, b)| a.priority.cmp(&b.priority).then_with(|| idx_a.cmp(idx_b)));
    indexed.into_iter().map(|(_, m)| m).collect()
}

pub(crate) fn register_pending_wizard_session(session: PendingInstallerSession) -> InstallerWizardPlan {
    let plan = session.plan.clone();
    let now = now_secs();
    if let Ok(mut guard) = session_store().lock() {
        prune_stale_sessions_locked(&mut guard, now);
        guard.insert(plan.session_id.clone(), session);
    }
    plan
}

fn clean_rel_subpath(raw: &str) -> Result<PathBuf, String> {
    let norm = raw.trim().replace('\\', "/");
    let trimmed = norm.trim_matches('/');
    if trimmed.is_empty() {
        return Ok(PathBuf::new());
    }
    validate_archive_entry_path(trimmed)
}

#[tauri::command]
pub async fn cancel_installer_wizard_session(session_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let sess_opt = session_store()
            .lock()
            .ok()
            .and_then(|mut g| g.remove(session_id.trim()));
        if let Some(sess) = sess_opt {
            if sess.stage_dir.exists() {
                let _ = fs::remove_dir_all(&sess.stage_dir);
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn sanitize_installer_cache_stem(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() {
        "installer_archive".to_string()
    } else {
        trimmed.to_string()
    }
}

fn cache_installer_archive_for_reconfigure(
    vault_root: &Path,
    source_path: &Path,
    folder_rel: &str,
) -> Option<String> {
    if !source_path.is_file() {
        return None;
    }
    let ext = source_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    if !matches!(ext.as_str(), "zip" | "7z" | "rar") {
        return None;
    }
    let installers_dir = vault_root.join("Backups").join("Installers");
    if let Ok(canon_installers) = installers_dir.canonicalize() {
        if let Ok(canon_src) = source_path.canonicalize() {
            if path_is_within_root(&canon_src, &canon_installers) {
                let canon_vault = vault_root
                    .canonicalize()
                    .unwrap_or_else(|_| vault_root.to_path_buf());
                return canon_src
                    .strip_prefix(&canon_vault)
                    .ok()
                    .map(|p| p.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    if fs::create_dir_all(&installers_dir).is_err() {
        return None;
    }
    let stem = sanitize_installer_cache_stem(folder_rel);
    let dest = installers_dir.join(format!("{}.{}", stem, ext));
    if ensure_strict_descendant_of_roots(&dest, &[installers_dir]).is_err() {
        return None;
    }
    if dest.exists() {
        let _ = remove_file_clearing_readonly(&dest);
    }
    let placed = fs::hard_link(source_path, &dest).is_ok() || fs::copy(source_path, &dest).is_ok();
    if placed {
        Some(format!("Backups/Installers/{}.{}", stem, ext))
    } else {
        None
    }
}

fn remove_prior_fomod_installed_files(target_base: &Path) {
    let Some(doc) = read_saved_fomod_choices_doc(target_base) else {
        return;
    };
    let Some(arr) = doc.get("installed_files").and_then(|v| v.as_array()) else {
        return;
    };
    let Ok(canon_base) = target_base.canonicalize() else {
        return;
    };
    for rel_val in arr {
        let Some(rel_str) = rel_val.as_str() else {
            continue;
        };
        let Ok(rel_path) = clean_rel_subpath(rel_str) else {
            continue;
        };
        if rel_path.as_os_str().is_empty() {
            continue;
        }
        let full = canon_base.join(&rel_path);
        if !full.is_file() {
            continue;
        }
        if ensure_strict_descendant_of_roots(&full, std::slice::from_ref(&canon_base)).is_ok() {
            let _ = remove_file_clearing_readonly(&full);
            let mut cur = full.parent().map(|p| p.to_path_buf());
            while let Some(dir) = cur {
                if dir == canon_base {
                    break;
                }
                if fs::remove_dir(&dir).is_err() {
                    break;
                }
                cur = dir.parent().map(|p| p.to_path_buf());
            }
        }
    }
}

pub(crate) fn commit_installer_session_sync(
    app: &tauri::AppHandle,
    game_schema: &Option<crate::schema::GameSchema>,
    sess: PendingInstallerSession,
    selected_option_ids: Vec<String>,
    target_folder: Option<String>,
) -> Result<Vec<String>, String> {
    let _stage_guard = TempStagingGuard(sess.stage_dir.clone());

    let vault_root = get_vault_root_dir(&sess.vault_path);
    let vault_mods_lane = get_vault_mods_lane(&sess.vault_path);
    fs::create_dir_all(&vault_mods_lane).map_err(|e| e.to_string())?;

    let chosen_folder = target_folder
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&sess.zip_stem);
    let rel_folder = clean_rel_subpath(chosen_folder)?;
    if rel_folder.as_os_str().is_empty() {
        return Err("Blocked: invalid target_folder.".to_string());
    }
    let rel_folder_str = rel_folder.to_string_lossy().replace('\\', "/");
    let target_base = vault_mods_lane.join(&rel_folder);
    ensure_strict_descendant_of_roots(&target_base, std::slice::from_ref(&vault_mods_lane))?;
    fs::create_dir_all(&target_base).map_err(|e| e.to_string())?;

    let prior_archive_rel = read_saved_fomod_choices_doc(&target_base)
        .and_then(|d| {
            d.get("installer_archive_rel")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        });
    remove_prior_fomod_installed_files(&target_base);

    let cached_archive_rel = cache_installer_archive_for_reconfigure(
        &vault_root,
        &sess.source_path,
        &rel_folder_str,
    )
    .or(prior_archive_rel);

    let selected_set: HashSet<String> = selected_option_ids.into_iter().collect();
    let mappings = collect_wizard_mappings(&sess.plan, &selected_set);

    let supported = crate::game_logic::get_supported_extensions(game_schema);
    let twin_exts: Vec<String> = game_schema
        .as_ref()
        .and_then(|s| s.extensions.twin_extensions.as_ref())
        .map(|groups| {
            groups
                .iter()
                .flat_map(|g| g.iter())
                .map(|e| e.trim_start_matches('.').to_lowercase())
                .filter(|e| !e.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let stage_roots = [sess.stage_dir.clone()];
    let vault_roots = [vault_mods_lane.clone()];
    let content_root = if sess.plan.content_root_rel.trim().is_empty() {
        sess.stage_dir.clone()
    } else {
        let sub = clean_rel_subpath(&sess.plan.content_root_rel)?;
        let joined = sess.stage_dir.join(sub);
        ensure_path_within_roots(&joined, &stage_roots)?;
        joined
    };
    let mut installed_files: Vec<String> = Vec::new();
    let mut installed_hashes: Vec<String> = Vec::new();

    for mapping in mappings {
        let src_rel = clean_rel_subpath(&mapping.source)?;
        if src_rel.as_os_str().is_empty() {
            continue;
        }
        let src_abs = resolve_case_insensitive_path(
            &content_root,
            &src_rel.to_string_lossy().replace('\\', "/"),
        );
        if !src_abs.exists() || ensure_path_within_roots(&src_abs, &stage_roots).is_err() {
            continue;
        }

        let raw_dest_rel = clean_rel_subpath(&mapping.destination)?;
        let dest_base_rel =
            crate::game_logic::strip_relative_root_anchors(&raw_dest_rel, game_schema);

        if src_abs.is_dir() {
            for ent in walkdir::WalkDir::new(&src_abs)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if !ent.file_type().is_file() {
                    continue;
                }
                let fp = ent.path();
                if is_macos_or_os_metadata_path(fp) {
                    continue;
                }
                let Ok(sub_rel) = fp.strip_prefix(&src_abs) else {
                    continue;
                };
                let joined_rel = if dest_base_rel.as_os_str().is_empty() {
                    sub_rel.to_path_buf()
                } else {
                    dest_base_rel.join(sub_rel)
                };
                let final_dest = target_base.join(&joined_rel);
                ensure_strict_descendant_of_roots(&final_dest, &vault_roots)?;
                if let Some(par) = final_dest.parent() {
                    let _ = fs::create_dir_all(par);
                }
                if final_dest.exists() {
                    let _ = remove_file_clearing_readonly(&final_dest);
                }
                fs::copy(fp, &final_dest).map_err(|e| e.to_string())?;
                let rel_str = joined_rel.to_string_lossy().replace('\\', "/");
                installed_files.push(rel_str);
                if let Some(ext) = final_dest.extension().and_then(|e| e.to_str()) {
                    let el = ext.to_lowercase();
                    if supported.contains(&el) || twin_exts.contains(&el) {
                        if let Ok(h) = calculate_hash(&final_dest) {
                            let _ = archive_mod_binary_version(
                                &sess.vault_path,
                                &final_dest,
                                Some(&h),
                                None,
                                None,
                            );
                            if !h.is_empty() && !installed_hashes.contains(&h) {
                                installed_hashes.push(h);
                            }
                        }
                    }
                }
            }
        } else if src_abs.is_file() {
            let trailing_slash = mapping.destination.trim().ends_with('/')
                || mapping.destination.trim().ends_with('\\');
            let src_fname = src_abs.file_name().ok_or("Invalid source filename")?;
            let joined_rel = if dest_base_rel.as_os_str().is_empty() {
                PathBuf::from(src_fname)
            } else if trailing_slash {
                dest_base_rel.join(src_fname)
            } else {
                dest_base_rel
            };
            let final_dest = target_base.join(&joined_rel);
            ensure_strict_descendant_of_roots(&final_dest, &vault_roots)?;
            if let Some(par) = final_dest.parent() {
                let _ = fs::create_dir_all(par);
            }
            if final_dest.exists() {
                let _ = remove_file_clearing_readonly(&final_dest);
            }
            fs::copy(&src_abs, &final_dest).map_err(|e| e.to_string())?;
            installed_files.push(joined_rel.to_string_lossy().replace('\\', "/"));
            if let Some(ext) = final_dest.extension().and_then(|e| e.to_str()) {
                let el = ext.to_lowercase();
                if supported.contains(&el) || twin_exts.contains(&el) {
                    if let Ok(h) = calculate_hash(&final_dest) {
                        let _ = archive_mod_binary_version(
                            &sess.vault_path,
                            &final_dest,
                            Some(&h),
                            None,
                            None,
                        );
                        if !h.is_empty() && !installed_hashes.contains(&h) {
                            installed_hashes.push(h);
                        }
                    }
                }
            }
        }
    }

    let choices_doc = serde_json::json!({
        "wizard_kind": sess.plan.wizard_kind,
        "mod_name": sess.plan.mod_name,
        "version": sess.plan.version,
        "selected_option_ids": selected_set.into_iter().collect::<Vec<_>>(),
        "installed_files": installed_files,
        "installer_archive_rel": cached_archive_rel,
        "chosen_at": chrono::Local::now().to_rfc3339(),
    });
    if let Ok(cjson) = serde_json::to_string_pretty(&choices_doc) {
        let _ = atomic_write_bytes(&target_base.join(".sanctuary_fomod_choices.json"), cjson.as_bytes());
    }

    let hashes_for_edge = if installed_hashes.is_empty() {
        sess.extracted_hashes
    } else {
        installed_hashes
    };
    if let Some(raw_edge) = sess
        .sanctuary_manifest_json
        .as_ref()
        .or(sess.sanctuary_override_json.as_ref())
    {
        if let Some((ovr, manifest_opt, auto_accepted)) =
            crate::commands::edge_network::auto_ingest_edge_json(
                &sess.vault_path,
                raw_edge,
                &hashes_for_edge,
            )
        {
            let _ = app.emit(
                "edge_override_detected",
                serde_json::json!({
                    "source_action": "commit_installer_wizard_session",
                    "override_json": serde_json::to_string(&ovr).unwrap_or_else(|_| raw_edge.clone()),
                    "manifest_json": manifest_opt.as_ref().and_then(|m| serde_json::to_string(m).ok()),
                    "extracted_hashes": hashes_for_edge,
                    "auto_accepted": auto_accepted,
                }),
            );
        }
    }

    if sess.should_move_original && is_safe_user_file_path(&sess.source_path) {
        let _ = fs::remove_file(&sess.source_path);
    }

    Ok(installed_files)
}

#[tauri::command]
pub async fn commit_installer_wizard_session(
    app: tauri::AppHandle,
    app_state: tauri::State<'_, AppState>,
    session_id: String,
    selected_option_ids: Vec<String>,
    target_folder: Option<String>,
) -> Result<Vec<String>, String> {
    let game_schema = app_state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || {
        let now = now_secs();
        let sess = {
            let mut guard = session_store()
                .lock()
                .map_err(|_| "Installer session lock failed.".to_string())?;
            prune_stale_sessions_locked(&mut guard, now);
            guard
                .remove(session_id.trim())
                .ok_or_else(|| "Installer session expired or not found.".to_string())?
        };
        commit_installer_session_sync(&app, &game_schema, sess, selected_option_ids, target_folder)
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(crate) async fn replay_fomod_session_headless(
    app: &tauri::AppHandle,
    app_state: &tauri::State<'_, AppState>,
    session_id: &str,
    target_folder: Option<String>,
    selected_option_ids: Vec<String>,
) -> Result<Vec<String>, String> {
    let app_clone = app.clone();
    let game_schema = app_state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let sid = session_id.trim().to_string();

    tauri::async_runtime::spawn_blocking(move || {
        let now = now_secs();
        let sess = {
            let mut guard = session_store()
                .lock()
                .map_err(|_| "Installer session lock failed.".to_string())?;
            prune_stale_sessions_locked(&mut guard, now);
            guard
                .remove(&sid)
                .ok_or_else(|| "Installer session expired or not found.".to_string())?
        };
        commit_installer_session_sync(&app_clone, &game_schema, sess, selected_option_ids, target_folder)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn resolve_mod_dir_and_cached_installer(
    vault_path: &str,
    mod_rel_path: &str,
) -> Result<(PathBuf, PathBuf, PathBuf, String, Option<PathBuf>, Vec<String>), String> {
    if vault_path.trim().is_empty() {
        return Err("VAULT_NOT_CONFIGURED".to_string());
    }
    let vault_root = get_vault_root_dir(vault_path);
    let vault_mods_lane = get_vault_mods_lane(vault_path);
    let clean = mod_rel_path.trim().replace('\\', "/");
    let clean_rel = clean.trim_matches('/');
    if clean_rel.is_empty() {
        return Err("Invalid empty mod path.".to_string());
    }

    let first_seg = clean_rel.split('/').next().unwrap_or(clean_rel);
    let mut mod_dir = resolve_case_insensitive_path(&vault_mods_lane, clean_rel);
    if !mod_dir.is_dir() {
        mod_dir = resolve_case_insensitive_path(&vault_mods_lane, first_seg);
    }
    if !mod_dir.is_dir() {
        return Err("Target {mod} folder not found inside Vault.".to_string());
    }
    ensure_strict_descendant_of_roots(&mod_dir, std::slice::from_ref(&vault_mods_lane))?;

    let folder_rel = mod_dir
        .strip_prefix(&vault_mods_lane)
        .unwrap_or(Path::new(first_seg))
        .to_string_lossy()
        .replace('\\', "/");

    let doc = read_saved_fomod_choices_doc(&mod_dir);
    let saved_ids = read_saved_fomod_choices(&mod_dir);
    let mut archive_opt: Option<PathBuf> = doc
        .as_ref()
        .and_then(|v| v.get("installer_archive_rel").and_then(|s| s.as_str()))
        .and_then(|rel| {
            clean_rel_subpath(rel).ok().and_then(|r| {
                let p = vault_root.join(r);
                (p.is_file() && ensure_strict_descendant_of_roots(&p, std::slice::from_ref(&vault_root)).is_ok())
                    .then_some(p)
            })
        });

    if archive_opt.is_none() {
        let installers_dir = vault_root.join("Backups").join("Installers");
        let stem = sanitize_installer_cache_stem(&folder_rel);
        for ext in ["zip", "7z", "rar"] {
            let cand = installers_dir.join(format!("{}.{}", stem, ext));
            if cand.is_file() {
                archive_opt = Some(cand);
                break;
            }
        }
    }

    Ok((vault_root, vault_mods_lane, mod_dir, folder_rel, archive_opt, saved_ids))
}

#[tauri::command]
pub fn can_reconfigure_mod_installer(
    vault_path: String,
    mod_rel_path: String,
) -> Result<bool, String> {
    let Ok((_vault_root, vault_mods_lane, mod_dir, folder_rel, archive_opt, _saved)) =
        resolve_mod_dir_and_cached_installer(&vault_path, &mod_rel_path)
    else {
        return Ok(false);
    };
    if archive_opt.is_some() {
        return Ok(true);
    }
    Ok(parse_fomod_or_bain_plan(&mod_dir, &folder_rel, None, None, &vault_mods_lane, None)
        .ok()
        .flatten()
        .is_some())
}

#[tauri::command]
pub async fn reopen_mod_installer_wizard(
    app_state: tauri::State<'_, AppState>,
    vault_path: String,
    mod_rel_path: String,
) -> Result<InstallerWizardPlan, String> {
    let game_schema = app_state
        .active_schema
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<InstallerWizardPlan, String> {
        let (vault_root, vault_mods_lane, mod_dir, folder_rel, archive_opt, saved_ids) =
            resolve_mod_dir_and_cached_installer(&vault_path, &mod_rel_path)?;

        let stage_dir = vault_root.join(format!(".tmp_sanctuary_reconfig_{}", uuid::Uuid::new_v4()));
        let mut stage_guard = TempStagingGuard(stage_dir.clone());
        let mut extracted_hashes = Vec::new();
        let mut manifest_json = None;
        let mut override_json = None;
        let source_path;

        if let Some(archive_path) = archive_opt {
            let extraction = extract_archive_bounded_to_dir(
                &archive_path,
                &stage_dir,
                Some(&folder_rel),
                &game_schema,
                MAX_ARCHIVE_ENTRY_BYTES,
                MAX_ARCHIVE_TOTAL_BYTES,
            )?;
            manifest_json = extraction.sanctuary_manifest_json;
            override_json = extraction.sanctuary_override_json;
            for ent in extraction.files {
                if let Ok(h) = calculate_hash(&ent.staged_path) {
                    if !h.is_empty() && !extracted_hashes.contains(&h) {
                        extracted_hashes.push(h);
                    }
                }
            }
            source_path = archive_path;
        } else {
            fs::create_dir_all(&stage_dir).map_err(|e| e.to_string())?;
            for ent in walkdir::WalkDir::new(&mod_dir)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if !ent.file_type().is_file() {
                    continue;
                }
                let p = ent.path();
                if let Ok(rel) = p.strip_prefix(&mod_dir) {
                    let dst = stage_dir.join(rel);
                    if let Some(par) = dst.parent() {
                        let _ = fs::create_dir_all(par);
                    }
                    let _ = fs::copy(p, &dst);
                }
            }
            source_path = mod_dir.clone();
        }

        let coords = crate::commands::state_ops::get_saved_coordinates();
        let mods_dir_opt = (!coords.mods_path.trim().is_empty())
            .then(|| PathBuf::from(&coords.mods_path));
        let live_root_opt = (!coords.live_path.trim().is_empty())
            .then(|| crate::game_logic::resolve_game_engine_root(&coords.live_path, &game_schema));
        let detected_game_ver = (!coords.live_path.trim().is_empty())
            .then(|| {
                crate::commands::game_info::rip_game_version_with_schema_and_docs(
                    &coords.live_path,
                    coords.docs_path.as_deref(),
                    &game_schema,
                )
                .ok()
            })
            .flatten();

        let mut plan = parse_fomod_or_bain_plan(
            &stage_dir,
            &folder_rel,
            mods_dir_opt.as_deref(),
            live_root_opt.as_deref(),
            &vault_mods_lane,
            detected_game_ver.as_deref(),
        )?
        .ok_or_else(|| "No FOMOD or BAIN installer metadata found for this mod.".to_string())?;

        plan.suggested_target_folder = folder_rel.clone();
        if !saved_ids.is_empty() {
            plan.saved_selections = saved_ids;
        }

        stage_guard.0 = PathBuf::new();
        let emitted = register_pending_wizard_session(PendingInstallerSession {
            created_at_epoch: now_secs(),
            stage_dir,
            source_path,
            should_move_original: false,
            vault_path,
            zip_stem: folder_rel,
            sanctuary_manifest_json: manifest_json,
            sanctuary_override_json: override_json,
            extracted_hashes,
            plan,
        });
        Ok(emitted)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_utf16le_fomod_and_resolves_conditional_flags_and_bain() {
        let base = std::env::temp_dir().join(format!("fomod_test_{}", uuid::Uuid::new_v4()));
        let stage = base.join("stage_fomod");
        let vault = base.join("vault");
        let vault_mods = vault.join("Mods");
        std::fs::create_dir_all(stage.join("fomod")).unwrap();
        std::fs::create_dir_all(stage.join("core")).unwrap();
        std::fs::create_dir_all(stage.join("patch")).unwrap();
        std::fs::create_dir_all(&vault_mods).unwrap();
        std::fs::write(stage.join("core/main.esp"), b"MAIN").unwrap();
        std::fs::write(stage.join("patch/hi_patch.esp"), b"PATCH").unwrap();

        let xml_str = r#"<config>
  <moduleName>WizardTest</moduleName>
  <requiredInstallFiles>
    <folder source="core" destination="" priority="0"/>
  </requiredInstallFiles>
  <installSteps order="Explicit">
    <installStep name="Options">
      <optionalFileGroups order="Explicit">
        <group name="Quality" type="SelectExactlyOne">
          <plugins order="Explicit">
            <plugin name="HighRes">
              <description>Sets flag</description>
              <conditionFlags><flag name="MODE">HIGH</flag></conditionFlags>
              <typeDescriptor><type name="Recommended"/></typeDescriptor>
            </plugin>
          </plugins>
        </group>
      </optionalFileGroups>
    </installStep>
  </installSteps>
  <conditionalFileInstalls>
    <patterns>
      <pattern>
        <dependencies operator="And">
          <flagDependency flag="MODE" value="HIGH"/>
        </dependencies>
        <files>
          <file source="patch/hi_patch.esp" destination="hi_patch.esp" priority="5"/>
        </files>
      </pattern>
    </patterns>
  </conditionalFileInstalls>
</config>"#;

        let mut utf16_bytes = vec![0xFFu8, 0xFEu8];
        for unit in xml_str.encode_utf16() {
            utf16_bytes.extend_from_slice(&unit.to_le_bytes());
        }
        std::fs::write(stage.join("fomod/ModuleConfig.xml"), &utf16_bytes).unwrap();

        let plan = parse_fomod_or_bain_plan(&stage, "WizardTest", None, None, &vault_mods, None)
            .unwrap()
            .expect("Expected FOMOD plan");
        assert_eq!(plan.wizard_kind, "fomod");
        assert_eq!(plan.mod_name, "WizardTest");
        assert_eq!(plan.steps.len(), 1);
        let opt_id = plan.steps[0].groups[0].options[0].id.clone();

        let mut selected = HashSet::new();
        selected.insert(opt_id);
        let mapped = collect_wizard_mappings(&plan, &selected);
        assert_eq!(mapped.len(), 2);
        assert_eq!(mapped[0].source, "core");
        assert_eq!(mapped[1].source, "patch/hi_patch.esp");

        // Verify BAIN detection when >= 2 numbered folders exist
        let bain_stage = base.join("stage_bain");
        std::fs::create_dir_all(bain_stage.join("00 Core")).unwrap();
        std::fs::create_dir_all(bain_stage.join("01 Dark UI")).unwrap();
        let bain_plan = parse_fomod_or_bain_plan(&bain_stage, "BainMod", None, None, &vault_mods, None)
            .unwrap()
            .expect("Expected BAIN plan");
        assert_eq!(bain_plan.wizard_kind, "bain");
        assert_eq!(bain_plan.steps[0].groups[0].options.len(), 2);
        assert_eq!(bain_plan.steps[0].groups[0].options[0].default_type, "Recommended");
        assert_eq!(bain_plan.steps[0].groups[0].options[1].default_type, "Optional");

        // Verify saved `.sanctuary_fomod_choices.json` reload for repeat upgrades
        let existing_mod_dir = vault_mods.join("WizardTest");
        std::fs::create_dir_all(&existing_mod_dir).unwrap();
        std::fs::write(
            existing_mod_dir.join(".sanctuary_fomod_choices.json"),
            r#"{"wizard_kind":"fomod","selected_option_ids":["s0_g0_o0"]}"#,
        )
        .unwrap();
        let reloaded_plan = parse_fomod_or_bain_plan(&stage, "WizardTest", None, None, &vault_mods, None)
            .unwrap()
            .expect("Expected reloaded FOMOD plan");
        assert_eq!(reloaded_plan.saved_selections, vec!["s0_g0_o0".to_string()]);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn parses_nested_fomod_game_dependency_and_4mb_option_image() {
        let base = std::env::temp_dir().join(format!("fomod_nested_test_{}", uuid::Uuid::new_v4()));
        let stage = base.join("stage");
        let wrapper = stage.join("WrapperRoot");
        let vault_mods = base.join("vault").join("Mods");
        std::fs::create_dir_all(wrapper.join("fomod")).unwrap();
        std::fs::create_dir_all(wrapper.join("images")).unwrap();
        std::fs::create_dir_all(wrapper.join("optA")).unwrap();
        std::fs::create_dir_all(&vault_mods).unwrap();
        std::fs::write(wrapper.join("optA/a.bin"), b"A").unwrap();
        // > 256 KiB image (320 KiB) should encode cleanly under the 4 MiB cap
        std::fs::write(wrapper.join("images/preview.png"), vec![0x89u8; 320 * 1024]).unwrap();

        let xml_str = r#"<config>
  <moduleName>NestedMod</moduleName>
  <moduleDependencies operator="And">
    <gameDependency version="1.6.1170"/>
  </moduleDependencies>
  <installSteps order="Explicit">
    <installStep name="StepOne">
      <optionalFileGroups order="Explicit">
        <group name="Choices" type="SelectAny">
          <plugins order="Explicit">
            <plugin name="OptionA">
              <description>With image</description>
              <image path="images/preview.png"/>
              <files><folder source="optA" destination="" priority="0"/></files>
              <typeDescriptor>
                <dependencyType>
                  <defaultType name="NotUsable"/>
                  <patterns>
                    <pattern>
                      <dependencies operator="And">
                        <gameDependency version="1.6.640"/>
                      </dependencies>
                      <type name="Recommended"/>
                    </pattern>
                  </patterns>
                </dependencyType>
              </typeDescriptor>
            </plugin>
          </plugins>
        </group>
      </optionalFileGroups>
    </installStep>
  </installSteps>
</config>"#;
        std::fs::write(wrapper.join("fomod/ModuleConfig.xml"), xml_str).unwrap();

        let ok_plan = parse_fomod_or_bain_plan(
            &stage,
            "NestedMod",
            None,
            None,
            &vault_mods,
            Some("1.6.1170.0"),
        )
        .unwrap()
        .expect("Expected nested FOMOD plan");
        assert_eq!(ok_plan.content_root_rel, "WrapperRoot");
        assert!(ok_plan.module_dependencies_satisfied);
        let opt = &ok_plan.steps[0].groups[0].options[0];
        assert!(opt.image_data_url.as_deref().unwrap_or("").starts_with("data:image/png;base64,"));
        match &opt.dependency_patterns[0].condition {
            FomodConditionNode::Composite { children, .. } => match &children[0] {
                FomodConditionNode::VersionDependency { target, satisfied, .. } => {
                    assert_eq!(target, "game");
                    assert!(*satisfied);
                }
                other => panic!("Unexpected child: {:?}", other),
            },
            other => panic!("Unexpected cond: {:?}", other),
        }

        let old_ver_plan = parse_fomod_or_bain_plan(
            &stage,
            "NestedMod",
            None,
            None,
            &vault_mods,
            Some("1.5.97"),
        )
        .unwrap()
        .unwrap();
        assert!(!old_ver_plan.module_dependencies_satisfied);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn reconfiguring_fomod_removes_stale_prior_option_files_and_caches_installer() {
        let base = std::env::temp_dir().join(format!("fomod_reconfig_test_{}", uuid::Uuid::new_v4()));
        let vault_root = base.join("vault");
        let mod_dir = vault_root.join("Mods").join("ModularMod");
        std::fs::create_dir_all(&mod_dir).unwrap();
        std::fs::write(mod_dir.join("opt_a.esp"), b"OLD_OPT").unwrap();
        std::fs::write(mod_dir.join("user_notes.txt"), b"KEEP_ME").unwrap();

        let src_zip = base.join("ModularMod.zip");
        std::fs::write(&src_zip, b"PK\x03\x04dummy").unwrap();
        let cached_rel = cache_installer_archive_for_reconfigure(&vault_root, &src_zip, "ModularMod")
            .expect("Expected installer cache");
        assert!(vault_root.join(&cached_rel).is_file());

        std::fs::write(
            mod_dir.join(".sanctuary_fomod_choices.json"),
            serde_json::to_string_pretty(&serde_json::json!({
                "wizard_kind": "fomod",
                "selected_option_ids": ["s0_g0_o0"],
                "installed_files": ["opt_a.esp"],
                "installer_archive_rel": cached_rel,
            }))
            .unwrap(),
        )
        .unwrap();

        remove_prior_fomod_installed_files(&mod_dir);
        assert!(!mod_dir.join("opt_a.esp").exists());
        assert!(mod_dir.join("user_notes.txt").exists());
        assert_eq!(read_saved_fomod_choices(&mod_dir), vec!["s0_g0_o0".to_string()]);

        let _ = std::fs::remove_dir_all(&base);
    }
}
