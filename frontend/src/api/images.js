import { apiFetch } from './client'

export const generateImage = (campaignId, data) =>
  apiFetch(`/campaigns/${campaignId}/image/generate`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
