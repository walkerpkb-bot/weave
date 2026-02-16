import { apiFetch } from './client'

export const createContent = (campaignId, content) =>
  apiFetch(`/campaigns/${campaignId}/content`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })

export const fetchContent = (campaignId) =>
  apiFetch(`/campaigns/${campaignId}/content`)

export const updateContent = (campaignId, content) =>
  apiFetch(`/campaigns/${campaignId}/content`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  })

export const saveDraft = (campaignId, content) =>
  apiFetch(`/campaigns/${campaignId}/draft`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })

export const fetchDraft = (campaignId) =>
  apiFetch(`/campaigns/${campaignId}/draft`)

export const fetchAvailableBeats = (campaignId) =>
  apiFetch(`/campaigns/${campaignId}/available-beats`)

export const hitBeat = (campaignId, data) =>
  apiFetch(`/campaigns/${campaignId}/hit-beat`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const generateFields = (campaignId, payload) =>
  apiFetch(`/campaigns/${campaignId}/generate-fields`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const generateFieldsStandalone = (payload) =>
  apiFetch('/generate-fields', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
