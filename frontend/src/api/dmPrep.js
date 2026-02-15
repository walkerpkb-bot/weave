import { apiFetch } from './client'

export const fetchDMPrep = (campaignId) =>
  apiFetch(`/campaigns/${campaignId}/dm-prep`)

export const sendPrepMessage = (campaignId, message) =>
  apiFetch(`/campaigns/${campaignId}/dm-prep/message`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })

export const createPrepNote = (campaignId, data) =>
  apiFetch(`/campaigns/${campaignId}/dm-prep/note`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updatePrepNote = (campaignId, noteId, data) =>
  apiFetch(`/campaigns/${campaignId}/dm-prep/note/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deletePrepNote = (campaignId, noteId) =>
  apiFetch(`/campaigns/${campaignId}/dm-prep/note/${noteId}`, {
    method: 'DELETE',
  })

export const pinInsight = (campaignId, data) =>
  apiFetch(`/campaigns/${campaignId}/dm-prep/pin`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const deletePin = (campaignId, pinId) =>
  apiFetch(`/campaigns/${campaignId}/dm-prep/pin/${pinId}`, {
    method: 'DELETE',
  })

export const clearConversation = (campaignId) =>
  apiFetch(`/campaigns/${campaignId}/dm-prep/conversation`, {
    method: 'DELETE',
  })
