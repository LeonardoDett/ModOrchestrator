// Package settings holds the settings catalog (core/13) and validates
// values. State category: desired. Every setting has a stable key, a scope,
// a type, a default, a release and a Settings tab (Vortex layout, D042).
// Adding a setting means adding a line to core/13 and here.
package settings

import (
	"errors"
	"fmt"
	"slices"
	"strconv"
)

// ErrInvalid is returned for unknown keys or invalid values.
var ErrInvalid = errors.New("settings: invalid")

// Scope says where a value lives.
type Scope string

const (
	ScopeApp      Scope = "app"
	ScopeInstance Scope = "instance"
	ScopeProfile  Scope = "profile"
)

// Type is the value type.
type Type string

const (
	TypeBool Type = "bool"
	TypeInt  Type = "int"
	TypeEnum Type = "enum"
	TypePath Type = "path"
)

// Release says when a setting becomes available; later releases are
// reserved and never shown (anti-pattern 18).
type Release string

const (
	V1  Release = "v1"
	V1x Release = "v1.x"
	V2  Release = "v2"
)

// Tab is the Settings tab (Vortex order).
type Tab string

const (
	TabInterface   Tab = "interface"
	TabApplication Tab = "application"
	TabMods        Tab = "mods"
	TabPlugins     Tab = "plugins"
	TabDownload    Tab = "download"
	TabWorkarounds Tab = "workarounds"
	TabTheme       Tab = "theme"
)

// Def describes one setting.
type Def struct {
	Key     string
	Scope   Scope
	Type    Type
	Tab     Tab
	Release Release
	// Default is the literal default; DerivedDefault means it is computed
	// at runtime (OS language, suggested path...) and Default is empty.
	Default        string
	DerivedDefault bool
	Options        []string
	Min, Max       int
	Advanced       bool
	// RestartRequired shows the "Reiniciar agora" notice.
	RestartRequired bool
}

// Catalog is the V1 settings catalog of core/13, in tab order.
var Catalog = []Def{
	{Key: "ui.language", Scope: ScopeApp, Type: TypeEnum, Tab: TabInterface, Release: V1, DerivedDefault: true, Options: []string{"en", "pt-BR"}},
	{Key: "ui.customTitleBar", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "true", RestartRequired: true},
	{Key: "ui.desktopNotifications", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "false"},
	{Key: "ui.hideTopLevelCategory", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "false"},
	{Key: "ui.relativeTimes", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "true"},
	{Key: "ui.reduceMotion", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, DerivedDefault: true},
	{Key: "ui.compactHeaders", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "false"},
	{Key: "ui.advancedMode", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "false"},
	{Key: "automation.deployOnChange", Scope: ScopeInstance, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "true"},
	{Key: "automation.enableOnInstall", Scope: ScopeInstance, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "true"},
	{Key: "automation.deployDelayMs", Scope: ScopeApp, Type: TypeInt, Tab: TabInterface, Release: V1, Default: "1500", Min: 0, Max: 60000, Advanced: true},
	{Key: "diagnostics.showUnreviewedConflicts", Scope: ScopeInstance, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "true"},
	{Key: "app.runAtStartup", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1x, Default: "false"},
	{Key: "app.startMinimized", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1x, Default: "false"},
	{Key: "automation.installOnDownload", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V2, Default: "false"},

	{Key: "app.logLevel", Scope: ScopeApp, Type: TypeEnum, Tab: TabApplication, Release: V1, Default: "info", Options: []string{"error", "warn", "info", "debug"}},
	{Key: "app.gpuAcceleration", Scope: ScopeApp, Type: TypeBool, Tab: TabApplication, Release: V1, Default: "true", RestartRequired: true},
	{Key: "app.updateCheck", Scope: ScopeApp, Type: TypeBool, Tab: TabApplication, Release: V1, Default: "false"},
	{Key: "app.updateChannel", Scope: ScopeApp, Type: TypeEnum, Tab: TabApplication, Release: V1, Default: "stable", Options: []string{"stable", "beta"}},
	{Key: "app.anonymizeSupportBundle", Scope: ScopeApp, Type: TypeBool, Tab: TabApplication, Release: V1, Default: "true"},
	{Key: "history.retentionDays", Scope: ScopeApp, Type: TypeInt, Tab: TabApplication, Release: V1, Default: "180", Min: 7, Max: 3650},
	{Key: "snapshots.autoRetention", Scope: ScopeApp, Type: TypeInt, Tab: TabApplication, Release: V1, Default: "20", Min: 1, Max: 500},
	{Key: "snapshots.bulkThreshold", Scope: ScopeApp, Type: TypeInt, Tab: TabApplication, Release: V1, Default: "10", Min: 1, Max: 10000},

	{Key: "mods.stagingPath", Scope: ScopeInstance, Type: TypePath, Tab: TabMods, Release: V1, DerivedDefault: true},
	{Key: "mods.useSuggestedStaging", Scope: ScopeApp, Type: TypeBool, Tab: TabMods, Release: V1, Default: "true"},
	{Key: "mods.archiveStorePath", Scope: ScopeInstance, Type: TypePath, Tab: TabMods, Release: V1, DerivedDefault: true},
	{Key: "mods.importRetention", Scope: ScopeApp, Type: TypeEnum, Tab: TabMods, Release: V1, Default: "copy", Options: []string{"copy", "move", "none"}},
	{Key: "deploy.method", Scope: ScopeInstance, Type: TypeEnum, Tab: TabMods, Release: V1, DerivedDefault: true, Options: []string{"hardlink", "symlink", "copy"}},
	{Key: "deploy.cleanEmptyDirs", Scope: ScopeInstance, Type: TypeBool, Tab: TabMods, Release: V1, Default: "true"},
	{Key: "deploy.autoRestoreMissing", Scope: ScopeInstance, Type: TypeBool, Tab: TabMods, Release: V1, Default: "false"},
	{Key: "deploy.verifyOnFocus", Scope: ScopeApp, Type: TypeBool, Tab: TabMods, Release: V1, Default: "true"},
	{Key: "library.verifyStagingOnStartup", Scope: ScopeApp, Type: TypeBool, Tab: TabMods, Release: V1, Default: "false"},
	{Key: "import.maxExtractedSizeGB", Scope: ScopeApp, Type: TypeInt, Tab: TabMods, Release: V1, Default: "64", Min: 1, Max: 4096, Advanced: true},
	{Key: "import.maxEntries", Scope: ScopeApp, Type: TypeInt, Tab: TabMods, Release: V1, Default: "500000", Min: 1000, Max: 10000000, Advanced: true},
	{Key: "order.snapshotMoveThreshold", Scope: ScopeApp, Type: TypeInt, Tab: TabMods, Release: V1, Default: "20", Min: 1, Max: 10000},

	{Key: "plugins.autoSort", Scope: ScopeInstance, Type: TypeBool, Tab: TabPlugins, Release: V1, Default: "true"},
	{Key: "plugins.enableOnModEnable", Scope: ScopeInstance, Type: TypeBool, Tab: TabPlugins, Release: V1, Default: "true"},
	{Key: "plugins.enableExternallyAdded", Scope: ScopeInstance, Type: TypeBool, Tab: TabPlugins, Release: V1, Default: "false"},
	{Key: "plugins.lootProvider", Scope: ScopeInstance, Type: TypeBool, Tab: TabPlugins, Release: V1x, Default: "false"},

	{Key: "theme.mode", Scope: ScopeApp, Type: TypeEnum, Tab: TabTheme, Release: V1, Default: "dark", Options: []string{"dark", "light", "system"}},
	{Key: "theme.id", Scope: ScopeApp, Type: TypeEnum, Tab: TabTheme, Release: V1, Default: "orchestrator", Options: []string{"orchestrator", "forest", "graphite"}},
	{Key: "theme.fontScale", Scope: ScopeApp, Type: TypeInt, Tab: TabTheme, Release: V1, Default: "100", Min: 90, Max: 125},
	{Key: "theme.density", Scope: ScopeApp, Type: TypeEnum, Tab: TabTheme, Release: V1, Default: "comfortable", Options: []string{"comfortable", "compact"}},
}

// Lookup returns the definition of key.
func Lookup(key string) (Def, bool) {
	i := slices.IndexFunc(Catalog, func(d Def) bool { return d.Key == key })
	if i < 0 {
		return Def{}, false
	}
	return Catalog[i], true
}

// Available returns the settings shown in a release (reserved ones are
// hidden).
func Available(r Release) []Def {
	rank := map[Release]int{V1: 0, V1x: 1, V2: 2}
	return slices.DeleteFunc(slices.Clone(Catalog), func(d Def) bool { return rank[d.Release] > rank[r] })
}

// Validate checks a raw value against the definition.
func (d Def) Validate(value string) error {
	switch d.Type {
	case TypeBool:
		if _, err := strconv.ParseBool(value); err != nil {
			return fmt.Errorf("%w: %s expects true/false", ErrInvalid, d.Key)
		}
	case TypeInt:
		n, err := strconv.Atoi(value)
		if err != nil || n < d.Min || n > d.Max {
			return fmt.Errorf("%w: %s expects an integer in [%d, %d]", ErrInvalid, d.Key, d.Min, d.Max)
		}
	case TypeEnum:
		if !slices.Contains(d.Options, value) {
			return fmt.Errorf("%w: %s expects one of %v", ErrInvalid, d.Key, d.Options)
		}
	case TypePath:
		if value == "" {
			return fmt.Errorf("%w: %s expects a path", ErrInvalid, d.Key)
		}
	default:
		return fmt.Errorf("%w: %s has unknown type %q", ErrInvalid, d.Key, d.Type)
	}
	return nil
}

// Value is a persisted setting value.
type Value struct {
	Scope   Scope
	ScopeID string // instance or profile id; empty for app scope
	Key     string
	Value   string
}

// NewValue validates key, scope and value.
func NewValue(scope Scope, scopeID, key, value string) (Value, error) {
	d, ok := Lookup(key)
	if !ok {
		return Value{}, fmt.Errorf("%w: unknown setting %q", ErrInvalid, key)
	}
	if d.Scope != scope || (scope == ScopeApp) != (scopeID == "") {
		return Value{}, fmt.Errorf("%w: %s is a %s setting", ErrInvalid, key, d.Scope)
	}
	if err := d.Validate(value); err != nil {
		return Value{}, err
	}
	return Value{Scope: scope, ScopeID: scopeID, Key: key, Value: value}, nil
}
