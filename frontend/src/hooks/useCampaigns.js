import { useState, useEffect, useCallback } from 'react'
import * as campaignsApi from '../api/campaigns'

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState([])

  const refresh = useCallback(async (autoSelect) => {
    try {
      const data = await campaignsApi.fetchCampaigns()
      setCampaigns(data.campaigns || [])
      return data
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
      return { campaigns: [] }
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { campaigns, refresh }
}
