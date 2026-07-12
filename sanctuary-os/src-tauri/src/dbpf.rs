use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct DbpfResource {
    pub t: u32,
    pub g: u32,
    pub i: u64,
}

pub fn read_dbpf_index(path: &Path) -> Result<Vec<DbpfResource>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);
    let mut buffer = [0u8; 72];
    
    if reader.read_exact(&mut buffer).is_err() || &buffer[0..4] != b"DBPF" {
        return Err("Not a valid DBPF file".into());
    }

    let major = u32::from_le_bytes(buffer[4..8].try_into().unwrap());
    let minor = u32::from_le_bytes(buffer[8..12].try_into().unwrap());
    let index_count = u32::from_le_bytes(buffer[36..40].try_into().unwrap());

    if index_count == 0 || index_count > 1_000_000 {
        return Err("Invalid index count".into());
    }

    let (index_size, index_offset) = if major == 2 && minor == 0 {
        let offset = u32::from_le_bytes(buffer[40..44].try_into().unwrap()) as u64;
        let size = u32::from_le_bytes(buffer[44..48].try_into().unwrap());
        (size, offset)
    } else {
        let size = u32::from_le_bytes(buffer[40..44].try_into().unwrap());
        let offset = u64::from_le_bytes(buffer[64..72].try_into().unwrap());
        (size, offset)
    };

    if reader.seek(SeekFrom::Start(index_offset)).is_err() {
        return Err("Failed to seek to index".into());
    }

    let mut flags_buf = [0u8; 4];
    if reader.read_exact(&mut flags_buf).is_err() {
        return Err("Failed to read flags".into());
    }

    let flags = u32::from_le_bytes(flags_buf);
    let mut const_bytes = 4;
    let mut const_type = 0u32;
    let mut const_group = 0u32;
    let mut const_inst_ex = 0u32;

    if flags & 0x01 != 0 {
        let mut b = [0u8; 4];
        let _ = reader.read_exact(&mut b);
        const_type = u32::from_le_bytes(b);
        const_bytes += 4;
    }
    if flags & 0x02 != 0 {
        let mut b = [0u8; 4];
        let _ = reader.read_exact(&mut b);
        const_group = u32::from_le_bytes(b);
        const_bytes += 4;
    }
    if flags & 0x04 != 0 {
        let mut b = [0u8; 4];
        let _ = reader.read_exact(&mut b);
        const_inst_ex = u32::from_le_bytes(b);
        const_bytes += 4;
    }

    let record_size = if index_count > 0 {
        index_size.saturating_sub(const_bytes) / index_count
    } else {
        0
    };

    let mut resources = Vec::with_capacity(index_count as usize);

    for _ in 0..index_count {
        let mut bytes_read = 0;
        let mut t = const_type;
        let mut g = const_group;
        let mut i_ex = const_inst_ex;

        if flags & 0x01 == 0 {
            let mut b = [0u8; 4];
            if reader.read_exact(&mut b).is_err() { break; }
            t = u32::from_le_bytes(b);
            bytes_read += 4;
        }
        if flags & 0x02 == 0 {
            let mut b = [0u8; 4];
            if reader.read_exact(&mut b).is_err() { break; }
            g = u32::from_le_bytes(b);
            bytes_read += 4;
        }
        if flags & 0x04 == 0 {
            let mut b = [0u8; 4];
            if reader.read_exact(&mut b).is_err() { break; }
            i_ex = u32::from_le_bytes(b);
            bytes_read += 4;
        }

        let mut b4 = [0u8; 4];
        if reader.read_exact(&mut b4).is_err() { break; }
        let i_low = u32::from_le_bytes(b4);
        bytes_read += 4;

        let skip_bytes = record_size.saturating_sub(bytes_read);
        if skip_bytes > 0 {
            if reader.seek(SeekFrom::Current(skip_bytes as i64)).is_err() { break; }
        }

        let i = ((i_ex as u64) << 32) | (i_low as u64);
        
        resources.push(DbpfResource { t, g, i });
    }

    Ok(resources)
}
