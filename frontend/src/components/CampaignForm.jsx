import React, { useState, useEffect } from 'react'
import DMPrepSection from './DMPrepSection'
import { fetchTemplates as apiGetTemplates, fetchTemplate } from '../api/templates'
import { generateFields, generateFieldsStandalone } from '../api/content'


const REWARD_TYPES = [
  { value: 'stat', label: 'Stat increase' },
  { value: 'health', label: 'Health increase' },
  { value: 'magic', label: 'Magic increase' },
  { value: 'choice', label: 'Player choice' },
  { value: 'ability', label: 'New ability' },
]

// Validation requirements
const VALIDATION = {
  minNPCs: 2,
  maxNPCs: 10,
  minLocations: 2,
  maxLocations: 10,
  minBeats: 3,
  maxBeats: 10,
  minThreatStages: 3,
  maxThreatStages: 6,
  minSpecies: 2,
  maxSpecies: 15,
  minStats: 2,
  maxStats: 6,
  minBuildings: 2,
  maxBuildings: 12,
}

// Default system config - empty/minimal to start fresh
const DEFAULT_SYSTEM = {
  game_name: '',
  player_context: '',
  species: [
    { name: '', trait_name: '', trait_desc: '' },
    { name: '', trait_name: '', trait_desc: '' },
  ],
  stats: {
    names: ['', '', ''],
    colors: ['#c75050', '#50c770', '#5090c7'],
    starting_pool: 6,
    min_per_stat: 1,
    max_per_stat: 4,
  },
  resources: {
    health: { name: '', symbol: '', starting: 10, max: 20 },
    magic: { name: '', symbol: '', starting: 5, max: 10 },
  },
  currency: { name: '', symbol: '', starting: 0 },
  buildings: [
    { key: '', name: '', cost: 0, desc: '' },
    { key: '', name: '', cost: 0, desc: '' },
  ],
  leveling: {
    max_level: 5,
    thresholds: [10, 25, 50, 100],
    rewards: {
      '2': { type: 'stat', desc: '' },
      '3': { type: 'health', desc: '' },
      '4': { type: 'ability', desc: '' },
      '5': { type: 'stat', desc: '' },
    },
  },
  mechanics: {
    dice: 'd20',
    success_threshold: 15,
    partial_threshold: 10,
    enemy_tiers: {
      minion: { health: 2, damage: 'd4' },
      standard: { health: 6, damage: 'd6' },
      elite: { health: 12, damage: 'd8' },
      boss: { health: 20, damage: 'd10' },
    },
  },
  location_tags: [
    { value: '', label: '' },
  ],
  art_style: '',
  lore: '',
  dm_tone: '',
  rules_addendum: '',
}

function CampaignForm({ onSubmit, onCancel, onSaveDraft, initialData = null, initialSystem = null, campaignId = null }) {
  // === Templates State ===
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')

  // === Content State ===
  const [name, setName] = useState(initialData?.name || '')
  const [premise, setPremise] = useState(initialData?.premise || '')
  const [tone, setTone] = useState(initialData?.tone || '')

  const [threatName, setThreatName] = useState(initialData?.threat?.name || '')
  const [threatStages, setThreatStages] = useState(
    initialData?.threat?.stages || ['', '', '']
  )
  const [threatAdvancesUnlessBeatHit, setThreatAdvancesUnlessBeatHit] = useState(
    initialData?.threat?.advances_each_episode_unless_beat_hit ?? true
  )

  const [npcs, setNpcs] = useState(
    initialData?.npcs || [
      { name: '', species: '', role: '', wants: '', secret: '' },
      { name: '', species: '', role: '', wants: '', secret: '' },
    ]
  )

  const [locations, setLocations] = useState(
    initialData?.locations || [
      { name: '', vibe: '', contains: [] },
      { name: '', vibe: '', contains: [] },
    ]
  )

  const [beats, setBeats] = useState(
    initialData?.beats || [
      { id: '', description: '', hints: [''], revelation: '', prerequisites: [], unlocked_by: null, closes_after_episodes: null, is_finale: false },
      { id: '', description: '', hints: [''], revelation: '', prerequisites: [], unlocked_by: null, closes_after_episodes: null, is_finale: false },
      { id: '', description: '', hints: [''], revelation: '', prerequisites: [], unlocked_by: null, closes_after_episodes: null, is_finale: false },
    ]
  )

  // === Character Arcs State ===
  const [characterArcs, setCharacterArcs] = useState(
    initialData?.character_arcs || []
  )

  // === DM Decides State ===
  const [threatDmDecides, setThreatDmDecides] = useState({})
  const [npcDmDecides, setNpcDmDecides] = useState(
    (initialData?.npcs || [{}, {}]).map(() => ({}))
  )
  const [locationDmDecides, setLocationDmDecides] = useState(
    (initialData?.locations || [{}, {}]).map(() => ({}))
  )
  const [beatDmDecides, setBeatDmDecides] = useState(
    (initialData?.beats || [{}, {}, {}]).map(() => ({}))
  )
  const [arcDmDecides, setArcDmDecides] = useState(
    (initialData?.character_arcs || []).map(() => ({}))
  )
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  // === System Config State ===
  const [system, setSystem] = useState(initialSystem || DEFAULT_SYSTEM)
  const [systemSection, setSystemSection] = useState('general') // Which system sub-section is active

  const [errors, setErrors] = useState([])
  const [currentSection, setCurrentSection] = useState('system') // Start with system for new campaigns

  // === Fetch templates on mount ===
  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const data = await apiGetTemplates()
      setTemplates(data.templates || [])
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    }
  }

  const loadTemplate = async (templateId) => {
    if (!templateId) return

    try {
      const data = await fetchTemplate(templateId)
      if (data.system) {
        setSystem(data.system)
        setSelectedTemplate(templateId)
      }
    } catch (err) {
      console.error('Failed to load template:', err)
    }
  }

  // === System Update Helpers ===
  const updateSystem = (field, value) => {
    setSystem(prev => ({ ...prev, [field]: value }))
  }

  const updateSystemNested = (path, value) => {
    setSystem(prev => {
      const copy = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let obj = copy
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return copy
    })
  }

  // Species helpers
  const updateSpecies = (index, field, value) => {
    const updated = [...system.species]
    updated[index] = { ...updated[index], [field]: value }
    updateSystem('species', updated)
  }

  const addSpecies = () => {
    if (system.species.length < VALIDATION.maxSpecies) {
      updateSystem('species', [...system.species, { name: '', trait_name: '', trait_desc: '' }])
    }
  }

  const removeSpecies = (index) => {
    if (system.species.length > VALIDATION.minSpecies) {
      updateSystem('species', system.species.filter((_, i) => i !== index))
    }
  }

  // Stats helpers
  const updateStatName = (index, value) => {
    const updated = [...system.stats.names]
    updated[index] = value
    updateSystemNested('stats.names', updated)
  }

  const updateStatColor = (index, value) => {
    const updated = [...system.stats.colors]
    updated[index] = value
    updateSystemNested('stats.colors', updated)
  }

  const addStat = () => {
    if (system.stats.names.length < VALIDATION.maxStats) {
      updateSystemNested('stats.names', [...system.stats.names, ''])
      updateSystemNested('stats.colors', [...system.stats.colors, '#666666'])
    }
  }

  const removeStat = (index) => {
    if (system.stats.names.length > VALIDATION.minStats) {
      updateSystemNested('stats.names', system.stats.names.filter((_, i) => i !== index))
      updateSystemNested('stats.colors', system.stats.colors.filter((_, i) => i !== index))
    }
  }

  // Building helpers
  const updateBuilding = (index, field, value) => {
    const updated = [...system.buildings]
    updated[index] = { ...updated[index], [field]: value }
    updateSystem('buildings', updated)
  }

  const addBuilding = () => {
    if (system.buildings.length < VALIDATION.maxBuildings) {
      updateSystem('buildings', [...system.buildings, { key: '', name: '', cost: 0, desc: '' }])
    }
  }

  const removeBuilding = (index) => {
    if (system.buildings.length > VALIDATION.minBuildings) {
      updateSystem('buildings', system.buildings.filter((_, i) => i !== index))
    }
  }

  // Location tag helpers
  const updateLocationTag = (index, field, value) => {
    const updated = [...system.location_tags]
    updated[index] = { ...updated[index], [field]: value }
    updateSystem('location_tags', updated)
  }

  const addLocationTag = () => {
    updateSystem('location_tags', [...system.location_tags, { value: '', label: '' }])
  }

  const removeLocationTag = (index) => {
    if (system.location_tags.length > 1) {
      updateSystem('location_tags', system.location_tags.filter((_, i) => i !== index))
    }
  }

  // Leveling helpers
  const updateThreshold = (index, value) => {
    const updated = [...system.leveling.thresholds]
    updated[index] = parseInt(value) || 0
    updateSystemNested('leveling.thresholds', updated)
  }

  const updateReward = (level, field, value) => {
    const updated = { ...system.leveling.rewards }
    updated[level] = { ...updated[level], [field]: value }
    updateSystemNested('leveling.rewards', updated)
  }

  // Enemy tier helpers
  const updateEnemyTier = (tier, field, value) => {
    const updated = { ...system.mechanics.enemy_tiers }
    updated[tier] = { ...updated[tier], [field]: field === 'health' ? (parseInt(value) || 0) : value }
    updateSystemNested('mechanics.enemy_tiers', updated)
  }

  // === Validation ===
  const validate = () => {
    const errs = []

    // Basics
    if (!name.trim()) errs.push('Campaign name is required')
    if (premise.length < 20) errs.push('Premise must be at least 20 characters')
    if (!tone.trim()) errs.push('Tone is required')

    // Threat
    if (!threatName.trim()) errs.push('Threat name is required')
    const validStages = threatStages.filter(s => s.trim().length >= 5)
    if (validStages.length < VALIDATION.minThreatStages) {
      errs.push(`At least ${VALIDATION.minThreatStages} threat stages required (each 5+ chars)`)
    }

    // NPCs
    const validNpcs = npcs.filter(n => n.name && n.role && n.wants && n.secret)
    if (validNpcs.length < VALIDATION.minNPCs) {
      errs.push(`At least ${VALIDATION.minNPCs} complete NPCs required`)
    }

    // Locations
    const validLocs = locations.filter(l => l.name && l.vibe && l.contains.length > 0)
    if (validLocs.length < VALIDATION.minLocations) {
      errs.push(`At least ${VALIDATION.minLocations} complete locations required`)
    }

    // Beats
    const validBeats = beats.filter(b => b.id && b.description && b.revelation)
    if (validBeats.length < VALIDATION.minBeats) {
      errs.push(`At least ${VALIDATION.minBeats} complete beats required`)
    }

    // Check for at least one beat with no prerequisites (available from start)
    const hasStartBeat = beats.some(b => b.id && b.description && (!b.prerequisites || b.prerequisites.length === 0) && !b.unlocked_by)
    if (!hasStartBeat) {
      errs.push('At least one beat must be available from start (no prerequisites)')
    }

    // Check beat ID uniqueness
    const beatIds = beats.map(b => b.id).filter(id => id)
    if (new Set(beatIds).size !== beatIds.length) {
      errs.push('Beat IDs must be unique')
    }

    // Check beat ID format
    const idPattern = /^[a-z][a-z0-9_]*$/
    for (const beat of beats) {
      if (beat.id && !idPattern.test(beat.id)) {
        errs.push(`Beat ID "${beat.id}" must start with letter, use only lowercase, numbers, underscores`)
      }
    }

    // Check prerequisite references
    for (const beat of beats) {
      for (const prereq of (beat.prerequisites || [])) {
        if (!beatIds.includes(prereq)) {
          errs.push(`Beat "${beat.id}" references unknown prerequisite "${prereq}"`)
        }
        if (prereq === beat.id) {
          errs.push(`Beat "${beat.id}" cannot be its own prerequisite`)
        }
      }
    }

    // System validation
    const validSpecies = system.species.filter(s => s.name && s.trait_name && s.trait_desc)
    if (validSpecies.length < VALIDATION.minSpecies) {
      errs.push(`At least ${VALIDATION.minSpecies} complete species required`)
    }

    const validStats = system.stats.names.filter(n => n.trim())
    if (validStats.length < VALIDATION.minStats) {
      errs.push(`At least ${VALIDATION.minStats} stats required`)
    }

    setErrors(errs)
    return errs.length === 0
  }

  // === Build output ===
  const buildCampaignData = () => {
    return {
      name: name.trim(),
      premise: premise.trim(),
      tone: tone.trim(),
      threat: {
        name: threatName.trim(),
        stages: threatStages.filter(s => s.trim()).map(s => s.trim()),
        advances_each_episode_unless_beat_hit: threatAdvancesUnlessBeatHit
      },
      npcs: npcs
        .filter(n => n.name && n.role && n.wants && n.secret)
        .map(n => ({
          name: n.name.trim(),
          species: n.species || system.species[0]?.name || 'Human',
          role: n.role.trim(),
          wants: n.wants.trim(),
          secret: n.secret.trim()
        })),
      locations: locations
        .filter(l => l.name && l.vibe && l.contains.length > 0)
        .map(l => ({
          name: l.name.trim(),
          vibe: l.vibe.trim(),
          contains: l.contains
        })),
      beats: beats
        .filter(b => b.id && b.description && b.revelation)
        .map(b => ({
          id: b.id.trim(),
          description: b.description.trim(),
          hints: (b.hints || []).filter(h => h.trim()).map(h => h.trim()),
          revelation: b.revelation.trim(),
          prerequisites: b.prerequisites || [],
          unlocked_by: b.unlocked_by || null,
          closes_after_episodes: b.closes_after_episodes || null,
          is_finale: b.is_finale || false,
        })),
      character_arcs: characterArcs
        .filter(a => a.id && a.name && a.milestones?.length >= 2 && a.reward?.name && a.reward?.description)
        .map(a => ({
          id: a.id.trim(),
          name: a.name.trim(),
          suggested_for: a.suggested_for || [],
          milestones: a.milestones.filter(m => m.trim()).map(m => m.trim()),
          reward: { name: a.reward.name.trim(), description: a.reward.description.trim() }
        }))
    }
  }

  const buildSystemData = () => {
    return {
      ...system,
      species: system.species.filter(s => s.name && s.trait_name && s.trait_desc),
      stats: {
        ...system.stats,
        names: system.stats.names.filter(n => n.trim()),
        colors: system.stats.colors.slice(0, system.stats.names.filter(n => n.trim()).length),
      },
      buildings: system.buildings.filter(b => b.key && b.name),
      location_tags: system.location_tags.filter(t => t.value && t.label),
    }
  }

  const handleSubmit = () => {
    if (hasDmDecidesFields()) {
      setErrors(['Generate or uncheck all "DM decides" fields before publishing'])
      return
    }
    if (validate()) {
      onSubmit({
        content: buildCampaignData(),
        system: buildSystemData()
      })
    }
  }

  // Build draft data - keeps everything including partial items
  const buildDraftData = () => {
    return {
      content: {
        name: name.trim(),
        premise: premise.trim(),
        tone: tone.trim(),
        threat: {
          name: threatName.trim(),
          stages: threatStages.map(s => s.trim()),
          advances_each_episode_unless_beat_hit: threatAdvancesUnlessBeatHit
        },
        npcs: npcs.map(n => ({
          name: n.name?.trim() || '',
          species: n.species || system.species[0]?.name || '',
          role: n.role?.trim() || '',
          wants: n.wants?.trim() || '',
          secret: n.secret?.trim() || ''
        })),
        locations: locations.map(l => ({
          name: l.name?.trim() || '',
          vibe: l.vibe?.trim() || '',
          contains: l.contains || []
        })),
        beats: beats.map(b => ({
          id: b.id?.trim() || '',
          description: b.description?.trim() || '',
          hints: (b.hints || []).map(h => h?.trim() || ''),
          revelation: b.revelation?.trim() || '',
          prerequisites: b.prerequisites || [],
          unlocked_by: b.unlocked_by || null,
          closes_after_episodes: b.closes_after_episodes || null,
          is_finale: b.is_finale || false,
        })),
        character_arcs: characterArcs.map(a => ({
          id: a.id?.trim() || '',
          name: a.name?.trim() || '',
          suggested_for: a.suggested_for || [],
          milestones: a.milestones?.map(m => m?.trim() || '') || ['', ''],
          reward: {
            name: a.reward?.name?.trim() || '',
            description: a.reward?.description?.trim() || ''
          }
        }))
      },
      system: system
    }
  }

  const handleSaveDraft = () => {
    if (!name.trim()) {
      setErrors(['Campaign name is required to save a draft'])
      return
    }
    onSaveDraft?.(buildDraftData())
  }

  // === Array manipulation helpers ===
  const updateNpc = (index, field, value) => {
    const updated = [...npcs]
    updated[index] = { ...updated[index], [field]: value }
    setNpcs(updated)
  }

  const addNpc = () => {
    if (npcs.length < VALIDATION.maxNPCs) {
      setNpcs([...npcs, { name: '', species: system.species[0]?.name || '', role: '', wants: '', secret: '' }])
      setNpcDmDecides(prev => [...prev, {}])
    }
  }

  const removeNpc = (index) => {
    if (npcs.length > VALIDATION.minNPCs) {
      setNpcs(npcs.filter((_, i) => i !== index))
      setNpcDmDecides(prev => prev.filter((_, i) => i !== index))
    }
  }

  const updateLocation = (index, field, value) => {
    const updated = [...locations]
    updated[index] = { ...updated[index], [field]: value }
    setLocations(updated)
  }

  const toggleLocationTag = (locIndex, tag) => {
    const updated = [...locations]
    const contains = updated[locIndex].contains
    if (contains.includes(tag)) {
      updated[locIndex].contains = contains.filter(t => t !== tag)
    } else {
      updated[locIndex].contains = [...contains, tag]
    }
    setLocations(updated)
  }

  const addLocation = () => {
    if (locations.length < VALIDATION.maxLocations) {
      setLocations([...locations, { name: '', vibe: '', contains: [] }])
      setLocationDmDecides(prev => [...prev, {}])
    }
  }

  const removeLocation = (index) => {
    if (locations.length > VALIDATION.minLocations) {
      setLocations(locations.filter((_, i) => i !== index))
      setLocationDmDecides(prev => prev.filter((_, i) => i !== index))
    }
  }

  const updateBeat = (index, field, value) => {
    const updated = [...beats]
    updated[index] = { ...updated[index], [field]: value }
    setBeats(updated)
  }

  const updateHint = (beatIndex, itemIndex, value) => {
    const updated = [...beats]
    updated[beatIndex].hints[itemIndex] = value
    setBeats(updated)
  }

  const addHint = (beatIndex) => {
    if (beats[beatIndex].hints.length < 5) {
      const updated = [...beats]
      updated[beatIndex].hints = [...updated[beatIndex].hints, '']
      setBeats(updated)
    }
  }

  const removeHint = (beatIndex, itemIndex) => {
    const updated = [...beats]
    updated[beatIndex].hints = updated[beatIndex].hints.filter((_, i) => i !== itemIndex)
    setBeats(updated)
  }

  const togglePrerequisite = (beatIndex, prereqId) => {
    const updated = [...beats]
    const prereqs = updated[beatIndex].prerequisites || []
    if (prereqs.includes(prereqId)) {
      updated[beatIndex].prerequisites = prereqs.filter(p => p !== prereqId)
    } else {
      updated[beatIndex].prerequisites = [...prereqs, prereqId]
    }
    setBeats(updated)
  }

  const addBeat = () => {
    if (beats.length < VALIDATION.maxBeats) {
      setBeats([...beats, {
        id: '', description: '', hints: [''], revelation: '', prerequisites: [],
        unlocked_by: null, closes_after_episodes: null, is_finale: false,
      }])
      setBeatDmDecides(prev => [...prev, {}])
    }
  }

  const removeBeat = (index) => {
    if (beats.length > VALIDATION.minBeats) {
      setBeats(beats.filter((_, i) => i !== index))
      setBeatDmDecides(prev => prev.filter((_, i) => i !== index))
    }
  }

  const updateThreatStage = (index, value) => {
    const updated = [...threatStages]
    updated[index] = value
    setThreatStages(updated)
  }

  const addThreatStage = () => {
    if (threatStages.length < VALIDATION.maxThreatStages) {
      setThreatStages([...threatStages, ''])
    }
  }

  const removeThreatStage = (index) => {
    if (threatStages.length > VALIDATION.minThreatStages) {
      setThreatStages(threatStages.filter((_, i) => i !== index))
    }
  }

  // === Character Arc Helpers ===
  const updateArc = (index, field, value) => {
    const updated = [...characterArcs]
    updated[index] = { ...updated[index], [field]: value }
    setCharacterArcs(updated)
  }

  const updateArcMilestone = (arcIndex, mIndex, value) => {
    const updated = [...characterArcs]
    updated[arcIndex].milestones[mIndex] = value
    setCharacterArcs(updated)
  }

  const addArcMilestone = (arcIndex) => {
    if (characterArcs[arcIndex].milestones.length < 5) {
      const updated = [...characterArcs]
      updated[arcIndex].milestones = [...updated[arcIndex].milestones, '']
      setCharacterArcs(updated)
    }
  }

  const removeArcMilestone = (arcIndex, mIndex) => {
    if (characterArcs[arcIndex].milestones.length > 2) {
      const updated = [...characterArcs]
      updated[arcIndex].milestones = updated[arcIndex].milestones.filter((_, i) => i !== mIndex)
      setCharacterArcs(updated)
    }
  }

  const toggleArcSpecies = (arcIndex, speciesName) => {
    const updated = [...characterArcs]
    const suggested = updated[arcIndex].suggested_for || []
    if (suggested.includes(speciesName)) {
      updated[arcIndex].suggested_for = suggested.filter(s => s !== speciesName)
    } else {
      updated[arcIndex].suggested_for = [...suggested, speciesName]
    }
    setCharacterArcs(updated)
  }

  const addArc = () => {
    if (characterArcs.length < 10) {
      setCharacterArcs([...characterArcs, {
        id: '', name: '', suggested_for: [], milestones: ['', ''],
        reward: { name: '', description: '' }
      }])
      setArcDmDecides(prev => [...prev, {}])
    }
  }

  const removeArc = (index) => {
    setCharacterArcs(characterArcs.filter((_, i) => i !== index))
    setArcDmDecides(prev => prev.filter((_, i) => i !== index))
  }

  // === DM Decides Toggle Helpers ===
  const toggleThreatDmDecides = (field) => {
    setThreatDmDecides(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const toggleNpcDmDecides = (i, field) => {
    setNpcDmDecides(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: !updated[i]?.[field] }
      return updated
    })
  }

  const toggleLocationDmDecides = (i, field) => {
    setLocationDmDecides(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: !updated[i]?.[field] }
      return updated
    })
  }

  const toggleBeatDmDecides = (i, field) => {
    setBeatDmDecides(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: !updated[i]?.[field] }
      return updated
    })
  }

  const toggleArcDmDecides = (i, field) => {
    setArcDmDecides(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: !updated[i]?.[field] }
      return updated
    })
  }

  const hasDmDecidesFields = () => {
    if (Object.values(threatDmDecides).some(v => v)) return true
    if (npcDmDecides.some(n => Object.values(n).some(v => v))) return true
    if (locationDmDecides.some(l => Object.values(l).some(v => v))) return true
    if (beatDmDecides.some(b => Object.values(b).some(v => v))) return true
    if (arcDmDecides.some(a => Object.values(a).some(v => v))) return true
    return false
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateError(null)

    const generate = {}

    // Build generate map from DM-decides state
    if (Object.values(threatDmDecides).some(v => v)) {
      generate.threat = { ...threatDmDecides }
    }

    const npcGen = npcDmDecides.map(n => {
      const fields = Object.entries(n).filter(([, v]) => v)
      return fields.length > 0 ? Object.fromEntries(fields) : null
    })
    if (npcGen.some(n => n)) generate.npcs = npcGen

    const locGen = locationDmDecides.map(l => {
      const fields = Object.entries(l).filter(([, v]) => v)
      return fields.length > 0 ? Object.fromEntries(fields) : null
    })
    if (locGen.some(l => l)) generate.locations = locGen

    const beatGen = beatDmDecides.map(b => {
      const fields = Object.entries(b).filter(([, v]) => v)
      return fields.length > 0 ? Object.fromEntries(fields) : null
    })
    if (beatGen.some(b => b)) generate.beats = beatGen

    const arcGen = arcDmDecides.map(a => {
      const fields = Object.entries(a).filter(([, v]) => v)
      return fields.length > 0 ? Object.fromEntries(fields) : null
    })
    if (arcGen.some(a => a)) generate.character_arcs = arcGen

    const content = {
      name, premise, tone,
      threat: { name: threatName, stages: threatStages },
      npcs, locations, beats,
      character_arcs: characterArcs
    }

    const payload = {
      content,
      generate,
      available_species: system.species.filter(s => s.name).map(s => s.name),
      available_tags: system.location_tags.filter(t => t.value).map(t => t.value),
    }

    try {
      const result = campaignId
        ? await generateFields(campaignId, payload)
        : await generateFieldsStandalone(payload)

      const gen = result.generated

      // Apply generated fields
      if (gen.threat) {
        if (gen.threat.name) setThreatName(gen.threat.name)
        if (gen.threat.stages) setThreatStages(gen.threat.stages)
      }

      if (gen.npcs) {
        setNpcs(prev => prev.map((npc, i) => {
          if (!gen.npcs[i]) return npc
          return { ...npc, ...gen.npcs[i] }
        }))
      }

      if (gen.locations) {
        setLocations(prev => prev.map((loc, i) => {
          if (!gen.locations[i]) return loc
          return { ...loc, ...gen.locations[i] }
        }))
      }

      if (gen.beats) {
        setBeats(prev => prev.map((beat, i) => {
          if (!gen.beats[i]) return beat
          return { ...beat, ...gen.beats[i] }
        }))
      }

      if (gen.character_arcs) {
        setCharacterArcs(prev => prev.map((arc, i) => {
          if (!gen.character_arcs[i]) return arc
          const genArc = gen.character_arcs[i]
          return {
            ...arc,
            ...genArc,
            reward: genArc.reward_name || genArc.reward_description
              ? {
                  name: genArc.reward_name || arc.reward?.name || '',
                  description: genArc.reward_description || arc.reward?.description || ''
                }
              : arc.reward
          }
        }))
      }

      // Clear all DM-decides checkboxes
      setThreatDmDecides({})
      setNpcDmDecides(prev => prev.map(() => ({})))
      setLocationDmDecides(prev => prev.map(() => ({})))
      setRunDmDecides(prev => prev.map(() => ({})))
      setArcDmDecides(prev => prev.map(() => ({})))

    } catch (err) {
      setGenerateError(err.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // === Section navigation ===
  const sections = ['system', 'basics', 'threat', 'npcs', 'locations', 'beats', 'arcs', 'dm-prep']
  const sectionLabels = {
    system: 'System',
    basics: 'Basics',
    threat: 'Threat',
    npcs: 'NPCs',
    locations: 'Locations',
    beats: 'Beats',
    arcs: 'Arcs',
    'dm-prep': 'DM Prep'
  }

  const systemSections = ['general', 'species', 'stats', 'resources', 'buildings', 'leveling', 'mechanics', 'content']
  const systemSectionLabels = {
    general: 'General',
    species: 'Species',
    stats: 'Stats',
    resources: 'Resources',
    buildings: 'Buildings',
    leveling: 'Leveling',
    mechanics: 'Mechanics',
    content: 'Lore & Style'
  }

  // === Render ===
  return (
    <div className="campaign-form">
      <div className="form-header">
        <h2>{initialData ? 'Edit Campaign' : 'New Campaign'}</h2>
        <p className="form-subtitle">Configure game system and story content</p>
      </div>

      {/* Section tabs */}
      <div className="section-tabs">
        {sections.map(section => (
          <button
            key={section}
            className={`section-tab ${currentSection === section ? 'active' : ''}`}
            onClick={() => setCurrentSection(section)}
          >
            {sectionLabels[section]}
          </button>
        ))}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="form-errors">
          <strong>Please fix the following:</strong>
          <ul>
            {errors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      <div className="form-body">

        {/* === SYSTEM CONFIG === */}
        {currentSection === 'system' && (
          <div className="form-section">
            {/* Template selector */}
            <div className="form-group">
              <label>Start from Template</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">Select a template...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary"
                  onClick={() => loadTemplate(selectedTemplate)}
                  disabled={!selectedTemplate}
                >
                  Load
                </button>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate-muted)', marginTop: '0.25rem' }}>
                Loading a template will replace current system settings
              </div>
            </div>

            {/* System sub-section tabs */}
            <div className="sub-section-tabs" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {systemSections.map(section => (
                <button
                  key={section}
                  className={`btn ${systemSection === section ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSystemSection(section)}
                  style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                >
                  {systemSectionLabels[section]}
                </button>
              ))}
            </div>

            {/* General Settings */}
            {systemSection === 'general' && (
              <div>
                <div className="form-group">
                  <label>Game Name</label>
                  <input
                    type="text"
                    value={system.game_name}
                    onChange={e => updateSystem('game_name', e.target.value)}
                    placeholder="e.g., Bloomburrow Adventures"
                  />
                </div>
                <div className="form-group">
                  <label>Player Context <span className="hint">(who is playing - used in DM prompts)</span></label>
                  <input
                    type="text"
                    value={system.player_context}
                    onChange={e => updateSystem('player_context', e.target.value)}
                    placeholder="e.g., parent and child, solo adventurer"
                  />
                </div>
              </div>
            )}

            {/* Species */}
            {systemSection === 'species' && (
              <div>
                <p className="section-intro">Playable species/races with their unique traits.</p>

                {system.species.map((spec, i) => (
                  <div key={i} className="sub-form-card">
                    <div className="sub-form-header">
                      <span>Species {i + 1}</span>
                      {system.species.length > VALIDATION.minSpecies && (
                        <button className="remove-btn" onClick={() => removeSpecies(i)}>Remove</button>
                      )}
                    </div>
                    <div className="form-group">
                      <label>Name *</label>
                      <input
                        type="text"
                        value={spec.name}
                        onChange={e => updateSpecies(i, 'name', e.target.value)}
                        placeholder="e.g., Mousefolk"
                      />
                    </div>
                    <div className="form-row">
                      <div className="form-group half">
                        <label>Trait Name *</label>
                        <input
                          type="text"
                          value={spec.trait_name}
                          onChange={e => updateSpecies(i, 'trait_name', e.target.value)}
                          placeholder="e.g., Quick Paws"
                        />
                      </div>
                      <div className="form-group half">
                        <label>Trait Description *</label>
                        <input
                          type="text"
                          value={spec.trait_desc}
                          onChange={e => updateSpecies(i, 'trait_desc', e.target.value)}
                          placeholder="e.g., Take two actions in one turn"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {system.species.length < VALIDATION.maxSpecies && (
                  <button className="add-btn" onClick={addSpecies}>+ Add Species</button>
                )}
              </div>
            )}

            {/* Stats */}
            {systemSection === 'stats' && (
              <div>
                <p className="section-intro">Character stats (e.g., Brave, Clever, Kind or Strength, Dexterity, Wisdom)</p>

                <div className="form-row">
                  <div className="form-group third">
                    <label>Starting Pool</label>
                    <input
                      type="number"
                      min="3"
                      max="20"
                      value={system.stats.starting_pool}
                      onChange={e => updateSystemNested('stats.starting_pool', parseInt(e.target.value) || 3)}
                    />
                  </div>
                  <div className="form-group third">
                    <label>Min per Stat</label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={system.stats.min_per_stat}
                      onChange={e => updateSystemNested('stats.min_per_stat', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="form-group third">
                    <label>Max per Stat</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={system.stats.max_per_stat}
                      onChange={e => updateSystemNested('stats.max_per_stat', parseInt(e.target.value) || 3)}
                    />
                  </div>
                </div>

                {system.stats.names.map((statName, i) => (
                  <div key={i} className="array-item" style={{ alignItems: 'center' }}>
                    <input
                      type="color"
                      value={system.stats.colors[i] || '#666666'}
                      onChange={e => updateStatColor(i, e.target.value)}
                      style={{ width: '40px', height: '32px', padding: 0, border: 'none' }}
                    />
                    <input
                      type="text"
                      value={statName}
                      onChange={e => updateStatName(i, e.target.value)}
                      placeholder="Stat name"
                      style={{ flex: 1 }}
                    />
                    {system.stats.names.length > VALIDATION.minStats && (
                      <button className="remove-btn" onClick={() => removeStat(i)}>×</button>
                    )}
                  </div>
                ))}

                {system.stats.names.length < VALIDATION.maxStats && (
                  <button className="add-btn" onClick={addStat}>+ Add Stat</button>
                )}
              </div>
            )}

            {/* Resources */}
            {systemSection === 'resources' && (
              <div>
                <p className="section-intro">Health and magic resources for characters</p>

                <div className="sub-form-card">
                  <div className="sub-form-header">Health Resource</div>
                  <div className="form-row">
                    <div className="form-group half">
                      <label>Name</label>
                      <input
                        type="text"
                        value={system.resources.health?.name || ''}
                        onChange={e => updateSystemNested('resources.health.name', e.target.value)}
                        placeholder="e.g., Hearts, HP, Health"
                      />
                    </div>
                    <div className="form-group quarter">
                      <label>Symbol</label>
                      <input
                        type="text"
                        value={system.resources.health?.symbol || ''}
                        onChange={e => updateSystemNested('resources.health.symbol', e.target.value)}
                        placeholder="♥"
                        maxLength={2}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group half">
                      <label>Starting</label>
                      <input
                        type="number"
                        min="1"
                        value={system.resources.health?.starting || 5}
                        onChange={e => updateSystemNested('resources.health.starting', parseInt(e.target.value) || 5)}
                      />
                    </div>
                    <div className="form-group half">
                      <label>Maximum</label>
                      <input
                        type="number"
                        min="1"
                        value={system.resources.health?.max || 10}
                        onChange={e => updateSystemNested('resources.health.max', parseInt(e.target.value) || 10)}
                      />
                    </div>
                  </div>
                </div>

                <div className="sub-form-card">
                  <div className="sub-form-header">Magic Resource</div>
                  <div className="form-row">
                    <div className="form-group half">
                      <label>Name</label>
                      <input
                        type="text"
                        value={system.resources.magic?.name || ''}
                        onChange={e => updateSystemNested('resources.magic.name', e.target.value)}
                        placeholder="e.g., Threads, Mana, MP"
                      />
                    </div>
                    <div className="form-group quarter">
                      <label>Symbol</label>
                      <input
                        type="text"
                        value={system.resources.magic?.symbol || ''}
                        onChange={e => updateSystemNested('resources.magic.symbol', e.target.value)}
                        placeholder="✦"
                        maxLength={2}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group half">
                      <label>Starting</label>
                      <input
                        type="number"
                        min="0"
                        value={system.resources.magic?.starting || 3}
                        onChange={e => updateSystemNested('resources.magic.starting', parseInt(e.target.value) || 3)}
                      />
                    </div>
                    <div className="form-group half">
                      <label>Maximum</label>
                      <input
                        type="number"
                        min="1"
                        value={system.resources.magic?.max || 5}
                        onChange={e => updateSystemNested('resources.magic.max', parseInt(e.target.value) || 5)}
                      />
                    </div>
                  </div>
                </div>

                <div className="sub-form-card">
                  <div className="sub-form-header">Currency</div>
                  <div className="form-row">
                    <div className="form-group half">
                      <label>Name</label>
                      <input
                        type="text"
                        value={system.currency?.name || ''}
                        onChange={e => updateSystemNested('currency.name', e.target.value)}
                        placeholder="e.g., Gold, Seeds, Credits"
                      />
                    </div>
                    <div className="form-group quarter">
                      <label>Symbol</label>
                      <input
                        type="text"
                        value={system.currency?.symbol || ''}
                        onChange={e => updateSystemNested('currency.symbol', e.target.value)}
                        placeholder="🪙"
                        maxLength={2}
                      />
                    </div>
                    <div className="form-group quarter">
                      <label>Starting</label>
                      <input
                        type="number"
                        min="0"
                        value={system.currency?.starting || 0}
                        onChange={e => updateSystemNested('currency.starting', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Buildings */}
            {systemSection === 'buildings' && (
              <div>
                <p className="section-intro">Town buildings that can be purchased</p>

                {system.buildings.map((building, i) => (
                  <div key={i} className="sub-form-card">
                    <div className="sub-form-header">
                      <span>Building {i + 1}</span>
                      {system.buildings.length > VALIDATION.minBuildings && (
                        <button className="remove-btn" onClick={() => removeBuilding(i)}>Remove</button>
                      )}
                    </div>
                    <div className="form-row">
                      <div className="form-group third">
                        <label>Key *</label>
                        <input
                          type="text"
                          value={building.key}
                          onChange={e => updateBuilding(i, 'key', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                          placeholder="shop"
                        />
                      </div>
                      <div className="form-group third">
                        <label>Name *</label>
                        <input
                          type="text"
                          value={building.name}
                          onChange={e => updateBuilding(i, 'name', e.target.value)}
                          placeholder="General Shop"
                        />
                      </div>
                      <div className="form-group third">
                        <label>Cost</label>
                        <input
                          type="number"
                          min="0"
                          value={building.cost}
                          onChange={e => updateBuilding(i, 'cost', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <input
                        type="text"
                        value={building.desc}
                        onChange={e => updateBuilding(i, 'desc', e.target.value)}
                        placeholder="Basic supplies and gear"
                      />
                    </div>
                  </div>
                ))}

                {system.buildings.length < VALIDATION.maxBuildings && (
                  <button className="add-btn" onClick={addBuilding}>+ Add Building</button>
                )}
              </div>
            )}

            {/* Leveling */}
            {systemSection === 'leveling' && (
              <div>
                <p className="section-intro">XP thresholds and level-up rewards</p>

                <div className="form-group">
                  <label>Max Level</label>
                  <input
                    type="number"
                    min="2"
                    max="20"
                    value={system.leveling.max_level}
                    onChange={e => updateSystemNested('leveling.max_level', parseInt(e.target.value) || 5)}
                    style={{ width: '100px' }}
                  />
                </div>

                <div className="form-group">
                  <label>XP Thresholds <span className="hint">(XP needed for each level starting at 2)</span></label>
                  {system.leveling.thresholds.map((threshold, i) => (
                    <div key={i} className="array-item">
                      <span className="array-index">Lvl {i + 2}:</span>
                      <input
                        type="number"
                        min="1"
                        value={threshold}
                        onChange={e => updateThreshold(i, e.target.value)}
                        style={{ width: '100px' }}
                      />
                      <span style={{ color: 'var(--slate-muted)', fontSize: '0.8rem' }}>XP</span>
                    </div>
                  ))}
                </div>

                <div className="form-group">
                  <label>Level Rewards</label>
                  {Object.entries(system.leveling.rewards).map(([level, reward]) => (
                    <div key={level} className="sub-form-card" style={{ padding: '0.5rem' }}>
                      <div className="form-row">
                        <div className="form-group quarter">
                          <label>Level {level}</label>
                        </div>
                        <div className="form-group quarter">
                          <select
                            value={reward.type}
                            onChange={e => updateReward(level, 'type', e.target.value)}
                          >
                            {REWARD_TYPES.map(rt => (
                              <option key={rt.value} value={rt.value}>{rt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group half">
                          <input
                            type="text"
                            value={reward.desc}
                            onChange={e => updateReward(level, 'desc', e.target.value)}
                            placeholder="Reward description"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mechanics */}
            {systemSection === 'mechanics' && (
              <div>
                <p className="section-intro">Dice mechanics and enemy definitions</p>

                <div className="form-row">
                  <div className="form-group third">
                    <label>Dice Type</label>
                    <select
                      value={system.mechanics.dice}
                      onChange={e => updateSystemNested('mechanics.dice', e.target.value)}
                    >
                      <option value="d4">d4</option>
                      <option value="d6">d6</option>
                      <option value="d8">d8</option>
                      <option value="d10">d10</option>
                      <option value="d12">d12</option>
                      <option value="d20">d20</option>
                    </select>
                  </div>
                  <div className="form-group third">
                    <label>Success Threshold</label>
                    <input
                      type="number"
                      min="1"
                      value={system.mechanics.success_threshold}
                      onChange={e => updateSystemNested('mechanics.success_threshold', parseInt(e.target.value) || 15)}
                    />
                  </div>
                  <div className="form-group third">
                    <label>Partial Threshold</label>
                    <input
                      type="number"
                      min="1"
                      value={system.mechanics.partial_threshold}
                      onChange={e => updateSystemNested('mechanics.partial_threshold', parseInt(e.target.value) || 10)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Enemy Tiers</label>
                  {Object.entries(system.mechanics.enemy_tiers || {}).map(([tier, data]) => (
                    <div key={tier} className="array-item" style={{ alignItems: 'center' }}>
                      <span style={{ width: '80px', fontWeight: 600 }}>{tier}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--slate-muted)' }}>HP:</span>
                      <input
                        type="number"
                        min="1"
                        value={data.health}
                        onChange={e => updateEnemyTier(tier, 'health', e.target.value)}
                        style={{ width: '60px' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--slate-muted)' }}>Dmg:</span>
                      <select
                        value={data.damage}
                        onChange={e => updateEnemyTier(tier, 'damage', e.target.value)}
                        style={{ width: '70px' }}
                      >
                        <option value="d4">d4</option>
                        <option value="d6">d6</option>
                        <option value="d8">d8</option>
                        <option value="d10">d10</option>
                        <option value="d12">d12</option>
                      </select>
                    </div>
                  ))}
                </div>

                <div className="form-group">
                  <label>Location Tags <span className="hint">(used in authored campaigns)</span></label>
                  {system.location_tags.map((tag, i) => (
                    <div key={i} className="array-item">
                      <input
                        type="text"
                        value={tag.value}
                        onChange={e => updateLocationTag(i, 'value', e.target.value.toLowerCase().replace(/[^a-z]/g, ''))}
                        placeholder="value"
                        style={{ width: '100px' }}
                      />
                      <input
                        type="text"
                        value={tag.label}
                        onChange={e => updateLocationTag(i, 'label', e.target.value)}
                        placeholder="Label"
                        style={{ flex: 1 }}
                      />
                      {system.location_tags.length > 1 && (
                        <button className="remove-btn" onClick={() => removeLocationTag(i)}>×</button>
                      )}
                    </div>
                  ))}
                  <button className="add-btn" onClick={addLocationTag}>+ Add Tag</button>
                </div>
              </div>
            )}

            {/* Lore & Style */}
            {systemSection === 'content' && (
              <div>
                <div className="form-group">
                  <label>Art Style <span className="hint">(prompt for AI image generation)</span></label>
                  <textarea
                    value={system.art_style}
                    onChange={e => updateSystem('art_style', e.target.value)}
                    placeholder="e.g., fantasy illustration, warm earthy tones, atmospheric lighting"
                    rows={3}
                  />
                </div>

                <div className="form-group">
                  <label>World Lore <span className="hint">(background for the DM)</span></label>
                  <textarea
                    value={system.lore}
                    onChange={e => updateSystem('lore', e.target.value)}
                    placeholder="Describe the world, history, and key concepts..."
                    rows={5}
                  />
                </div>

                <div className="form-group">
                  <label>DM Tone <span className="hint">(how the AI narrator should behave)</span></label>
                  <textarea
                    value={system.dm_tone}
                    onChange={e => updateSystem('dm_tone', e.target.value)}
                    placeholder="e.g., Warm storybook tone. Never scary. Celebrate creativity."
                    rows={3}
                  />
                </div>

                <div className="form-group">
                  <label>Rules Addendum <span className="hint">(additional rules or modifications)</span></label>
                  <textarea
                    value={system.rules_addendum}
                    onChange={e => updateSystem('rules_addendum', e.target.value)}
                    placeholder="Any special rules for this campaign..."
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* === BASICS === */}
        {currentSection === 'basics' && (
          <div className="form-section">
            <div className="form-group">
              <label>Campaign Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., The Rotwood Blight"
                maxLength={50}
              />
            </div>

            <div className="form-group">
              <label>Premise * <span className="hint">(2-4 sentences: what's happening, stakes, goal)</span></label>
              <textarea
                value={premise}
                onChange={e => setPremise(e.target.value)}
                placeholder="A sickness spreads through the Brambles. Trees blacken, streams turn bitter, creatures flee toward Valley. The heroes must find the source before it reaches Three Tree City."
                rows={4}
                maxLength={500}
              />
              <div className="char-count">{premise.length}/500</div>
            </div>

            <div className="form-group">
              <label>Tone * <span className="hint">(short phrase or comma-separated tags)</span></label>
              <input
                type="text"
                value={tone}
                onChange={e => setTone(e.target.value)}
                placeholder="e.g., creeping dread, mystery, hope at the edges"
                maxLength={100}
              />
            </div>
          </div>
        )}

        {/* === THREAT === */}
        {currentSection === 'threat' && (
          <div className="form-section">
            <div className={`form-group dm-decides-field ${threatDmDecides.name ? 'checked' : ''}`}>
              <div className="field-label-row">
                <label>Threat Name *</label>
                <label className="dm-decides-label">
                  <input type="checkbox" checked={!!threatDmDecides.name} onChange={() => toggleThreatDmDecides('name')} />
                  DM decides
                </label>
              </div>
              <input
                type="text"
                value={threatName}
                onChange={e => setThreatName(e.target.value)}
                placeholder="e.g., The Blight"
                maxLength={50}
              />
            </div>

            <div className={`form-group dm-decides-field ${threatDmDecides.stages ? 'checked' : ''}`}>
              <div className="field-label-row">
                <label>Threat Stages * <span className="hint">(escalating states, {VALIDATION.minThreatStages}-{VALIDATION.maxThreatStages})</span></label>
                <label className="dm-decides-label">
                  <input type="checkbox" checked={!!threatDmDecides.stages} onChange={() => toggleThreatDmDecides('stages')} />
                  DM decides
                </label>
              </div>
              {threatStages.map((stage, i) => (
                <div key={i} className="array-item">
                  <span className="array-index">{i + 1}.</span>
                  <input
                    type="text"
                    value={stage}
                    onChange={e => updateThreatStage(i, e.target.value)}
                    placeholder={`Stage ${i + 1}: What's happening at this level?`}
                    maxLength={150}
                  />
                  {threatStages.length > VALIDATION.minThreatStages && (
                    <button className="remove-btn" onClick={() => removeThreatStage(i)}>×</button>
                  )}
                </div>
              ))}
              {threatStages.length < VALIDATION.maxThreatStages && (
                <button className="add-btn" onClick={addThreatStage}>+ Add Stage</button>
              )}
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={threatAdvancesUnlessBeatHit}
                  onChange={e => setThreatAdvancesUnlessBeatHit(e.target.checked)}
                />
                Threat advances each episode unless a beat is hit
              </label>
            </div>
          </div>
        )}

        {/* === NPCs === */}
        {currentSection === 'npcs' && (
          <div className="form-section">
            <p className="section-intro">Key characters the party will meet. Each needs a secret the party can discover.</p>

            {npcs.map((npc, i) => (
              <div key={i} className="sub-form-card">
                <div className="sub-form-header">
                  <span>NPC {i + 1}</span>
                  {npcs.length > VALIDATION.minNPCs && (
                    <button className="remove-btn" onClick={() => removeNpc(i)}>Remove</button>
                  )}
                </div>

                <div className="form-row">
                  <div className={`form-group half dm-decides-field ${npcDmDecides[i]?.name ? 'checked' : ''}`}>
                    <div className="field-label-row">
                      <label>Name *</label>
                      <label className="dm-decides-label">
                        <input type="checkbox" checked={!!npcDmDecides[i]?.name} onChange={() => toggleNpcDmDecides(i, 'name')} />
                        DM
                      </label>
                    </div>
                    <input
                      type="text"
                      value={npc.name}
                      onChange={e => updateNpc(i, 'name', e.target.value)}
                      placeholder="e.g., Bramblewick"
                      maxLength={50}
                    />
                  </div>
                  <div className={`form-group half dm-decides-field ${npcDmDecides[i]?.species ? 'checked' : ''}`}>
                    <div className="field-label-row">
                      <label>Species *</label>
                      <label className="dm-decides-label">
                        <input type="checkbox" checked={!!npcDmDecides[i]?.species} onChange={() => toggleNpcDmDecides(i, 'species')} />
                        DM
                      </label>
                    </div>
                    <select value={npc.species || ''} onChange={e => updateNpc(i, 'species', e.target.value)}>
                      <option value="">Select species...</option>
                      {system.species.filter(s => s.name).map(s => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={`form-group dm-decides-field ${npcDmDecides[i]?.role ? 'checked' : ''}`}>
                  <div className="field-label-row">
                    <label>Role * <span className="hint">(one phrase)</span></label>
                    <label className="dm-decides-label">
                      <input type="checkbox" checked={!!npcDmDecides[i]?.role} onChange={() => toggleNpcDmDecides(i, 'role')} />
                      DM decides
                    </label>
                  </div>
                  <input
                    type="text"
                    value={npc.role}
                    onChange={e => updateNpc(i, 'role', e.target.value)}
                    placeholder="e.g., Hermit scholar in the Brambles"
                    maxLength={100}
                  />
                </div>

                <div className={`form-group dm-decides-field ${npcDmDecides[i]?.wants ? 'checked' : ''}`}>
                  <div className="field-label-row">
                    <label>Wants * <span className="hint">(what they're trying to achieve)</span></label>
                    <label className="dm-decides-label">
                      <input type="checkbox" checked={!!npcDmDecides[i]?.wants} onChange={() => toggleNpcDmDecides(i, 'wants')} />
                      DM decides
                    </label>
                  </div>
                  <input
                    type="text"
                    value={npc.wants}
                    onChange={e => updateNpc(i, 'wants', e.target.value)}
                    placeholder="e.g., Protect his insect colony"
                    maxLength={200}
                  />
                </div>

                <div className={`form-group dm-decides-field ${npcDmDecides[i]?.secret ? 'checked' : ''}`}>
                  <div className="field-label-row">
                    <label>Secret * <span className="hint">(what they know or are hiding)</span></label>
                    <label className="dm-decides-label">
                      <input type="checkbox" checked={!!npcDmDecides[i]?.secret} onChange={() => toggleNpcDmDecides(i, 'secret')} />
                      DM decides
                    </label>
                  </div>
                  <input
                    type="text"
                    value={npc.secret}
                    onChange={e => updateNpc(i, 'secret', e.target.value)}
                    placeholder="e.g., Knows the blight started at an old shrine"
                    maxLength={300}
                  />
                </div>
              </div>
            ))}

            {npcs.length < VALIDATION.maxNPCs && (
              <button className="add-btn" onClick={addNpc}>+ Add NPC</button>
            )}
          </div>
        )}

        {/* === LOCATIONS === */}
        {currentSection === 'locations' && (
          <div className="form-section">
            <p className="section-intro">Key places in your campaign. Tag what can be found there.</p>

            {locations.map((loc, i) => (
              <div key={i} className="sub-form-card">
                <div className="sub-form-header">
                  <span>Location {i + 1}</span>
                  {locations.length > VALIDATION.minLocations && (
                    <button className="remove-btn" onClick={() => removeLocation(i)}>Remove</button>
                  )}
                </div>

                <div className={`form-group dm-decides-field ${locationDmDecides[i]?.name ? 'checked' : ''}`}>
                  <div className="field-label-row">
                    <label>Name *</label>
                    <label className="dm-decides-label">
                      <input type="checkbox" checked={!!locationDmDecides[i]?.name} onChange={() => toggleLocationDmDecides(i, 'name')} />
                      DM decides
                    </label>
                  </div>
                  <input
                    type="text"
                    value={loc.name}
                    onChange={e => updateLocation(i, 'name', e.target.value)}
                    placeholder="e.g., The Withered Clearing"
                    maxLength={50}
                  />
                </div>

                <div className={`form-group dm-decides-field ${locationDmDecides[i]?.vibe ? 'checked' : ''}`}>
                  <div className="field-label-row">
                    <label>Vibe * <span className="hint">(one sentence atmosphere)</span></label>
                    <label className="dm-decides-label">
                      <input type="checkbox" checked={!!locationDmDecides[i]?.vibe} onChange={() => toggleLocationDmDecides(i, 'vibe')} />
                      DM decides
                    </label>
                  </div>
                  <input
                    type="text"
                    value={loc.vibe}
                    onChange={e => updateLocation(i, 'vibe', e.target.value)}
                    placeholder="e.g., Dead center of the blight, air thick and wrong"
                    maxLength={200}
                  />
                </div>

                <div className={`form-group dm-decides-tags ${locationDmDecides[i]?.contains ? 'checked' : ''}`}>
                  <div className="field-label-row">
                    <label>Contains * <span className="hint">(select at least one)</span></label>
                    <label className="dm-decides-label">
                      <input type="checkbox" checked={!!locationDmDecides[i]?.contains} onChange={() => toggleLocationDmDecides(i, 'contains')} />
                      DM decides
                    </label>
                  </div>
                  <div className="tag-buttons">
                    {system.location_tags.filter(t => t.value && t.label).map(tag => (
                      <button
                        key={tag.value}
                        className={`tag-btn ${loc.contains.includes(tag.value) ? 'active' : ''}`}
                        onClick={() => toggleLocationTag(i, tag.value)}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {locations.length < VALIDATION.maxLocations && (
              <button className="add-btn" onClick={addLocation}>+ Add Location</button>
            )}
          </div>
        )}

        {/* === BEATS === */}
        {currentSection === 'beats' && (
          <div className="form-section">
            <p className="section-intro">
              Story beats that advance the plot. Each beat has a description, hints for the AI, and a revelation the party learns.
            </p>

            {beats.map((beat, i) => (
              <div key={i} className="sub-form-card">
                <div className="sub-form-header">
                  <span>Beat {i + 1}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <label className="checkbox-label" style={{ fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={beat.is_finale || false}
                        onChange={e => updateBeat(i, 'is_finale', e.target.checked)}
                      />
                      Finale
                    </label>
                    {beats.length > VALIDATION.minBeats && (
                      <button className="remove-btn" onClick={() => removeBeat(i)}>Remove</button>
                    )}
                  </div>
                </div>

                <div className={`form-group dm-decides-field ${beatDmDecides[i]?.id ? 'checked' : ''}`}>
                  <div className="field-label-row">
                    <label>ID * <span className="hint">(lowercase, no spaces)</span></label>
                    <label className="dm-decides-label">
                      <input type="checkbox" checked={!!beatDmDecides[i]?.id} onChange={() => toggleBeatDmDecides(i, 'id')} />
                      DM
                    </label>
                  </div>
                  <input
                    type="text"
                    value={beat.id}
                    onChange={e => updateBeat(i, 'id', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    placeholder="e.g., first_signs"
                    maxLength={30}
                  />
                </div>

                <div className={`form-group dm-decides-field ${beatDmDecides[i]?.description ? 'checked' : ''}`}>
                  <div className="field-label-row">
                    <label>Description * <span className="hint">(what this beat is about)</span></label>
                    <label className="dm-decides-label">
                      <input type="checkbox" checked={!!beatDmDecides[i]?.description} onChange={() => toggleBeatDmDecides(i, 'description')} />
                      DM decides
                    </label>
                  </div>
                  <textarea
                    value={beat.description}
                    onChange={e => updateBeat(i, 'description', e.target.value)}
                    placeholder="e.g., A farmer's child is sick. The healer needs bramble-root, but gatherers have gone missing."
                    rows={2}
                    maxLength={300}
                  />
                </div>

                <div className="form-group">
                  <label>Hints <span className="hint">(things the AI must weave in, up to 5)</span></label>
                  {(beat.hints || []).map((item, j) => (
                    <div key={j} className="array-item">
                      <input
                        type="text"
                        value={item}
                        onChange={e => updateHint(i, j, e.target.value)}
                        placeholder="e.g., Signs of the blight (blackened leaves)"
                        maxLength={200}
                      />
                      {beat.hints.length > 1 && (
                        <button className="remove-btn" onClick={() => removeHint(i, j)}>x</button>
                      )}
                    </div>
                  ))}
                  {(beat.hints || []).length < 5 && (
                    <button className="add-btn small" onClick={() => addHint(i)}>+ Add Hint</button>
                  )}
                </div>

                <div className={`form-group dm-decides-field ${beatDmDecides[i]?.revelation ? 'checked' : ''}`}>
                  <div className="field-label-row">
                    <label>Revelation * <span className="hint">(what the party learns)</span></label>
                    <label className="dm-decides-label">
                      <input type="checkbox" checked={!!beatDmDecides[i]?.revelation} onChange={() => toggleBeatDmDecides(i, 'revelation')} />
                      DM decides
                    </label>
                  </div>
                  <input
                    type="text"
                    value={beat.revelation}
                    onChange={e => updateBeat(i, 'revelation', e.target.value)}
                    placeholder="e.g., The Brambles themselves are sick — this isn't normal"
                    maxLength={300}
                  />
                </div>

                <div className="form-group">
                  <label>Prerequisites <span className="hint">(beats that must be hit first)</span></label>
                  <div className="tag-buttons">
                    {beats.filter((b, j) => j !== i && b.id).map(b => (
                      <button
                        key={b.id}
                        className={`tag-btn ${(beat.prerequisites || []).includes(b.id) ? 'active' : ''}`}
                        onClick={() => togglePrerequisite(i, b.id)}
                      >
                        {b.id}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group half">
                    <label>Unlocked After Episode <span className="hint">(optional)</span></label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={beat.unlocked_by ? parseInt(beat.unlocked_by.replace('episode:', '')) || '' : ''}
                      onChange={e => updateBeat(i, 'unlocked_by', e.target.value ? `episode:${e.target.value}` : null)}
                      placeholder="e.g., 3"
                    />
                  </div>
                  <div className="form-group half">
                    <label>Expires After Episode <span className="hint">(optional)</span></label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={beat.closes_after_episodes || ''}
                      onChange={e => updateBeat(i, 'closes_after_episodes', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="e.g., 5"
                    />
                  </div>
                </div>
              </div>
            ))}

            {beats.length < VALIDATION.maxBeats && (
              <button className="add-btn" onClick={addBeat}>+ Add Beat</button>
            )}
          </div>
        )}

        {/* === CHARACTER ARCS === */}
        {currentSection === 'arcs' && (
          <div className="form-section">
            <p className="section-intro">
              Optional character arcs players can choose during character creation. Each arc has milestones and a reward.
            </p>

            {characterArcs.map((arc, i) => (
              <div key={i} className="sub-form-card">
                <div className="sub-form-header">
                  <span>Arc {i + 1}</span>
                  <button className="remove-btn" onClick={() => removeArc(i)}>Remove</button>
                </div>

                <div className="form-row">
                  <div className={`form-group half dm-decides-field ${arcDmDecides[i]?.id ? 'checked' : ''}`}>
                    <div className="field-label-row">
                      <label>ID * <span className="hint">(lowercase, no spaces)</span></label>
                      <label className="dm-decides-label">
                        <input type="checkbox" checked={!!arcDmDecides[i]?.id} onChange={() => toggleArcDmDecides(i, 'id')} />
                        DM
                      </label>
                    </div>
                    <input
                      type="text"
                      value={arc.id}
                      onChange={e => updateArc(i, 'id', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                      placeholder="e.g., brave_path"
                      maxLength={30}
                    />
                  </div>
                  <div className={`form-group half dm-decides-field ${arcDmDecides[i]?.name ? 'checked' : ''}`}>
                    <div className="field-label-row">
                      <label>Name *</label>
                      <label className="dm-decides-label">
                        <input type="checkbox" checked={!!arcDmDecides[i]?.name} onChange={() => toggleArcDmDecides(i, 'name')} />
                        DM
                      </label>
                    </div>
                    <input
                      type="text"
                      value={arc.name}
                      onChange={e => updateArc(i, 'name', e.target.value)}
                      placeholder="e.g., Path of Courage"
                      maxLength={50}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Suggested For <span className="hint">(optional, species this arc fits)</span></label>
                  <div className="tag-buttons">
                    {system.species.filter(s => s.name).map(spec => (
                      <button
                        key={spec.name}
                        className={`tag-btn ${(arc.suggested_for || []).includes(spec.name) ? 'active' : ''}`}
                        onClick={() => toggleArcSpecies(i, spec.name)}
                      >
                        {spec.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`form-group dm-decides-field ${arcDmDecides[i]?.milestones ? 'checked' : ''}`}>
                  <div className="field-label-row">
                    <label>Milestones * <span className="hint">(2-5 goals to progress)</span></label>
                    <label className="dm-decides-label">
                      <input type="checkbox" checked={!!arcDmDecides[i]?.milestones} onChange={() => toggleArcDmDecides(i, 'milestones')} />
                      DM decides
                    </label>
                  </div>
                  {arc.milestones.map((m, j) => (
                    <div key={j} className="array-item">
                      <span className="array-index">{j + 1}.</span>
                      <input
                        type="text"
                        value={m}
                        onChange={e => updateArcMilestone(i, j, e.target.value)}
                        placeholder={`Milestone ${j + 1}`}
                        maxLength={200}
                      />
                      {arc.milestones.length > 2 && (
                        <button className="remove-btn" onClick={() => removeArcMilestone(i, j)}>x</button>
                      )}
                    </div>
                  ))}
                  {arc.milestones.length < 5 && (
                    <button className="add-btn small" onClick={() => addArcMilestone(i)}>+ Add Milestone</button>
                  )}
                </div>

                <div className="form-row">
                  <div className={`form-group half dm-decides-field ${arcDmDecides[i]?.reward_name ? 'checked' : ''}`}>
                    <div className="field-label-row">
                      <label>Reward Name *</label>
                      <label className="dm-decides-label">
                        <input type="checkbox" checked={!!arcDmDecides[i]?.reward_name} onChange={() => toggleArcDmDecides(i, 'reward_name')} />
                        DM
                      </label>
                    </div>
                    <input
                      type="text"
                      value={arc.reward?.name || ''}
                      onChange={e => updateArc(i, 'reward', { ...arc.reward, name: e.target.value })}
                      placeholder="e.g., Heart of Valor"
                      maxLength={50}
                    />
                  </div>
                  <div className={`form-group half dm-decides-field ${arcDmDecides[i]?.reward_description ? 'checked' : ''}`}>
                    <div className="field-label-row">
                      <label>Reward Description *</label>
                      <label className="dm-decides-label">
                        <input type="checkbox" checked={!!arcDmDecides[i]?.reward_description} onChange={() => toggleArcDmDecides(i, 'reward_description')} />
                        DM
                      </label>
                    </div>
                    <input
                      type="text"
                      value={arc.reward?.description || ''}
                      onChange={e => updateArc(i, 'reward', { ...arc.reward, description: e.target.value })}
                      placeholder="e.g., +1 to Brave stat permanently"
                      maxLength={200}
                    />
                  </div>
                </div>
              </div>
            ))}

            {characterArcs.length < 10 && (
              <button className="add-btn" onClick={addArc}>+ Add Character Arc</button>
            )}
          </div>
        )}

        {/* === DM PREP === */}
        {currentSection === 'dm-prep' && campaignId && (
          <DMPrepSection
            campaignId={campaignId}
            npcs={npcs}
            locations={locations}
            beats={beats}
          />
        )}
        {currentSection === 'dm-prep' && !campaignId && (
          <div className="form-section">
            <p className="text-center" style={{ padding: '2rem', color: 'var(--slate-muted)' }}>
              DM Prep is available after saving the campaign. Save as draft first to access this feature.
            </p>
          </div>
        )}

      </div>

      {/* Form actions */}
      <div className="form-actions">
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        {onSaveDraft && (
          <button className="btn btn-outline" onClick={handleSaveDraft}>
            Save Draft
          </button>
        )}
        {hasDmDecidesFields() && (
          <button
            className="btn-gold"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Generate DM Fields'}
          </button>
        )}
        <button className="btn btn-primary" onClick={handleSubmit}>
          {initialData ? 'Save Changes' : 'Create Campaign'}
        </button>
      </div>
      {generateError && (
        <div className="generate-error">{generateError}</div>
      )}
    </div>
  )
}

export default CampaignForm
