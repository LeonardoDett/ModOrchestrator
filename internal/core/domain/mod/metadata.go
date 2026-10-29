package mod

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/relpath"
)

// MetadataFormat is the version of the metadata file. It only goes up when
// a field changes meaning; a new field keeps the version (D145).
const MetadataFormat = 1

// Metadata is the content of game.ModMetadataFile in the staging folder of a
// mod: what defines it outside the profile. Order, enabled state, rules and
// overrides are not here (they belong to profiles and the instance).
type Metadata struct {
	Format     int                `json:"formatVersion"`
	Mod        ID                 `json:"modId"`
	Instance   game.InstanceID    `json:"instanceId"`
	Name       string             `json:"name"`
	Attributes MetadataAttributes `json:"attributes"`
	Category   *MetadataCategory  `json:"category,omitempty"`
	Type       game.ModTypeID     `json:"modType,omitempty"`
	Source     MetadataSource     `json:"source"`
	Archive    *MetadataArchive   `json:"archive,omitempty"`
	Variant    *MetadataVariant   `json:"variant,omitempty"`
	Package    Package            `json:"package"`
	Content    []ContentFlag      `json:"content,omitempty"`
	Created    time.Time          `json:"createdAt"`
	Installed  time.Time          `json:"installedAt,omitzero"`
	Updated    time.Time          `json:"updatedAt"`
}

// MetadataAttributes mirrors Attributes.
type MetadataAttributes struct {
	Name        string   `json:"name,omitempty"`
	Version     string   `json:"version,omitempty"`
	Author      string   `json:"author,omitempty"`
	Description string   `json:"description,omitempty"`
	Notes       string   `json:"notes,omitempty"`
	Color       string   `json:"highlightColor,omitempty"`
	Icon        string   `json:"highlightIcon,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

// MetadataCategory is the category of the mod: its id in the old instance
// and the names from the root to it, to find or create it again.
type MetadataCategory struct {
	ID   CategoryID `json:"id"`
	Name string     `json:"name"`
	Path []string   `json:"path,omitempty"`
}

// MetadataSource is the origin of the mod. Provider ids (Nexus) and the URL
// join this object when the model has them.
type MetadataSource struct {
	Kind SourceKind `json:"kind"`
	Ref  string     `json:"ref,omitempty"`
}

// MetadataArchive describes the source archive, enough to register it again
// when the file is still in the ArchiveStore.
type MetadataArchive struct {
	ID           ArchiveID   `json:"id"`
	OriginalName string      `json:"originalName"`
	Kind         ArchiveKind `json:"kind"`
	Size         int64       `json:"size"`
	Hash         string      `json:"hash"`
	Stored       string      `json:"stored,omitempty"`
	ImportedAt   time.Time   `json:"importedAt,omitzero"`
}

// MetadataVariant links a variant to its original mod.
type MetadataVariant struct {
	Of    ID     `json:"of"`
	Label string `json:"label"`
}

// NewMetadata describes m. cat (with its path of names) and a are optional.
func NewMetadata(m *Mod, cat *Category, catPath []string, a *Archive) Metadata {
	md := Metadata{
		Format: MetadataFormat, Mod: m.ID, Instance: m.Instance, Name: m.Name,
		Attributes: MetadataAttributes{
			Name: m.Attributes.Name, Version: m.Attributes.Version, Author: m.Attributes.Author,
			Description: m.Attributes.Description, Notes: m.Attributes.Notes,
			Color: m.Attributes.Highlight.Color, Icon: m.Attributes.Highlight.Icon,
			Tags: slices.Clone(m.Attributes.Tags),
		},
		Type:      m.Type,
		Source:    MetadataSource{Kind: m.Source.Kind, Ref: m.Source.Ref},
		Package:   m.Package,
		Content:   slices.Clone(m.Content),
		Created:   m.CreatedAt,
		Installed: m.InstalledAt,
		Updated:   m.UpdatedAt,
	}
	if cat != nil {
		md.Category = &MetadataCategory{ID: cat.ID, Name: cat.Name, Path: slices.Clone(catPath)}
	}
	if a != nil {
		md.Archive = &MetadataArchive{
			ID: a.ID, OriginalName: a.OriginalName, Kind: a.Kind, Size: a.Size, Hash: a.Hash,
			Stored: a.Stored.String(), ImportedAt: a.ImportedAt,
		}
	}
	if m.VariantOf != "" {
		md.Variant = &MetadataVariant{Of: m.VariantOf, Label: m.VariantLabel}
	}
	return md
}

// Encode returns the file content (indented JSON, readable by hand).
func (md Metadata) Encode() ([]byte, error) {
	b, err := json.MarshalIndent(md, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(b, '\n'), nil
}

// ParseMetadata reads a metadata file found in the folder named folder. A
// file that is not valid JSON, has an unknown format or names another mod is
// an error: the caller falls back to the folder name.
func ParseMetadata(data []byte, folder string) (Metadata, error) {
	var md Metadata
	if err := json.Unmarshal(data, &md); err != nil {
		return Metadata{}, fmt.Errorf("%w: metadata is not valid: %v", ErrInvalid, err)
	}
	switch {
	case md.Format < 1 || md.Format > MetadataFormat:
		return Metadata{}, fmt.Errorf("%w: metadata format %d is not known", ErrInvalid, md.Format)
	case md.Mod == "" || !strings.EqualFold(string(md.Mod), folder):
		return Metadata{}, fmt.Errorf("%w: metadata names mod %q, not the folder %q", ErrInvalid, md.Mod, folder)
	}
	return md, nil
}

// Attrs returns the attributes recorded in the file.
func (md Metadata) Attrs() Attributes {
	a := md.Attributes
	return Attributes{
		Name: a.Name, Version: a.Version, Author: a.Author, Description: a.Description, Notes: a.Notes,
		Highlight: Highlight{Color: a.Color, Icon: a.Icon}, Tags: slices.Clone(a.Tags),
	}
}

// ArchiveFor rebuilds the archive record for instance, or false when the
// file describes none or an invalid one.
func (md Metadata) ArchiveFor(instance game.InstanceID) (*Archive, bool) {
	if md.Archive == nil {
		return nil, false
	}
	x := md.Archive
	var stored relpath.Path
	if x.Stored != "" {
		p, err := relpath.Parse(x.Stored)
		if err != nil {
			return nil, false
		}
		stored = p
	}
	a, err := NewArchive(x.ID, instance, x.OriginalName, x.Kind, x.Size, x.Hash, stored, x.ImportedAt)
	return a, err == nil
}
