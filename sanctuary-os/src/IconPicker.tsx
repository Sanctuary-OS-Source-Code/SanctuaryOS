import React, { useState, useMemo } from 'react';
import { useLexicon } from './LexiconContext';

export const ICON_CATEGORIES = [
  {
    "name": "General",
    "icons": [
      "star",
      "favorite",
      "warning",
      "info",
      "check_circle",
      "cancel",
      "bolt",
      "local_fire_department",
      "rocket_launch",
      "diamond",
      "science",
      "construction",
      "bug_report",
      "verified",
      "public",
      "language",
      "terminal",
      "memory",
      "dns",
      "hub",
      "api",
      "code",
      "database",
      "cloud",
      "security",
      "shield",
      "lock",
      "key",
      "fingerprint",
      "admin_panel_settings",
      "settings",
      "build",
      "gavel",
      "policy",
      "health_and_safety",
      "monitor_heart",
      "healing",
      "medication",
      "biotech",
      "crisis_alert",
      "notifications_active",
      "flag",
      "tour",
      "explore",
      "map",
      "location_on",
      "my_location",
      "flight_takeoff",
      "sports_esports",
      "smart_toy",
      "psychology",
      "group",
      "person",
      "engineering",
      "architecture",
      "precision_manufacturing",
      "inventory_2",
      "conveyor_belt",
      "factory",
      "warehouse",
      "support_agent",
      "help",
      "article",
      "description",
      "assignment",
      "task_alt",
      "event",
      "schedule",
      "update",
      "history",
      "lightbulb",
      "emoji_objects",
      "wb_sunny",
      "nightlight",
      "palette",
      "brush",
      "format_paint",
      "imagesmode",
      "photo_camera",
      "videocam",
      "mic",
      "volume_up",
      "music_note",
      "play_arrow",
      "pause"
    ]
  },
  {
    "name": "UI Navigation",
    "icons": [
      "menu",
      "search",
      "home",
      "arrow_back",
      "arrow_forward",
      "chevron_left",
      "chevron_right",
      "expand_more",
      "expand_less",
      "close",
      "refresh",
      "sync",
      "done",
      "done_all",
      "apps",
      "more_vert",
      "more_horiz",
      "filter_list",
      "sort",
      "delete",
      "edit",
      "add",
      "remove"
    ]
  },
  {
    "name": "Communication",
    "icons": [
      "email",
      "mail",
      "chat",
      "chat_bubble",
      "forum",
      "call",
      "phone",
      "contact_mail",
      "contact_phone",
      "rss_feed",
      "share",
      "send",
      "drafts",
      "mark_email_read",
      "mark_email_unread"
    ]
  },
  {
    "name": "Files & Storage",
    "icons": [
      "folder",
      "folder_open",
      "folder_shared",
      "create_new_folder",
      "file_download",
      "file_upload",
      "attach_file",
      "cloud_upload",
      "cloud_download",
      "cloud_sync",
      "save",
      "save_alt",
      "upload",
      "download"
    ]
  },
  {
    "name": "E-Commerce & Finance",
    "icons": [
      "shopping_cart",
      "shopping_bag",
      "store",
      "storefront",
      "payment",
      "credit_card",
      "account_balance",
      "account_balance_wallet",
      "receipt",
      "receipt_long",
      "monetization_on",
      "paid",
      "sell",
      "trending_up",
      "trending_down",
      "price_check"
    ]
  },
  {
    "name": "Devices & Hardware",
    "icons": [
      "computer",
      "smartphone",
      "laptop",
      "tablet_mac",
      "tablet_android",
      "keyboard",
      "mouse",
      "print",
      "router",
      "scanner",
      "headphones",
      "watch",
      "tv",
      "speaker",
      "developer_board",
      "cast"
    ]
  },
  {
    "name": "Text Formatting",
    "icons": [
      "format_bold",
      "format_italic",
      "format_underlined",
      "format_strikethrough",
      "format_align_left",
      "format_align_center",
      "format_align_right",
      "format_list_bulleted",
      "format_list_numbered",
      "format_quote",
      "text_fields",
      "spellcheck"
    ]
  },
  {
    "name": "Social & People",
    "icons": [
      "person_add",
      "person_remove",
      "people",
      "people_alt",
      "thumb_up",
      "thumb_down",
      "mood",
      "mood_bad",
      "sentiment_satisfied",
      "sentiment_dissatisfied",
      "emoji_emotions",
      "cake",
      "celebration",
      "volunteer_activism"
    ]
  },
  {
    "name": "Transportation & Travel",
    "icons": [
      "directions_car",
      "local_taxi",
      "directions_bus",
      "train",
      "tram",
      "directions_bike",
      "directions_boat",
      "local_shipping",
      "flight",
      "flight_land",
      "two_wheeler",
      "commute",
      "traffic"
    ]
  },
  {
    "name": "Media & Playback",
    "icons": [
      "stop",
      "skip_next",
      "skip_previous",
      "fast_forward",
      "fast_rewind",
      "volume_off",
      "volume_mute",
      "equalizer",
      "closed_caption",
      "subtitles",
      "queue_music",
      "movie",
      "theaters",
      "radio",
      "cast"
    ]
  },
  {
    "name": "Food & Beverage",
    "icons": [
      "restaurant",
      "local_cafe",
      "local_bar",
      "fastfood",
      "local_pizza",
      "lunch_dining",
      "bakery_dining",
      "set_meal",
      "icecream",
      "liquor",
      "ramen_dining",
      "wine_bar"
    ]
  },
  {
    "name": "Places & Real Estate",
    "icons": [
      "apartment",
      "house",
      "business",
      "location_city",
      "home_work",
      "hotel",
      "cabin",
      "chalet",
      "corporate_fare",
      "cottage",
      "stadium",
      "castle"
    ]
  },
  {
    "name": "Nature & Outdoors",
    "icons": [
      "park",
      "forest",
      "agriculture",
      "nature",
      "nature_people",
      "landscape",
      "eco",
      "water_drop",
      "grass",
      "recycling",
      "cruelty_free",
      "compost"
    ]
  },
  {
    "name": "Weather",
    "icons": [
      "cloudy",
      "rainy",
      "thunderstorm",
      "snowing",
      "air",
      "cyclone",
      "water",
      "tsunami",
      "tornado",
      "sunny_snowing",
      "foggy",
      "severe_cold"
    ]
  },
  {
    "name": "Time & Scheduling",
    "icons": [
      "calendar_month",
      "calendar_today",
      "timer",
      "hourglass_empty",
      "hourglass_full",
      "alarm",
      "alarm_on",
      "snooze",
      "watch_later",
      "pending_actions",
      "timer_off"
    ]
  },
  {
    "name": "Education",
    "icons": [
      "school",
      "menu_book",
      "book",
      "import_contacts",
      "auto_stories",
      "quiz",
      "local_library",
      "cast_for_education"
    ]
  },
  {
    "name": "Advanced UI Actions",
    "icons": [
      "visibility",
      "visibility_off",
      "lock_open",
      "exit_to_app",
      "login",
      "logout",
      "drag_indicator",
      "pan_tool",
      "zoom_in",
      "zoom_out",
      "open_in_new",
      "open_in_full",
      "touch_app"
    ]
  },
  {
    "name": "Sports & Fitness",
    "icons": [
      "sports_soccer",
      "sports_basketball",
      "sports_tennis",
      "sports_motorsports",
      "sports_baseball",
      "fitness_center",
      "directions_run",
      "pool",
      "hiking",
      "kayaking",
      "snowboarding"
    ]
  },
  {
    "name": "Smart Home",
    "icons": [
      "chair",
      "bed",
      "living",
      "kitchen",
      "dining",
      "coffee_maker",
      "blender",
      "light",
      "thermostat",
      "sensor_door",
      "smart_display",
      "doorbell"
    ]
  },
  {
    "name": "Extended Medical",
    "icons": [
      "local_hospital",
      "bloodtype",
      "medical_services",
      "vaccines",
      "sanitizer",
      "masks",
      "coronavirus",
      "wheelchair_pickup",
      "elderly",
      "personal_injury"
    ]
  },
  {
    "name": "Photography",
    "icons": [
      "camera",
      "camera_roll",
      "flash_on",
      "flash_off",
      "lens",
      "portrait",
      "panorama",
      "timelapse",
      "hdr_on",
      "image_search",
      "crop",
      "blur_on",
      "tonality"
    ]
  },
  {
    "name": "Maps & Navigation",
    "icons": [
      "pin_drop",
      "navigation",
      "route",
      "add_location",
      "edit_location",
      "streetview",
      "satellite",
      "local_gas_station",
      "local_parking",
      "ev_station",
      "subway"
    ]
  },
  {
    "name": "Design & Layers",
    "icons": [
      "layers",
      "layers_clear",
      "align_horizontal_center",
      "align_vertical_center",
      "format_shapes",
      "flip",
      "rotate_90_degrees_ccw",
      "grid_view",
      "view_module",
      "view_list",
      "view_kanban",
      "view_agenda"
    ]
  },
  {
    "name": "Accessibility",
    "icons": [
      "accessibility",
      "accessibility_new",
      "accessible",
      "accessible_forward",
      "blind",
      "sign_language",
      "assist_walker",
      "hearing_disabled",
      "tty"
    ]
  },
  {
    "name": "Gaming",
    "icons": [
      "gamepad",
      "toys",
      "casino",
      "4k",
      "hd",
      "repeat",
      "shuffle",
      "play_circle",
      "stop_circle",
      "album",
      "mic_off",
      "videocam_off"
    ]
  },
  {
    "name": "Data Visualization",
    "icons": [
      "bar_chart",
      "pie_chart",
      "show_chart",
      "insert_chart",
      "stacked_line_chart",
      "bubble_chart",
      "multiline_chart",
      "scatter_plot",
      "area_chart",
      "candlestick_chart"
    ]
  },
  {
    "name": "Development",
    "icons": [
      "integration_instructions",
      "data_object",
      "data_array",
      "webhook",
      "code_off",
      "html",
      "css",
      "javascript",
      "schema",
      "troubleshoot",
      "query_stats"
    ]
  },
  {
    "name": "Device Status",
    "icons": [
      "wifi",
      "wifi_off",
      "bluetooth",
      "bluetooth_connected",
      "bluetooth_disabled",
      "battery_full",
      "battery_alert",
      "battery_charging_full",
      "network_cell",
      "nfc",
      "usb",
      "sim_card",
      "cast_connected"
    ]
  },
  {
    "name": "Privacy & Security",
    "icons": [
      "vpn_key",
      "privacy_tip",
      "enhanced_encryption",
      "no_encryption",
      "key_off",
      "passkey",
      "password",
      "local_police",
      "badge",
      "gpp_good",
      "gpp_bad"
    ]
  },
  {
    "name": "File Types",
    "icons": [
      "picture_as_pdf",
      "text_snippet",
      "folder_zip",
      "topic",
      "newspaper",
      "sticky_note_2",
      "request_quote",
      "plagiarism",
      "find_in_page"
    ]
  },
  {
    "name": "Playlist Controls",
    "icons": [
      "playlist_play",
      "playlist_add",
      "playlist_add_check",
      "playlist_remove",
      "forward_10",
      "forward_30",
      "replay_10",
      "replay_30",
      "speed",
      "slow_motion_video",
      "high_quality",
      "closed_caption_off"
    ]
  },
  {
    "name": "Shapes & Symbols",
    "icons": [
      "circle",
      "square",
      "change_history",
      "pentagon",
      "hexagon",
      "star_half",
      "star_border",
      "favorite_border",
      "bookmark",
      "bookmark_border",
      "label",
      "label_important"
    ]
  },
  {
    "name": "AI & Automation",
    "icons": [
      "auto_awesome",
      "auto_awesome_mosaic",
      "auto_awesome_motion",
      "magic_button",
      "model_training",
      "psychology_alt",
      "smart_button",
      "assistant",
      "assistant_direction",
      "generating_tokens"
    ]
  },
  {
    "name": "Retail & Loyalty",
    "icons": [
      "add_shopping_cart",
      "remove_shopping_cart",
      "card_giftcard",
      "redeem",
      "loyalty",
      "local_offer",
      "point_of_sale",
      "local_mall",
      "production_quantity_limits"
    ]
  },
  {
    "name": "Text Formatting Extensions",
    "icons": [
      "format_color_fill",
      "format_color_text",
      "format_size",
      "format_line_spacing",
      "format_indent_increase",
      "format_indent_decrease",
      "subscript",
      "superscript",
      "line_weight",
      "font_download"
    ]
  },
  {
    "name": "Construction",
    "icons": [
      "roofing",
      "foundation",
      "fence",
      "hardware",
      "carpenter",
      "plumbing",
      "electrical_services",
      "hvac",
      "water_heater",
      "microwave",
      "iron"
    ]
  },
  {
    "name": "Specialized Transport",
    "icons": [
      "airlines",
      "airport_shuttle",
      "electric_car",
      "electric_bike",
      "electric_scooter",
      "moped",
      "rv_hookup",
      "snowmobile",
      "pedal_bike",
      "luggage",
      "no_transfer"
    ]
  },
  {
    "name": "Touch Gestures",
    "icons": [
      "swipe",
      "swipe_left",
      "swipe_right",
      "swipe_up",
      "swipe_down",
      "drag_click",
      "pinch",
      "pan_tool_alt",
      "all_out",
      "compress",
      "unfold_more",
      "unfold_less",
      "minimize",
      "maximize"
    ]
  },
  {
    "name": "Alerts & Feedback",
    "icons": [
      "notification_important",
      "add_alert",
      "auto_delete",
      "sim_card_alert",
      "error",
      "error_outline",
      "feedback",
      "new_releases",
      "announcement",
      "campaign"
    ]
  },
  {
    "name": "User Management",
    "icons": [
      "manage_accounts",
      "supervisor_account",
      "switch_account",
      "account_box",
      "account_circle",
      "co_present",
      "contacts",
      "recent_actors",
      "how_to_reg",
      "face",
      "face_retouching_natural"
    ]
  },
  {
    "name": "Workplace",
    "icons": [
      "work",
      "work_outline",
      "work_off",
      "cases",
      "business_center",
      "meeting_room",
      "no_meeting_room",
      "desk",
      "workspace_premium",
      "domain",
      "corporate_fare",
      "card_membership"
    ]
  },
  {
    "name": "Science & Math",
    "icons": [
      "calculate",
      "functions",
      "exposure",
      "square_foot",
      "straighten",
      "timeline",
      "data_exploration",
      "percent"
    ]
  },
  {
    "name": "Animals & Wildlife",
    "icons": [
      "pets",
      "pest_control",
      "pest_control_rodent",
      "phishing",
      "hive"
    ]
  },
  {
    "name": "Audio Production",
    "icons": [
      "graphic_eq",
      "surround_sound",
      "spatial_audio",
      "spatial_audio_off",
      "spatial_tracking",
      "music_video",
      "audio_file",
      "library_music",
      "speaker_group",
      "piano",
      "piano_off",
      "settings_voice"
    ]
  },
  {
    "name": "Network & Cloud",
    "icons": [
      "network_check",
      "cell_tower",
      "satellite_alt",
      "lan",
      "private_connectivity",
      "cloud_done",
      "cloud_off",
      "cloud_circle",
      "settings_ethernet",
      "portable_wifi_off"
    ]
  },
  {
    "name": "Everyday Life",
    "icons": [
      "umbrella",
      "dry_cleaning",
      "local_laundry_service",
      "wash",
      "clean_hands",
      "soap",
      "bathtub",
      "shower",
      "stroller",
      "crib",
      "baby_changing_station"
    ]
  },
  {
    "name": "Finance",
    "icons": [
      "currency_bitcoin",
      "currency_exchange",
      "currency_franc",
      "currency_lira",
      "currency_pound",
      "currency_ruble",
      "currency_rupee",
      "currency_yen",
      "currency_yuan",
      "savings"
    ]
  },
  {
    "name": "Turn-by-Turn Navigation",
    "icons": [
      "turn_right",
      "turn_left",
      "u_turn_left",
      "u_turn_right",
      "fork_right",
      "fork_left",
      "roundabout_right",
      "roundabout_left",
      "alt_route",
      "multiple_stop",
      "add_road",
      "edit_road"
    ]
  },
  {
    "name": "Emergency",
    "icons": [
      "fire_extinguisher",
      "fire_hydrant",
      "car_crash",
      "minor_crash",
      "sos",
      "e911_emergency",
      "medical_information",
      "emergency_recording",
      "emergency_share",
      "heart_broken"
    ]
  },
  {
    "name": "Advanced Camera Settings",
    "icons": [
      "burst_mode",
      "shutter_speed",
      "wb_incandescent",
      "wb_iridescent",
      "motion_photos_on",
      "motion_photos_off",
      "crop_original",
      "crop_square",
      "crop_16_9",
      "flip_camera_ios",
      "flip_camera_android"
    ]
  },
  {
    "name": "System Commands",
    "icons": [
      "keyboard_command_key",
      "keyboard_control_key",
      "keyboard_option_key",
      "keyboard_return",
      "keyboard_tab",
      "keyboard_capslock",
      "keyboard_double_arrow_right",
      "keyboard_double_arrow_left",
      "keyboard_arrow_up",
      "keyboard_arrow_down",
      "restore",
      "system_update"
    ]
  },
  {
    "name": "Drawing & Inking",
    "icons": [
      "draw",
      "color_lens",
      "polyline",
      "shape_line",
      "gradient",
      "pattern",
      "texture",
      "ink_eraser",
      "ink_pen",
      "ink_highlighter",
      "opacity",
    ]
  },
  {
    "name": "Document Layout",
    "icons": [
      "margin",
      "padding",
      "wrap_text",
      "vertical_align_top",
      "vertical_align_bottom",
      "space_bar",
      "view_column",
      "view_array",
      "view_carousel",
      "view_sidebar",
      "view_stream"
    ]
  },
  {
    "name": "Phone & Calling",
    "icons": [
      "video_call",
      "missed_video_call",
      "ring_volume",
      "voicemail",
      "dialpad",
      "dialer_sip",
      "phonelink",
      "phonelink_erase",
      "phonelink_lock",
      "phonelink_ring",
      "phonelink_setup",
      "cell_wifi"
    ]
  },
  {
    "name": "Scheduling",
    "icons": [
      "event_available",
      "event_busy",
      "event_note",
      "event_repeat",
      "date_range",
      "next_plan",
      "edit_calendar",
      "insert_invitation",
      "free_cancellation",
      "published_with_changes"
    ]
  },
  {
    "name": "Web Browsing",
    "icons": [
      "web",
      "web_asset",
      "web_asset_off",
      "tab",
      "tab_unselected",
      "public_off",
      "vpn_lock",
      "bookmark_add",
      "bookmark_added",
      "bookmark_remove"
    ]
  },
  {
    "name": "Battery Status",
    "icons": [
      "battery_0_bar",
      "battery_1_bar",
      "battery_2_bar",
      "battery_3_bar",
      "battery_4_bar",
      "battery_5_bar",
      "battery_6_bar",
      "battery_saver",
      "battery_unknown",
      "battery_charging_20",
      "battery_charging_80"
    ]
  },
  {
    "name": "Reviews & Ratings",
    "icons": [
      "stars",
      "star_rate",
      "reviews",
      "recommend",
      "rate_review",
      "thumbs_up_down",
      "thumb_up_off_alt",
      "thumb_down_off_alt",
      "add_reaction"
    ]
  },
  {
    "name": "Appliances",
    "icons": [
      "air_freshener",
      "blinds",
      "blinds_closed",
      "roller_shades",
      "roller_shades_closed",
      "mode_fan_off",
      "nest_cam_wired_stand",
      "smart_outlet",
      "table_lamp",
      "vacuum"
    ]
  },
  {
    "name": "Wellness",
    "icons": [
      "blood_pressure",
      "dentistry",
      "dermatology",
      "nutrition",
      "ophthalmology",
      "prescriptions",
      "syringe",
      "vital_signs",
      "weight",
      "stethoscope"
    ]
  },
  {
    "name": "Data Filtering",
    "icons": [
      "sort_by_alpha",
      "swap_vert",
      "swap_horiz",
      "filter_alt",
      "filter_alt_off",
      "low_priority",
      "reorder",
      "sync_alt",
      "compare_arrows",
      "sync_problem"
    ]
  },
  {
    "name": "Genders & Gestures",
    "icons": [
      "man",
      "woman",
      "boy",
      "girl",
      "transgender",
      "male",
      "female",
      "waving_hand",
      "front_hand",
      "handshake",
      "connect_without_contact"
    ]
  },
  {
    "name": "Vehicle Services",
    "icons": [
      "taxi_alert",
      "bus_alert",
      "car_rental",
      "car_repair",
      "local_car_wash",
      "tire_repair",
      "directions_transit_filled",
      "directions_railway",
      "hail"
    ]
  },
  {
    "name": "File Management",
    "icons": [
      "folder_copy",
      "folder_delete",
      "folder_off",
      "folder_special",
      "file_present",
      "snippet_folder",
      "rule_folder",
      "drive_file_rename_outline",
      "drive_folder_upload",
      "folder_managed"
    ]
  },
  {
    "name": "Action Sports",
    "icons": [
      "kitesurfing",
      "roller_skating",
      "skateboarding",
      "downhill_skiing",
      "ice_skating",
      "snowshoeing",
      "surfing",
      "paragliding",
      "rowing",
      "scuba_diving"
    ]
  },
  {
    "name": "Picture-in-Picture",
    "icons": [
      "picture_in_picture",
      "picture_in_picture_alt",
      "branding_watermark",
      "control_camera",
      "play_disabled",
      "video_settings",
      "featured_video",
      "featured_play_list",
      "art_track"
    ]
  },
  {
    "name": "Content Creation",
    "icons": [
      "post_add",
      "note_add",
      "format_clear",
      "strikethrough_s",
      "format_list_bulleted_add",
      "history_edu",
      "app_registration",
      "dynamic_feed",
      "mark_as_unread"
    ]
  },
  {
    "name": "Clipboard",
    "icons": [
      "content_copy",
      "content_paste",
      "content_cut",
      "content_paste_search",
      "content_paste_go",
      "copy_all",
      "inventory",
      "archive",
      "unarchive",
      "outbox"
    ]
  },
  {
    "name": "Photo Filters",
    "icons": [
      "filter_1",
      "filter_2",
      "filter_3",
      "filter_b_and_w",
      "filter_drama",
      "filter_vintage",
      "monochrome_photos",
      "lens_blur",
      "panorama_fish_eye",
      "panorama_horizontal",
      "panorama_vertical"
    ]
  },
  {
    "name": "Text Direction",
    "icons": [
      "format_textdirection_l_to_r",
      "format_textdirection_r_to_l",
      "text_decrease",
      "text_increase",
      "text_format",
      "text_rotate_up",
      "text_rotate_vertical",
      "text_rotation_angledown",
      "text_rotation_angleup",
      "text_rotation_down",
      "text_rotation_none"
    ]
  },
  {
    "name": "Audio Analysis",
    "icons": [
      "record_voice_over",
      "voice_over_off",
      "hearing",
      "mic_external_on",
      "mic_external_off",
      "noise_control_off",
      "noise_aware",
      "transcribe"
    ]
  },
  {
    "name": "Puzzles",
    "icons": [
      "videogame_asset",
      "videogame_asset_off",
      "extension",
      "extension_off",
      "score",
      "scoreboard",
      "sports_gymnastics",
      "sports_martial_arts",
      "sports_kabaddi"
    ]
  },
  {
    "name": "Patio & Real Estate",
    "icons": [
      "yard",
      "outdoor_grill",
      "deck",
      "balcony",
      "chair_alt",
      "table_bar",
      "table_restaurant",
      "villa",
      "holiday_village",
      "gite"
    ]
  },
  {
    "name": "Ports & Plugs",
    "icons": [
      "power",
      "power_off",
      "cable",
      "sim_card_download",
      "aod",
      "dock",
      "earbuds",
      "earbuds_battery",
      "speaker_phone",
      "headset",
      "headset_mic"
    ]
  },
  {
    "name": "Tables & Grids",
    "icons": [
      "table_rows",
      "table_chart",
      "table_view",
      "backup_table",
      "border_all",
      "border_clear",
      "border_outer",
      "border_inner",
      "border_style",
      "border_color",
      "view_comfy"
    ]
  },
  {
    "name": "Scanning",
    "icons": [
      "qr_code",
      "qr_code_2",
      "qr_code_scanner",
      "barcode_reader",
      "document_scanner",
      "adf_scanner",
      "flip_to_front",
      "flip_to_back",
      "line_style",
      "linear_scale"
    ]
  },
  {
    "name": "Screens & Display",
    "icons": [
      "screenshot",
      "screenshot_monitor",
      "desktop_windows",
      "desktop_mac",
      "monitor",
      "monitor_weight",
      "fit_screen",
      "aspect_ratio",
      "view_in_ar",
      "connected_tv"
    ]
  },
  {
    "name": "Do Not Disturb",
    "icons": [
      "do_not_disturb",
      "do_not_disturb_on",
      "do_not_disturb_off",
      "do_not_disturb_alt",
      "notification_add",
      "notifications_paused",
      "alarm_add",
      "alarm_off",
      "vibration"
    ]
  },
  {
    "name": "Location Pins",
    "icons": [
      "push_pin",
      "wrong_location",
      "location_searching",
      "location_disabled",
      "not_listed_location",
      "person_pin",
      "person_pin_circle",
      "trip_origin",
      "mode_of_travel",
      "moving"
    ]
  },
  {
    "name": "Image Correction",
    "icons": [
      "tune",
      "transform",
      "animation",
      "auto_fix_high",
      "auto_fix_normal",
      "auto_fix_off",
      "broken_image",
      "add_photo_alternate",
      "hide_image",
      "image_not_supported"
    ]
  },
  {
    "name": "Sensors & Diagnostics",
    "icons": [
      "sensors",
      "sensors_off",
      "network_ping",
      "wifi_find",
      "settings_input_antenna",
      "settings_input_component",
      "settings_input_hdmi",
      "settings_input_svideo",
      "compass_calibration"
    ]
  },
  {
    "name": "Directional Arrows",
    "icons": [
      "arrow_drop_down",
      "arrow_drop_up",
      "arrow_right",
      "arrow_left",
      "arrow_outward",
      "call_made",
      "call_received",
      "call_split",
      "call_merge",
      "call_missed",
      "call_missed_outgoing",
      "south",
      "east",
      "west",
      "north",
      "north_east",
      "north_west",
      "south_east",
      "south_west"
    ]
  },
  {
    "name": "Travel Terminals",
    "icons": [
      "airline_seat_flat",
      "airline_seat_flat_angled",
      "airline_seat_individual_suite",
      "airline_seat_legroom_extra",
      "airline_seat_legroom_normal",
      "airline_seat_legroom_reduced",
      "airline_seat_recline_extra",
      "airline_seat_recline_normal",
      "connecting_airports",
      "departure_board"
    ]
  },
  {
    "name": "Signal Strengths",
    "icons": [
      "signal_cellular_alt",
      "signal_cellular_alt_1_bar",
      "signal_cellular_alt_2_bar",
      "signal_cellular_connected_no_internet_0_bar",
      "signal_cellular_connected_no_internet_4_bar",
      "signal_cellular_null",
      "signal_cellular_off",
      "signal_wifi_4_bar",
      "signal_wifi_4_bar_lock",
      "signal_wifi_bad",
      "signal_wifi_connected_no_internet_4",
      "signal_wifi_off"
    ]
  },
  {
    "name": "Moderation & Safety",
    "icons": [
      "add_moderator",
      "remove_moderator",
      "report",
      "report_gmailerrorred",
      "report_off",
      "report_problem",
      "safety_divider",
      "safety_check",
      "block",
      "cancel_presentation",
      "dangerous",
      "warning_amber",
      "domain_verification"
    ]
  },
  {
    "name": "Video Resolutions",
    "icons": [
      "fiber_dvr",
      "fiber_manual_record",
      "fiber_new",
      "fiber_pin",
      "fiber_smart_record",
      "forward_5",
      "replay_5",
      "sd",
      "8k",
      "10k",
      "1k",
      "2k",
      "3k",
      "5k",
      "6k",
      "7k",
      "9k",
      "1k_plus",
      "2k_plus"
    ]
  },
  {
    "name": "Camera Focus",
    "icons": [
      "crop_free",
      "crop_landscape",
      "crop_portrait",
      "crop_din",
      "crop_3_2",
      "crop_5_4",
      "crop_7_5",
      "center_focus_strong",
      "center_focus_weak",
      "camera_front",
      "camera_rear"
    ]
  },
  {
    "name": "Display Controls",
    "icons": [
      "brightness_1",
      "brightness_2",
      "brightness_3",
      "brightness_4",
      "brightness_5",
      "brightness_6",
      "brightness_7",
      "brightness_auto",
      "brightness_high",
      "brightness_low",
      "brightness_medium",
      "contrast",
      "display_settings",
      "settings_brightness",
      "dark_mode",
      "light_mode"
    ]
  },
  {
    "name": "Storage Drives",
    "icons": [
      "storage",
      "sd_card",
      "sd_storage",
      "sd_card_alert",
      "data_usage",
      "backup",
      "drive_eta",
      "hard_drive",
      "devices_other",
      "device_hub",
      "app_blocking",
      "developer_mode"
    ]
  },
  {
    "name": "Message Status",
    "icons": [
      "all_inbox",
      "mark_chat_read",
      "mark_chat_unread",
      "chat_bubble_outline",
      "speaker_notes",
      "speaker_notes_off",
      "quickreply",
      "forward_to_inbox",
      "unsubscribe",
      "mark_email_read",
      "mark_email_unread",
      "drafts"
    ]
  },
  {
    "name": "Culinary Dining",
    "icons": [
      "flatware",
      "soup_kitchen",
      "kebab_dining",
      "egg",
      "egg_alt",
      "dinner_dining",
      "brunch_dining",
      "no_meals",
      "local_dining",
      "takeout_dining",
      "delivery_dining",
      "tapas"
    ]
  },
  {
    "name": "Vector Shapes",
    "icons": [
      "difference",
      "join_inner",
      "join_left",
      "join_right",
      "join_full",
      "format_overline",
      "horizontal_rule",
      "space_dashboard",
      "format_list_numbered_rtl",
      "view_timeline",
      "view_week",
      "view_day"
    ]
  }
];

export default function IconPicker({ onSelect, onClose }: { onSelect: (icon: string) => void, onClose: () => void }) {
  const [search, setSearch] = useState('');
  const { t } = useLexicon();

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return ICON_CATEGORIES;
    const lowerSearch = search.toLowerCase();
    
    return ICON_CATEGORIES.map(cat => ({
      name: cat.name,
      icons: cat.icons.filter(icon => icon.toLowerCase().includes(lowerSearch) || cat.name.toLowerCase().includes(lowerSearch))
    })).filter(cat => cat.icons.length > 0);
  }, [search]);

  return (
    <div className="absolute top-full mt-2 rounded-3xl bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-3xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-auto w-[360px] z-50 animate-in fade-in zoom-in-95 duration-200 flex flex-col overflow-hidden">
      
      {/* Search Header */}
      <div className="p-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-transparent shrink-0">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtext)] text-sm">search</span>
          <input
            type="text"
            placeholder={t("masonhub_search") || "Search icons..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[color-mix(in_srgb,var(--text)_5%,transparent)] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] focus:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl pl-9 pr-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]/50 transition-all placeholder:text-[var(--subtext)]/50"
            autoFocus
          />
        </div>
      </div>
      
      {/* Scrollable Icon Grid */}
      <div className="p-4 max-h-[300px] overflow-y-auto custom-scrollbar">
        {filteredCategories.length === 0 ? (
          <div className="text-center text-[var(--subtext)] text-xs py-8 opacity-50">No icons found.</div>
        ) : (
          <div className="flex flex-col gap-6">
            {filteredCategories.map(cat => (
              <div key={cat.name} className="flex flex-col gap-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 ml-1">{cat.name}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {cat.icons.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => onSelect(icon)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--text)] hover:text-[var(--accent)] transition-all hover:scale-110 shadow-sm shrink-0"
                    >
                      <span className="material-symbols-outlined !text-[20px]">{icon}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
