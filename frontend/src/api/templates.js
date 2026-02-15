import { apiFetch } from './client'

export const fetchTemplates = () => apiFetch('/templates')

export const fetchTemplate = (id) => apiFetch(`/templates/${id}`)
