use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::time::Duration;
use url::Url;

const RADIO_MIRRORS: [&str; 3] = [
    "https://de1.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
];
const ARCHIVE_SEARCH: &str = "https://archive.org/advancedsearch.php";
const ARCHIVE_METADATA: &str = "https://archive.org/metadata";
const RESULT_CAP: u32 = 20;
const PD_MARK: &str = "creativecommons.org/publicdomain/mark/1.0";
const CC0: &str = "creativecommons.org/publicdomain/zero/1.0";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub page: u32,
    pub page_size: u32,
    pub has_more: bool,
    pub partial: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RadioStation {
    #[serde(alias = "stationuuid")]
    pub station_uuid: String,
    pub name: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub codec: String,
    pub bitrate: u32,
    pub stream_url: String,
    pub homepage_url: Option<String>,
    pub artwork_url: Option<String>,
    pub votes: u32,
    pub is_http: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveItemSummary {
    pub identifier: String,
    pub title: String,
    pub creator: String,
    pub date: String,
    pub downloads: u64,
    pub license_url: String,
    pub source_page_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveTrack {
    pub source_id: String,
    pub identifier: String,
    pub file_name: String,
    pub title: String,
    pub creator: String,
    pub duration_sec: Option<f64>,
    pub playback_url: String,
    pub source_page_url: String,
    pub license_url: String,
    pub codec: String,
}

#[derive(Debug, Deserialize)]
struct RadioRaw {
    stationuuid: String,
    name: String,
    #[serde(default)]
    country: String,
    #[serde(default)]
    tags: String,
    #[serde(default)]
    codec: String,
    #[serde(default)]
    bitrate: u32,
    #[serde(default)]
    url_resolved: String,
    #[serde(default)]
    homepage: String,
    #[serde(default)]
    favicon: String,
    #[serde(default)]
    votes: u32,
    #[serde(default)]
    lastcheckok: u8,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent(format!(
            "Deep-Work/{} (desktop focus timer)",
            env!("CARGO_PKG_VERSION")
        ))
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| format!("catalog client: {e}"))
}

fn safe_remote_url(raw: &str, allow_http: bool) -> Option<String> {
    let url = Url::parse(raw.trim()).ok()?;
    if !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    if url.scheme() != "https" && !(allow_http && url.scheme() == "http") {
        return None;
    }
    let host = url.host_str()?.trim_end_matches('.').to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") {
        return None;
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() {
            return None;
        }
        match ip {
            IpAddr::V4(v) if v.is_private() || v.is_link_local() => return None,
            IpAddr::V6(v) if v.is_unique_local() || v.is_unicast_link_local() => return None,
            _ => {}
        }
    }
    Some(url.to_string())
}

fn normalize_radio(raw: RadioRaw) -> Option<RadioStation> {
    if raw.lastcheckok != 1 || raw.stationuuid.trim().is_empty() || raw.name.trim().is_empty() {
        return None;
    }
    let codec = raw.codec.trim().to_ascii_uppercase();
    if !matches!(codec.as_str(), "MP3" | "AAC" | "AAC+" | "OGG") {
        return None;
    }
    let stream_url = safe_remote_url(&raw.url_resolved, true)?;
    if stream_url.to_ascii_lowercase().contains(".m3u8") {
        return None;
    }
    Some(RadioStation {
        station_uuid: raw.stationuuid,
        name: raw.name.trim().to_string(),
        country: raw.country,
        tags: raw
            .tags
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .take(8)
            .map(str::to_string)
            .collect(),
        codec,
        bitrate: raw.bitrate,
        is_http: stream_url.starts_with("http://"),
        stream_url,
        homepage_url: safe_remote_url(&raw.homepage, true),
        artwork_url: safe_remote_url(&raw.favicon, true),
        votes: raw.votes,
    })
}

async fn radio_request(
    client: &Client,
    path: &str,
    params: &[(&str, String)],
) -> Result<Vec<RadioRaw>, String> {
    let mut errors = Vec::new();
    for mirror in RADIO_MIRRORS {
        match client
            .get(format!("{mirror}{path}"))
            .query(params)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                return resp
                    .json()
                    .await
                    .map_err(|e| format!("Radio Browser returned invalid data: {e}"))
            }
            Ok(resp) => errors.push(format!("{}: {}", mirror, resp.status())),
            Err(e) => errors.push(format!("{}: {}", mirror, e)),
        }
    }
    Err(format!(
        "Radio Browser is unavailable ({})",
        errors.join("; ")
    ))
}

#[tauri::command]
pub async fn search_radio(
    query: String,
    page: u32,
    sort: Option<String>,
) -> Result<Page<RadioStation>, String> {
    let client = client()?;
    let page = page.max(1);
    let limit = RESULT_CAP + 1;
    let offset = (page - 1) * RESULT_CAP;
    let order = match sort.as_deref() {
        Some("name") => "name",
        Some("bitrate") => "bitrate",
        _ => "votes",
    };
    let base = vec![
        ("hidebroken", "true".into()),
        ("limit", limit.to_string()),
        ("offset", offset.to_string()),
        ("order", order.into()),
        ("reverse", (order != "name").to_string()),
    ];
    let trimmed = query.trim();
    let mut partial = false;
    let raws;
    if trimmed.is_empty() {
        let mut focus = base.clone();
        focus.push(("tag", "focus".into()));
        raws = radio_request(&client, "/json/stations/search", &focus).await?;
    } else {
        let mut name = base.clone();
        name.push(("name", trimmed.to_string()));
        let mut tag = base.clone();
        tag.push(("tag", trimmed.to_string()));
        let (a, b) = tokio::join!(
            radio_request(&client, "/json/stations/search", &name),
            radio_request(&client, "/json/stations/search", &tag)
        );
        match (a, b) {
            (Ok(mut x), Ok(y)) => {
                x.extend(y);
                raws = x
            }
            (Ok(x), Err(_)) | (Err(_), Ok(x)) => {
                raws = x;
                partial = true
            }
            (Err(a), Err(b)) => return Err(format!("{a}; {b}")),
        }
    }
    let mut seen = HashSet::new();
    let mut items: Vec<_> = raws
        .into_iter()
        .filter_map(normalize_radio)
        .filter(|s| seen.insert(s.station_uuid.clone()))
        .collect();
    match order {
        "name" => items.sort_by_key(|x| x.name.to_ascii_lowercase()),
        "bitrate" => items.sort_by_key(|x| std::cmp::Reverse(x.bitrate)),
        _ => items.sort_by_key(|x| std::cmp::Reverse(x.votes)),
    }
    let has_more = items.len() > RESULT_CAP as usize;
    items.truncate(RESULT_CAP as usize);
    Ok(Page {
        items,
        page,
        page_size: RESULT_CAP,
        has_more,
        partial,
    })
}

#[tauri::command]
pub async fn refresh_radio_station(station_uuid: String) -> Result<RadioStation, String> {
    let rows = radio_request(
        &client()?,
        &format!(
            "/json/stations/byuuid/{}",
            url::form_urlencoded::byte_serialize(station_uuid.as_bytes()).collect::<String>()
        ),
        &[],
    )
    .await?;
    rows.into_iter()
        .find_map(normalize_radio)
        .ok_or_else(|| "Station is offline or uses an unsupported stream format.".into())
}

#[tauri::command]
pub async fn report_radio_click(station_uuid: String) -> Result<(), String> {
    let client = client()?;
    for mirror in RADIO_MIRRORS {
        if let Ok(r) = client
            .get(format!(
                "{mirror}/json/url/{}",
                url::form_urlencoded::byte_serialize(station_uuid.as_bytes()).collect::<String>()
            ))
            .send()
            .await
        {
            if r.status().is_success() {
                return Ok(());
            }
        }
    }
    Err("Could not report station start.".into())
}

fn license_kind(raw: &str) -> Option<&'static str> {
    let value = raw.to_ascii_lowercase();
    if value.contains(PD_MARK) {
        Some("Public Domain Mark 1.0")
    } else if value.contains(CC0) {
        Some("CC0 1.0")
    } else {
        None
    }
}
fn string_field(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(x)) => x.clone(),
        Some(Value::Array(x)) => x
            .first()
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        Some(v) => v.to_string().trim_matches('"').to_string(),
        None => String::new(),
    }
}

#[tauri::command]
pub async fn search_archive(
    query: String,
    page: u32,
    sort: Option<String>,
) -> Result<Page<ArchiveItemSummary>, String> {
    let page = page.max(1);
    let rows = 12u32;
    let terms = query.trim();
    let escaped = terms.replace('\\', "\\\\").replace('"', "\\\"");
    let q = format!("mediatype:audio AND ({escaped}) AND (licenseurl:(\"https://creativecommons.org/publicdomain/mark/1.0/\" OR \"http://creativecommons.org/publicdomain/mark/1.0/\" OR \"https://creativecommons.org/publicdomain/zero/1.0/\" OR \"http://creativecommons.org/publicdomain/zero/1.0/\"))");
    let sort_value = match sort.as_deref() {
        Some("downloads") => "downloads desc",
        Some("date") => "date desc",
        _ => "_score desc",
    };
    let response = client()?
        .get(ARCHIVE_SEARCH)
        .query(&[
            ("q", q),
            (
                "fl[]",
                "identifier,title,creator,date,downloads,licenseurl".into(),
            ),
            ("rows", (rows + 1).to_string()),
            ("page", page.to_string()),
            ("sort[]", sort_value.into()),
            ("output", "json".into()),
        ])
        .send()
        .await
        .map_err(|e| format!("Internet Archive is unavailable: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Internet Archive returned {}", response.status()));
    }
    let value: Value = response
        .json()
        .await
        .map_err(|e| format!("Internet Archive returned invalid data: {e}"))?;
    let docs = value
        .pointer("/response/docs")
        .and_then(Value::as_array)
        .ok_or("Internet Archive returned invalid search metadata.")?;
    let mut items = Vec::new();
    for doc in docs {
        let id = string_field(doc.get("identifier"));
        let license = string_field(doc.get("licenseurl"));
        if id.is_empty() || license_kind(&license).is_none() {
            continue;
        }
        items.push(ArchiveItemSummary {
            title: string_field(doc.get("title")),
            creator: string_field(doc.get("creator")),
            date: string_field(doc.get("date")),
            downloads: doc.get("downloads").and_then(Value::as_u64).unwrap_or(0),
            license_url: license,
            source_page_url: format!("https://archive.org/details/{id}"),
            identifier: id,
        });
    }
    let has_more = items.len() > rows as usize;
    items.truncate(rows as usize);
    Ok(Page {
        items,
        page,
        page_size: rows,
        has_more,
        partial: false,
    })
}

#[tauri::command]
pub async fn get_archive_item_tracks(identifier: String) -> Result<Vec<ArchiveTrack>, String> {
    if identifier.is_empty() || identifier.contains('/') || identifier.contains("..") {
        return Err("Invalid Archive identifier.".into());
    }
    let response = client()?
        .get(format!("{ARCHIVE_METADATA}/{identifier}"))
        .send()
        .await
        .map_err(|e| format!("Internet Archive metadata is unavailable: {e}"))?;
    if response.status() == StatusCode::NOT_FOUND {
        return Err("Archive item was not found.".into());
    }
    let value: Value = response
        .json()
        .await
        .map_err(|e| format!("Internet Archive returned invalid metadata: {e}"))?;
    let metadata = value
        .get("metadata")
        .and_then(Value::as_object)
        .ok_or("Archive item has no metadata.")?;
    let license = string_field(metadata.get("licenseurl"));
    if license_kind(&license).is_none() {
        return Err("This item is no longer marked public domain or CC0.".into());
    }
    let creator = string_field(metadata.get("creator"));
    let files = value
        .get("files")
        .and_then(Value::as_array)
        .ok_or("Archive item has no files.")?;
    let mut grouped: HashMap<String, (u8, ArchiveTrack)> = HashMap::new();
    for f in files {
        let name = string_field(f.get("name"));
        let format = string_field(f.get("format"));
        let rank = if format.contains("VBR MP3") {
            0
        } else if format == "MP3" || format.contains("MP3") {
            1
        } else if format.contains("FLAC") {
            2
        } else {
            continue;
        };
        let original = string_field(f.get("original"));
        let key = if original.is_empty() {
            name.trim_end_matches(".mp3")
                .trim_end_matches(".flac")
                .to_string()
        } else {
            original
        };
        let encoded: String = url::form_urlencoded::byte_serialize(name.as_bytes()).collect();
        let Some(playback_url) = safe_remote_url(
            &format!("https://archive.org/download/{identifier}/{encoded}"),
            false,
        ) else {
            continue;
        };
        let title = {
            let t = string_field(f.get("title"));
            if t.is_empty() {
                name.rsplit('/')
                    .next()
                    .unwrap_or(&name)
                    .trim_end_matches(".mp3")
                    .trim_end_matches(".flac")
                    .to_string()
            } else {
                t
            }
        };
        let track = ArchiveTrack {
            source_id: format!("{identifier}:{key}"),
            identifier: identifier.clone(),
            file_name: name,
            title,
            creator: creator.clone(),
            duration_sec: string_field(f.get("length")).parse().ok(),
            playback_url,
            source_page_url: format!("https://archive.org/details/{identifier}"),
            license_url: license.clone(),
            codec: if rank == 2 {
                "FLAC".into()
            } else {
                "MP3".into()
            },
        };
        if grouped
            .get(&key)
            .map(|(old, _)| rank < *old)
            .unwrap_or(true)
        {
            grouped.insert(key, (rank, track));
        }
    }
    let mut tracks: Vec<_> = grouped.into_values().map(|(_, t)| t).collect();
    tracks.sort_by_key(|t| t.file_name.clone());
    if tracks.is_empty() {
        return Err("No compatible MP3 or FLAC tracks were found.".into());
    }
    Ok(tracks)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unsafe_urls() {
        for url in [
            "file:///tmp/a.mp3",
            "http://localhost/a",
            "http://127.0.0.1/a",
            "http://10.0.0.2/a",
            "https://u:p@example.com/a",
        ] {
            assert!(safe_remote_url(url, true).is_none(), "{url}");
        }
    }
    #[test]
    fn accepts_public_streams() {
        assert!(safe_remote_url("https://radio.example.org/live.mp3", true).is_some());
        assert!(safe_remote_url("http://radio.example.org/live.ogg", true).is_some());
    }
    #[test]
    fn recognizes_only_supported_rights() {
        assert_eq!(
            license_kind("https://creativecommons.org/publicdomain/mark/1.0/"),
            Some("Public Domain Mark 1.0")
        );
        assert_eq!(
            license_kind("https://creativecommons.org/licenses/by/4.0/"),
            None
        );
    }
    #[test]
    fn filters_broken_hls_and_unknown_codecs() {
        let raw = RadioRaw {
            stationuuid: "x".into(),
            name: "X".into(),
            country: "".into(),
            tags: "study,ambient".into(),
            codec: "MP3".into(),
            bitrate: 128,
            url_resolved: "https://example.org/live.m3u8".into(),
            homepage: "".into(),
            favicon: "".into(),
            votes: 1,
            lastcheckok: 1,
        };
        assert!(normalize_radio(raw).is_none());
    }
}
