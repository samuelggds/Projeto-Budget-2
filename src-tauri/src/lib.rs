use std::path::{Path, PathBuf};
use tauri::Manager;

fn unique_pdf_path(desktop: &Path, filename: &str) -> PathBuf {
  let requested = Path::new(filename);
  let stem = requested
    .file_stem()
    .and_then(|value| value.to_str())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or("documento");

  let mut candidate = desktop.join(format!("{stem}.pdf"));
  let mut suffix = 1;

  while candidate.exists() {
    candidate = desktop.join(format!("{stem} ({suffix}).pdf"));
    suffix += 1;
  }

  candidate
}

#[tauri::command]
fn save_pdf_to_desktop(
  app: tauri::AppHandle,
  filename: String,
  bytes: Vec<u8>,
) -> Result<String, String> {
  if bytes.is_empty() {
    return Err("O PDF está vazio".into());
  }

  let safe_filename = Path::new(&filename)
    .file_name()
    .and_then(|value| value.to_str())
    .ok_or_else(|| "Nome de arquivo inválido".to_string())?;

  if !safe_filename.to_ascii_lowercase().ends_with(".pdf") {
    return Err("O arquivo precisa ter extensão .pdf".into());
  }

  let desktop = app
    .path()
    .desktop_dir()
    .map_err(|error| format!("Não foi possível localizar a Área de Trabalho: {error}"))?;

  let destination = unique_pdf_path(&desktop, safe_filename);
  std::fs::write(&destination, bytes)
    .map_err(|error| format!("Não foi possível salvar o PDF: {error}"))?;

  Ok(destination.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![save_pdf_to_desktop])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
