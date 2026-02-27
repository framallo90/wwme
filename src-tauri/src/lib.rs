#[cfg(target_os = "windows")]
use std::{
  fs,
  path::PathBuf,
  process::Command,
  time::{SystemTime, UNIX_EPOCH},
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportAudiobookInput {
  text: String,
  output_path: String,
  language: String,
  voice_name: Option<String>,
  rate: f32,
  volume: f32,
}

#[cfg(target_os = "windows")]
const AUDIO_EXPORT_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$textPath = ([string]$env:WRITEWME_AUDIO_TEXT_PATH).Trim()
$outPath = ([string]$env:WRITEWME_AUDIO_OUTPUT).Trim()
$language = ([string]$env:WRITEWME_AUDIO_LANGUAGE).Trim()
$voiceName = ([string]$env:WRITEWME_AUDIO_VOICE).Trim()
$rate = [int]([string]$env:WRITEWME_AUDIO_RATE_SAPI)
$volume = [int]([string]$env:WRITEWME_AUDIO_VOLUME_SAPI)

$text = Get-Content -Raw -LiteralPath $textPath -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($text)) {
  throw 'No hay texto para exportar.'
}

$directory = [System.IO.Path]::GetDirectoryName($outPath)
if (-not [string]::IsNullOrWhiteSpace($directory)) {
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voiceSelected = $false
  if (-not [string]::IsNullOrWhiteSpace($voiceName)) {
    try {
      $synth.SelectVoice($voiceName)
      $voiceSelected = $true
    } catch {
      $voiceSelected = $false
    }
  }

  if (-not $voiceSelected -and -not [string]::IsNullOrWhiteSpace($language)) {
    $languageLower = $language.ToLowerInvariant()
    $languageBase = $language.Split('-')[0].ToLowerInvariant()
    $voiceMatch = $synth.GetInstalledVoices() |
      Where-Object {
        $_.Enabled -and $_.VoiceInfo.Culture -and
        (
          $_.VoiceInfo.Culture.Name.ToLowerInvariant() -eq $languageLower -or
          $_.VoiceInfo.Culture.Name.ToLowerInvariant().StartsWith($languageBase + '-')
        )
      } |
      Select-Object -First 1

    if ($null -eq $voiceMatch) {
      $voiceMatch = $synth.GetInstalledVoices() |
        Where-Object {
          $_.Enabled -and $_.VoiceInfo.Culture -and
          $_.VoiceInfo.Culture.Name.ToLowerInvariant() -eq $languageBase
        } |
        Select-Object -First 1
    }

    if ($null -ne $voiceMatch) {
      $synth.SelectVoice($voiceMatch.VoiceInfo.Name)
    }
  }

  $synth.Rate = $rate
  $synth.Volume = $volume
  $synth.SetOutputToWaveFile($outPath)
  try {
    $synth.Speak($text)
  } finally {
    $synth.SetOutputToNull()
  }

  Write-Output $outPath
} finally {
  $synth.Dispose()
}
"#;

#[cfg(target_os = "windows")]
fn build_temp_audio_text_path() -> PathBuf {
  let mut path = std::env::temp_dir();
  let stamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or(0);
  path.push(format!("writewme-audio-{}-{stamp}.txt", std::process::id()));
  path
}

#[cfg(target_os = "windows")]
fn map_audio_rate_to_sapi(rate: f32) -> i32 {
  let clamped = rate.clamp(0.5, 2.0);
  if clamped <= 1.0 {
    (((clamped - 0.5) / 0.5) * 10.0 - 10.0).round() as i32
  } else {
    (((clamped - 1.0) / 1.0) * 10.0).round() as i32
  }
}

#[cfg(target_os = "windows")]
fn map_audio_volume_to_sapi(volume: f32) -> i32 {
  (volume.clamp(0.0, 1.0) * 100.0).round() as i32
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn export_audiobook_wav(input: ExportAudiobookInput) -> Result<String, String> {
  let normalized_text = input.text.trim();
  if normalized_text.is_empty() {
    return Err("No hay texto para exportar.".into());
  }

  let output_path = input.output_path.trim();
  if output_path.is_empty() {
    return Err("No se encontro la ruta de salida para el audiolibro.".into());
  }

  let text_path = build_temp_audio_text_path();
  fs::write(&text_path, normalized_text.as_bytes())
    .map_err(|error| format!("No se pudo preparar el texto para audio: {error}"))?;

  let requested_voice = input.voice_name.unwrap_or_default().trim().to_string();
  let command_result = Command::new("powershell")
    .args(["-NoProfile", "-NonInteractive", "-Command", AUDIO_EXPORT_SCRIPT])
    .env("WRITEWME_AUDIO_TEXT_PATH", &text_path)
    .env("WRITEWME_AUDIO_OUTPUT", output_path)
    .env("WRITEWME_AUDIO_LANGUAGE", input.language.trim())
    .env("WRITEWME_AUDIO_VOICE", requested_voice)
    .env("WRITEWME_AUDIO_RATE_SAPI", map_audio_rate_to_sapi(input.rate).to_string())
    .env("WRITEWME_AUDIO_VOLUME_SAPI", map_audio_volume_to_sapi(input.volume).to_string())
    .output();

  let _ = fs::remove_file(&text_path);

  let output = command_result.map_err(|error| format!("No se pudo iniciar la exportacion de audio: {error}"))?;
  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() {
      stderr
    } else if !stdout.is_empty() {
      stdout
    } else {
      format!("PowerShell finalizo con codigo {:?}", output.status.code())
    };
    return Err(format!("Fallo al generar WAV: {detail}"));
  }

  let exported_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
  if exported_path.is_empty() {
    Ok(output_path.to_string())
  } else {
    Ok(exported_path)
  }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn export_audiobook_wav(_input: ExportAudiobookInput) -> Result<String, String> {
  Err("La exportacion de audiolibro WAV con voces del sistema esta disponible solo en Windows por ahora.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![export_audiobook_wav])
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
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
