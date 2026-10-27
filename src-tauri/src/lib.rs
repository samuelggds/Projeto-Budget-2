use std::path::{Path, PathBuf};
use std::io::Write;
use tauri::Manager;

fn unique_pdf_path(desktop: &Path, filename: &str) -> PathBuf {
  let requested = Path::new(filename);
  let stem = requested
    .file_stem()
    .and_then(|value| value.to_str())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or("documento");

  desktop.join(format!("{stem}.pdf"))
}

#[tauri::command]
fn save_pdf_to_desktop(
  app: tauri::AppHandle,
  filename: String,
  bytes: Vec<u8>,
) -> Result<String, String> {
  if bytes.is_empty() || bytes.len() > 30 * 1024 * 1024 || !bytes.starts_with(b"%PDF-") {
    return Err("PDF inválido ou maior que 30 MB".into());
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

  // create_new impede sobrescrita inclusive quando dois downloads ocorrem juntos.
  let original = unique_pdf_path(&desktop, safe_filename);
  let stem = original.file_stem().and_then(|v| v.to_str()).unwrap_or("documento");
  for suffix in 0..10_000 {
    let destination = if suffix == 0 {
      original.clone()
    } else {
      desktop.join(format!("{stem} ({suffix}).pdf"))
    };
    match std::fs::OpenOptions::new().write(true).create_new(true).open(&destination) {
      Ok(mut file) => {
        if let Err(error) = file.write_all(&bytes) {
          drop(file);
          let _ = std::fs::remove_file(&destination);
          return Err(format!("Não foi possível salvar o PDF: {error}"));
        }
        return Ok(destination.to_string_lossy().into_owned());
      }
      Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
      Err(error) => return Err(format!("Não foi possível salvar o PDF: {error}")),
    }
  }
  Err("Não foi possível encontrar um nome livre para o PDF".into())
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
