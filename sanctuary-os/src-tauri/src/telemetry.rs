use sysinfo::{System, Disks};

#[derive(serde::Serialize)]
pub struct SystemTelemetry {
    pub logical_cores: usize,
    pub physical_cores: usize,
    pub total_memory: u64,
    pub total_swap: u64,
    pub host_os: String,
    pub disk_total: u64,
    pub disk_used: u64,
}

#[tauri::command]
pub async fn fetch_system_telemetry() -> Result<SystemTelemetry, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let disks = Disks::new_with_refreshed_list();
    let mut disk_total = 0;
    let mut disk_used = 0;
    
    for disk in disks.list() {
        disk_total += disk.total_space();
        disk_used += disk.total_space() - disk.available_space();
    }
    
    Ok(SystemTelemetry {
        logical_cores: sys.cpus().len(),
        physical_cores: sysinfo::System::physical_core_count().unwrap_or(0),
        total_memory: sys.total_memory(),
        total_swap: sys.total_swap(),
        host_os: System::long_os_version().unwrap_or_else(|| "Unknown".to_string()),
        disk_total,
        disk_used,
    })
}

#[tauri::command]
pub async fn get_directory_size(path: String) -> Result<u64, String> {
    let mut total_size = 0;
    for entry in walkdir::WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
        if let Ok(metadata) = entry.metadata() {
            total_size += metadata.len();
        }
    }
    Ok(total_size)
}
