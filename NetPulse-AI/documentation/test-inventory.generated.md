# Automated Test Inventory

Generated from the final JUnit XML files in `reports/test-runs/`.

## Backend Pytest inventory (79 tests)

### `test_access_points` — 8 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_seeded_access_points_are_labelled_simulations | PASS | 0.290 |
| 2 | test_create_update_history_performance_and_delete | PASS | 0.064 |
| 3 | test_duplicate_access_point_is_rejected | PASS | 0.026 |
| 4 | test_invalid_ip_and_mac_are_validated | PASS | 0.014 |
| 5 | test_analyst_and_viewer_cannot_create_access_points | PASS | 0.269 |
| 6 | test_simulated_check_is_clearly_labelled_and_excluded | PASS | 0.028 |
| 7 | test_access_point_search_and_simulation_filter | PASS | 0.015 |
| 8 | test_missing_access_point_returns_404 | PASS | 0.012 |

### `test_anomaly` — 7 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_sample_baseline_is_deterministic_and_labelled | PASS | 0.003 |
| 2 | test_cold_start_uses_sample_baseline_when_history_is_insufficient | PASS | 0.323 |
| 3 | test_detection_returns_no_live_data_without_measurements | PASS | 0.288 |
| 4 | test_extreme_live_measurement_is_detected_and_explained | PASS | 0.714 |
| 5 | test_offline_measurement_always_gets_critical_explanation | PASS | 0.004 |
| 6 | test_model_info_and_api_contract | PASS | 0.320 |
| 7 | test_anomaly_filter_validation | PASS | 0.007 |

### `test_auth` — 12 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_health_is_public | PASS | 0.048 |
| 2 | test_admin_can_log_in | PASS | 0.061 |
| 3 | test_wrong_password_is_rejected | PASS | 0.059 |
| 4 | test_unknown_email_is_rejected_without_leaking_account_state | PASS | 0.052 |
| 5 | test_me_returns_signed_in_user | PASS | 0.007 |
| 6 | test_protected_routes_require_a_token | PASS | 0.007 |
| 7 | test_invalid_token_is_rejected | PASS | 0.005 |
| 8 | test_admin_creates_viewer_and_duplicate_is_rejected | PASS | 0.066 |
| 9 | test_viewer_cannot_manage_users | PASS | 0.006 |
| 10 | test_analyst_cannot_manage_users | PASS | 0.006 |
| 11 | test_user_validation_returns_field_errors | PASS | 0.007 |
| 12 | test_viewer_can_read_dashboard_but_not_change_configuration | PASS | 0.026 |

### `test_dashboard` — 4 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_dashboard_overview_contract | PASS | 0.011 |
| 2 | test_dashboard_excludes_simulated_measurements | PASS | 0.022 |
| 3 | test_dashboard_validates_window | PASS | 0.012 |
| 4 | test_dashboard_calculates_health_from_live_measurements | PASS | 0.013 |

### `test_devices` — 6 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_arp_parser_filters_scope_and_duplicates | PASS | 0.009 |
| 2 | test_device_list_exposes_privacy_note | PASS | 0.010 |
| 3 | test_device_update_approval_and_activity | PASS | 0.038 |
| 4 | test_discovery_is_mocked_and_duplicates_are_suppressed | PASS | 0.027 |
| 5 | test_viewer_cannot_discover_or_approve | PASS | 0.011 |
| 6 | test_device_filtering_by_approval | PASS | 0.017 |

### `test_monitoring` — 8 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_network_info_reports_real_host_context | PASS | 0.017 |
| 2 | test_history_returns_scoped_measurements | PASS | 0.011 |
| 3 | test_access_point_history_can_include_simulations | PASS | 0.018 |
| 4 | test_live_run_is_blocked_in_test_environment | PASS | 0.007 |
| 5 | test_monitoring_service_persists_live_probe_and_opens_ticket | PASS | 0.014 |
| 6 | test_scheduler_status_endpoint | PASS | 0.007 |
| 7 | test_latest_measurement_endpoint_returns_live_only | PASS | 0.007 |
| 8 | test_simulated_measurement_is_never_live | PASS | 0.003 |

### `test_reports` — 7 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_report_types_expose_all_eight_reports | PASS | 0.008 |
| 2 | test_generate_list_and_download_pdf | PASS | 0.063 |
| 3 | test_specialised_reports_generate_with_correct_listing_metadata | PASS | 0.118 |
| 4 | test_invalid_report_requests_are_rejected | PASS | 0.013 |
| 5 | test_missing_report_returns_404 | PASS | 0.008 |
| 6 | test_report_path_traversal_is_blocked | PASS | 0.011 |
| 7 | test_reports_require_authentication | PASS | 0.008 |

### `test_security` — 7 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_password_hash_round_trip | PASS | 0.170 |
| 2 | test_password_hash_rejects_oversized_input | PASS | 0.001 |
| 3 | test_access_token_contains_required_claims | PASS | 0.001 |
| 4 | test_token_with_wrong_signature_is_rejected | PASS | 0.001 |
| 5 | test_role_hierarchy | PASS | 0.000 |
| 6 | test_production_secret_requirements_are_enforced | PASS | 0.015 |
| 7 | test_test_environment_has_ephemeral_safe_defaults | PASS | 0.000 |

### `test_settings` — 5 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_get_settings_contract | PASS | 0.008 |
| 2 | test_admin_can_update_and_restore_settings | PASS | 0.041 |
| 3 | test_invalid_settings_are_rejected | PASS | 0.019 |
| 4 | test_analyst_cannot_change_settings | PASS | 0.007 |
| 5 | test_system_status_reports_runtime_and_safety | PASS | 0.007 |

### `test_testing` — 6 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_testing_dashboard_contract | PASS | 0.090 |
| 2 | test_runner_is_forbidden_when_disabled | PASS | 0.013 |
| 3 | test_suite_mapping | PASS | 0.001 |
| 4 | test_junit_parser_handles_all_statuses | PASS | 0.004 |
| 5 | test_no_active_run_after_startup | PASS | 0.001 |
| 6 | test_missing_run_returns_404 | PASS | 0.008 |

### `test_tickets` — 5 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_manual_ticket_lifecycle | PASS | 0.058 |
| 2 | test_ticket_list_filters_and_stats | PASS | 0.043 |
| 3 | test_duplicate_suppression_and_resolution_reopens_fingerprint | PASS | 0.007 |
| 4 | test_automatic_ticket_policy_ignores_low_anomaly | PASS | 0.006 |
| 5 | test_ticket_validation_and_permissions | PASS | 0.018 |

### `test_troubleshooting` — 4 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | test_simulated_access_point_cannot_be_diagnosed_as_real | PASS | 0.022 |
| 2 | test_rules_escalate_latency_loss_and_outage | PASS | 0.044 |
| 3 | test_recommendation_list_and_latest | PASS | 0.017 |
| 4 | test_invalid_access_point_and_rbac | PASS | 0.021 |

## Frontend Playwright inventory (18 tests)

### `auth.spec.js` — 4 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | Authentication and access control › an anonymous visitor is redirected to the login page | PASS | 0.643 |
| 2 | Authentication and access control › the login form rejects an incorrect password | PASS | 0.633 |
| 3 | Authentication and access control › the administrator can sign in and the session survives a reload | PASS | 2.51 |
| 4 | Authentication and access control › sign out clears the browser session | PASS | 2.925 |

### `interactions.spec.js` — 10 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | Workspace interactions › light theme toggles, persists after reload and can be restored | PASS | 2.675 |
| 2 | Workspace interactions › the command palette jumps between modules | PASS | 2.354 |
| 3 | Workspace interactions › access point details open, simulated checks run and the dialog closes | PASS | 2.616 |
| 4 | Workspace interactions › access point create, edit and delete lifecycle | PASS | 3.495 |
| 5 | Workspace interactions › device discovery and the read-only privacy dialog | PASS | 7.589 |
| 6 | Workspace interactions › AI detection and rule-based diagnosis can be executed | PASS | 8.594 |
| 7 | Workspace interactions › ticket creation, comment and status update | PASS | 4.977 |
| 8 | Workspace interactions › PDF reports generate and download from the real backend | PASS | 2.1 |
| 9 | Workspace interactions › settings save through the administration form | PASS | 2.356 |
| 10 | Workspace interactions › notifications panel opens from the header | PASS | 2.329 |

### `navigation.spec.js` — 2 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | Workspace navigation › every sidebar module renders its own content without runtime errors | PASS | 5.722 |
| 2 | Workspace navigation › deep links load the requested module and unknown paths show the not-found page | PASS | 2.106 |

### `responsive.spec.js` — 2 tests

| # | Test | Result | Time (s) |
|---|---|---|---:|
| 1 | Responsive layout › mobile navigation opens, navigates and closes | PASS | 1.839 |
| 2 | Responsive layout › the dashboard does not overflow the mobile viewport | PASS | 1.406 |

