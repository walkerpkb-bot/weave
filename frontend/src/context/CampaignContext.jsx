import React, { createContext, useContext } from 'react'

const CampaignContext = createContext(null)

export function CampaignProvider({ campaignId, campaign, children }) {
  return (
    <CampaignContext.Provider value={{ campaignId, campaign }}>
      {children}
    </CampaignContext.Provider>
  )
}

export function useCampaignContext() {
  const ctx = useContext(CampaignContext)
  if (!ctx) {
    throw new Error('useCampaignContext must be used within a CampaignProvider')
  }
  return ctx
}
