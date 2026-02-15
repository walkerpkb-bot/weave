import { apiFetch, apiUpload } from './client'

export const fetchCampaigns = () => apiFetch('/campaigns')

export const fetchCampaign = (id) => apiFetch(`/campaigns/${id}`)

export const createCampaign = (data) =>
  apiFetch('/campaigns', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateCampaign = (id, data) =>
  apiFetch(`/campaigns/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deleteCampaign = (id) =>
  apiFetch(`/campaigns/${id}`, { method: 'DELETE' })

export const selectCampaign = (id) =>
  apiFetch(`/campaigns/${id}/select`, { method: 'PUT' })

export const uploadBanner = (id, formData) =>
  apiUpload(`/campaigns/${id}/banner`, formData)

export const fetchSystemConfig = (id) =>
  apiFetch(`/campaigns/${id}/system`)

export const updateSystemConfig = (id, system) =>
  apiFetch(`/campaigns/${id}/system`, {
    method: 'PUT',
    body: JSON.stringify(system),
  })
