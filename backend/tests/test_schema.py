"""
Tests for Pydantic model validation in campaign_schema.py
"""

import copy

import pytest
from pydantic import ValidationError

from campaign_schema import (
    Beat,
    CampaignContent,
    CampaignState,
    CampaignSystem,
    Location,
    NPC,
    Threat,
    ValidationResult,
    validate_campaign_content,
    EXAMPLE_CAMPAIGN,
    BLOOMBURROW_SYSTEM,
)


# === Beat validation ===


class TestBeat:
    def test_valid_beat(self):
        beat = Beat(
            id="test_beat",
            description="A mysterious letter arrives at the party's doorstep",
            revelation="The letter was from the lost king",
        )
        assert beat.id == "test_beat"

    def test_id_invalid_chars_rejected(self):
        with pytest.raises(ValidationError):
            Beat(
                id="Test Beat!",
                description="A mysterious letter arrives at the party's doorstep",
                revelation="The letter was from the lost king",
            )

    def test_description_too_short_rejected(self):
        with pytest.raises(ValidationError):
            Beat(
                id="test_beat",
                description="Short",
                revelation="The letter was from the lost king",
            )

    def test_beat_with_prerequisites(self):
        beat = Beat(
            id="second_beat",
            description="Follow up on the mysterious letter clues",
            revelation="The king is alive",
            prerequisites=["first_beat"],
        )
        assert beat.prerequisites == ["first_beat"]

    def test_beat_is_finale(self):
        beat = Beat(
            id="finale",
            description="The final confrontation with the villain",
            revelation="Peace is restored",
            is_finale=True,
        )
        assert beat.is_finale is True

    def test_beat_with_unlocked_by(self):
        beat = Beat(
            id="late_beat",
            description="Available after several episodes",
            revelation="A hidden truth",
            unlocked_by="episode:3",
        )
        assert beat.unlocked_by == "episode:3"

    def test_beat_with_closes_after(self):
        beat = Beat(
            id="timed_beat",
            description="Only available for a limited time",
            revelation="Missed opportunity",
            closes_after_episodes=5,
        )
        assert beat.closes_after_episodes == 5


# === Threat validation ===


class TestThreat:
    def test_valid_threat(self):
        t = Threat(
            name="The Blight",
            stages=[
                "Stage one description here",
                "Stage two description here",
                "Stage three description here",
            ],
            advances_each_episode_unless_beat_hit=True,
        )
        assert len(t.stages) == 3

    def test_stage_too_short_rejected(self):
        with pytest.raises(ValidationError):
            Threat(
                name="The Blight",
                stages=["OK", "Fine stage two here!", "Fine stage three here"],
                advances_each_episode_unless_beat_hit=True,
            )

    def test_too_few_stages_rejected(self):
        with pytest.raises(ValidationError):
            Threat(
                name="The Blight",
                stages=["Stage one description", "Stage two description"],
                advances_each_episode_unless_beat_hit=True,
            )

    def test_six_stages_valid(self):
        t = Threat(
            name="The Blight",
            stages=[f"Stage {i} is happening now" for i in range(6)],
            advances_each_episode_unless_beat_hit=False,
        )
        assert len(t.stages) == 6

    def test_seven_stages_rejected(self):
        with pytest.raises(ValidationError):
            Threat(
                name="The Blight",
                stages=[f"Stage {i} is happening now" for i in range(7)],
                advances_each_episode_unless_beat_hit=True,
            )


# === CampaignContent validation ===


class TestCampaignContent:
    def test_example_campaign_valid(self):
        content = CampaignContent(**EXAMPLE_CAMPAIGN)
        assert content.name == "The Rotwood Blight"

    def test_has_available_beat_true(self):
        content = CampaignContent(**EXAMPLE_CAMPAIGN)
        assert content.has_available_beat() is True

    def test_has_available_beat_false_when_all_gated(self):
        data = copy.deepcopy(EXAMPLE_CAMPAIGN)
        # Make all beats have prerequisites
        for beat in data["beats"]:
            if not beat.get("prerequisites"):
                beat["prerequisites"] = ["some_other_beat"]
        # This will fail validation because prerequisites reference nonexistent beat
        # Instead, make them all depend on each other in a chain
        data["beats"][0]["prerequisites"] = ["heart_of_the_rot"]
        data["beats"][2]["prerequisites"] = ["heart_of_the_rot"]
        content = CampaignContent(**data)
        assert content.has_available_beat() is False

    def test_prerequisite_references_nonexistent_beat_rejected(self):
        data = copy.deepcopy(EXAMPLE_CAMPAIGN)
        data["beats"][1]["prerequisites"] = ["nonexistent_beat"]
        with pytest.raises(ValidationError, match="unknown prerequisite"):
            CampaignContent(**data)

    def test_self_referencing_prerequisite_rejected(self):
        data = copy.deepcopy(EXAMPLE_CAMPAIGN)
        data["beats"][0]["prerequisites"] = ["first_signs"]
        with pytest.raises(ValidationError, match="cannot be its own prerequisite"):
            CampaignContent(**data)

    def test_too_few_npcs_rejected(self):
        data = copy.deepcopy(EXAMPLE_CAMPAIGN)
        data["npcs"] = [data["npcs"][0]]
        with pytest.raises(ValidationError):
            CampaignContent(**data)

    def test_too_few_locations_rejected(self):
        data = copy.deepcopy(EXAMPLE_CAMPAIGN)
        data["locations"] = [data["locations"][0]]
        with pytest.raises(ValidationError):
            CampaignContent(**data)

    def test_too_few_beats_rejected(self):
        data = copy.deepcopy(EXAMPLE_CAMPAIGN)
        data["beats"] = data["beats"][:2]
        with pytest.raises(ValidationError):
            CampaignContent(**data)


# === validate_campaign_content ===


class TestValidateCampaignContent:
    def test_valid_data_returns_valid(self):
        result = validate_campaign_content(EXAMPLE_CAMPAIGN)
        assert result.valid is True
        assert result.errors == []

    def test_invalid_data_returns_errors(self):
        result = validate_campaign_content({"name": "X"})
        assert result.valid is False
        assert len(result.errors) > 0

    def test_no_available_beat_is_error(self):
        data = copy.deepcopy(EXAMPLE_CAMPAIGN)
        # Make all beats have prerequisites pointing to other beats
        data["beats"][0]["prerequisites"] = ["heart_of_the_rot"]
        data["beats"][2]["prerequisites"] = ["heart_of_the_rot"]
        # Also add unlocked_by to beats that have no prereqs
        for beat in data["beats"]:
            if not beat.get("prerequisites"):
                beat["unlocked_by"] = "episode:99"
        result = validate_campaign_content(data)
        assert result.valid is False
        assert any("available from start" in e.lower() for e in result.errors)


# === CampaignState ===


class TestCampaignState:
    def test_default_state(self):
        state = CampaignState()
        assert state.threat_stage == 0
        assert state.episodes_completed == 0
        assert state.beats_hit == []
        assert state.current_episode is None

    def test_initialize_from_content(self, sample_content):
        state = CampaignState()
        state.initialize_from_content(sample_content)
        assert "bramblewick" in state.npcs
        assert "captain_thornfeather" in state.npcs
        assert "old_mossback" in state.npcs
        assert state.npcs["bramblewick"].met is False


# === CampaignSystem ===


class TestCampaignSystem:
    def test_bloomburrow_system_valid(self):
        system = CampaignSystem(**BLOOMBURROW_SYSTEM)
        assert system.game_name == "Bloomburrow Adventures"

    def test_leveling_thresholds_must_be_ascending(self):
        data = copy.deepcopy(BLOOMBURROW_SYSTEM)
        data["leveling"]["thresholds"] = [10, 5, 20, 30]
        with pytest.raises(ValidationError, match="ascending"):
            CampaignSystem(**data)

    def test_stat_colors_auto_filled(self):
        data = copy.deepcopy(BLOOMBURROW_SYSTEM)
        data["stats"]["colors"] = []
        system = CampaignSystem(**data)
        assert len(system.stats.colors) == len(system.stats.names)

    def test_too_few_species_rejected(self):
        data = copy.deepcopy(BLOOMBURROW_SYSTEM)
        data["species"] = [data["species"][0]]
        with pytest.raises(ValidationError):
            CampaignSystem(**data)
