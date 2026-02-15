import { useState, useEffect, useCallback } from 'react'
import * as campaignsApi from '../api/campaigns'
import * as charactersApi from '../api/characters'
import * as sessionsApi from '../api/sessions'
import * as townApi from '../api/town'
import * as contentApi from '../api/content'

export function useCampaignData(campaignId) {
  const [session, setSession] = useState(null)
  const [roster, setRoster] = useState([])
  const [town, setTown] = useState(null)
  const [systemConfig, setSystemConfig] = useState(null)

  const fetchSystemConfig = useCallback(async () => {
    if (!campaignId) return
    try {
      const data = await campaignsApi.fetchSystemConfig(campaignId)
      setSystemConfig(data)
    } catch (err) {
      console.error('Failed to fetch system config:', err)
    }
  }, [campaignId])

  const fetchSession = useCallback(async () => {
    if (!campaignId) return
    try {
      const data = await sessionsApi.fetchSession(campaignId)
      setSession(data)
    } catch (err) {
      console.error('Failed to fetch session:', err)
    }
  }, [campaignId])

  const fetchRoster = useCallback(async () => {
    if (!campaignId) return
    try {
      const data = await charactersApi.fetchCharacters(campaignId)
      setRoster(data)
    } catch (err) {
      console.error('Failed to fetch roster:', err)
    }
  }, [campaignId])

  const fetchTown = useCallback(async () => {
    if (!campaignId) return
    try {
      const data = await townApi.fetchTown(campaignId)
      setTown(data)
    } catch (err) {
      console.error('Failed to fetch town:', err)
    }
  }, [campaignId])

  const handleCreateCharacter = useCallback(async (character) => {
    if (!campaignId) return
    try {
      const newChar = await charactersApi.createCharacter(campaignId, character)
      setRoster(prev => [...prev, newChar])
      return newChar
    } catch (err) {
      console.error('Failed to create character:', err)
    }
  }, [campaignId])

  const handleStartSession = useCallback(async (quest, location, partyIds) => {
    if (!campaignId) return
    try {
      const data = await sessionsApi.startSession(campaignId, { quest, location, partyIds })
      setSession(data)
      return data
    } catch (err) {
      console.error('Failed to start session:', err)
    }
  }, [campaignId])

  const handleUpdateSession = useCallback(async (updates) => {
    if (!campaignId) return
    try {
      const data = await sessionsApi.updateSession(campaignId, updates)
      setSession(data)
    } catch (err) {
      console.error('Failed to update session:', err)
    }
  }, [campaignId])

  const handleEndSession = useCallback(async (outcome) => {
    if (!campaignId) return
    if (!confirm(`End the run with "${outcome}"?`)) return

    try {
      // First complete the authored run if applicable
      try {
        await contentApi.completeRun(campaignId, {
          outcome,
          facts_learned: [],
          npcs_met: [],
          locations_visited: [],
        })
      } catch (runErr) {
        console.log('No authored run to complete (freestyle campaign)')
      }

      // Then end the session
      await sessionsApi.endSession(campaignId, { outcome })
      fetchSession()
      fetchRoster() // Refresh to show updated XP
    } catch (err) {
      console.error('Failed to end session:', err)
    }
  }, [campaignId, fetchSession, fetchRoster])

  // Reset all state (when switching campaigns)
  const reset = useCallback(() => {
    setSession(null)
    setRoster([])
    setTown(null)
    setSystemConfig(null)
  }, [])

  return {
    session,
    roster,
    town,
    systemConfig,
    fetchSystemConfig,
    fetchSession,
    fetchRoster,
    fetchTown,
    handleCreateCharacter,
    handleStartSession,
    handleUpdateSession,
    handleEndSession,
    reset,
  }
}
