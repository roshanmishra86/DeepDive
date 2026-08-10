//! Phase 11 P0-1: real multi-statement transactions for the SQL driver.
//!
//! Replaces the retired TauriDriver approach of folding BEGIN/…/COMMIT into
//! one multi-statement plugin execute() string, which could strand a pooled
//! connection mid-transaction when a middle statement failed (sqlx does not
//! roll back on pool release). This command owns ONE fresh connection for
//! the entire operation: begin, run every statement, commit — or roll back
//! on any failure — then drop the connection. Per-call connections also
//! mean no connection state can leak between transactions.

use serde::{Deserialize, Serialize};
use sqlx::{Connection, SqliteConnection};
use std::path::Path;
use tauri::Manager;

#[derive(Debug, Deserialize)]
pub struct TxStatement {
    sql: String,
    #[serde(default)]
    params: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TxResult {
    rows_affected: u64,
    last_insert_id: i64,
}

/// Core logic, separated from the command so `#[cfg(test)]` tests can drive
/// it against a temp file without an AppHandle.
pub async fn run_in_transaction(
    db_path: &Path,
    statements: &[TxStatement],
) -> Result<Vec<TxResult>, String> {
    if statements.is_empty() {
        return Ok(vec![]);
    }
    // Deliberately NO create_if_missing: the plugin pool creates and
    // migrates the database on first open, long before any transaction can
    // run, so the file always exists here. If it does not, the path is
    // wrong (e.g. a platform path-mapping drift) and the correct failure
    // is a connect error — not a silently created second, empty database
    // that every statement then fails against with "no such table"
    // (PR #13 review).
    let options = sqlx::sqlite::SqliteConnectOptions::new().filename(db_path);
    let mut conn = SqliteConnection::connect_with(&options)
        .await
        .map_err(|e| format!("connect: {e}"))?;
    let mut tx = conn.begin().await.map_err(|e| format!("begin: {e}"))?;

    let mut results = Vec::with_capacity(statements.len());
    for (i, stmt) in statements.iter().enumerate() {
        let mut query = sqlx::query(&stmt.sql);
        for value in &stmt.params {
            query = match value {
                serde_json::Value::Null => query.bind(Option::<i64>::None),
                serde_json::Value::Bool(b) => query.bind(*b),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        query.bind(i)
                    } else if let Some(f) = n.as_f64() {
                        query.bind(f)
                    } else {
                        return Err(format!("statement {i}: unrepresentable number {n}"));
                    }
                }
                serde_json::Value::String(s) => query.bind(s.as_str()),
                other => return Err(format!("statement {i}: unsupported param type {other}")),
            };
        }
        match query.execute(&mut *tx).await {
            Ok(result) => results.push(TxResult {
                rows_affected: result.rows_affected(),
                last_insert_id: result.last_insert_rowid(),
            }),
            Err(e) => {
                // Best-effort rollback; the connection is dropped right after
                // either way, so nothing can be left stranded for later users.
                let _ = tx.rollback().await;
                return Err(format!(
                    "statement {i} failed, transaction rolled back: {e}"
                ));
            }
        }
    }
    tx.commit().await.map_err(|e| format!("commit: {e}"))?;
    Ok(results)
}

#[tauri::command]
pub async fn execute_transaction(
    app: tauri::AppHandle,
    statements: Vec<TxStatement>,
) -> Result<Vec<TxResult>, String> {
    // Must match tauri-plugin-sql's path_mapper for "sqlite:deepwork.db":
    // app_config_dir() + the filename from the connection string.
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("app_config_dir: {e}"))?;
    run_in_transaction(&dir.join("deepwork.db"), &statements).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;

    fn temp_db_path(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("deepwork-tx-test-{}-{tag}.db", std::process::id()))
    }

    async fn setup_schema(path: &Path) {
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true);
        let mut conn = SqliteConnection::connect_with(&options)
            .await
            .expect("connect for schema setup");
        sqlx::query("CREATE TABLE t (id INTEGER PRIMARY KEY, n INTEGER NOT NULL CHECK (n > 0))")
            .execute(&mut conn)
            .await
            .expect("create table");
    }

    async fn read_all_n(path: &Path) -> Vec<i64> {
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true);
        let mut conn = SqliteConnection::connect_with(&options)
            .await
            .expect("connect for read-back");
        let rows = sqlx::query("SELECT n FROM t ORDER BY id")
            .fetch_all(&mut conn)
            .await
            .expect("select");
        rows.iter().map(|r| r.get::<i64, _>(0)).collect()
    }

    fn insert_stmt(n: i64) -> TxStatement {
        TxStatement {
            sql: "INSERT INTO t (n) VALUES (?)".to_string(),
            params: vec![serde_json::Value::Number(n.into())],
        }
    }

    #[tokio::test]
    async fn happy_path_commits_all_statements() {
        let path = temp_db_path("happy");
        let _ = std::fs::remove_file(&path);
        setup_schema(&path).await;

        let results = run_in_transaction(&path, &[insert_stmt(1), insert_stmt(2)])
            .await
            .expect("transaction should succeed");
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].last_insert_id, 1);
        assert_eq!(results[1].last_insert_id, 2);

        let rows = read_all_n(&path).await;
        assert_eq!(rows, vec![1, 2]);

        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn middle_failure_rolls_back_and_leaves_db_usable() {
        let path = temp_db_path("rollback");
        let _ = std::fs::remove_file(&path);
        setup_schema(&path).await;

        // n = -5 violates CHECK (n > 0): the middle statement fails.
        let result =
            run_in_transaction(&path, &[insert_stmt(1), insert_stmt(-5), insert_stmt(3)]).await;
        assert!(result.is_err(), "expected the transaction to fail");

        // Rollback genuinely happened: zero rows visible from a fresh conn.
        let rows = read_all_n(&path).await;
        assert_eq!(rows, Vec::<i64>::new(), "rollback must leave zero rows");

        // The database is still usable: a subsequent transaction succeeds.
        run_in_transaction(&path, &[insert_stmt(7)])
            .await
            .expect("subsequent transaction should succeed");
        let rows = read_all_n(&path).await;
        assert_eq!(rows, vec![7]);

        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn missing_file_is_a_connect_error_not_a_silent_new_database() {
        let path = temp_db_path("missing");
        let _ = std::fs::remove_file(&path);

        let result = run_in_transaction(&path, &[insert_stmt(1)]).await;
        assert!(
            result.is_err(),
            "a missing database file must fail to connect"
        );
        assert!(
            !path.exists(),
            "the command must not create a second, empty database at a wrong path"
        );
    }

    #[tokio::test]
    async fn empty_statement_list_is_ok() {
        let path = temp_db_path("empty");
        let _ = std::fs::remove_file(&path);
        // No schema setup: empty list must not even touch the file.
        run_in_transaction(&path, &[])
            .await
            .expect("empty transaction should be a no-op Ok");
        let _ = std::fs::remove_file(&path);
    }
}
