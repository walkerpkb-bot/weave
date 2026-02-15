import { apiFetch } from './client'

export const fetchSession = (campaignId) =>
  apiFetch(`/campaigns/${campaignId}/session`)

export const startSession = (campaignId, data) =>
  apiFetch(`/campaigns/${campaignId}/session/start`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateSession = (campaignId, updates) =>
  apiFetch(`/campaigns/${campaignId}/session/update`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })

export const endSession = (campaignId, data) =>
  apiFetch(`/campaigns/${campaignId}/session/end`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const logDiceRoll = (campaignId, roll) =>
  apiFetch(`/campaigns/${campaignId}/dice/roll`, {
    method: 'POST',
    body: JSON.stringify(roll),
  })
