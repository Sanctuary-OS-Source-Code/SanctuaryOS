use super::{airgap::*, lab_session::*};

mod lab_safety_tests {
    use super::*;

    fn make_test_schema(save_folders: Vec<&str>, save_exts: Vec<&str>) -> Option<crate::schema::GameSchema> {
        let json = serde_json::json!({
            "id": "unit_test_engine",
            "game_id": "unit_test_engine",
            "display_name": "Unit Test Engine",
            "executable_names": [],
            "time_capsule": {
                "save_airgap_targets": save_folders,
                "world_state_targets": [],
                "engine_state_targets": []
            },
            "lab_verification": {
                "required_active_seconds": 60,
                "require_focus": true,
                "require_save_checkpoint": true,
                "save_extensions": save_exts
            }
        });
        Some(serde_json::from_value(json).expect("valid test schema"))
    }

    #[test]
    fn test_dual_vault_airgap_evacuates_mirrors_and_heals_external_tampering() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_airgap_test_{}",
            uuid::Uuid::new_v4()
        ));
        let docs_dir = base.join("UserData");
        let vault_dir = base.join("Vault");
        let live_saves = docs_dir.join("SaveSlots");
        std::fs::create_dir_all(&live_saves).unwrap();
        std::fs::create_dir_all(&vault_dir).unwrap();

        let original_save_bytes = b"{\"world\":\"PreciousUserCampaign\",\"playtime_hours\":412,\"gold\":999999}";
        let live_slot_path = live_saves.join("campaign_01.json");
        std::fs::write(&live_slot_path, original_save_bytes).unwrap();

        // Include case-variant duplicate targets ("SaveSlots" + "saveslots") to verify zero double-swap!
        let schema = make_test_schema(vec!["SaveSlots", "saveslots"], vec![".json"]);
        let storage = resolve_airgap_storage_paths(
            &docs_dir,
            Some(&vault_dir.to_string_lossy()),
        );

        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            true,
            &schema,
        )
        .expect("Airgap enable must succeed");

        // Live folder is now an isolated sandbox; original save is NOT in live folder,
        // and ZERO .sanctuary_* marker files/folders exist inside docs_dir (EA App / Steam Cloud safe)!
        assert!(!live_saves.join("campaign_01.json").exists());
        assert!(!live_saves.join(".sanctuary_sandbox_marker").exists());
        assert!(!docs_dir.join(".sanctuary_lab_airgap").exists());
        assert!(!docs_dir.join(".sanctuary_lab_sandbox").exists());

        // Write a sandbox test save inside the live folder during test
        std::fs::write(
            live_saves.join("sandbox_run.json"),
            b"{\"world\":\"DisposableLabSandboxRun\"}",
        )
        .unwrap();

        // Simulate catastrophic user/external interference: delete the primary airgap save folder!
        let primary_airgap_target = storage.primary_airgap_root.join("SaveSlots");
        set_tree_readonly(&primary_airgap_target, false);
        std::fs::remove_dir_all(&primary_airgap_target).unwrap();
        assert!(!primary_airgap_target.exists());

        // Re-invoke enable=true while primary airgap folder is missing: must STILL refuse to overwrite the Vault mirror!
        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            true,
            &schema,
        )
        .expect("Idempotent airgap re-enable must succeed safely");

        // Now disable airgap: must self-heal from external Vault mirror and restore campaign_01.json byte-for-byte!
        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            false,
            &schema,
        )
        .expect("Airgap restore must self-heal from Vault mirror");

        let restored = std::fs::read(live_saves.join("campaign_01.json"))
            .expect("Original campaign save must be restored");
        assert_eq!(restored.as_slice(), original_save_bytes);

        // Immortal Secondary Vault Mirror MUST remain intact even after airgap is disabled!
        assert!(storage
            .secondary_vault_mirror
            .join("SaveSlots")
            .join("campaign_01.json")
            .exists());

        set_tree_readonly(&storage.primary_airgap_root, false);
        set_tree_readonly(&storage.secondary_vault_mirror, false);
        let _ = std::fs::remove_dir_all(&storage.primary_airgap_root);
        let _ = std::fs::remove_dir_all(&storage.sandbox_root);
        let _ = std::fs::remove_dir_all(&storage.secondary_vault_mirror);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_crash_stranded_airgap_recovery_from_stale_instance() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_crash_rec_{}",
            uuid::Uuid::new_v4()
        ));
        let docs_dir = base.join("UserData");
        let vault_dir = base.join("Vault");
        let live_saves = docs_dir.join("Profiles");
        std::fs::create_dir_all(&live_saves).unwrap();
        std::fs::create_dir_all(&vault_dir).unwrap();

        let payload = vec![0x42u8; 8192];
        std::fs::write(live_saves.join("slot_alpha"), &payload).unwrap();

        // Generic schema with empty save_extensions = [] (extensionless save files!)
        let schema = make_test_schema(vec!["Profiles"], vec![]);
        let storage = resolve_airgap_storage_paths(
            &docs_dir,
            Some(&vault_dir.to_string_lossy()),
        );

        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            true,
            &schema,
        )
        .unwrap();

        // Simulate OS reboot / crashed previous app session by stamping a stale runtime instance_id
        let marker_file = storage.primary_airgap_root.join(".airgap_active.json");
        std::fs::write(
            &marker_file,
            r#"{"active":true,"instance_id":"crashed-old-os-boot-uuid","targets":["Profiles"]}"#,
        )
        .unwrap();

        let report = recover_stranded_airgap_if_needed(
            &docs_dir,
            &vault_dir.to_string_lossy(),
            &schema,
        )
        .expect("Stranded crash recovery must succeed");
        assert!(report.recovered);
        assert_eq!(
            std::fs::read(live_saves.join("slot_alpha")).unwrap(),
            payload
        );

        set_tree_readonly(&storage.primary_airgap_root, false);
        set_tree_readonly(&storage.secondary_vault_mirror, false);
        let _ = std::fs::remove_dir_all(&storage.primary_airgap_root);
        let _ = std::fs::remove_dir_all(&storage.sandbox_root);
        let _ = std::fs::remove_dir_all(&storage.secondary_vault_mirror);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_stage2_never_starts_countdown_on_main_menu_stream_or_empty_scratch_dir() {
        let dir = std::env::temp_dir().join(format!(
            "sanctuary_stage2_menu_guard_{}",
            uuid::Uuid::new_v4()
        ));
        let empty_scratch = dir.join("saves").join("scratch");
        std::fs::create_dir_all(&empty_scratch).unwrap();

        let scratch_subdirs = vec!["saves/scratch".to_string()];
        let initial_scratch = snapshot_scratch_files(&dir, &scratch_subdirs);
        assert!(initial_scratch.is_empty());
        assert!(
            !has_post_menu_scratch_file_activity(&dir, &scratch_subdirs, &initial_scratch, 0),
            "An empty scratch directory must NEVER count as post-menu world load activity"
        );

        let mut baseline_ram = 2_566 * 1024 * 1024u64;
        let mut baseline_disk = 120 * 1024 * 1024u64;
        let mut menu_had_focused_input = false;
        let mut menu_active_secs = 0u32;
        let mut settle_ticks = 0u32;
        let mut post_settle_input_ticks = 0u32;

        // 1. Reproduce exact live bug: game streams 3D Main Menu scene to 3,516 MB (+37%) with 31 MB disk while unfocused
        for _ in 0..5 {
            let triggered = evaluate_stage2_world_loaded(
                &Stage2TickInput {
                    dt: 1,
                    require_focus: true,
                    is_focused: false,
                    matched_process_stopped: false,
                    current_idle_seconds: 0,
                    current_ram_bytes: 3_516 * 1024 * 1024,
                    ram_diff_bytes: 2 * 1024 * 1024,
                    cumulative_disk_read_bytes: baseline_disk + 31 * 1024 * 1024,
                    disk_io_bytes_this_tick: 2 * 1024 * 1024,
                    disk_rate_mb: 2,
                    min_disk_read_mb: 75,
                    min_ram_step_percent: 20,
                    warm_cache_ram_step_percent: 35,
                    scratch_file_created: false,
                    scratch_modified_recently: false,
                },
                &mut baseline_ram,
                &mut baseline_disk,
                &mut menu_had_focused_input,
                &mut menu_active_secs,
                &mut settle_ticks,
                &mut post_settle_input_ticks,
            );
            assert!(!triggered, "Main Menu streaming while unfocused must NEVER start Stage 3");
        }
        assert!(!menu_had_focused_input);
        assert_eq!(baseline_ram, 3_516 * 1024 * 1024);

        // 2. Player focuses the Main Menu and clicks Resume/Load Game -> world streams +110 MB disk & +720 MB RAM
        let world_ram = baseline_ram + 720 * 1024 * 1024;
        let world_disk = baseline_disk + 110 * 1024 * 1024;
        let loading_screen_tick = evaluate_stage2_world_loaded(
            &Stage2TickInput {
                dt: 1,
                require_focus: true,
                is_focused: true,
                matched_process_stopped: false,
                current_idle_seconds: 0,
                current_ram_bytes: world_ram,
                ram_diff_bytes: 95 * 1024 * 1024,
                cumulative_disk_read_bytes: world_disk,
                disk_io_bytes_this_tick: 24 * 1024 * 1024,
                disk_rate_mb: 24,
                min_disk_read_mb: 75,
                min_ram_step_percent: 20,
                warm_cache_ram_step_percent: 35,
                scratch_file_created: false,
                scratch_modified_recently: false,
            },
            &mut baseline_ram,
            &mut baseline_disk,
            &mut menu_had_focused_input,
            &mut menu_active_secs,
            &mut settle_ticks,
            &mut post_settle_input_ticks,
        );
        assert!(menu_had_focused_input);
        assert!(!loading_screen_tick, "Must wait until loading screen disk burst settles");

        // 3. Mid-loading-screen lull: disk reads dip to 0 MB/s while RAM still instantiates meshes/shaders (+42 MB/s)
        //    or scratch files are still being unpacked -> MUST NOT settle or start Stage 3!
        for scratch_busy in [false, true] {
            let mid_load = evaluate_stage2_world_loaded(
                &Stage2TickInput {
                    dt: 1,
                    require_focus: true,
                    is_focused: true,
                    matched_process_stopped: false,
                    current_idle_seconds: 0,
                    current_ram_bytes: world_ram + 42 * 1024 * 1024,
                    ram_diff_bytes: if scratch_busy { 512 * 1024 } else { 42 * 1024 * 1024 },
                    cumulative_disk_read_bytes: world_disk,
                    disk_io_bytes_this_tick: 512 * 1024,
                    disk_rate_mb: 0,
                    min_disk_read_mb: 75,
                    min_ram_step_percent: 20,
                    warm_cache_ram_step_percent: 35,
                    scratch_file_created: true,
                    scratch_modified_recently: scratch_busy,
                },
                &mut baseline_ram,
                &mut baseline_disk,
                &mut menu_had_focused_input,
                &mut menu_active_secs,
                &mut settle_ticks,
                &mut post_settle_input_ticks,
            );
            assert!(!mid_load, "Mid-load RAM surges or active scratch unpacking must never start Stage 3");
            assert_eq!(settle_ticks, 0);
        }

        // 4. 2-Stage Map -> Household Lot Loading Screen:
        //    Map screen settles for 4 quiet ticks, player clicks Household (tick 4), then lot loading burst starts -> resets!
        for i in 0..4 {
            let map_tick = evaluate_stage2_world_loaded(
                &Stage2TickInput {
                    dt: 1,
                    require_focus: true,
                    is_focused: true,
                    matched_process_stopped: false,
                    current_idle_seconds: if i == 3 { 0 } else { 3 },
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 1024 * 1024,
                    cumulative_disk_read_bytes: world_disk,
                    disk_io_bytes_this_tick: 512 * 1024,
                    disk_rate_mb: 0,
                    min_disk_read_mb: 75,
                    min_ram_step_percent: 20,
                    warm_cache_ram_step_percent: 35,
                    scratch_file_created: true,
                    scratch_modified_recently: false,
                },
                &mut baseline_ram,
                &mut baseline_disk,
                &mut menu_had_focused_input,
                &mut menu_active_secs,
                &mut settle_ticks,
                &mut post_settle_input_ticks,
            );
            assert!(!map_tick, "Clicking Household on World Map must wait 1 verification tick before starting");
        }
        assert_eq!(post_settle_input_ticks, 1);

        // Lot loading screen kicks off right after clicking the Household -> resets back to waiting!
        let lot_burst = evaluate_stage2_world_loaded(
            &Stage2TickInput {
                dt: 1,
                require_focus: true,
                is_focused: true,
                matched_process_stopped: false,
                current_idle_seconds: 2,
                current_ram_bytes: world_ram + 160 * 1024 * 1024,
                ram_diff_bytes: 55 * 1024 * 1024,
                cumulative_disk_read_bytes: world_disk + 35 * 1024 * 1024,
                disk_io_bytes_this_tick: 18 * 1024 * 1024,
                disk_rate_mb: 18,
                min_disk_read_mb: 75,
                min_ram_step_percent: 20,
                warm_cache_ram_step_percent: 35,
                scratch_file_created: true,
                scratch_modified_recently: true,
            },
            &mut baseline_ram,
            &mut baseline_disk,
            &mut menu_had_focused_input,
            &mut menu_active_secs,
            &mut settle_ticks,
            &mut post_settle_input_ticks,
        );
        assert!(!lot_burst);
        assert_eq!(settle_ticks, 0);
        assert_eq!(post_settle_input_ticks, 0);

        // 5. Household lot finishes loading: 4 quiet settled ticks + live player input + 1 settled verification tick -> Stage 3 starts!
        let final_ram = world_ram + 160 * 1024 * 1024;
        let final_disk = world_disk + 35 * 1024 * 1024;
        for i in 0..5 {
            let started = evaluate_stage2_world_loaded(
                &Stage2TickInput {
                    dt: 1,
                    require_focus: true,
                    is_focused: true,
                    matched_process_stopped: false,
                    current_idle_seconds: if i >= 3 { 0 } else { 2 },
                    current_ram_bytes: final_ram,
                    ram_diff_bytes: 1024 * 1024,
                    cumulative_disk_read_bytes: final_disk,
                    disk_io_bytes_this_tick: 256 * 1024,
                    disk_rate_mb: 0,
                    min_disk_read_mb: 75,
                    min_ram_step_percent: 20,
                    warm_cache_ram_step_percent: 35,
                    scratch_file_created: true,
                    scratch_modified_recently: false,
                },
                &mut baseline_ram,
                &mut baseline_disk,
                &mut menu_had_focused_input,
                &mut menu_active_secs,
                &mut settle_ticks,
                &mut post_settle_input_ticks,
            );
            if i < 4 {
                assert!(!started);
            } else {
                assert!(started, "Stage 3 must start cleanly once world settles and player interacts in live gameplay");
            }
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_save_corruption_audit_catches_truncation_nulls_and_broken_containers() {
        let dir = std::env::temp_dir().join(format!(
            "sanctuary_save_audit_{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        // 1. Null-zeroed crash file -> rejected
        let null_save = dir.join("crashed_zero.bin");
        std::fs::write(&null_save, vec![0u8; 4096]).unwrap();
        assert!(audit_save_file_corruption(&null_save, None).is_err());

        // 2. Truncated JSON save (missing closing brace) -> rejected
        let bad_json = dir.join("truncated.json");
        std::fs::write(&bad_json, b"{\"player\":\"Hero\",\"inventory\":[\"sword\",\"shield\"").unwrap();
        assert!(audit_save_file_corruption(&bad_json, None).is_err());

        // 3. Valid JSON save -> accepted
        let good_json = dir.join("valid.json");
        std::fs::write(&good_json, b"{\"player\":\"Hero\",\"inventory\":[\"sword\",\"shield\"]}\n").unwrap();
        assert!(audit_save_file_corruption(&good_json, None).is_ok());

        // 4. Truncated ZIP container (PK\x03\x04 without PK\x05\x06 EOCD) -> rejected
        let bad_zip = dir.join("truncated_world.sav");
        let mut fake_zip = b"PK\x03\x04".to_vec();
        fake_zip.extend_from_slice(&[0x14; 128]);
        std::fs::write(&bad_zip, &fake_zip).unwrap();
        assert!(audit_save_file_corruption(&bad_zip, None).is_err());

        // 5. Catastrophic size collapse (< 25% of >= 4KB baseline) -> rejected
        let collapsed = dir.join("collapsed.bin");
        std::fs::write(&collapsed, &[0xAB; 512]).unwrap();
        assert!(audit_save_file_corruption(&collapsed, Some(32_768)).is_err());
        assert!(audit_save_file_corruption(&collapsed, Some(600)).is_ok());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_stage3_timer_stops_on_unfocused_idle_and_pause_menu_cheese() {
        let baseline_ram = 2_400 * 1024 * 1024u64;
        let world_ram = 3_200 * 1024 * 1024u64;
        let mut peak_world_delta = world_ram - baseline_ram;
        let mut elapsed = 0u32;
        let mut pending_idle = 0u32;
        let mut input_mask = 0u16;
        let mut ticks = 0u32;
        let mut cpu_ema = 0.0f32;
        let mut freeze_ticks = 0u32;
        let mut consecutive_active = 0u32;
        let mut loading_cooldown = 0u32;

        // 1. 10 seconds of active focused gameplay -> timer advances cleanly to 10s
        for _ in 0..10 {
            let reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 6 * 1024 * 1024,
                    disk_io_bytes_this_tick: 128 * 1024,
                    current_cpu_usage: 52.0,
                    current_idle_seconds: 0,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(reason, None);
        }
        assert_eq!(elapsed, 10);

        // 2. Normal indoor CPU dip while actively playing (`idle == 0..=2`, low RAM/Disk delta)
        //    -> MUST NOT throw a false `GAME_PAUSED`!
        for idle_s in 0..=2 {
            let reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 128 * 1024,
                    disk_io_bytes_this_tick: 0,
                    current_cpu_usage: 20.0,
                    current_idle_seconds: idle_s,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(reason, None, "Active input must never trigger false CPU-freeze pause");
        }
        assert_eq!(elapsed, 13);
        assert_eq!(freeze_ticks, 0);

        // 3. Watching an in-game interaction hands-off for 6s (`idle = 1..=6` within `max_idle_seconds: 10`)
        //    followed by resuming active input -> zero false IDLE pause and seamless cadence bridge!
        for idle_s in 1..=6 {
            let reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 2 * 1024 * 1024,
                    disk_io_bytes_this_tick: 64 * 1024,
                    current_cpu_usage: 45.0,
                    current_idle_seconds: idle_s,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(reason, None, "Short animation-watch pause must not throw false IDLE");
        }
        assert_eq!(elapsed, 16);
        assert_eq!(pending_idle, 3);

        for _ in 0..2 {
            let reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 4 * 1024 * 1024,
                    disk_io_bytes_this_tick: 128 * 1024,
                    current_cpu_usage: 48.0,
                    current_idle_seconds: 0,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(reason, None);
        }
        assert_eq!(elapsed, 21);
        assert_eq!(pending_idle, 0);

        // 4. Player presses Esc / Pause hotkey (`hotkey_paused: true`) and keeps moving mouse around the Pause Menu
        //    -> IMMEDIATELY pauses with GAME_PAUSED and credits 0 seconds!
        for _ in 0..4 {
            let esc_reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: true,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 6 * 1024 * 1024,
                    disk_io_bytes_this_tick: 64 * 1024,
                    current_cpu_usage: 40.0,
                    current_idle_seconds: 0, // moving mouse inside Esc menu!
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(esc_reason.as_deref(), Some("GAME_PAUSED"));
        }
        assert_eq!(elapsed, 21);

        // 5. Player goes hands-off past `max_idle_seconds: 10` -> wipes buffered pending_idle to 0 and flags IDLE!
        for idle_s in 4..=11 {
            let reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 4 * 1024 * 1024,
                    disk_io_bytes_this_tick: 128 * 1024,
                    current_cpu_usage: 44.0,
                    current_idle_seconds: idle_s,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
            assert_eq!(elapsed, 21);
            if idle_s <= 10 {
                assert_eq!(reason, None);
            } else {
                assert_eq!(reason.as_deref(), Some("IDLE"));
                assert_eq!(pending_idle, 0);
            }
        }

        // 6. Alt-tabbing / unfocused stops immediately and discards buffered grace seconds
        let _ = evaluate_stage3_pause_and_credit(
            &Stage3TickMetrics {
                dt: 1,
                matched_process_stopped: false,
                require_focus: true,
                is_focused: true,
                hotkey_paused: false,
                baseline_ram_bytes: baseline_ram,
                current_ram_bytes: world_ram,
                ram_diff_bytes: 4 * 1024 * 1024,
                disk_io_bytes_this_tick: 128 * 1024,
                current_cpu_usage: 44.0,
                current_idle_seconds: 5,
                max_idle_seconds: 10,
                required_active_seconds: 120,
            },
            &mut peak_world_delta,
            &mut elapsed,
            &mut pending_idle,
            &mut input_mask,
            &mut ticks,
            &mut cpu_ema,
            &mut freeze_ticks,
            &mut consecutive_active,
            &mut loading_cooldown,
        );
        assert_eq!(pending_idle, 1);
        let unfocused_reason = evaluate_stage3_pause_and_credit(
            &Stage3TickMetrics {
                dt: 1,
                matched_process_stopped: false,
                require_focus: true,
                is_focused: false,
                hotkey_paused: false,
                baseline_ram_bytes: baseline_ram,
                current_ram_bytes: world_ram,
                ram_diff_bytes: 4 * 1024 * 1024,
                disk_io_bytes_this_tick: 128 * 1024,
                current_cpu_usage: 44.0,
                current_idle_seconds: 0,
                max_idle_seconds: 10,
                required_active_seconds: 120,
            },
            &mut peak_world_delta,
            &mut elapsed,
            &mut pending_idle,
            &mut input_mask,
            &mut ticks,
            &mut cpu_ema,
            &mut freeze_ticks,
            &mut consecutive_active,
            &mut loading_cooldown,
        );
        assert_eq!(unfocused_reason.as_deref(), Some("UNFOCUSED"));
        assert_eq!(pending_idle, 0);
        assert_eq!(elapsed, 21);

        // 7. Hands-off frozen simulation (`idle >= 3`, static RAM/Disk, `< active_cpu_ema * 0.45` for 3 ticks)
        //    -> catches GAME_PAUSED and discards pending_idle!
        freeze_ticks = 0;
        let mut modal_pause_reason = None;
        for idle_s in 4..=6 {
            modal_pause_reason = evaluate_stage3_pause_and_credit(
                &Stage3TickMetrics {
                    dt: 1,
                    matched_process_stopped: false,
                    require_focus: true,
                    is_focused: true,
                    hotkey_paused: false,
                    baseline_ram_bytes: baseline_ram,
                    current_ram_bytes: world_ram,
                    ram_diff_bytes: 128 * 1024,
                    disk_io_bytes_this_tick: 0,
                    current_cpu_usage: 14.0,
                    current_idle_seconds: idle_s,
                    max_idle_seconds: 10,
                    required_active_seconds: 120,
                },
                &mut peak_world_delta,
                &mut elapsed,
                &mut pending_idle,
                &mut input_mask,
                &mut ticks,
                &mut cpu_ema,
                &mut freeze_ticks,
                &mut consecutive_active,
                &mut loading_cooldown,
            );
        }
        assert_eq!(modal_pause_reason.as_deref(), Some("GAME_PAUSED"));
        assert_eq!(pending_idle, 0);
        assert_eq!(elapsed, 21);

        // 8. Heavy secondary lot/zone travel loading burst mid-test -> pauses with LOADING_WORLD
        let zone_load_reason = evaluate_stage3_pause_and_credit(
            &Stage3TickMetrics {
                dt: 1,
                matched_process_stopped: false,
                require_focus: true,
                is_focused: true,
                hotkey_paused: false,
                baseline_ram_bytes: baseline_ram,
                current_ram_bytes: world_ram,
                ram_diff_bytes: 32 * 1024 * 1024,
                disk_io_bytes_this_tick: 28 * 1024 * 1024,
                current_cpu_usage: 55.0,
                current_idle_seconds: 0,
                max_idle_seconds: 10,
                required_active_seconds: 120,
            },
            &mut peak_world_delta,
            &mut elapsed,
            &mut pending_idle,
            &mut input_mask,
            &mut ticks,
            &mut cpu_ema,
            &mut freeze_ticks,
            &mut consecutive_active,
            &mut loading_cooldown,
        );
        assert_eq!(zone_load_reason.as_deref(), Some("LOADING_WORLD"));
        loading_cooldown = 0;

        // 9. Resuming genuine active gameplay clears freeze_ticks and increments cleanly
        let resume_reason = evaluate_stage3_pause_and_credit(
            &Stage3TickMetrics {
                dt: 1,
                matched_process_stopped: false,
                require_focus: true,
                is_focused: true,
                hotkey_paused: false,
                baseline_ram_bytes: baseline_ram,
                current_ram_bytes: world_ram,
                ram_diff_bytes: 6 * 1024 * 1024,
                disk_io_bytes_this_tick: 128 * 1024,
                current_cpu_usage: 48.0,
                current_idle_seconds: 0,
                max_idle_seconds: 10,
                required_active_seconds: 120,
            },
            &mut peak_world_delta,
            &mut elapsed,
            &mut pending_idle,
            &mut input_mask,
            &mut ticks,
            &mut cpu_ema,
            &mut freeze_ticks,
            &mut consecutive_active,
            &mut loading_cooldown,
        );
        assert_eq!(resume_reason, None);
        assert_eq!(elapsed, 22);
    }

    #[test]
    fn test_configure_lab_test_save_accepts_external_file_paths_and_folder_imports() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_save_import_test_{}",
            uuid::Uuid::new_v4()
        ));
        let docs_dir = base.join("UserData");
        let ext_backup_dir = base.join("ExternalBackupSaves");
        std::fs::create_dir_all(&docs_dir).unwrap();
        std::fs::create_dir_all(&ext_backup_dir).unwrap();

        let slot_a = ext_backup_dir.join("Slot_Alpha.json");
        let slot_a_rev = ext_backup_dir.join("Slot_Alpha.json.ver0");
        let slot_b = ext_backup_dir.join("Slot_Beta.json");
        std::fs::write(&slot_a, b"{\"slot\":\"alpha\"}").unwrap();
        std::fs::write(&slot_a_rev, b"{\"slot\":\"alpha_rev0\"}").unwrap();
        std::fs::write(&slot_b, b"{\"slot\":\"beta\"}").unwrap();

        let schema = make_test_schema(vec!["SaveSlots"], vec![".json"]);
        let storage = resolve_airgap_storage_paths(&docs_dir, None);

        let status = configure_lab_test_save_internal(
            &docs_dir.to_string_lossy(),
            "import_to_live_saves",
            None,
            Some(vec![
                slot_a.to_string_lossy().to_string(),
                slot_b.to_string_lossy().to_string(),
            ]),
            &schema,
        )
        .expect("import_to_live_saves with external_file_paths must succeed");

        assert!(status.has_test_save);
        assert_eq!(status.available_live_saves.len(), 2);
        assert!(docs_dir
            .join("SaveSlots")
            .join("Slot_Alpha.json.ver0")
            .exists());
        assert!(storage
            .secondary_vault_mirror
            .join("SaveSlots")
            .join("Slot_Alpha.json")
            .exists());

        set_tree_readonly(&storage.primary_airgap_root, false);
        set_tree_readonly(&storage.secondary_vault_mirror, false);
        let _ = std::fs::remove_dir_all(&storage.primary_airgap_root);
        let _ = std::fs::remove_dir_all(&storage.sandbox_root);
        let _ = std::fs::remove_dir_all(&storage.secondary_vault_mirror);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_lab_deploy_stages_only_selected_mod_and_atomic_twin_never_collection_siblings() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_lab_single_mod_test_{}",
            uuid::Uuid::new_v4()
        ));
        let vault_dir = base.join("Vault");
        let vault_mods = crate::utils::get_vault_mods_lane(&vault_dir.to_string_lossy());
        let pack_dir = vault_mods.join("Garden Collection Pack");
        let live_mods = base.join("LiveMods");
        std::fs::create_dir_all(&pack_dir).unwrap();
        std::fs::create_dir_all(&live_mods).unwrap();

        let target_pkg = pack_dir.join("Juniper_Short.pkg");
        let target_twin = pack_dir.join("Juniper_Short.script");
        let sibling_a = pack_dir.join("Garden_Gate.pkg");
        let sibling_b = pack_dir.join("Picnic_Table.pkg");
        std::fs::write(&target_pkg, b"juniper_mesh").unwrap();
        std::fs::write(&target_twin, b"juniper_logic").unwrap();
        std::fs::write(&sibling_a, b"gate_mesh").unwrap();
        std::fs::write(&sibling_b, b"table_mesh").unwrap();

        let schema_json = serde_json::json!({
            "id": "unit_test_engine",
            "game_id": "unit_test_engine",
            "display_name": "Unit Test Engine",
            "supported_extensions": [".pkg", ".script"]
        });
        let schema: Option<crate::schema::GameSchema> =
            Some(serde_json::from_value(schema_json).unwrap());

        let linked = deploy_single_mod_to_live_sync(
            "Garden Collection Pack/Juniper_Short.pkg",
            None,
            &[],
            false,
            &live_mods.to_string_lossy(),
            &vault_dir.to_string_lossy(),
            &schema,
        )
        .expect("single mod lab deploy should succeed");

        assert_eq!(
            linked.len(),
            2,
            "Expected ONLY Juniper_Short.pkg + Juniper_Short.script twin, got: {:?}",
            linked
        );
        assert!(linked.iter().any(|p| p.ends_with("Juniper_Short.pkg")));
        assert!(linked.iter().any(|p| p.ends_with("Juniper_Short.script")));
        assert!(!linked.iter().any(|p| p.contains("Garden_Gate")));
        assert!(!linked.iter().any(|p| p.contains("Picnic_Table")));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_safe_wipe_mods_dir_clears_subfolders_metadata_and_rescues_real_files() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_wipe_mods_test_{}",
            uuid::Uuid::new_v4()
        ));
        let vault_dir = base.join("Vault");
        let live_mods = base.join("mods");
        let nested_mod_dir = live_mods.join("SubFolderMod");
        std::fs::create_dir_all(&vault_dir).unwrap();
        std::fs::create_dir_all(&nested_mod_dir).unwrap();

        std::fs::write(
            live_mods.join(".sanctuary_deployed_links.json"),
            b"[\"old_link\"]",
        )
        .unwrap();
        std::fs::write(live_mods.join("Manifest.cfg"), b"Priority 500").unwrap();
        std::fs::write(nested_mod_dir.join("RealNestedMod.pkg"), b"real_mod_payload").unwrap();
        std::fs::write(nested_mod_dir.join("mod_settings.cfg"), b"setting=true").unwrap();

        let schema_json = serde_json::json!({
            "id": "unit_test_engine",
            "game_id": "unit_test_engine",
            "display_name": "Unit Test Engine",
            "supported_extensions": [".pkg"],
            "paths": {
                "manifest_file": "Manifest.cfg"
            },
            "load_order": {
                "strategy": "folder_priority"
            }
        });
        let schema: Option<crate::schema::GameSchema> =
            Some(serde_json::from_value(schema_json).unwrap());

        crate::utils::safe_wipe_mods_dir_with_vault(
            &live_mods,
            Some(&vault_dir.to_string_lossy()),
            &schema,
        );

        assert!(
            !live_mods.join(".sanctuary_deployed_links.json").exists(),
            "Internal deployment JSON must be removed during Vault Lockdown"
        );
        assert!(
            !nested_mod_dir.exists(),
            "Subfolders inside mods directory must be evacuated and removed during Vault Lockdown"
        );
        assert!(
            live_mods.join("Manifest.cfg").exists(),
            "Root schema manifest file must remain intact"
        );
        let vault_mods = crate::utils::get_vault_mods_lane(&vault_dir.to_string_lossy());
        assert!(
            vault_mods.join("SubFolderMod").join("RealNestedMod.pkg").exists(),
            "Real nested mod file must be rescued into Vault/Mods"
        );
        assert!(
            vault_mods.join("SubFolderMod").join("mod_settings.cfg").exists(),
            "Nested user config file must also be preserved in Vault/Mods"
        );

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_homestead_sandbox_save_verifies_write_then_rewinds_to_pristine_airgapped_baseline() {
        let base = std::env::temp_dir().join(format!(
            "sanctuary_immutable_homestead_save_{}",
            uuid::Uuid::new_v4()
        ));
        let docs_dir = base.join("UserData");
        let vault_dir = base.join("Vault");
        let live_saves = docs_dir.join("SaveSlots");
        std::fs::create_dir_all(&live_saves).unwrap();
        std::fs::create_dir_all(&vault_dir).unwrap();

        let pristine_save_bytes =
            b"{\"world\":\"CleanHomesteadWorld\",\"tick\":100,\"mod_taint\":false}\n";
        std::fs::write(live_saves.join("Slot_01.json"), pristine_save_bytes).unwrap();

        let schema = make_test_schema(vec!["SaveSlots"], vec![".json"]);
        let storage = resolve_airgap_storage_paths(&docs_dir, Some(&vault_dir.to_string_lossy()));

        // 1. User clones `Slot_01.json` as their Homestead test save
        let configured = configure_lab_test_save_internal(
            &docs_dir.to_string_lossy(),
            "copy_live_save",
            Some("Slot_01.json".to_string()),
            None,
            &schema,
        )
        .expect("copy_live_save must succeed");
        assert!(configured.has_test_save);

        // 2. Test #1 launches (`enable = true`): mounts a disposable writable copy in `docs_dir/SaveSlots`
        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            true,
            &schema,
        )
        .expect("Airgap enable for Test #1 must succeed");

        let working_slot = live_saves.join("Slot_01.json");
        let golden_slot = storage.sandbox_root.join("SaveSlots").join("Slot_01.json");
        assert_eq!(std::fs::read(&working_slot).unwrap(), pristine_save_bytes);
        assert_eq!(std::fs::read(&golden_slot).unwrap(), pristine_save_bytes);

        // 3. During Stage 4 (`AWAITING_SAVE`), the game saves over `working_slot` (and even drops an extra Save-As file)
        let mutated_test1_bytes =
            b"{\"world\":\"CleanHomesteadWorld\",\"tick\":940,\"mod_taint\":true,\"injected_items\":42}\n";
        std::fs::write(&working_slot, mutated_test1_bytes).unwrap();
        std::fs::write(
            live_saves.join("Slot_99_ExtraSaveAs.json"),
            b"{\"extra\":true}\n",
        )
        .unwrap();

        // Stage 4 save serialization audit succeeds on the real in-engine save write...
        assert!(audit_save_file_corruption(&working_slot, Some(pristine_save_bytes.len() as u64)).is_ok());

        // ...and on teardown (`enable = false`), the mutated working copy is DISCARDED while the
        // Homestead test save remains 100% byte-for-byte identical to the pristine airgapped version!
        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            false,
            &schema,
        )
        .expect("Airgap teardown after Test #1 must rewind disposable save");

        assert_eq!(
            std::fs::read(&golden_slot).unwrap().as_slice(),
            pristine_save_bytes,
            "Golden Homestead baseline save must NEVER retain test mutations"
        );
        assert!(
            !storage
                .sandbox_root
                .join("SaveSlots")
                .join("Slot_99_ExtraSaveAs.json")
                .exists(),
            "Extra test-time Save-As files must not pollute the Homestead baseline"
        );
        assert_eq!(
            std::fs::read(live_saves.join("Slot_01.json"))
                .unwrap()
                .as_slice(),
            pristine_save_bytes,
            "User's normal live save must also be restored byte-for-byte"
        );

        // 4. Test #2 launches with a broken mod that corrupts `working_slot` on save -> teardown STILL keeps Homestead save clean!
        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            true,
            &schema,
        )
        .expect("Airgap enable for Test #2 must mount pristine Homestead save again");
        assert_eq!(
            std::fs::read(&working_slot).unwrap().as_slice(),
            pristine_save_bytes,
            "Test #2 must start from the untouched pristine Homestead save"
        );

        std::fs::write(&working_slot, vec![0u8; 4096]).unwrap(); // catastrophic null-zeroed crash write!
        assert!(audit_save_file_corruption(&working_slot, Some(pristine_save_bytes.len() as u64)).is_err());

        apply_save_airgap_with_vault(
            &docs_dir.to_string_lossy(),
            Some(&vault_dir.to_string_lossy()),
            false,
            &schema,
        )
        .expect("Airgap teardown after corrupted Test #2 must discard corrupted working copy");

        assert_eq!(
            std::fs::read(&golden_slot).unwrap().as_slice(),
            pristine_save_bytes,
            "Even after a save-corrupting mod failure, Homestead test save remains 100% uncorrupted!"
        );

        set_tree_readonly(&storage.primary_airgap_root, false);
        set_tree_readonly(&storage.sandbox_root, false);
        set_tree_readonly(&storage.secondary_vault_mirror, false);
        let _ = std::fs::remove_dir_all(&storage.primary_airgap_root);
        let _ = std::fs::remove_dir_all(&storage.sandbox_root);
        let _ = std::fs::remove_dir_all(&storage.secondary_vault_mirror);
        let _ = std::fs::remove_dir_all(&base);
    }
}




