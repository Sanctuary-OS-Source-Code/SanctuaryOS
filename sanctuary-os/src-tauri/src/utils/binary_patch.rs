use bzip2::read::BzDecoder;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};

const MAX_PATCH_OUTPUT_BYTES: usize = 512 * 1024 * 1024; // 512 MiB cap

fn decode_bsdiff_offtin(buf: &[u8]) -> i64 {
    let mut y = (buf[7] & 0x7F) as u64;
    y = (y << 8) | (buf[6] as u64);
    y = (y << 8) | (buf[5] as u64);
    y = (y << 8) | (buf[4] as u64);
    y = (y << 8) | (buf[3] as u64);
    y = (y << 8) | (buf[2] as u64);
    y = (y << 8) | (buf[1] as u64);
    y = (y << 8) | (buf[0] as u64);
    let signed = y as i64;
    if (buf[7] & 0x80) != 0 {
        -signed
    } else {
        signed
    }
}

/// Applies a binary `BSDIFF40` patch to `source` in pure Rust using bounded bzip2 streams.
pub fn apply_bsdiff40(source: &[u8], patch: &[u8]) -> Result<Vec<u8>, String> {
    if patch.len() < 32 || &patch[0..8] != b"BSDIFF40" {
        return Err("Invalid BSDIFF40 magic header.".to_string());
    }
    let ctrl_len = decode_bsdiff_offtin(&patch[8..16]);
    let diff_len = decode_bsdiff_offtin(&patch[16..24]);
    let new_size = decode_bsdiff_offtin(&patch[24..32]);
    if ctrl_len < 0 || diff_len < 0 || new_size < 0 {
        return Err("Corrupt BSDIFF40 header: negative section length.".to_string());
    }
    let ctrl_usize = ctrl_len as usize;
    let diff_usize = diff_len as usize;
    let new_usize = new_size as usize;
    if new_usize > MAX_PATCH_OUTPUT_BYTES {
        return Err("BSDIFF40 target exceeds 512 MiB memory safety cap.".to_string());
    }
    let diff_start = 32usize
        .checked_add(ctrl_usize)
        .ok_or_else(|| "BSDIFF40 ctrl overflow".to_string())?;
    let extra_start = diff_start
        .checked_add(diff_usize)
        .ok_or_else(|| "BSDIFF40 diff overflow".to_string())?;
    if extra_start > patch.len() {
        return Err("Truncated BSDIFF40 patch container.".to_string());
    }

    let mut ctrl_dec = BzDecoder::new(&patch[32..diff_start]);
    let mut diff_dec = BzDecoder::new(&patch[diff_start..extra_start]);
    let mut extra_dec = BzDecoder::new(&patch[extra_start..]);

    let mut output = vec![0u8; new_usize];
    let mut old_pos: i64 = 0;
    let mut new_pos: usize = 0;
    let old_len = source.len() as i64;

    let mut ctrl_buf = [0u8; 24];
    while new_pos < new_usize {
        ctrl_dec
            .read_exact(&mut ctrl_buf)
            .map_err(|e| format!("Failed decoding BSDIFF40 ctrl stream: {}", e))?;
        let add_len = decode_bsdiff_offtin(&ctrl_buf[0..8]);
        let copy_len = decode_bsdiff_offtin(&ctrl_buf[8..16]);
        let seek_offset = decode_bsdiff_offtin(&ctrl_buf[16..24]);

        if add_len < 0 || copy_len < 0 {
            return Err("Corrupt BSDIFF40 control tuple: negative copy length.".to_string());
        }
        let add_u = add_len as usize;
        let copy_u = copy_len as usize;
        if new_pos.saturating_add(add_u).saturating_add(copy_u) > new_usize {
            return Err("BSDIFF40 write exceeds declared target output size.".to_string());
        }

        if add_u > 0 {
            let mut diff_chunk = vec![0u8; add_u];
            diff_dec
                .read_exact(&mut diff_chunk)
                .map_err(|e| format!("Failed decoding BSDIFF40 diff stream: {}", e))?;
            for (i, dbyte) in diff_chunk.into_iter().enumerate() {
                let src_idx = old_pos.saturating_add(i as i64);
                let src_byte = if src_idx >= 0 && src_idx < old_len {
                    source[src_idx as usize]
                } else {
                    0
                };
                output[new_pos + i] = dbyte.wrapping_add(src_byte);
            }
            new_pos += add_u;
            old_pos = old_pos.saturating_add(add_len);
        }

        if copy_u > 0 {
            extra_dec
                .read_exact(&mut output[new_pos..new_pos + copy_u])
                .map_err(|e| format!("Failed decoding BSDIFF40 extra stream: {}", e))?;
            new_pos += copy_u;
        }
        old_pos = old_pos.saturating_add(seek_offset);
    }

    Ok(output)
}

fn read_vcdiff_varint(buf: &[u8], pos: &mut usize) -> Result<usize, String> {
    let mut val: usize = 0;
    for _ in 0..9 {
        if *pos >= buf.len() {
            return Err("Unexpected EOF decoding VCDIFF integer.".to_string());
        }
        let b = buf[*pos];
        *pos += 1;
        val = val
            .checked_shl(7)
            .ok_or_else(|| "VCDIFF integer overflow.".to_string())?
            | ((b & 0x7F) as usize);
        if (b & 0x80) == 0 {
            return Ok(val);
        }
    }
    Err("Malformed VCDIFF multi-byte integer.".to_string())
}

fn adler32_checksum(data: &[u8]) -> u32 {
    const MOD_ADLER: u32 = 65521;
    let mut a: u32 = 1;
    let mut b: u32 = 0;
    for &byte in data {
        a = (a + byte as u32) % MOD_ADLER;
        b = (b + a) % MOD_ADLER;
    }
    (b << 16) | a
}

#[derive(Copy, Clone)]
enum VcdInstOp {
    Run(usize),
    Add(usize),
    Copy { size: usize, mode: usize },
}

fn decode_vcdiff_default_table(code: u8) -> (VcdInstOp, Option<VcdInstOp>) {
    let idx = code as usize;
    if idx == 0 {
        (VcdInstOp::Run(0), None)
    } else if idx <= 18 {
        (VcdInstOp::Add(idx - 1), None)
    } else if idx <= 162 {
        let rel = idx - 19;
        let mode = rel / 16;
        let s = rel % 16;
        let size = if s == 0 { 0 } else { s + 3 };
        (VcdInstOp::Copy { size, mode }, None)
    } else if idx <= 234 {
        let rel = idx - 163;
        let mode = rel / 12;
        let rem = rel % 12;
        let add_sz = (rem / 3) + 1;
        let copy_sz = (rem % 3) + 4;
        (
            VcdInstOp::Add(add_sz),
            Some(VcdInstOp::Copy {
                size: copy_sz,
                mode,
            }),
        )
    } else if idx <= 246 {
        let rel = idx - 235;
        let mode = 6 + (rel / 4);
        let add_sz = (rel % 4) + 1;
        (VcdInstOp::Add(add_sz), Some(VcdInstOp::Copy { size: 4, mode }))
    } else {
        let mode = idx - 247;
        (VcdInstOp::Copy { size: 4, mode }, Some(VcdInstOp::Add(1)))
    }
}

struct VcdiffAddrCache {
    near: [usize; 4],
    next_slot: usize,
    same: [usize; 3 * 256],
}

impl VcdiffAddrCache {
    fn new() -> Self {
        Self {
            near: [0; 4],
            next_slot: 0,
            same: [0; 3 * 256],
        }
    }

    fn update(&mut self, addr: usize) {
        self.near[self.next_slot] = addr;
        self.next_slot = (self.next_slot + 1) & 3;
        self.same[addr % (3 * 256)] = addr;
    }

    fn decode(&mut self, mode: usize, here: usize, addr_sec: &[u8], addr_pos: &mut usize) -> Result<usize, String> {
        let addr = match mode {
            0 => read_vcdiff_varint(addr_sec, addr_pos)?,
            1 => {
                let d = read_vcdiff_varint(addr_sec, addr_pos)?;
                here.checked_sub(d)
                    .ok_or_else(|| "VCDIFF VCD_HERE address underflow.".to_string())?
            }
            2..=5 => {
                let n_idx = mode - 2;
                self.near[n_idx]
                    .checked_add(read_vcdiff_varint(addr_sec, addr_pos)?)
                    .ok_or_else(|| "VCDIFF near address overflow.".to_string())?
            }
            6..=8 => {
                let s_idx = mode - 6;
                if *addr_pos >= addr_sec.len() {
                    return Err("Unexpected EOF reading VCDIFF same-cache index.".to_string());
                }
                let b = addr_sec[*addr_pos] as usize;
                *addr_pos += 1;
                self.same[s_idx * 256 + b]
            }
            _ => return Err(format!("Unsupported VCDIFF address mode {}", mode)),
        };
        self.update(addr);
        Ok(addr)
    }
}

/// Applies an RFC 3284 `VCDIFF` / `xdelta3` patch container to `source` in pure Rust.
pub fn apply_vcdiff_xdelta(source: &[u8], patch: &[u8]) -> Result<Vec<u8>, String> {
    if patch.len() < 5 || patch[0..4] != [0xD6, 0xC3, 0xC4, 0x00] {
        return Err("Invalid VCDIFF / xdelta3 header magic.".to_string());
    }
    let mut pos = 4usize;
    let hdr_indicator = patch[pos];
    pos += 1;
    if (hdr_indicator & 0x01) != 0 {
        // VCD_DECOMPRESS secondary compressor byte
        if pos >= patch.len() {
            return Err("Truncated VCDIFF secondary compressor header.".to_string());
        }
        let sec_id = patch[pos];
        pos += 1;
        if sec_id != 0 {
            return Err(format!("Unsupported VCDIFF secondary compressor id {}", sec_id));
        }
    }
    if (hdr_indicator & 0x02) != 0 {
        return Err("Custom VCDIFF code tables are not supported.".to_string());
    }
    if (hdr_indicator & 0x04) != 0 {
        let app_len = read_vcdiff_varint(patch, &mut pos)?;
        pos = pos
            .checked_add(app_len)
            .filter(|&p| p <= patch.len())
            .ok_or_else(|| "Truncated VCDIFF app header.".to_string())?;
    }

    let mut output: Vec<u8> = Vec::new();
    while pos < patch.len() {
        let win_ind = patch[pos];
        pos += 1;
        let use_source = (win_ind & 0x01) != 0;
        let use_target = (win_ind & 0x02) != 0;
        let has_adler32 = (win_ind & 0x04) != 0;
        if use_source && use_target {
            return Err("Invalid VCDIFF window: both VCD_SOURCE and VCD_TARGET set.".to_string());
        }

        let mut seg_len = 0usize;
        let mut seg_pos = 0usize;
        if use_source || use_target {
            seg_len = read_vcdiff_varint(patch, &mut pos)?;
            seg_pos = read_vcdiff_varint(patch, &mut pos)?;
            let src_slice_len = if use_source { source.len() } else { output.len() };
            if seg_pos.saturating_add(seg_len) > src_slice_len {
                return Err("VCDIFF source window out of bounds.".to_string());
            }
        }

        let delta_len = read_vcdiff_varint(patch, &mut pos)?;
        let delta_end = pos
            .checked_add(delta_len)
            .filter(|&e| e <= patch.len())
            .ok_or_else(|| "VCDIFF delta window extends past EOF.".to_string())?;

        let target_win_len = read_vcdiff_varint(patch, &mut pos)?;
        if output.len().saturating_add(target_win_len) > MAX_PATCH_OUTPUT_BYTES {
            return Err("VCDIFF target exceeds 512 MiB memory safety cap.".to_string());
        }
        if pos >= delta_end {
            return Err("Truncated VCDIFF delta indicator.".to_string());
        }
        let delta_ind = patch[pos];
        pos += 1;
        if delta_ind != 0 {
            return Err("Compressed VCDIFF window sections are not supported.".to_string());
        }

        let add_run_len = read_vcdiff_varint(patch, &mut pos)?;
        let inst_len = read_vcdiff_varint(patch, &mut pos)?;
        let addr_len = read_vcdiff_varint(patch, &mut pos)?;
        let expected_adler = if has_adler32 {
            if pos + 4 > delta_end {
                return Err("Truncated VCDIFF Adler-32 field.".to_string());
            }
            let v = u32::from_be_bytes([patch[pos], patch[pos + 1], patch[pos + 2], patch[pos + 3]]);
            pos += 4;
            Some(v)
        } else {
            None
        };

        let data_end = pos.saturating_add(add_run_len);
        let inst_end = data_end.saturating_add(inst_len);
        let addr_end = inst_end.saturating_add(addr_len);
        if addr_end > delta_end {
            return Err("Truncated VCDIFF window sections.".to_string());
        }

        let data_sec = &patch[pos..data_end];
        let inst_sec = &patch[data_end..inst_end];
        let addr_sec = &patch[inst_end..addr_end];
        pos = delta_end;

        let mut data_pos = 0usize;
        let mut inst_pos = 0usize;
        let mut addr_pos = 0usize;
        let mut cache = VcdiffAddrCache::new();
        let mut win_out: Vec<u8> = Vec::with_capacity(target_win_len);

        while inst_pos < inst_sec.len() {
            let opcode = inst_sec[inst_pos];
            inst_pos += 1;
            let (op1, op2_opt) = decode_vcdiff_default_table(opcode);
            for op in std::iter::once(op1).chain(op2_opt) {
                match op {
                    VcdInstOp::Add(sz_raw) => {
                        let sz = if sz_raw == 0 {
                            read_vcdiff_varint(inst_sec, &mut inst_pos)?
                        } else {
                            sz_raw
                        };
                        if data_pos + sz > data_sec.len() || win_out.len() + sz > target_win_len {
                            return Err("VCDIFF ADD overflows window bounds.".to_string());
                        }
                        win_out.extend_from_slice(&data_sec[data_pos..data_pos + sz]);
                        data_pos += sz;
                    }
                    VcdInstOp::Run(sz_raw) => {
                        let sz = if sz_raw == 0 {
                            read_vcdiff_varint(inst_sec, &mut inst_pos)?
                        } else {
                            sz_raw
                        };
                        if data_pos >= data_sec.len() || win_out.len() + sz > target_win_len {
                            return Err("VCDIFF RUN overflows window bounds.".to_string());
                        }
                        let byte = data_sec[data_pos];
                        data_pos += 1;
                        win_out.resize(win_out.len() + sz, byte);
                    }
                    VcdInstOp::Copy { size: sz_raw, mode } => {
                        let sz = if sz_raw == 0 {
                            read_vcdiff_varint(inst_sec, &mut inst_pos)?
                        } else {
                            sz_raw
                        };
                        let here = seg_len + win_out.len();
                        let addr = cache.decode(mode, here, addr_sec, &mut addr_pos)?;
                        if win_out.len() + sz > target_win_len {
                            return Err("VCDIFF COPY overflows target window length.".to_string());
                        }
                        for step in 0..sz {
                            let idx = addr + step;
                            let byte = if idx < seg_len {
                                if use_source {
                                    source[seg_pos + idx]
                                } else {
                                    output[seg_pos + idx]
                                }
                            } else {
                                let t_idx = idx - seg_len;
                                if t_idx >= win_out.len() {
                                    return Err("VCDIFF COPY reads uninitialized target byte.".to_string());
                                }
                                win_out[t_idx]
                            };
                            win_out.push(byte);
                        }
                    }
                }
            }
        }

        if win_out.len() != target_win_len {
            return Err(format!(
                "VCDIFF window length mismatch: expected {}, got {}",
                target_win_len,
                win_out.len()
            ));
        }
        if let Some(exp_adler) = expected_adler {
            let actual_adler = adler32_checksum(&win_out);
            if actual_adler != exp_adler {
                return Err(format!(
                    "VCDIFF Adler-32 checksum mismatch: expected {:08x}, got {:08x}",
                    exp_adler, actual_adler
                ));
            }
        }
        output.extend_from_slice(&win_out);
    }

    Ok(output)
}

/// Dispatches native `BSDIFF40` or `VCDIFF` / `xdelta3` binary patch application automatically.
pub fn apply_binary_patch_bytes(source: &[u8], patch: &[u8]) -> Result<Vec<u8>, String> {
    if patch.starts_with(b"BSDIFF40") {
        apply_bsdiff40(source, patch)
    } else if patch.len() >= 4 && patch[0..4] == [0xD6, 0xC3, 0xC4, 0x00] {
        apply_vcdiff_xdelta(source, patch)
    } else {
        Err("Unsupported binary patch format (expected BSDIFF40 or VCDIFF/xdelta3).".to_string())
    }
}

/// Applies a binary patch on disk within `allowed_roots`, verifies optional SHA-256, and writes atomically.
pub fn apply_binary_patch_file(
    source_path: &Path,
    patch_path: &Path,
    output_path: &Path,
    expected_sha256: Option<&str>,
    allowed_roots: &[PathBuf],
) -> Result<String, String> {
    if !allowed_roots.is_empty() {
        crate::utils::ensure_path_within_roots(source_path, allowed_roots)?;
        crate::utils::ensure_path_within_roots(patch_path, allowed_roots)?;
        crate::utils::ensure_strict_descendant_of_roots(output_path, allowed_roots)?;
    }
    if !crate::utils::is_safe_user_file_path(source_path)
        || !crate::utils::is_safe_user_file_path(patch_path)
        || !crate::utils::is_safe_user_file_path(output_path)
    {
        return Err("Blocked unsafe path in binary patch execution.".to_string());
    }
    let src_bytes = std::fs::read(source_path)
        .map_err(|e| format!("Failed reading patch source {:?}: {}", source_path, e))?;
    let patch_bytes = std::fs::read(patch_path)
        .map_err(|e| format!("Failed reading binary patch {:?}: {}", patch_path, e))?;

    let patched = apply_binary_patch_bytes(&src_bytes, &patch_bytes)?;
    let mut hasher = Sha256::new();
    hasher.update(&patched);
    let actual_sha = hex::encode(hasher.finalize());

    if let Some(exp) = expected_sha256.map(str::trim).filter(|s| !s.is_empty()) {
        if !actual_sha.eq_ignore_ascii_case(exp) {
            return Err(format!(
                "Patched output SHA-256 mismatch: expected {}, got {}",
                exp.to_ascii_lowercase(),
                actual_sha
            ));
        }
    }

    crate::utils::atomic_write_bytes(output_path, &patched)?;
    Ok(actual_sha)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bzip2::write::BzEncoder;
    use bzip2::Compression;
    use std::io::Write;

    fn encode_bsdiff_offtin(val: i64) -> [u8; 8] {
        let neg = val < 0;
        let mag = if neg { (-val) as u64 } else { val as u64 };
        let mut buf = [0u8; 8];
        for (i, b) in buf.iter_mut().enumerate() {
            *b = ((mag >> (i * 8)) & 0xFF) as u8;
        }
        if neg {
            buf[7] |= 0x80;
        }
        buf
    }

    fn push_vcdiff_varint(out: &mut Vec<u8>, mut val: usize) {
        let mut stack = [0u8; 10];
        let mut len = 0usize;
        loop {
            stack[len] = (val & 0x7F) as u8;
            len += 1;
            val >>= 7;
            if val == 0 {
                break;
            }
        }
        for i in (0..len).rev() {
            let mut b = stack[i];
            if i > 0 {
                b |= 0x80;
            }
            out.push(b);
        }
    }

    #[test]
    fn bsdiff40_and_vcdiff_xdelta_patch_roundtrips_and_checksum_guards() {
        let source = b"SanctuaryOS_Vanilla_Engine_Payload_v1";
        let target = b"SanctuaryOS_Patched_Engine_Payload_v2!!";

        // 1. Real BSDIFF40 stream with diff + extra blocks
        // source[0..12] = "SanctuaryOS_", diff zeros -> "SanctuaryOS_"
        // extra "Patched", seek +7 (now at index 19: "_Engine_Payload_v1", len 18)
        // add 18 bytes: first 17 zeros ("_Engine_Payload_v"), byte 17 = b'2'.wrapping_sub(b'1'), extra "!!"
        let mut c2 = Vec::new();
        c2.extend_from_slice(&encode_bsdiff_offtin(12));
        c2.extend_from_slice(&encode_bsdiff_offtin(7));
        c2.extend_from_slice(&encode_bsdiff_offtin(7));
        c2.extend_from_slice(&encode_bsdiff_offtin(18));
        c2.extend_from_slice(&encode_bsdiff_offtin(2));
        c2.extend_from_slice(&encode_bsdiff_offtin(0));

        let mut d2 = vec![0u8; 12 + 18];
        d2[12 + 17] = b'2'.wrapping_sub(b'1');
        let e2 = b"Patched!!";

        let bz = |raw: &[u8]| -> Vec<u8> {
            let mut enc = BzEncoder::new(Vec::new(), Compression::default());
            enc.write_all(raw).unwrap();
            enc.finish().unwrap()
        };
        let bz_ctrl = bz(&c2);
        let bz_diff = bz(&d2);
        let bz_extra = bz(e2);

        let mut bsdiff_patch = Vec::new();
        bsdiff_patch.extend_from_slice(b"BSDIFF40");
        bsdiff_patch.extend_from_slice(&encode_bsdiff_offtin(bz_ctrl.len() as i64));
        bsdiff_patch.extend_from_slice(&encode_bsdiff_offtin(bz_diff.len() as i64));
        bsdiff_patch.extend_from_slice(&encode_bsdiff_offtin(target.len() as i64));
        bsdiff_patch.extend_from_slice(&bz_ctrl);
        bsdiff_patch.extend_from_slice(&bz_diff);
        bsdiff_patch.extend_from_slice(&bz_extra);

        let patched_bs = apply_binary_patch_bytes(source, &bsdiff_patch).unwrap();
        assert_eq!(patched_bs.as_slice(), target);

        // 2. Real VCDIFF / xdelta3 RFC 3284 window with VCD_SOURCE + COPY + ADD + VCD_ADLER32
        let mut data_sec = Vec::new();
        data_sec.extend_from_slice(b"Patched");
        data_sec.extend_from_slice(b"2!!");

        let mut inst_sec = Vec::new();
        // Op1: COPY 12 bytes (mode 0 VCD_SELF -> index 19 + (12 - 3) = 28)
        inst_sec.push(28);
        // Op2: ADD 7 bytes (ADD 7 -> index 1 + 7 = 8)
        inst_sec.push(8);
        // Op3: COPY 17 bytes (mode 0 -> index 19 + (17 - 3) = 33)
        inst_sec.push(33);
        // Op4: ADD 3 bytes (ADD 3 -> index 1 + 3 = 4)
        inst_sec.push(4);

        let mut addr_sec = Vec::new();
        push_vcdiff_varint(&mut addr_sec, 0); // copy "SanctuaryOS_" from source[0..12]
        push_vcdiff_varint(&mut addr_sec, 19); // copy "_Engine_Payload_v" from source[19..36]

        let adler = adler32_checksum(target);
        let mut delta_body = Vec::new();
        push_vcdiff_varint(&mut delta_body, target.len());
        delta_body.push(0); // delta_indicator
        push_vcdiff_varint(&mut delta_body, data_sec.len());
        push_vcdiff_varint(&mut delta_body, inst_sec.len());
        push_vcdiff_varint(&mut delta_body, addr_sec.len());
        delta_body.extend_from_slice(&adler.to_be_bytes());
        delta_body.extend_from_slice(&data_sec);
        delta_body.extend_from_slice(&inst_sec);
        delta_body.extend_from_slice(&addr_sec);

        let mut vcdiff_patch = vec![0xD6, 0xC3, 0xC4, 0x00, 0x00];
        vcdiff_patch.push(0x01 | 0x04); // VCD_SOURCE | VCD_ADLER32
        push_vcdiff_varint(&mut vcdiff_patch, source.len());
        push_vcdiff_varint(&mut vcdiff_patch, 0);
        push_vcdiff_varint(&mut vcdiff_patch, delta_body.len());
        vcdiff_patch.extend_from_slice(&delta_body);

        let patched_vc = apply_binary_patch_bytes(source, &vcdiff_patch).unwrap();
        assert_eq!(patched_vc.as_slice(), target);

        // Tamper Adler-32 check in VCDIFF window -> must fail cleanly
        let mut bad_vc = vcdiff_patch.clone();
        let last_adler_offset = bad_vc.len() - data_sec.len() - inst_sec.len() - addr_sec.len() - 1;
        bad_vc[last_adler_offset] ^= 0xFF;
        assert!(apply_binary_patch_bytes(source, &bad_vc).is_err());

        // On-disk apply_binary_patch_file with SHA-256 verification
        let root = std::env::temp_dir().join(format!("sanctuary_patch_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let src_file = root.join("src.bin");
        let patch_file = root.join("patch.xdelta");
        let out_file = root.join("out.bin");
        std::fs::write(&src_file, source).unwrap();
        std::fs::write(&patch_file, &vcdiff_patch).unwrap();

        let mut sh = Sha256::new();
        sh.update(target);
        let expected_sha = hex::encode(sh.finalize());
        assert_eq!(
            apply_binary_patch_file(&src_file, &patch_file, &out_file, Some(&expected_sha), &[root.clone()]).unwrap(),
            expected_sha
        );
        assert_eq!(std::fs::read(&out_file).unwrap(), target);
        assert!(
            apply_binary_patch_file(&src_file, &patch_file, &out_file, Some("0000"), &[root.clone()]).is_err()
        );
        let _ = std::fs::remove_dir_all(&root);
    }
}
