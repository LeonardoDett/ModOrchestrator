package game

import (
	"fmt"
	"strings"
)

// Support is how a game is served (D113): by an adapter of its own, by a
// declared entry, or by an entry the user wrote.
type Support string

const (
	// SupportFull: a dedicated adapter, for behaviour that needs code.
	SupportFull Support = "full"
	// SupportDeclared: described by data only.
	SupportDeclared Support = "declared"
	// SupportCustom: described by the user.
	SupportCustom Support = "custom"
)

// Stores a game can be found in. StoreRegistry installations come from a
// RegistryHint and carry its ID as the app id.
const (
	StoreSteam    = "steam"
	StoreGOG      = "gog"
	StoreEpic     = "epic"
	StoreRegistry = "registry"
)

// StoreRef identifies the game in one store (Steam app id, GOG game id,
// Epic app name).
type StoreRef struct {
	Store string
	AppID string
}

// RegistryHint is a registry value holding the install path of a game
// (core/11 §3). ID names the hint in the installations found through it.
type RegistryHint struct {
	ID    string
	Key   string // "HKLM\SOFTWARE\..." (64-bit view of the machine hive)
	Value string
}

// Discovery is how an installation of a game is found and recognised. It is
// data: the core matches store installations against it, so an adapter
// writes no detection code (D113).
type Discovery struct {
	Stores   []StoreRef
	Registry []RegistryHint
	// Markers are the files, relative to the root, whose presence in a
	// folder identify the game (full search).
	Markers []string
	// VersionFile is the executable, relative to the root, whose version
	// resource is the game version; "" when the game has none.
	VersionFile string
}

// Matches reports whether an installation found in a store is this game.
func (d Discovery) Matches(store, appID string) bool {
	if appID == "" {
		return false
	}
	if store == StoreRegistry {
		for _, h := range d.Registry {
			if h.ID == appID {
				return true
			}
		}
		return false
	}
	for _, s := range d.Stores {
		if s.Store == store && s.AppID == appID {
			return true
		}
	}
	return false
}

func (d Discovery) validate() error {
	for _, s := range d.Stores {
		if s.Store == "" || s.AppID == "" || s.Store == StoreRegistry {
			return fmt.Errorf("%w: store reference needs a store and an app id", ErrInvalid)
		}
	}
	seen := map[string]struct{}{}
	for _, h := range d.Registry {
		if h.ID == "" || h.Key == "" {
			return fmt.Errorf("%w: registry hint needs an id and a key", ErrInvalid)
		}
		if _, dup := seen[h.ID]; dup {
			return fmt.Errorf("%w: registry hint %q declared twice", ErrInvalid, h.ID)
		}
		seen[h.ID] = struct{}{}
	}
	for _, f := range append(append([]string(nil), d.Markers...), d.VersionFile) {
		if strings.HasPrefix(f, "/") || strings.HasPrefix(f, `\`) || strings.Contains(f, ":") || strings.Contains(f, "..") {
			return fmt.Errorf("%w: %q must be relative to the game folder", ErrInvalid, f)
		}
	}
	for _, m := range d.Markers {
		if m == "" {
			return fmt.Errorf("%w: empty marker", ErrInvalid)
		}
	}
	return nil
}

// FeatureClass says whether the user may turn a capability off.
type FeatureClass string

const (
	// ClassBase: part of managing the game or a protection; always on.
	ClassBase FeatureClass = "base"
	// ClassOptional: the user turns it on or off per instance.
	ClassOptional FeatureClass = "optional"
)

// FeatureSpec describes a capability as a feature of a game (D113).
type FeatureSpec struct {
	ID    Capability
	Class FeatureClass
	// Requires lists the features that must be in effect for this one.
	Requires []Capability
}

// Describe returns the feature description of a capability. A capability
// the core does not know (declared by an extension) is optional.
func Describe(c Capability) FeatureSpec {
	switch c {
	case CapPlugins, CapLaunch, CapSaveGames, CapGameSettings, CapTools:
		return FeatureSpec{ID: c, Class: ClassOptional}
	case CapLoadOrder:
		return FeatureSpec{ID: c, Class: ClassOptional, Requires: []Capability{CapPlugins}}
	case CapFilesystemTarget, CapModTypes, CapInstaller, CapExternalChanges,
		CapAdapterInstallers, CapHealthChecks, CapDefaultCategories, CapRunningDetection:
		return FeatureSpec{ID: c, Class: ClassBase}
	}
	return FeatureSpec{ID: c, Class: ClassOptional}
}
