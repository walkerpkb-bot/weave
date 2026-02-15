import { apiFetch } from './client'

export const fetchCharacters = (campaignId) =>
  apiFetch(`/campaigns/${campaignId}/characters`)

export const createCharacter = (campaignId, character) =>
  apiFetch(`/campaigns/${campaignId}/characters`, {
    method: 'POST',
    body: JSON.stringify(character),
  })

export const fetchCharacter = (campaignId, charId) =>
  apiFetch(`/campaigns/${campaignId}/characters/${charId}`)

export const updateCharacter = (campaignId, charId, updates) =>
  apiFetch(`/campaigns/${campaignId}/characters/${charId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })

export const deleteCharacter = (campaignId, charId) =>
  apiFetch(`/campaigns/${campaignId}/characters/${charId}`, {
    method: 'DELETE',
  })
