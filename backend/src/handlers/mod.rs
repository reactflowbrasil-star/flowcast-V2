pub mod activity_log;
pub mod admin;
// Envato license verification & activation
pub mod license;
pub mod app_versions;
pub mod auth;
pub mod content;
pub mod demo;
pub mod device;
pub mod discovery;
pub mod end_user_subscription;
pub mod epg;
pub mod favorites;
pub mod gift_codes;
pub mod master_api_key;
pub mod media_watcher;
pub mod notifications;
pub mod password_reset;
pub mod payments;
pub mod public_api;
pub mod reseller;
pub mod reseller_api_keys;
pub mod scanner;
pub mod security;
pub mod series;
pub mod smtp_config;
pub mod specialized;
pub mod ticket;
pub mod tmdb;
pub mod two_factor;
pub mod ui_config;
pub mod upload;
pub mod user_activity;
pub mod user_history;
pub mod user_profile;
pub mod viewer_profiles;

pub use auth::*;
// Re-export only the specific admin/reseller symbols used by lib.rs to avoid ambiguous glob warnings
pub use activity_log::{get_admin_activity_logs, get_reseller_activity_logs};
pub use admin::{
    bulk_update_users,
    create_admin,
    create_end_user,
    create_offline_payment,
    create_reseller,
    delete_user,
    export_users,
    get_all_end_users,
    // Billing (Admin)
    get_billing_overview,
    get_categories,
    get_config,
    get_credit_rates,
    // Pricing config (Admin)
    get_pricing_config,
    get_reseller_users,
    get_resellers,
    get_system_stats,
    get_user,
    get_user_stats,
    list_billing_transactions,
    reset_user_password,
    set_user_active_status,
    test_tmdb_key,
    transfer_user,
    update_config,
    update_credit_config,
    update_pricing_config,
    update_reseller_credits,
    update_reseller_demo_limit,
    update_tmdb_config,
    update_user,
    update_user_credits,
    update_user_subscriptions,
};
pub use content::*;
pub use device::*;
pub use reseller::{
    calculate_credit_cost, create_end_user as reseller_create_end_user, delete_end_user,
    extend_user_subscription, get_credit_balance, get_credit_rates as reseller_get_credit_rates,
    get_credit_usage_stats, get_my_end_users, set_end_user_active_status,
};
pub use security::*;
pub use ticket::{
    add_message, add_ticket_message, assign_ticket_to_self, create_ticket, create_ticket_admin,
    delete_ticket_admin, get_ticket_detail, get_ticket_messages, get_ticket_stats, get_tickets,
    get_unread_count_total, mark_ticket_messages_read, update_ticket, update_ticket_admin,
};

pub use master_api_key::{
    create_master_api_key, delete_master_api_key, get_master_api_key_by_id, get_master_api_keys,
    regenerate_master_api_key, update_master_api_key,
};

pub use gift_codes::*;
