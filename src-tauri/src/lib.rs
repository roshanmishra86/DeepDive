use tauri_plugin_sql::{Migration, MigrationKind};

mod tx;

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
                            Migration {
                                version: 3,
                                description: "Per-day shutdown time",
                                sql: include_str!("../migrations/0003_day_shutdown.sql"),
                                kind: MigrationKind::Up,
                            },
                            Migration {
                                version: 4,
                                description: "Block composer fields",
                                sql: include_str!("../migrations/0004_block_composer.sql"),
                                kind: MigrationKind::Up,
                            },
                            Migration {
                                version: 5,
                                description: "Task planning and repeat modes",
                                sql: include_str!("../migrations/0005_task_planning.sql"),
                                kind: MigrationKind::Up,
                            },
                            Migration {
                                version: 6,
                                description: "Notes timestamps, task priority, and weekly goal",
                                sql: include_str!("../migrations/0006_notes_priority_and_week.sql"),
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
        .invoke_handler(tauri::generate_handler![tx::execute_transaction])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
