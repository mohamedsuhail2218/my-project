# Automated Test Inventory

Generated from the final JUnit XML files in `reports/test-runs/`.

## Backend Pytest inventory (103 tests)

### `test_access_points` — 8 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_seeded_access_points_are_labelled_simulations | PASS | 1.053 |
| 2 | test_create_update_history_performance_and_delete | PASS | 0.219 |
| 3 | test_duplicate_access_point_is_rejected | PASS | 0.101 |
| 4 | test_invalid_ip_and_mac_are_validated | PASS | 0.040 |
| 5 | test_analyst_and_viewer_cannot_create_access_points | PASS | 0.774 |
| 6 | test_simulated_check_is_clearly_labelled_and_excluded | PASS | 0.119 |
| 7 | test_access_point_search_and_simulation_filter | PASS | 0.052 |
| 8 | test_missing_access_point_returns_404 | PASS | 0.041 |

### `test_anomaly` — 7 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_sample_baseline_is_deterministic_and_labelled | PASS | 0.014 |
| 2 | test_cold_start_uses_sample_baseline_when_history_is_insufficient | PASS | 1.298 |
| 3 | test_detection_returns_no_live_data_without_measurements | PASS | 1.275 |
| 4 | test_extreme_live_measurement_is_detected_and_explained | PASS | 3.022 |
| 5 | test_offline_measurement_always_gets_critical_explanation | PASS | 0.012 |
| 6 | test_model_info_and_api_contract | PASS | 1.157 |
| 7 | test_anomaly_filter_validation | PASS | 0.016 |

### `test_auth` — 12 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_health_is_public | PASS | 0.400 |
| 2 | test_admin_can_log_in | PASS | 0.213 |
| 3 | test_wrong_password_is_rejected | PASS | 0.186 |
| 4 | test_unknown_email_is_rejected_without_leaking_account_state | PASS | 0.189 |
| 5 | test_me_returns_signed_in_user | PASS | 0.027 |
| 6 | test_protected_routes_require_a_token | PASS | 0.023 |
| 7 | test_invalid_token_is_rejected | PASS | 0.016 |
| 8 | test_admin_creates_viewer_and_duplicate_is_rejected | PASS | 0.227 |
| 9 | test_viewer_cannot_manage_users | PASS | 0.020 |
| 10 | test_analyst_cannot_manage_users | PASS | 0.018 |
| 11 | test_user_validation_returns_field_errors | PASS | 0.018 |
| 12 | test_viewer_can_read_dashboard_but_not_change_configuration | PASS | 0.418 |

### `test_dashboard` — 4 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_dashboard_overview_contract | PASS | 0.051 |
| 2 | test_dashboard_excludes_simulated_measurements | PASS | 0.093 |
| 3 | test_dashboard_validates_window | PASS | 0.039 |
| 4 | test_dashboard_calculates_health_from_live_measurements | PASS | 0.081 |

### `test_devices` — 6 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_arp_parser_filters_scope_and_duplicates | PASS | 0.023 |
| 2 | test_device_list_exposes_privacy_note | PASS | 0.032 |
| 3 | test_device_update_approval_and_activity | PASS | 0.140 |
| 4 | test_discovery_is_mocked_and_duplicates_are_suppressed | PASS | 0.102 |
| 5 | test_viewer_cannot_discover_or_approve | PASS | 0.043 |
| 6 | test_device_filtering_by_approval | PASS | 0.056 |

### `test_intelligence` — 14 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_prediction_engine_reports_insufficient_data_instead_of_inventing_risk | PASS | 0.115 |
| 2 | test_prediction_engine_scores_only_live_measurements_and_explains_weights | PASS | 0.145 |
| 3 | test_prediction_feed_distinguishes_not_run_from_insufficient_data | PASS | 0.092 |
| 4 | test_root_cause_requires_evidence_and_creates_explainable_investigation | PASS | 0.122 |
| 5 | test_root_cause_reports_clear_state_for_healthy_measurement | PASS | 0.130 |
| 6 | test_security_scan_uses_local_evidence_and_deduplicates_findings | PASS | 0.213 |
| 7 | test_optimization_refuses_advice_without_enough_live_telemetry | PASS | 0.096 |
| 8 | test_optimization_builds_advisory_from_measured_threshold_breaches | PASS | 0.139 |
| 9 | test_intelligence_endpoints_return_explicit_state_envelopes | PASS | 0.132 |
| 10 | test_viewer_cannot_run_intelligence_engines | PASS | 0.058 |
| 11 | test_intelligence_csv_exports_are_real_files | PASS | 0.115 |
| 12 | test_notification_centre_contract | PASS | 0.048 |
| 13 | test_live_status_documents_polling_fallback | PASS | 0.056 |
| 14 | test_dashboard_exposes_intelligence_rollup | PASS | 0.038 |

### `test_monitoring` — 8 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_network_info_reports_real_host_context | PASS | 0.047 |
| 2 | test_history_returns_scoped_measurements | PASS | 0.048 |
| 3 | test_access_point_history_can_include_simulations | PASS | 0.054 |
| 4 | test_live_run_is_blocked_in_test_environment | PASS | 0.018 |
| 5 | test_monitoring_service_persists_live_probe_and_opens_ticket | PASS | 0.087 |
| 6 | test_scheduler_status_endpoint | PASS | 0.021 |
| 7 | test_latest_measurement_endpoint_returns_live_only | PASS | 0.022 |
| 8 | test_simulated_measurement_is_never_live | PASS | 0.011 |

### `test_reports` — 7 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_report_types_expose_all_reports | PASS | 0.021 |
| 2 | test_generate_list_and_download_pdf | PASS | 0.253 |
| 3 | test_specialised_reports_generate_with_correct_listing_metadata | PASS | 0.540 |
| 4 | test_invalid_report_requests_are_rejected | PASS | 0.039 |
| 5 | test_missing_report_returns_404 | PASS | 0.024 |
| 6 | test_report_path_traversal_is_blocked | PASS | 0.049 |
| 7 | test_reports_require_authentication | PASS | 0.033 |

### `test_security` — 8 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_password_hash_round_trip | PASS | 0.458 |
| 2 | test_password_hash_rejects_oversized_input | PASS | 0.002 |
| 3 | test_access_token_contains_required_claims | PASS | 0.003 |
| 4 | test_token_with_wrong_signature_is_rejected | PASS | 0.002 |
| 5 | test_role_hierarchy | PASS | 0.002 |
| 6 | test_postgres_urls_get_an_explicit_driver | PASS | 0.080 |
| 7 | test_production_secret_requirements_are_enforced | PASS | 0.055 |
| 8 | test_test_environment_has_ephemeral_safe_defaults | PASS | 0.004 |

### `test_settings` — 5 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_get_settings_contract | PASS | 0.034 |
| 2 | test_admin_can_update_and_restore_settings | PASS | 0.111 |
| 3 | test_invalid_settings_are_rejected | PASS | 0.035 |
| 4 | test_analyst_cannot_change_settings | PASS | 0.012 |
| 5 | test_system_status_reports_runtime_and_safety | PASS | 0.014 |

### `test_testing` — 6 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_testing_dashboard_contract | PASS | 0.018 |
| 2 | test_runner_is_forbidden_when_disabled | PASS | 0.028 |
| 3 | test_suite_mapping | PASS | 0.002 |
| 4 | test_junit_parser_handles_all_statuses | PASS | 0.012 |
| 5 | test_no_active_run_after_startup | PASS | 0.005 |
| 6 | test_missing_run_returns_404 | PASS | 0.021 |

### `test_tickets` — 5 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_manual_ticket_lifecycle | PASS | 0.139 |
| 2 | test_ticket_list_filters_and_stats | PASS | 0.083 |
| 3 | test_duplicate_suppression_and_resolution_reopens_fingerprint | PASS | 0.025 |
| 4 | test_automatic_ticket_policy_ignores_low_anomaly | PASS | 0.023 |
| 5 | test_ticket_validation_and_permissions | PASS | 0.043 |

### `test_troubleshooting` — 4 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_simulated_access_point_cannot_be_diagnosed_as_real | PASS | 0.032 |
| 2 | test_rules_escalate_latency_loss_and_outage | PASS | 0.074 |
| 3 | test_recommendation_list_and_latest | PASS | 0.022 |
| 4 | test_invalid_access_point_and_rbac | PASS | 0.031 |

### `test_wifi` — 9 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_parse_windows_interfaces_reads_connected_adapter_only | PASS | 0.004 |
| 2 | test_parse_windows_interfaces_returns_none_without_association | PASS | 0.002 |
| 3 | test_parse_netsh_gateway | PASS | 0.006 |
| 4 | test_band_and_channel_from_frequency | PASS | 0.002 |
| 5 | test_connected_wifi_returns_unavailable_payload | PASS | 0.003 |
| 6 | test_connected_wifi_reports_association_and_gateway | PASS | 0.002 |
| 7 | test_connected_wifi_explains_missing_gateway | PASS | 0.002 |
| 8 | test_wifi_endpoint_requires_authentication | PASS | 0.012 |
| 9 | test_wifi_endpoint_returns_detector_payload | PASS | 0.020 |

## Frontend Playwright inventory (21 tests)

### `auth.spec.js` — 4 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | Authentication and access control › an anonymous visitor is redirected to the login page | PASS | 0.774 |
| 2 | Authentication and access control › the login form rejects an incorrect password | PASS | 0.913 |
| 3 | Authentication and access control › the administrator can sign in and the session survives a reload | PASS | 2.55 |
| 4 | Authentication and access control › sign out clears the browser session | PASS | 2.086 |

### `interactions.spec.js` — 12 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | Workspace interactions › light theme toggles, persists after reload and can be restored | PASS | 2.179 |
| 2 | Workspace interactions › the command palette jumps between modules | PASS | 2.117 |
| 3 | Workspace interactions › access point details open, simulated checks run and the dialog closes | PASS | 2.584 |
| 4 | Workspace interactions › access point create, edit and delete lifecycle | PASS | 3.899 |
| 5 | Workspace interactions › current Wi-Fi prefills the registration form with the gateway | PASS | 2.664 |
| 6 | Workspace interactions › current Wi-Fi explains when the backend is not on a Wi-Fi network | PASS | 2.252 |
| 7 | Workspace interactions › device discovery and the read-only privacy dialog | PASS | 7.327 |
| 8 | Workspace interactions › AI detection and rule-based diagnosis can be executed | PASS | 5.722 |
| 9 | Workspace interactions › ticket creation, comment and status update | PASS | 4.376 |
| 10 | Workspace interactions › PDF reports generate and download from the real backend | PASS | 2.158 |
| 11 | Workspace interactions › settings save through the administration form | PASS | 2.062 |
| 12 | Workspace interactions › notifications panel opens from the header | PASS | 1.628 |

### `navigation.spec.js` — 3 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | Workspace navigation › every sidebar module renders its own content without runtime errors | PASS | 4.459 |
| 2 | Workspace navigation › deep links load the requested module and unknown paths show the not-found page | PASS | 3.328 |
| 3 | Workspace navigation › legacy modules remain reachable through the command palette | PASS | 1.907 |

### `responsive.spec.js` — 2 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | Responsive layout › mobile navigation opens, navigates and closes | PASS | 1.715 |
| 2 | Responsive layout › the dashboard does not overflow the mobile viewport | PASS | 1.336 |

