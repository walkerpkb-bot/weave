import { apiFetch } from './client'

export const fetchTown = (campaignId) =>
  apiFetch(`/campaigns/${campaignId}/town`)

export const updateTown = (campaignId, data) =>
  apiFetch(`/campaigns/${campaignId}/town`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const fetchStash = (campaignId) =>
  apiFetch(`/campaigns/${campaignId}/stash`)

export const updateStash = (campaignId, items) =>
  apiFetch(`/campaigns/${campaignId}/stash`, {
    method: 'PUT',
    body: JSON.stringify(items),
  })
