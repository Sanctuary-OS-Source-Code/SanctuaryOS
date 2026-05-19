#![allow(dead_code)]
use std::collections::HashMap;
use std::io::{Read, Seek};

#[derive(serde::Serialize)]
pub struct PackageInfo {
    pub is_valid: bool,
    pub asset_count: u32,
    pub tg_ids: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct ModConflict {
    pub mod_pair: String,
    pub shared_assets: u32,
}

#[derive(serde::Serialize)]
pub struct ScanReport {
    pub total_packages: u32,
    pub total_assets: u32,
    pub conflicts: Vec<ModConflict>,
}

pub fn scan_package_header(path: &str) -> Result<PackageInfo, String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;

    let mut magic = [0u8; 4];
    file.read_exact(&mut magic)
        .map_err(|e| format!("Failed to read header: {}", e))?;

    if &magic != b"DBPF" {
        return Ok(PackageInfo {
            is_valid: false,
            asset_count: 0,
            tg_ids: vec![],
        });
    }

    file.seek(std::io::SeekFrom::Start(36))
        .map_err(|e| e.to_string())?;
    let mut header_chunk = [0u8; 36];
    file.read_exact(&mut header_chunk)
        .map_err(|e| e.to_string())?;

    let index_count = u32::from_le_bytes(header_chunk[0..4].try_into().unwrap());
    let index_offset = u64::from_le_bytes(header_chunk[28..36].try_into().unwrap());

    file.seek(std::io::SeekFrom::Start(index_offset))
        .map_err(|e| e.to_string())?;

    let mut flags_buf = [0u8; 4];
    file.read_exact(&mut flags_buf).map_err(|e| e.to_string())?;
    let flags = u32::from_le_bytes(flags_buf);

    let mut const_type = 0u32;
    let mut const_group = 0u32;
    let mut const_inst_ex = 0u32;

    if flags & 0x01 != 0 {
        let mut b = [0u8; 4];
        file.read_exact(&mut b).unwrap_or_default();
        const_type = u32::from_le_bytes(b);
    }
    if flags & 0x02 != 0 {
        let mut b = [0u8; 4];
        file.read_exact(&mut b).unwrap_or_default();
        const_group = u32::from_le_bytes(b);
    }
    if flags & 0x04 != 0 {
        let mut b = [0u8; 4];
        file.read_exact(&mut b).unwrap_or_default();
        const_inst_ex = u32::from_le_bytes(b);
    }

    let mut tgis = Vec::new();

    for _ in 0..index_count {
        let mut t = const_type;
        let mut g = const_group;
        let mut i_ex = const_inst_ex;

        if flags & 0x01 == 0 {
            let mut b = [0u8; 4];
            if file.read_exact(&mut b).is_err() {
                break;
            }
            t = u32::from_le_bytes(b);
        }
        if flags & 0x02 == 0 {
            let mut b = [0u8; 4];
            if file.read_exact(&mut b).is_err() {
                break;
            }
            g = u32::from_le_bytes(b);
        }
        if flags & 0x04 == 0 {
            let mut b = [0u8; 4];
            if file.read_exact(&mut b).is_err() {
                break;
            }
            i_ex = u32::from_le_bytes(b);
        }

        let mut b4 = [0u8; 4];
        if file.read_exact(&mut b4).is_err() {
            break;
        }
        let i_low = u32::from_le_bytes(b4);

        let mut remainder = [0u8; 16];
        if file.read_exact(&mut remainder).is_err() {
            break;
        }

        let i = ((i_ex as u64) << 32) | (i_low as u64);

        let is_harmless_cc = match t {
            0x00B2D882 | 0x01661233 | 0x016612FA | 0x220557DA | 0x034AEECB | 0x319E4F1D
            | 0xC0DB5AE7 | 0xD3044521 | 0x01D0E75D | 0x02DC343F | 0x035AECC5 | 0x8B22EC6A
            | 0x015A1849 | 0x03B33DDF | 0x00000000 => true,
            _ => false,
        };

        if is_harmless_cc {
            continue;
        }

        tgis.push(format!("{:08X}:{:08X}:{:016X}", t, g, i));
    }

    Ok(PackageInfo {
        is_valid: true,
        asset_count: index_count,
        tg_ids: tgis,
    })
}

pub fn scan_directory_for_conflicts(dir_path: &str) -> Result<ScanReport, String> {
    let mut tgi_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut total_packages = 0;
    let mut total_assets = 0;

    let entries =
        std::fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_file()
            && path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase()
                == "package"
        {
            let path_str = path.to_string_lossy().to_string();

            if let Ok(info) = scan_package_header(&path_str) {
                if info.is_valid {
                    total_packages += 1;
                    total_assets += info.asset_count;

                    let file_name = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();

                    for tgi in info.tg_ids {
                        tgi_map
                            .entry(tgi)
                            .or_insert_with(Vec::new)
                            .push(file_name.clone());
                    }
                }
            }
        }
    }

    let mut pair_map: HashMap<String, u32> = HashMap::new();

    for (_tgi, mut files) in tgi_map {
        if files.len() > 1 {
            files.sort();
            files.dedup();

            if files.len() > 1 {
                for i in 0..files.len() {
                    for j in (i + 1)..files.len() {
                        let pair_name = format!("{}  ⚔️  {}", files[i], files[j]);
                        *pair_map.entry(pair_name).or_insert(0) += 1;
                    }
                }
            }
        }
    }

    let mut conflicts = Vec::new();
    for (mod_pair, shared_assets) in pair_map {
        conflicts.push(ModConflict {
            mod_pair,
            shared_assets,
        });
    }

    conflicts.sort_by(|a, b| b.shared_assets.cmp(&a.shared_assets));

    Ok(ScanReport {
        total_packages,
        total_assets,
        conflicts,
    })
}
