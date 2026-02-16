"""
Tests for pure logic functions in campaign_logic.py
"""

import pytest
from campaign_schema import (
    CampaignContent,
    CampaignState,
    NPCState,
    EXAMPLE_CAMPAIGN,
)
from campaign_logic import (
    get_available_beats,
    check_beat_expiry,
    advance_threat,
    build_dm_context,
)


# === get_available_beats ===


class TestGetAvailableBeats:
    """Tests for get_available_beats(content, state)"""

    def test_beats_with_no_prereqs_available_initially(self, sample_content):
        state = CampaignState()
        result = get_available_beats(sample_content, state)
        beat_ids = [b.id for b in result]
        assert "first_signs" in beat_ids

    def test_hit_beat_not_available(self, sample_content):
        state = CampaignState(beats_hit=["first_signs"])
        result = get_available_beats(sample_content, state)
        beat_ids = [b.id for b in result]
        assert "first_signs" not in beat_ids

    def test_prerequisite_unlocks_beat(self, sample_content):
        state = CampaignState(beats_hit=["first_signs"])
        result = get_available_beats(sample_content, state)
        beat_ids = [b.id for b in result]
        assert "find_the_scholar" in beat_ids

    def test_prerequisite_locks_beat(self, sample_content):
        state = CampaignState()
        result = get_available_beats(sample_content, state)
        beat_ids = [b.id for b in result]
        assert "find_the_scholar" not in beat_ids

    def test_unlocked_by_episode_count(self, sample_content):
        # the_lost_patrol has unlocked_by: "episode:2"
        state = CampaignState(episodes_completed=2)
        result = get_available_beats(sample_content, state)
        beat_ids = [b.id for b in result]
        assert "the_lost_patrol" in beat_ids

    def test_locked_by_episode_count(self, sample_content):
        state = CampaignState(episodes_completed=1)
        result = get_available_beats(sample_content, state)
        beat_ids = [b.id for b in result]
        assert "the_lost_patrol" not in beat_ids

    def test_finale_requires_prerequisites(self, sample_content):
        # heart_of_the_rot requires find_the_scholar
        state = CampaignState(beats_hit=["first_signs"])
        result = get_available_beats(sample_content, state)
        beat_ids = [b.id for b in result]
        assert "heart_of_the_rot" not in beat_ids

    def test_finale_available_when_prereqs_met(self, sample_content):
        state = CampaignState(beats_hit=["first_signs", "find_the_scholar"])
        result = get_available_beats(sample_content, state)
        beat_ids = [b.id for b in result]
        assert "heart_of_the_rot" in beat_ids

    def test_expired_beat_not_available(self, sample_content):
        state = CampaignState(beats_expired=["first_signs"])
        result = get_available_beats(sample_content, state)
        beat_ids = [b.id for b in result]
        assert "first_signs" not in beat_ids


# === check_beat_expiry ===


class TestCheckBeatExpiry:
    def test_no_expiry_returns_false(self, sample_content):
        beat = sample_content.beats[0]  # first_signs, no closes_after_episodes
        state = CampaignState(episodes_completed=100)
        assert check_beat_expiry(beat, state) is False

    def test_expired_returns_true(self):
        from campaign_schema import Beat
        beat = Beat(
            id="timed",
            description="Only available for a limited time",
            revelation="Too late",
            closes_after_episodes=3,
        )
        state = CampaignState(episodes_completed=3)
        assert check_beat_expiry(beat, state) is True

    def test_not_expired_returns_false(self):
        from campaign_schema import Beat
        beat = Beat(
            id="timed",
            description="Only available for a limited time",
            revelation="Still here",
            closes_after_episodes=3,
        )
        state = CampaignState(episodes_completed=2)
        assert check_beat_expiry(beat, state) is False


# === advance_threat ===


class TestAdvanceThreat:
    def test_advances_when_no_beat_hit(self, sample_content):
        state = CampaignState(threat_stage=1)
        result = advance_threat(sample_content, state, beat_hit_this_episode=False)
        assert result is True
        assert state.threat_stage == 2

    def test_does_not_advance_when_beat_hit(self, sample_content):
        state = CampaignState(threat_stage=1)
        result = advance_threat(sample_content, state, beat_hit_this_episode=True)
        assert result is False
        assert state.threat_stage == 1

    def test_does_not_advance_at_max(self, sample_content):
        state = CampaignState(threat_stage=4)  # 5 stages, max index is 4
        result = advance_threat(sample_content, state, beat_hit_this_episode=False)
        assert result is False
        assert state.threat_stage == 4


# === build_dm_context ===


class TestBuildDmContext:
    """Tests for build_dm_context(content, state, episode_details)"""

    def test_includes_campaign_context(self, sample_content, sample_state):
        episode_details = {"description": "test episode"}
        result = build_dm_context(sample_content, sample_state, episode_details)
        assert result["campaign_context"]["name"] == sample_content.name
        assert result["campaign_context"]["premise"] == sample_content.premise

    def test_includes_episode(self, sample_content, sample_state):
        episode_details = {"description": "find the scholar", "beat_id": "find_the_scholar"}
        result = build_dm_context(sample_content, sample_state, episode_details)
        assert result["episode"] == episode_details

    def test_party_knows_contains_facts(self, sample_content, sample_state):
        episode_details = {"description": "test"}
        result = build_dm_context(sample_content, sample_state, episode_details)
        assert sample_state.facts_known[0] in result["party_knows"]

    def test_threat_description(self, sample_content, sample_state):
        episode_details = {"description": "test"}
        result = build_dm_context(sample_content, sample_state, episode_details)
        assert result["threat_stage"] == sample_state.threat_stage
        assert result["threat_name"] == sample_content.threat.name
        expected_desc = sample_content.threat.stages[sample_state.threat_stage]
        assert result["threat_description"] == expected_desc

    def test_npc_states_included(self, sample_content, sample_state):
        episode_details = {"description": "test"}
        result = build_dm_context(sample_content, sample_state, episode_details)
        assert "Bramblewick" in result["npc_states"]
        assert result["npc_states"]["Bramblewick"]["met"] is True

    def test_unrevealed_secrets_in_party_does_not_know(self, sample_content):
        state = CampaignState()
        state.initialize_from_content(sample_content)
        episode_details = {"description": "test"}
        result = build_dm_context(sample_content, state, episode_details)
        assert len(result["party_does_not_know"]) > 0

    def test_locations_included(self, sample_content, sample_state):
        episode_details = {"description": "test"}
        result = build_dm_context(sample_content, sample_state, episode_details)
        loc_names = [loc["name"] for loc in result["campaign_context"]["locations"]]
        assert "The Withered Clearing" in loc_names

    def test_available_beats_included(self, sample_content, sample_state):
        episode_details = {"description": "test"}
        result = build_dm_context(sample_content, sample_state, episode_details)
        assert "available_beats" in result
        beat_ids = [b["id"] for b in result["available_beats"]]
        # first_signs already hit, find_the_scholar should be available
        assert "find_the_scholar" in beat_ids
