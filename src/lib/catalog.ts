import { invoke } from '@tauri-apps/api/core'
import type { PlayableItem } from '../db/types'
import { isTauri } from './platform'

export interface PagedResult<T> { items: T[]; page: number; pageSize: number; hasMore: boolean; partial: boolean }
export type RadioSort = 'popularity' | 'name' | 'bitrate'
export type ArchiveSort = 'relevance' | 'downloads' | 'date'
export interface RadioStation { stationUuid: string; name: string; country: string; tags: string[]; codec: string; bitrate: number; streamUrl: string; homepageUrl: string | null; artworkUrl: string | null; votes: number; isHttp: boolean }
export interface ArchiveItemSummary { identifier: string; title: string; creator: string; date: string; downloads: number; licenseUrl: string; sourcePageUrl: string }
export interface ArchiveTrack { sourceId: string; identifier: string; fileName: string; title: string; creator: string; durationSec: number | null; playbackUrl: string; sourcePageUrl: string; licenseUrl: string; codec: string }

function desktopOnly(): never { throw new Error('Online catalogs are available in the Deep Work desktop app.') }
export async function searchRadio(query: string, page: number, sort: RadioSort) { if (!isTauri()) desktopOnly(); return invoke<PagedResult<RadioStation>>('search_radio', { query, page, sort }) }
export async function refreshRadioStation(stationUuid: string) { if (!isTauri()) desktopOnly(); return invoke<RadioStation>('refresh_radio_station', { stationUuid }) }
export async function reportRadioClick(stationUuid: string) { if (!isTauri()) return; await invoke('report_radio_click', { stationUuid }) }
export async function searchArchive(query: string, page: number, sort: ArchiveSort) { if (!isTauri()) desktopOnly(); return invoke<PagedResult<ArchiveItemSummary>>('search_archive', { query, page, sort }) }
export async function getArchiveItemTracks(identifier: string) { if (!isTauri()) desktopOnly(); return invoke<ArchiveTrack[]>('get_archive_item_tracks', { identifier }) }

export function radioPlayable(station: RadioStation, trackId: number | null = null): PlayableItem { return { key: `radio:${station.stationUuid}`, trackId, sourceKind:'radio', sourceId:station.stationUuid, title:station.name, creator:null, category:'live radio', playbackUrl:station.streamUrl, artworkUrl:station.artworkUrl, sourcePageUrl:station.homepageUrl, country:station.country || null, codec:station.codec || null, bitrate:station.bitrate || null, licenseUrl:null, tags:station.tags, durationSec:null, live:true, isHttp:station.isHttp } }
export function archivePlayable(track: ArchiveTrack, trackId: number | null = null): PlayableItem { return { key:`archive:${track.sourceId}`, trackId, sourceKind:'archive', sourceId:track.sourceId, title:track.title, creator:track.creator || null, category:'archive', playbackUrl:track.playbackUrl, artworkUrl:null, sourcePageUrl:track.sourcePageUrl, country:null, codec:track.codec, bitrate:null, licenseUrl:track.licenseUrl, tags:[], durationSec:track.durationSec, live:false, isHttp:false } }
