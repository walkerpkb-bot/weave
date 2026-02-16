import { useState, useEffect, useCallback } from 'react'
import * as campaignsApi from '../api/campaigns'

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [serverActiveCampaignId, setServerActiveCampaignId] = useState(null)

  const refresh = useCallback(async (autoSelect) => {
    try {
      const data = await campaignsApi.fetchCampaigns()
      setCampaigns(data.campaigns || [])
      setServerActiveCampaignId(data.activeCampaignId || null)
      return data
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
      return { campaigns: [] }
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { campaigns, serverActiveCampaignId, refresh }
}
