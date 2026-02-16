import React, { useState, useEffect } from 'react'

// Default values for backwards compatibility
const DEFAULT_SPECIES = [
  { name: 'Mousefolk', trait_name: 'Quick Paws', trait_desc: 'Once per run, take two actions in one turn' },
  { name: 'Rabbitfolk', trait_name: 'Warm Hearth', trait_desc: 'When you heal someone, they heal +1 extra Heart' },
  { name: 'Birdfolk', trait_name: 'Take Wing', trait_desc: 'Fly short distances' },
  { name: 'Batfolk', trait_name: 'Night Sight', trait_desc: 'See in darkness, sense hidden creatures' },
  { name: 'Frogfolk', trait_name: 'Read the Signs', trait_desc: 'Once per run, ask one yes/no question about ahead' },
  { name: 'Ratfolk', trait_name: 'Insect Companion', trait_desc: 'Your bug can scout, distract, or fetch' },
  { name: 'Otterfolk', trait_name: 'Slippery', trait_desc: 'Advantage on dodge/escape rolls' },
  { name: 'Lizardfolk', trait_name: 'Cold Blood, Hot Fury', trait_desc: 'After damage, next attack +1d4' },
  { name: 'Squirrelfolk', trait_name: 'Bone Whisper', trait_desc: 'Once per run, ask a corpse one question' },
  { name: 'Raccoonfolk', trait_name: 'Junk Magic', trait_desc: 'Once per run, produce any mundane item' },
]

const DEFAULT_STATS = {
  names: ['Brave', 'Clever', 'Kind'],
  colors: ['#c75050', '#5090c7', '#50c770'],
  starting_pool: 5,
  min_per_stat: 1,
  max_per_stat: 3
}

const DEFAULT_RESOURCES = {
  health: { name: 'Hearts', symbol: '♥', starting: 5, max: 7 },
  magic: { name: 'Threads', symbol: '✦', starting: 3, max: 5 }
}

function CharacterSheet({ character, onSave, onCancel, systemConfig, availableArcs: rawArcs = [] }) {
  const availableArcs = rawArcs.filter(a => a.id && a.name)
  // Extract config or use defaults
  const speciesList = systemConfig?.species || DEFAULT_SPECIES
  const statsConfig = systemConfig?.stats || DEFAULT_STATS
  const resourcesConfig = systemConfig?.resources || DEFAULT_RESOURCES

  const statNames = statsConfig.names
  const statColors = statsConfig.colors || DEFAULT_STATS.colors
  const startingPool = statsConfig.starting_pool
  const minStat = statsConfig.min_per_stat
  const maxStat = statsConfig.max_per_stat

  const healthConfig = resourcesConfig.health || DEFAULT_RESOURCES.health
  const magicConfig = resourcesConfig.magic || DEFAULT_RESOURCES.magic

  // Initialize stats from character or with default distribution
  const getInitialStats = () => {
    if (character?.stats) {
      return { ...character.stats }
    }
    // Distribute starting pool as evenly as possible
    const stats = {}
    const perStat = Math.floor(startingPool / statNames.length)
    let remainder = startingPool % statNames.length
    statNames.forEach((name, i) => {
      const key = name.toLowerCase()
      let value = Math.max(minStat, Math.min(maxStat, perStat))
      if (remainder > 0 && value < maxStat) {
        value++
        remainder--
      }
      stats[key] = value
    })
    return stats
  }

  const [name, setName] = useState(character?.name || '')
  const [species, setSpecies] = useState(character?.species || speciesList[0]?.name || '')
  const [stats, setStats] = useState(getInitialStats)
  const [arcId, setArcId] = useState(character?.arcId || '')
  const [backstory, setBackstory] = useState(character?.notes || '')

  // Update species when speciesList changes
  useEffect(() => {
    if (speciesList.length > 0 && !speciesList.find(s => s.name === species)) {
      setSpecies(speciesList[0].name)
    }
  }, [speciesList])

  const totalPoints = Object.values(stats).reduce((sum, val) => sum + val, 0)
  const allStatsValid = Object.values(stats).every(val => val >= minStat && val <= maxStat)
  const isValid = name && species && totalPoints === startingPool && allStatsValid

  const selectedSpecies = speciesList.find(s => s.name === species)

  const updateStat = (statName, value) => {
    const key = statName.toLowerCase()
    const newValue = Math.min(maxStat, Math.max(minStat, parseInt(value) || minStat))
    setStats(prev => ({ ...prev, [key]: newValue }))
  }

  const handleSave = () => {
    if (!isValid) return

    onSave({
      name,
      species,
      level: 1,
      xp: 0,
      stats,
      maxHearts: healthConfig.starting,
      maxThreads: magicConfig.starting,
      gear: [],
      weavesKnown: [],
      notes: backstory,
      ...(arcId ? { arcId } : {})
    })
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1rem', textAlign: 'center' }}>
        {character?.id ? 'Edit Character' : 'Create Character'}
      </h2>

      <div className="form-group">
        <label>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter character name"
        />
      </div>

      <div className="form-group">
        <label>Species</label>
        <select value={species} onChange={(e) => setSpecies(e.target.value)}>
          {speciesList.map(s => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
        {selectedSpecies && (
          <div style={{
            marginTop: '0.5rem',
            fontSize: '0.85rem',
            color: 'var(--forest-green)',
            fontStyle: 'italic'
          }}>
            <strong>{selectedSpecies.trait_name}</strong> - {selectedSpecies.trait_desc}
          </div>
        )}
      </div>

      {availableArcs.length > 0 && (
        <div className="form-group">
          <label>Character Arc</label>
          <select value={arcId} onChange={(e) => setArcId(e.target.value)}>
            <option value="">None</option>
            {availableArcs.map(arc => (
              <option key={arc.id} value={arc.id}>{arc.name}</option>
            ))}
          </select>
          {arcId && (() => {
            const arc = availableArcs.find(a => a.id === arcId)
            if (!arc) return null
            return (
              <div style={{
                marginTop: '0.5rem',
                fontSize: '0.85rem',
                background: 'var(--parchment)',
                padding: '0.75rem',
                borderRadius: '6px'
              }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Milestones:</strong>
                  <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                    {arc.milestones.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
                <div>
                  <strong>Reward:</strong> {arc.reward.name} — {arc.reward.description}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      <div className="form-group">
        <label>
          Stats ({startingPool} points total, each {minStat}-{maxStat}) —
          <span style={{
            color: totalPoints === startingPool ? 'var(--forest-green)' : 'var(--berry-red)',
            fontWeight: 700
          }}>
            {' '}{totalPoints}/{startingPool} used
          </span>
        </label>

        <div className="stat-inputs">
          {statNames.map((statName, i) => {
            const key = statName.toLowerCase()
            return (
              <div key={statName} className="stat-input">
                <label style={{ color: statColors[i] || '#666' }}>{statName}</label>
                <input
                  type="number"
                  min={minStat}
                  max={maxStat}
                  value={stats[key] || minStat}
                  onChange={(e) => updateStat(statName, e.target.value)}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div className="form-group">
        <label>Backstory <span style={{ fontSize: '0.8rem', color: 'var(--slate-muted)' }}>(optional)</span></label>
        <textarea
          value={backstory}
          onChange={(e) => setBackstory(e.target.value)}
          placeholder="Who is this character? Where do they come from?"
          rows={3}
          maxLength={500}
        />
      </div>

      <div style={{
        background: 'var(--parchment)',
        padding: '1rem',
        borderRadius: '8px',
        marginBottom: '1rem'
      }}>
        <div><strong>{healthConfig.name}:</strong> {healthConfig.starting}</div>
        <div><strong>{magicConfig.name}:</strong> {magicConfig.starting}</div>
      </div>

      <div className="form-actions">
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!isValid}
        >
          {character?.id ? 'Save Changes' : 'Create Character'}
        </button>
      </div>
    </div>
  )
}

export default CharacterSheet
