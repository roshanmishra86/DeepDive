use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.handle().plugin(
                tauri_plugin_sql::Builder::default()
                    .add_migrations(
                        "sqlite:deepwork.db",
                        vec![
                            Migration {
                                version: 1,
                                description: "Initialize schema",
                                sql: include_str!("../migrations/0001_init.sql"),
                                kind: MigrationKind::Up,
                            },
                            Migration {
                                version: 2,
                                description: "Seed defaults",
                                sql: include_str!("../migrations/0002_seed.sql"),
                                kind: MigrationKind::Up,
                            },
                        ],
                    )
                    .build(),
            )?;
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.handle().plugin(tauri_plugin_fs::init())?;
            app.handle().plugin(tauri_plugin_opener::init())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
