import React, { useState, useEffect } from 'react'
import { useCampaignContext } from '../context/CampaignContext'
import { fetchAvailableBeats } from '../api/content'
import { updateCharacter } from '../api/characters'

// Default values for backwards compatibility
const DEFAULT_LEVELING = {
  max_level: 5,
  thresholds: [2, 4, 7, 11],
  rewards: {
    "2": { type: "stat", desc: "+1 to one stat" },
    "3": { type: "health", desc: "+1 Health" },
    "4": { type: "choice", desc: "New ability OR +1 Magic" },
    "5": { type: "stat", desc: "+1 to one stat" }
  }
}

const DEFAULT_STATS = {
  names: ['Brave', 'Clever', 'Kind'],
  colors: ['#c75050', '#5090c7', '#50c770']
}

const DEFAULT_RESOURCES = {
  health: { name: 'Hearts', symbol: '♥' },
  magic: { name: 'Threads', symbol: '✦' }
}

function RosterView({ roster, onCreateCharacter, onSelectCharacter, onStartSession, sessionActive, onRefresh, systemConfig }) {
  const { campaignId } = useCampaignContext()
  // Extract config or use defaults
  const levelingConfig = systemConfig?.leveling || DEFAULT_LEVELING
  const statsConfig = systemConfig?.stats || DEFAULT_STATS
  const resourcesConfig = systemConfig?.resources || DEFAULT_RESOURCES

  const statNames = statsConfig.names || DEFAULT_STATS.names
  const statColors = statsConfig.colors || DEFAULT_STATS.colors
  const healthConfig = resourcesConfig.health || DEFAULT_RESOURCES.health
  const magicConfig = resourcesConfig.magic || DEFAULT_RESOURCES.magic

  // Build level thresholds from config
  const thresholds = levelingConfig.thresholds || DEFAULT_LEVELING.thresholds
  const maxLevel = levelingConfig.max_level || DEFAULT_LEVELING.max_level
  const rewards = levelingConfig.rewards || DEFAULT_LEVELING.rewards

  // Get the level a character should be based on XP
  const getLevelForXP = (xp) => {
    let level = 1
    for (let i = 0; i < thresholds.length; i++) {
      if (xp >= thresholds[i]) {
        level = i + 2 // Level 2 is at thresholds[0], etc.
      }
    }
    return Math.min(level, maxLevel)
  }

  // Check if character can level up
  const canLevelUp = (char) => {
    const targetLevel = getLevelForXP(char.xp)
    return targetLevel > char.level && char.level < maxLevel
  }

  // Get reward for next level
  const getNextLevelReward = (char) => {
    const nextLevel = char.level + 1
    return rewards[String(nextLevel)] || null
  }

  const [selectedIds, setSelectedIds] = useState([])
  const [showStartModal, setShowStartModal] = useState(false)
  const [quest, setQuest] = useState('')
  const [location, setLocation] = useState('')
  const [levelUpChar, setLevelUpChar] = useState(null)
  const [levelUpChoice, setLevelUpChoice] = useState(null)

  // Authored campaign state
  const [availableBeats, setAvailableBeats] = useState(null)
  const [hasContent, setHasContent] = useState(false)
  const [selectedBeat, setSelectedBeat] = useState(null)
  const [loadingBeats, setLoadingBeats] = useState(false)

  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id))
    } else if (selectedIds.length < 2) {
      setSelectedIds([...selectedIds, id])
    }
  }

  // Fetch available beats when opening modal
  const handleOpenStartModal = async () => {
    setShowStartModal(true)
    setLoadingBeats(true)

    try {
      const data = await fetchAvailableBeats(campaignId)

      setHasContent(data.hasContent || false)
      if (data.hasContent) {
        setAvailableBeats(data)
        // Auto-select first beat if available
        if (data.beats?.length > 0) {
          setSelectedBeat(data.beats[0])
        }
      }
    } catch (err) {
      console.error('Failed to fetch available beats:', err)
      setHasContent(false)
    } finally {
      setLoadingBeats(false)
    }
  }

  const handleStartEpisode = async () => {
    if (selectedIds.length === 0) return

    if (hasContent && selectedBeat) {
      // Authored campaign: start episode with selected beat context
      onStartSession(selectedBeat.description, selectedBeat.id, selectedIds)
    } else {
      // Freestyle: use manual quest/location
      if (!quest || !location) return
      onStartSession(quest, location, selectedIds)
    }

    setShowStartModal(false)
    setSelectedIds([])
    setQuest('')
    setLocation('')
    setSelectedBeat(null)
    setAvailableBeats(null)
  }

  const handleLevelUp = async () => {
    if (!levelUpChar) return

    const nextLevel = levelUpChar.level + 1
    const reward = getNextLevelReward(levelUpChar)

    // If reward needs a choice and none made, block
    if (reward && (reward.type === 'stat' || reward.type === 'choice') && !levelUpChoice) return

    const updates = { level: nextLevel }

    if (reward) {
      if (reward.type === 'health') {
        // Auto +1 health
        updates.maxHearts = (levelUpChar.maxHearts || healthConfig.starting || 5) + 1
      } else if (reward.type === 'magic') {
        // Auto +1 magic
        updates.maxThreads = (levelUpChar.maxThreads || magicConfig.starting || 3) + 1
      } else if (reward.type === 'stat') {
        // +1 to chosen stat
        const statKey = levelUpChoice
        if (statKey && levelUpChar.stats[statKey] !== undefined) {
          const maxStat = statsConfig.max_per_stat || 5
          if (levelUpChar.stats[statKey] < maxStat) {
            updates.stats = { ...levelUpChar.stats, [statKey]: levelUpChar.stats[statKey] + 1 }
          }
        }
      } else if (reward.type === 'choice') {
        // Player chose between magic or ability
        if (levelUpChoice === 'magic') {
          updates.maxThreads = (levelUpChar.maxThreads || magicConfig.starting || 3) + 1
        }
        // ability would need to be tracked separately
      }
    }

    try {
      await updateCharacter(campaignId, levelUpChar.id, updates)
      setLevelUpChar(null)
      setLevelUpChoice(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error('Failed to level up:', err)
    }
  }

  const updateCharStat = async (charId, field, delta) => {
    const char = roster.find(c => c.id === charId)
    if (!char) return

    const newValue = (char[field] || 0) + delta
    if (newValue < 1) return // Don't go below 1

    try {
      await updateCharacter(campaignId, charId, { [field]: newValue })
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error('Failed to update character:', err)
    }
  }

  // Helper to get abbreviated stat name for display
  const getStatAbbrev = (statName) => {
    return statName.substring(0, 3).toUpperCase()
  }

  // Get stat keys (lowercase stat names)
  const getStatKeys = () => {
    return statNames.map(name => name.toLowerCase())
  }

  return (
    <div>
      {!sessionActive && selectedIds.length > 0 && (
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span>{selectedIds.length} character(s) selected</span>
          <button
            className="btn btn-primary"
            onClick={handleOpenStartModal}
            style={{ flex: 'none', padding: '0.5rem 1rem' }}
          >
            Start Episode
          </button>
        </div>
      )}

      <div className="roster-view">
        {roster.map(char => (
          <div
            key={char.id}
            className={`card roster-card ${selectedIds.includes(char.id) ? 'selected' : ''}`}
            onClick={() => !sessionActive && toggleSelect(char.id)}
            style={{
              border: selectedIds.includes(char.id) ? '3px solid var(--forest-green)' : undefined
            }}
          >
            <div className="card-header" style={{
              background: selectedIds.includes(char.id) ? 'var(--forest-green)' : 'var(--warm-brown)'
            }}>
              {char.name}
              <span className="level">Lvl {char.level}</span>
            </div>
            <div className="card-body">
              <div className="species" style={{ color: 'var(--forest-green)', fontWeight: 600 }}>
                {char.species}
              </div>
              <div className="stats">
                {statNames.map((statName, i) => {
                  const key = statName.toLowerCase()
                  const value = char.stats?.[key] || 0
                  return (
                    <div key={statName} className="stat">
                      <span style={{ color: statColors[i] || '#666' }}>{getStatAbbrev(statName)}</span> {value}
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>XP: {char.xp}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); updateCharStat(char.id, 'maxHearts', -1) }}
                    style={{ padding: '0 4px', fontSize: '0.7rem', cursor: 'pointer', background: 'var(--parchment)', border: '1px solid var(--warm-brown)', borderRadius: '3px' }}
                  >-</button>
                  <span style={{ color: 'var(--berry-red)' }}>{healthConfig.symbol}{char.maxHearts}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); updateCharStat(char.id, 'maxHearts', 1) }}
                    style={{ padding: '0 4px', fontSize: '0.7rem', cursor: 'pointer', background: 'var(--parchment)', border: '1px solid var(--warm-brown)', borderRadius: '3px' }}
                  >+</button>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); updateCharStat(char.id, 'maxThreads', -1) }}
                    style={{ padding: '0 4px', fontSize: '0.7rem', cursor: 'pointer', background: 'var(--parchment)', border: '1px solid var(--warm-brown)', borderRadius: '3px' }}
                  >-</button>
                  <span style={{ color: 'var(--golden)' }}>{magicConfig.symbol}{char.maxThreads}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); updateCharStat(char.id, 'maxThreads', 1) }}
                    style={{ padding: '0 4px', fontSize: '0.7rem', cursor: 'pointer', background: 'var(--parchment)', border: '1px solid var(--warm-brown)', borderRadius: '3px' }}
                  >+</button>
                </span>
              </div>
              {canLevelUp(char) && (
                <button
                  className="btn btn-primary"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLevelUpChar(char)
                    setLevelUpChoice(null)
                  }}
                  style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.85rem' }}
                >
                  Level Up!
                </button>
              )}
            </div>
          </div>
        ))}

        <div className="card add-character-card" onClick={onCreateCharacter}>
          <span>+</span>
        </div>
      </div>

      {/* Start Episode Modal */}
      {showStartModal && (
        <div className="modal-overlay" onClick={() => setShowStartModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '1rem' }}>Start New Episode</h2>

            {loadingBeats ? (
              <p style={{ color: 'var(--slate-muted)' }}>Loading available beats...</p>
            ) : hasContent && availableBeats ? (
              // Authored campaign: show beat selection
              <div>
                {availableBeats.beats?.length > 0 ? (
                  <div className="form-group">
                    <label>Available Beats</label>
                    <div className="run-options">
                      {availableBeats.beats.map(beat => (
                        <div
                          key={beat.id}
                          className={`run-option ${selectedBeat?.id === beat.id ? 'selected' : ''} ${beat.is_finale ? 'finale' : ''}`}
                          onClick={() => setSelectedBeat(beat)}
                        >
                          <div className="run-option-title">{beat.description}{beat.is_finale ? ' (Finale)' : ''}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'var(--amber-glow)', fontStyle: 'italic' }}>
                    No beats available. The campaign may be complete!
                  </p>
                )}

                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--twilight-purple)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--slate-muted)' }}>
                    Episodes completed: {availableBeats.episodes_completed} | Threat stage: {availableBeats.threat_stage + 1}
                  </div>
                </div>
              </div>
            ) : (
              // Freestyle: manual quest/location entry
              <div>
                <div className="form-group">
                  <label>Quest</label>
                  <input
                    type="text"
                    value={quest}
                    onChange={(e) => setQuest(e.target.value)}
                    placeholder="e.g., Rescue the missing scout"
                  />
                </div>

                <div className="form-group">
                  <label>Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., Bramble Hollow"
                  />
                </div>
              </div>
            )}

            <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
              <strong>Party:</strong>
              <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                {selectedIds.map(id => {
                  const char = roster.find(c => c.id === id)
                  return <li key={id}>{char?.name} ({char?.species})</li>
                })}
              </ul>
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowStartModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStartEpisode}
                disabled={hasContent ? !selectedBeat : (!quest || !location)}
              >
                Begin Adventure!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Level Up Modal */}
      {levelUpChar && (
        <div className="modal-overlay" onClick={() => setLevelUpChar(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '1rem' }}>
              {levelUpChar.name} Levels Up!
            </h2>
            <p style={{ marginBottom: '0.5rem' }}>
              Level {levelUpChar.level} → Level {levelUpChar.level + 1}
            </p>
            <p style={{ marginBottom: '1rem', fontStyle: 'italic' }}>
              {getNextLevelReward(levelUpChar)?.desc}
            </p>

            {/* Stat choice reward */}
            {getNextLevelReward(levelUpChar)?.type === 'stat' && (
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Choose a stat to increase:</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {statNames.map((statName, i) => {
                    const key = statName.toLowerCase()
                    const maxStat = statsConfig.max_per_stat || 5
                    const currentVal = levelUpChar.stats?.[key] || 0
                    const canIncrease = currentVal < maxStat
                    return (
                      <button
                        key={key}
                        className={`btn ${levelUpChoice === key ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => canIncrease && setLevelUpChoice(key)}
                        disabled={!canIncrease}
                        style={{ flex: 1, minWidth: '80px', opacity: canIncrease ? 1 : 0.5 }}
                      >
                        {getStatAbbrev(statName)} ({currentVal})
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Auto health reward */}
            {getNextLevelReward(levelUpChar)?.type === 'health' && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--parchment)', borderRadius: '8px' }}>
                <p>Your max {healthConfig.name} will increase from {levelUpChar.maxHearts} to {levelUpChar.maxHearts + 1}!</p>
              </div>
            )}

            {/* Auto magic reward */}
            {getNextLevelReward(levelUpChar)?.type === 'magic' && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--parchment)', borderRadius: '8px' }}>
                <p>Your max {magicConfig.name} will increase from {levelUpChar.maxThreads} to {levelUpChar.maxThreads + 1}!</p>
              </div>
            )}

            {/* Choice reward (magic or ability) */}
            {getNextLevelReward(levelUpChar)?.type === 'choice' && (
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Choose your reward:</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className={`btn ${levelUpChoice === 'magic' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setLevelUpChoice('magic')}
                    style={{ flex: 1 }}
                  >
                    +1 {magicConfig.name}
                  </button>
                  <button
                    className={`btn ${levelUpChoice === 'ability' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setLevelUpChoice('ability')}
                    style={{ flex: 1 }}
                  >
                    Species Ability
                  </button>
                </div>
              </div>
            )}

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setLevelUpChar(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleLevelUp}
                disabled={
                  getNextLevelReward(levelUpChar)?.type === 'stat' && !levelUpChoice ||
                  getNextLevelReward(levelUpChar)?.type === 'choice' && !levelUpChoice
                }
              >
                Confirm Level Up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RosterView
