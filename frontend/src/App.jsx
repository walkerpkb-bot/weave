import React, { useState, useEffect } from 'react'
import CharacterSheet from './components/CharacterSheet'
import RosterView from './components/RosterView'
import TownView from './components/TownView'
import SessionPanel from './components/SessionPanel'
import ChatWindow from './components/ChatWindow'
import PartyStatus from './components/PartyStatus'
import ImagePanel from './components/ImagePanel'
import CampaignSelector from './components/CampaignSelector'
import SettingsModal from './components/SettingsModal'
import InCampaignHeader from './components/InCampaignHeader'
import { CampaignProvider } from './context/CampaignContext'
import { useCampaigns } from './hooks/useCampaigns'
import { useCampaignData } from './hooks/useCampaignData'
import * as campaignsApi from './api/campaigns'

function App() {
  const [currentView, setCurrentView] = useState('campaign-select')
  const [activeCampaignId, setActiveCampaignId] = useState(null)
  const [activeCampaign, setActiveCampaign] = useState(null)
  const [view, setView] = useState('session')
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [userSwitchedAway, setUserSwitchedAway] = useState(false)

  const { campaigns, serverActiveCampaignId, refresh: refreshCampaigns } = useCampaigns()
  const {
    session, roster, town, systemConfig, campaignContent,
    fetchSystemConfig, fetchSession, fetchRoster, fetchTown, fetchContent,
    handleCreateCharacter, handleStartSession, handleUpdateSession, handleEndSession,
    reset,
  } = useCampaignData(activeCampaignId)

  // Auto-select on initial load if server has an active campaign
  useEffect(() => {
    if (serverActiveCampaignId && !activeCampaignId && !userSwitchedAway) {
      selectCampaign(serverActiveCampaignId)
    }
  }, [serverActiveCampaignId])

  // When campaign is selected, fetch campaign data
  useEffect(() => {
    if (activeCampaignId && currentView === 'in-campaign') {
      fetchSystemConfig()
      fetchSession()
      fetchRoster()
      fetchTown()
      fetchContent()
    }
  }, [activeCampaignId, currentView])

  // Refetch session when switching to session view
  useEffect(() => {
    if (view === 'session' && activeCampaignId) {
      fetchSession()
    }
  }, [view])

  const selectCampaign = async (campaignId) => {
    setUserSwitchedAway(false)
    try {
      await campaignsApi.selectCampaign(campaignId)
      const campaign = campaigns.find(c => c.id === campaignId) ||
        (await campaignsApi.fetchCampaign(campaignId))
      setActiveCampaignId(campaignId)
      setActiveCampaign(campaign)
      setCurrentView('in-campaign')
      setView('session')
    } catch (err) {
      console.error('Failed to select campaign:', err)
    }
  }

  const switchCampaign = () => {
    setUserSwitchedAway(true)
    setCurrentView('campaign-select')
    setActiveCampaignId(null)
    reset()
    refreshCampaigns()
  }

  const onCreateCharacter = async (character) => {
    await handleCreateCharacter(character)
    setSelectedCharacter(null)
  }

  const onStartSession = async (quest, location, partyIds) => {
    await handleStartSession(quest, location, partyIds)
    setView('session')
  }

  if (currentView === 'campaign-select') {
    return (
      <div className="app">
        <CampaignSelector
          campaigns={campaigns}
          onSelectCampaign={selectCampaign}
          onOpenSettings={() => setShowSettings(true)}
        />
        {showSettings && (
          <SettingsModal
            campaigns={campaigns}
            onClose={() => setShowSettings(false)}
            onRefresh={refreshCampaigns}
          />
        )}
      </div>
    )
  }

  return (
    <CampaignProvider campaignId={activeCampaignId} campaign={activeCampaign}>
      <div className="app">
        <InCampaignHeader
          campaign={activeCampaign}
          view={view}
          setView={setView}
          onSwitchCampaign={switchCampaign}
        />

        <main className="app-main">
          {view === 'session' && (
            <div className="session-view">
              <div className="session-left">
                <ChatWindow
                  session={session}
                  onSessionUpdate={handleUpdateSession}
                  onRefreshSession={fetchSession}
                />
              </div>
              <div className="session-right">
                <PartyStatus session={session} onUpdate={handleUpdateSession} />
                <ImagePanel session={session} />
                <SessionPanel session={session} onEndSession={handleEndSession} />
              </div>
              <div className="scroll-btns">
                <button
                  className="scroll-btn up"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  title="Scroll to top"
                >
                  ↑
                </button>
                <button
                  className="scroll-btn down"
                  onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                  title="Scroll to bottom"
                >
                  ↓
                </button>
              </div>
            </div>
          )}

          {view === 'roster' && (
            <RosterView
              roster={roster}
              onCreateCharacter={() => setSelectedCharacter({})}
              onSelectCharacter={setSelectedCharacter}
              onStartSession={onStartSession}
              sessionActive={session?.active}
              onRefresh={fetchRoster}
              systemConfig={systemConfig}
            />
          )}

          {view === 'town' && (
            <TownView
              town={town}
              onUpdate={fetchTown}
              systemConfig={systemConfig}
            />
          )}
        </main>

        {selectedCharacter !== null && (
          <div className="modal-overlay" onClick={() => setSelectedCharacter(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <CharacterSheet
                character={selectedCharacter}
                onSave={onCreateCharacter}
                onCancel={() => setSelectedCharacter(null)}
                systemConfig={systemConfig}
                availableArcs={campaignContent?.character_arcs || []}
              />
            </div>
          </div>
        )}
      </div>
    </CampaignProvider>
  )
}

export default App
