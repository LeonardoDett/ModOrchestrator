package game

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Marker file names (core/04 §10–11, D035). They are evidence of ownership:
// the database stays primary (docs-ia/03 rule 3).
const (
	StagingMarker    = ".modorchestrator-staging"
	ArchivesMarker   = ".modorchestrator-archives"
	BackupsMarker    = ".modorchestrator-backups"
	DeploymentMarker = ".modorchestrator-deployment.json"
)

// ForeignKind says who else deployed to a game folder.
type ForeignKind string

const (
	// ForeignVortex: Vortex deployment manifest or backup files.
	ForeignVortex ForeignKind = "vortex"
	// ForeignMO2: a portable Mod Organizer 2 instance pointing at the game.
	ForeignMO2 ForeignKind = "mo2"
	// ForeignInstance: a deployment marker of another instance of this app.
	ForeignInstance ForeignKind = "other_instance"
)

// Entry is one name found in a folder listing.
type Entry struct {
	Name  string
	IsDir bool
}

// ClassifyTargetEntry says whether a name at the top of a target is the mark
// of another manager (INV-DEP-08). Our own marker is handled by the caller,
// because it depends on the instance id inside the file.
func ClassifyTargetEntry(e Entry) (ForeignKind, bool) {
	name := strings.ToLower(e.Name)
	switch {
	case e.IsDir:
		return "", false
	case strings.HasPrefix(name, "vortex.deployment") && strings.HasSuffix(name, ".json"):
		return ForeignVortex, true
	case strings.HasSuffix(name, ".vortex_backup"):
		return ForeignVortex, true
	}
	return "", false
}

// ClassifyRoot looks at the top of the game folder for a portable MO2
// instance: its ini file, or its mods + profiles + overwrite layout.
func ClassifyRoot(entries []Entry) (ForeignKind, bool) {
	var ini, mods, profiles, overwrite bool
	for _, e := range entries {
		switch strings.ToLower(e.Name) {
		case "modorganizer.ini":
			ini = !e.IsDir
		case "mods":
			mods = e.IsDir
		case "profiles":
			profiles = e.IsDir
		case "overwrite":
			overwrite = e.IsDir
		}
	}
	if ini || (mods && profiles && overwrite) {
		return ForeignMO2, true
	}
	return "", false
}

// IsDeploymentMarker reports whether name is our deployment marker.
func IsDeploymentMarker(name string) bool { return strings.EqualFold(name, DeploymentMarker) }

// folderMarker is the content of every marker file (staging, archives,
// backups, deployment). Other fields may be added by the deploy engine; only
// the owner matters here.
type folderMarker struct {
	InstanceID string `json:"instanceId"`
	Kind       string `json:"kind,omitempty"`
}

// NewFolderMarker builds the marker of a folder owned by an instance.
func NewFolderMarker(kind string, instance InstanceID) []byte {
	b, _ := json.Marshal(folderMarker{InstanceID: string(instance), Kind: kind})
	return b
}

// ParseMarker returns the instance that owns a marker. A marker that is not
// valid JSON or names nobody is reported as an error: it must be treated as
// foreign, never as ours.
func ParseMarker(data []byte) (InstanceID, error) {
	var m folderMarker
	if err := json.Unmarshal(data, &m); err != nil {
		return "", fmt.Errorf("%w: marker is not valid: %v", ErrInvalid, err)
	}
	if m.InstanceID == "" {
		return "", fmt.Errorf("%w: marker names no instance", ErrInvalid)
	}
	return InstanceID(m.InstanceID), nil
}
