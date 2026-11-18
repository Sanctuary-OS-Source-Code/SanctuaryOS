use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const MAX_JSON_BYTES: u64 = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_ZIP_INSPECT_BYTES: u64 = 48 * 1024 * 1024;

#[derive(Debug, Serialize, Clone)]
pub struct DiskImageAsset {
    pub path: String,
    pub file_name: String,
    pub data_base64: String,
    pub mime: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ZipJsonCandidate {
    pub entry_name: String,
    pub json_text: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ZipImageAsset {
    pub entry_name: String,
    pub data_base64: String,
    pub mime: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DroppedJsonFileEntry {
    pub source_path: String,
    pub file_name: String,
    pub json_text: String,
    pub sibling_images: Vec<DiskImageAsset>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DroppedZipJsonBundle {
    pub source_path: String,
    pub file_name: String,
    pub json_entries: Vec<ZipJsonCandidate>,
    pub images: Vec<ZipImageAsset>,
}

#[derive(Debug, Serialize, Default)]
pub struct DroppedJsonInspectionReport {
    pub json_files: Vec<DroppedJsonFileEntry>,
    pub zip_bundles: Vec<DroppedZipJsonBundle>,
    pub standalone_images: Vec<DiskImageAsset>,
}

fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(((input.len() + 2) / 3) * 4);
    let mut i = 0;
    while i < input.len() {
        let b0 = input[i] as u32;
        let b1 = if i + 1 < input.len() { input[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < input.len() { input[i + 2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        out.push(if i + 1 < input.len() {
            TABLE[((triple >> 6) & 0x3F) as usize] as char
        } else {
            '='
        });
        out.push(if i + 2 < input.len() {
            TABLE[(triple & 0x3F) as usize] as char
        } else {
            '='
        });
        i += 3;
    }
    out
}

fn is_image_ext(ext_lower: &str) -> bool {
    matches!(ext_lower, "png" | "jpg" | "jpeg" | "webp" | "gif")
}

fn guess_image_mime(file_name: &str) -> &'static str {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else {
        "image/webp"
    }
}

fn strip_utf8_bom(raw: Vec<u8>) -> Result<String, String> {
    let s = String::from_utf8(raw).map_err(|e| format!("Invalid UTF-8 JSON: {}", e))?;
    Ok(s.strip_prefix('\u{FEFF}').unwrap_or(&s).to_string())
}

fn read_image_asset_from_disk(path: &Path) -> Option<DiskImageAsset> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_IMAGE_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let file_name = path.file_name()?.to_string_lossy().to_string();
    Some(DiskImageAsset {
        path: path.to_string_lossy().to_string(),
        mime: guess_image_mime(&file_name).to_string(),
        file_name,
        data_base64: encode_base64(&bytes),
    })
}

fn collect_sibling_images(json_path: &Path) -> Vec<DiskImageAsset> {
    let Some(parent) = json_path.parent() else {
        return Vec::new();
    };
    let stem_lower = json_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let keyword_stems = [
        "bg",
        "background",
        "wallpaper",
        "banner",
        "backdrop",
        "preview",
        "cover",
        "thumb",
        "thumbnail",
    ];

    let mut collected = Vec::new();
    let Ok(entries) = fs::read_dir(parent) else {
        return collected;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_file() || crate::utils::is_macos_or_os_metadata_path(&p) {
            continue;
        }
        let ext = p
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !is_image_ext(&ext) {
            continue;
        }
        let img_stem = p
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let stem_matches = (!stem_lower.is_empty() && img_stem.starts_with(&stem_lower))
            || keyword_stems.iter().any(|k| img_stem.contains(k));
        if !stem_matches {
            continue;
        }
        if !crate::utils::is_safe_user_file_path(&p) {
            continue;
        }
        if let Some(asset) = read_image_asset_from_disk(&p) {
            collected.push(asset);
            if collected.len() >= 6 {
                break;
            }
        }
    }
    collected
}

fn is_recognized_external_modlist_entry(lower_name: &str, outer_ext_lower: &str) -> bool {
    let leaf = lower_name.rsplit('/').next().unwrap_or(lower_name);
    leaf == "modrinth.index.json"
        || leaf == "manifest.json"
        || leaf == "collection.json"
        || leaf == "modlist"
        || (outer_ext_lower == "wabbajack" && (leaf == "modlist" || leaf.ends_with(".json")))
}

fn inspect_zip_json_bundle(path: &Path) -> Option<DroppedZipJsonBundle> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_ZIP_INSPECT_BYTES {
        return None;
    }
    let outer_ext_lower = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let file = fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    let mut json_entries: Vec<ZipJsonCandidate> = Vec::new();
    let mut images: Vec<ZipImageAsset> = Vec::new();
    let mut has_recognized_modlist = false;
    let mut has_non_meta_payload = false;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).ok()?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        let entry_path = Path::new(&name);
        if crate::utils::is_macos_or_os_metadata_path(entry_path) {
            continue;
        }
        let lower = name.to_ascii_lowercase();
        let ext = entry_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        let is_modlist_entry = is_recognized_external_modlist_entry(&lower, &outer_ext_lower);
        if is_modlist_entry {
            has_recognized_modlist = true;
        }

        if ext == "json" || is_modlist_entry {
            if lower.ends_with(".sanctuary.manifest.json")
                || lower.ends_with(".sanctuary.override.json")
            {
                return None;
            }
            if entry.size() > MAX_JSON_BYTES || json_entries.len() >= 12 {
                continue;
            }
            let mut buf = Vec::with_capacity((entry.size() as usize).min(256 * 1024));
            if entry.read_to_end(&mut buf).is_err() {
                continue;
            }
            if let Ok(json_text) = strip_utf8_bom(buf) {
                json_entries.push(ZipJsonCandidate {
                    entry_name: name,
                    json_text,
                });
            }
        } else if is_image_ext(&ext) {
            if entry.size() > 0 && entry.size() <= MAX_IMAGE_BYTES && images.len() < 8 {
                let mut buf = Vec::with_capacity((entry.size() as usize).min(256 * 1024));
                if entry.read_to_end(&mut buf).is_ok() {
                    images.push(ZipImageAsset {
                        mime: guess_image_mime(&name).to_string(),
                        entry_name: name,
                        data_base64: encode_base64(&buf),
                    });
                }
            }
        } else if !matches!(ext.as_str(), "txt" | "md" | "url" | "license") {
            has_non_meta_payload = true;
        }
    }

    if !has_recognized_modlist && has_non_meta_payload {
        // Contains game binaries/mod payloads — leave for `ingest_dropped_file`.
        return None;
    }

    if json_entries.is_empty() {
        return None;
    }

    Some(DroppedZipJsonBundle {
        source_path: path.to_string_lossy().to_string(),
        file_name: path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string(),
        json_entries,
        images,
    })
}

fn sanitize_os_asset_stem(raw_name: &str, suffix_to_strip: &[&str]) -> String {
    let leaf = Path::new(raw_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("asset")
        .trim();
    let mut stem = leaf.to_string();
    let lower = stem.to_ascii_lowercase();
    for suffix in suffix_to_strip {
        if lower.ends_with(suffix) && stem.len() > suffix.len() {
            stem.truncate(stem.len() - suffix.len());
            break;
        }
    }
    let cleaned: String = stem
        .chars()
        .map(|c| {
            if matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control()
            {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('.').trim();
    if trimmed.is_empty() {
        "sanctuary_asset".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub async fn inspect_dropped_json_bundles(
    paths: Vec<String>,
) -> Result<DroppedJsonInspectionReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut report = DroppedJsonInspectionReport::default();
        let mut image_candidates: Vec<PathBuf> = Vec::new();

        for raw in paths {
            let p = PathBuf::from(&raw);
            if !p.is_file()
                || crate::utils::is_macos_or_os_metadata_path(&p)
                || !crate::utils::is_safe_user_file_path(&p)
            {
                continue;
            }
            let file_name = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            let lower = file_name.to_ascii_lowercase();
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();

            if ext == "json" {
                if lower.ends_with(".sanctuary.manifest.json")
                    || lower.ends_with(".sanctuary.override.json")
                {
                    continue;
                }
                let Ok(meta) = fs::metadata(&p) else {
                    continue;
                };
                if meta.len() > MAX_JSON_BYTES {
                    continue;
                }
                if let Ok(bytes) = fs::read(&p) {
                    if let Ok(json_text) = strip_utf8_bom(bytes) {
                        let sibling_images = collect_sibling_images(&p);
                        report.json_files.push(DroppedJsonFileEntry {
                            source_path: raw,
                            file_name,
                            json_text,
                            sibling_images,
                        });
                    }
                }
            } else if matches!(ext.as_str(), "zip" | "mrpack" | "wabbajack") {
                if let Some(zip_bundle) = inspect_zip_json_bundle(&p) {
                    report.zip_bundles.push(zip_bundle);
                } else if ext == "wabbajack" {
                    if let Ok(meta) = fs::metadata(&p) {
                        if meta.len() <= MAX_JSON_BYTES {
                            if let Ok(bytes) = fs::read(&p) {
                                if let Ok(json_text) = strip_utf8_bom(bytes) {
                                    report.json_files.push(DroppedJsonFileEntry {
                                        source_path: raw,
                                        file_name,
                                        json_text,
                                        sibling_images: Vec::new(),
                                    });
                                }
                            }
                        }
                    }
                }
            } else if is_image_ext(&ext) {
                image_candidates.push(p);
            }
        }

        if !report.json_files.is_empty() {
            for img_path in image_candidates.into_iter().take(12) {
                if let Some(asset) = read_image_asset_from_disk(&img_path) {
                    report.standalone_images.push(asset);
                }
            }
        }

        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_dropped_os_asset(
    asset_kind: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let coords = crate::commands::state_ops::get_saved_coordinates();
        let global = crate::commands::state_ops::get_global_config();

        let spoke_root = {
            let trimmed = coords.vault_path.trim();
            if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("web") {
                None
            } else {
                Some(crate::utils::get_vault_root_dir(trimmed))
            }
        };

        let master_root = coords
            .master_vault_path
            .as_deref()
            .or(global.vault_path.as_deref())
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("web"))
            .map(PathBuf::from)
            .or_else(|| spoke_root.clone());

        let (target_dir, final_file_name) = match asset_kind.as_str() {
            "blueprint" => {
                let Some(root) = spoke_root.or(master_root) else {
                    return Ok(String::new());
                };
                let stem = sanitize_os_asset_stem(&file_name, &[".blueprint.json", ".json"]);
                (root.join("Blueprints"), format!("{}.json", stem))
            }
            "workbench_template" => {
                let Some(root) = spoke_root.or(master_root) else {
                    return Ok(String::new());
                };
                let stem =
                    sanitize_os_asset_stem(&file_name, &[".sanctuary.template.json", ".json"]);
                (
                    root.join("Data").join("Templates"),
                    format!("{}.sanctuary.template.json", stem),
                )
            }
            "chameleon" => {
                let Some(root) = master_root else {
                    return Ok(String::new());
                };
                let stem = sanitize_os_asset_stem(&file_name, &[".chameleon.json", ".json"]);
                (root.join("Data").join("Themes"), format!("{}.json", stem))
            }
            "lexicon" => {
                let Some(root) = master_root else {
                    return Ok(String::new());
                };
                let stem = sanitize_os_asset_stem(&file_name, &[".lexicon.json", ".json"]);
                (root.join("Data").join("Lexicons"), format!("{}.json", stem))
            }
            "master_schema" => {
                let Some(root) = master_root else {
                    return Ok(String::new());
                };
                let stem = sanitize_os_asset_stem(&file_name, &[".schema.json", ".json"]);
                (root.join("Data").join("Schemas"), format!("{}.json", stem))
            }
            other => return Err(format!("Unsupported dropped OS asset kind: {}", other)),
        };

        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        let target_path = target_dir.join(&final_file_name);
        crate::utils::ensure_strict_descendant_of_roots(
            &target_path,
            std::slice::from_ref(&target_dir),
        )?;
        crate::utils::atomic_write_bytes(&target_path, content.as_bytes())?;
        Ok(target_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

