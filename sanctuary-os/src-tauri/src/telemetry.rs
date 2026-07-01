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
    let sys_mutex = SYS.get_or_init(|| {
        let mut s = sysinfo::System::new();
        s.refresh_cpu_usage();
        s.refresh_memory();
        Mutex::new(s)
    });

    let mut sys = sys_mutex.lock().map_err(|_| "Failed to lock system mutex")?;
    sys.refresh_memory();
    sys.refresh_cpu_usage();
    
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

#[derive(serde::Serialize)]
pub struct AppFootprint {
    pub memory_used: u64,
    pub memory_private: u64,
    pub cpu_usage: f32,
    pub disk_read: u64,
    pub disk_written: u64,
}

#[cfg(target_os = "windows")]
fn get_private_usage() -> u64 {
    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS_EX};
    use windows::Win32::System::Threading::GetCurrentProcess;
    use std::mem::size_of;
    
    unsafe {
        let process = GetCurrentProcess();
        let mut counters = PROCESS_MEMORY_COUNTERS_EX::default();
        let cb = size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
        
        if GetProcessMemoryInfo(process, &mut counters as *mut _ as *mut _, cb).is_ok() {
            counters.PrivateUsage as u64
        } else {
            0
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn get_private_usage() -> u64 {
    0
}

use std::sync::{Mutex, OnceLock};

static SYS: OnceLock<Mutex<sysinfo::System>> = OnceLock::new();

#[tauri::command]
pub async fn fetch_app_footprint() -> Result<AppFootprint, String> {
    let pid = sysinfo::get_current_pid().map_err(|e| e.to_string())?;
    
    let sys_mutex = SYS.get_or_init(|| {
        Mutex::new(sysinfo::System::new())
    });

    let mut sys = sys_mutex.lock().map_err(|_| "Failed to lock system mutex")?;
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
    
    if let Some(process) = sys.process(pid) {
        let disk_usage = process.disk_usage();
        Ok(AppFootprint {
            memory_used: process.memory(),
            memory_private: get_private_usage(),
            cpu_usage: process.cpu_usage(),
            disk_read: disk_usage.read_bytes,
            disk_written: disk_usage.written_bytes,
        })
    } else {
        Err("Process not found".to_string())
    }
}
