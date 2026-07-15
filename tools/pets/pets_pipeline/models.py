"""Typed validation results shared by the Pet asset pipeline."""

from dataclasses import asdict, dataclass
from typing import Any

from .ora import OraStructure
from .psd import PsdStructure


@dataclass(frozen=True)
class AlphaStats:
    minimum: int
    maximum: int
    transparent: int
    opaque: int
    partial: int


@dataclass(frozen=True)
class PngInfo:
    width: int
    height: int
    mode: str
    nontransparent_pixels: int
    alpha: AlphaStats


@dataclass(frozen=True)
class ManifestValidation:
    character_id: str
    canvas: tuple[int, int]
    layer_count: int
    unique_layer_ids: bool
    unique_layer_paths: bool
    missing_layer_files: tuple[str, ...]
    empty_layer_ids: tuple[str, ...]
    invalid_pivot_ids: tuple[str, ...]
    invalid_pivot_references: tuple[str, ...]
    branding_all_non_mirrorable: bool
    default_expression: str
    happy_expression_is_source_extracted: bool
    guide_and_reference_groups_hidden: bool
    anatomy_underlap_ids: tuple[str, ...]


@dataclass(frozen=True)
class SourceValidationReport:
    character_id: str
    canvas: tuple[int, int]
    psd: PsdStructure
    ora: OraStructure
    manifest_layer_count: int
    unique_layer_ids: bool
    unique_layer_paths: bool
    missing_layer_files: tuple[str, ...]
    empty_layer_ids: tuple[str, ...]
    invalid_pivot_ids: tuple[str, ...]
    invalid_pivot_references: tuple[str, ...]
    branding_all_non_mirrorable: bool
    default_recomposition_exact: bool
    default_expression: str
    happy_expression_is_source_extracted: bool
    guide_and_reference_groups_hidden: bool
    anatomy_underlap_ids: tuple[str, ...]
    preview_alpha: AlphaStats

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
