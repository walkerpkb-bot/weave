import { apiFetch } from './client'

export const sendDMMessage = (campaignId, data) =>
  apiFetch(`/campaigns/${campaignId}/dm/message`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
