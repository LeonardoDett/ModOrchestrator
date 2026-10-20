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
	"strings"
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
	// TypeList is an ordered list of option ids separated by commas; each
	// id may carry a mode prefix ("-" hidden, "+" pinned). Used by the
	// dashboard layout (ui.dashboard.dashlets).
	TypeList Type = "list"
)

// Release says when a setting becomes available; later releases are
// reserved and never shown (anti-pattern 18).
type Release string

const (
	V1  Release = "v1"
	V1x Release = "v1.x"
	V2  Release = "v2"
)

// Tab is the Settings tab (Vortex order). The set is open: a module
// contributes its own tab (TabDef).
type Tab string

// Core tabs, in Vortex order. Download is reserved (D013) and has no
// setting, so it is never listed.
const (
	TabInterface   Tab = "interface"
	TabApplication Tab = "application"
	TabMods        Tab = "mods"
	TabDownload    Tab = "download"
	TabWorkarounds Tab = "workarounds"
	TabTheme       Tab = "theme"
)

// TabDef places a tab in Settings. After is the tab it follows (empty: the
// first); Section, when set, is the instance section (games.Sections) a
// game must offer for the tab to apply to it: the tab is shown only while
// a managed game offers it.
type TabDef struct {
	ID      Tab
	After   Tab
	Section string
}

// Contribution is what an optional module adds to the catalog: its tabs
// and its settings (D135). Keys must not collide with the core or with
// another module, and each setting goes into a known tab.
type Contribution struct {
	Tabs []TabDef
	Defs []Def
}

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
	// ReadOnly settings are shown, never stored (app.dataDir).
	ReadOnly bool
	// ByOperation means the value lives in the game instance and changes
	// only through an operation with preview (move staging, change method:
	// ui/telas/settings-extensions.md); it is never stored as a setting.
	ByOperation bool
}

// coreTabs are the core tabs in order.
var coreTabs = []TabDef{{ID: TabInterface}, {ID: TabApplication, After: TabInterface}, {ID: TabMods, After: TabApplication}, {ID: TabWorkarounds, After: TabMods}, {ID: TabTheme, After: TabWorkarounds}}

// coreDefs is the core settings catalog of core/13, in tab order.
var coreDefs = []Def{
	{Key: "ui.language", Scope: ScopeApp, Type: TypeEnum, Tab: TabInterface, Release: V1, DerivedDefault: true, Options: []string{"en", "pt-BR"}},
	{Key: "ui.customTitleBar", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "true", RestartRequired: true},
	{Key: "ui.desktopNotifications", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "false"},
	{Key: "ui.hideTopLevelCategory", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "false"},
	{Key: "ui.relativeTimes", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "true"},
	{Key: "ui.reduceMotion", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, DerivedDefault: true},
	{Key: "ui.compactHeaders", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "false"},
	{Key: "ui.advancedMode", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "false"},
	{Key: "ui.dashboard.dashlets", Scope: ScopeApp, Type: TypeList, Tab: TabInterface, Release: V1, Default: strings.Join(Dashlets, ","), Options: Dashlets},
	{Key: "automation.deployOnChange", Scope: ScopeInstance, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "true"},
	{Key: "automation.enableOnInstall", Scope: ScopeInstance, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "true"},
	{Key: "automation.deployDelayMs", Scope: ScopeApp, Type: TypeInt, Tab: TabInterface, Release: V1, Default: "1500", Min: 0, Max: 60000, Advanced: true},
	{Key: "diagnostics.showUnreviewedConflicts", Scope: ScopeInstance, Type: TypeBool, Tab: TabInterface, Release: V1, Default: "true"},
	// View of the Mods list (D123): list, nested by category, or category tabs.
	{Key: "mods.view", Scope: ScopeInstance, Type: TypeEnum, Tab: TabInterface, Release: V1, Default: "list", Options: []string{"list", "nested", "tabs"}},
	// Columns of the Mods list the user hid (Mais ações › Colunas da lista).
	{Key: "mods.hiddenColumns", Scope: ScopeInstance, Type: TypeList, Tab: TabInterface, Release: V1, Default: "", Options: []string{"category", "conflicts", "updated", "size"}},
	{Key: "app.runAtStartup", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1x, Default: "false"},
	{Key: "app.startMinimized", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V1x, Default: "false"},
	{Key: "automation.installOnDownload", Scope: ScopeApp, Type: TypeBool, Tab: TabInterface, Release: V2, Default: "false"},

	{Key: "app.dataDir", Scope: ScopeApp, Type: TypePath, Tab: TabApplication, Release: V1, DerivedDefault: true, ReadOnly: true},
	{Key: "app.logLevel", Scope: ScopeApp, Type: TypeEnum, Tab: TabApplication, Release: V1, Default: "info", Options: []string{"error", "warn", "info", "debug"}},
	{Key: "app.gpuAcceleration", Scope: ScopeApp, Type: TypeBool, Tab: TabApplication, Release: V1, Default: "true", RestartRequired: true},
	{Key: "app.updateCheck", Scope: ScopeApp, Type: TypeBool, Tab: TabApplication, Release: V1, Default: "false"},
	{Key: "app.updateChannel", Scope: ScopeApp, Type: TypeEnum, Tab: TabApplication, Release: V1, Default: "stable", Options: []string{"stable", "beta"}},
	{Key: "app.anonymizeSupportBundle", Scope: ScopeApp, Type: TypeBool, Tab: TabApplication, Release: V1, Default: "true"},
	{Key: "history.retentionDays", Scope: ScopeApp, Type: TypeInt, Tab: TabApplication, Release: V1, Default: "180", Min: 7, Max: 3650},
	{Key: "snapshots.autoRetention", Scope: ScopeApp, Type: TypeInt, Tab: TabApplication, Release: V1, Default: "20", Min: 1, Max: 500},
	{Key: "snapshots.bulkThreshold", Scope: ScopeApp, Type: TypeInt, Tab: TabApplication, Release: V1, Default: "10", Min: 1, Max: 10000},

	{Key: "mods.stagingPath", Scope: ScopeInstance, Type: TypePath, Tab: TabMods, Release: V1, DerivedDefault: true, ByOperation: true},
	{Key: "mods.useSuggestedStaging", Scope: ScopeApp, Type: TypeBool, Tab: TabMods, Release: V1, Default: "true"},
	{Key: "mods.archiveStorePath", Scope: ScopeInstance, Type: TypePath, Tab: TabMods, Release: V1, DerivedDefault: true, ByOperation: true},
	{Key: "mods.importRetention", Scope: ScopeApp, Type: TypeEnum, Tab: TabMods, Release: V1, Default: "copy", Options: []string{"copy", "move", "none"}},
	{Key: "deploy.method", Scope: ScopeInstance, Type: TypeEnum, Tab: TabMods, Release: V1, DerivedDefault: true, Options: []string{"hardlink", "symlink", "copy"}, ByOperation: true},
	{Key: "deploy.cleanEmptyDirs", Scope: ScopeInstance, Type: TypeBool, Tab: TabMods, Release: V1, Default: "true"},
	{Key: "deploy.autoRestoreMissing", Scope: ScopeInstance, Type: TypeBool, Tab: TabMods, Release: V1, Default: "false"},
	{Key: "deploy.verifyOnFocus", Scope: ScopeApp, Type: TypeBool, Tab: TabMods, Release: V1, Default: "true"},
	{Key: "library.verifyStagingOnStartup", Scope: ScopeApp, Type: TypeBool, Tab: TabMods, Release: V1, Default: "false"},
	{Key: "import.maxExtractedSizeGB", Scope: ScopeApp, Type: TypeInt, Tab: TabMods, Release: V1, Default: "64", Min: 1, Max: 4096, Advanced: true},
	{Key: "import.maxEntries", Scope: ScopeApp, Type: TypeInt, Tab: TabMods, Release: V1, Default: "500000", Min: 1000, Max: 10000000, Advanced: true},
	{Key: "order.snapshotMoveThreshold", Scope: ScopeApp, Type: TypeInt, Tab: TabMods, Release: V1, Default: "20", Min: 1, Max: 10000},

	{Key: "theme.mode", Scope: ScopeApp, Type: TypeEnum, Tab: TabTheme, Release: V1, Default: "dark", Options: []string{"dark", "light", "system"}},
	{Key: "theme.id", Scope: ScopeApp, Type: TypeEnum, Tab: TabTheme, Release: V1, Default: "orchestrator", Options: []string{"orchestrator", "forest", "graphite"}},
	{Key: "theme.fontScale", Scope: ScopeApp, Type: TypeInt, Tab: TabTheme, Release: V1, Default: "100", Min: 90, Max: 125},
	{Key: "theme.density", Scope: ScopeApp, Type: TypeEnum, Tab: TabTheme, Release: V1, Default: "comfortable", Options: []string{"comfortable", "compact"}},
}

// Catalog is the settings catalog in force: the core one plus what the
// modules contributed, in tab order.
type Catalog struct {
	defs []Def
	tabs []TabDef
}

// Core returns the catalog with the core settings only.
func Core() *Catalog {
	c, err := NewCatalog()
	if err != nil {
		panic(err) // the core catalog is checked by tests
	}
	return c
}

// NewCatalog builds the catalog from the core and the contributions. It
// refuses a repeated tab or key, a tab placed after an unknown one, a
// setting in an unknown tab and a literal default that does not validate.
func NewCatalog(contribs ...Contribution) (*Catalog, error) {
	c := &Catalog{tabs: slices.Clone(coreTabs)}
	defs := slices.Clone(coreDefs)
	for _, k := range contribs {
		for _, t := range k.Tabs {
			if t.ID == "" || c.hasTab(t.ID) || t.ID == TabDownload {
				return nil, fmt.Errorf("%w: tab %q repeated or empty", ErrInvalid, t.ID)
			}
			i := slices.IndexFunc(c.tabs, func(x TabDef) bool { return x.ID == t.After })
			if i < 0 {
				return nil, fmt.Errorf("%w: tab %q placed after unknown tab %q", ErrInvalid, t.ID, t.After)
			}
			c.tabs = slices.Insert(c.tabs, i+1, t)
		}
		defs = append(defs, k.Defs...)
	}
	seen := map[string]bool{}
	for _, d := range defs {
		switch {
		case d.Key == "" || seen[d.Key]:
			return nil, fmt.Errorf("%w: setting %q repeated or empty", ErrInvalid, d.Key)
		case !c.hasTab(d.Tab):
			return nil, fmt.Errorf("%w: setting %q in unknown tab %q", ErrInvalid, d.Key, d.Tab)
		case d.DerivedDefault && d.Default != "":
			return nil, fmt.Errorf("%w: setting %q has a derived and a literal default", ErrInvalid, d.Key)
		case !d.DerivedDefault:
			if err := d.Validate(d.Default); err != nil {
				return nil, fmt.Errorf("default of %s: %w", d.Key, err)
			}
		}
		seen[d.Key] = true
	}
	// Settings follow the tab order; inside a tab, declaration order.
	for _, t := range c.tabs {
		for _, d := range defs {
			if d.Tab == t.ID {
				c.defs = append(c.defs, d)
			}
		}
	}
	return c, nil
}

func (c *Catalog) hasTab(id Tab) bool {
	return slices.ContainsFunc(c.tabs, func(t TabDef) bool { return t.ID == id })
}

// Lookup returns the definition of key.
func (c *Catalog) Lookup(key string) (Def, bool) {
	i := slices.IndexFunc(c.defs, func(d Def) bool { return d.Key == key })
	if i < 0 {
		return Def{}, false
	}
	return c.defs[i], true
}

// Available returns the settings shown in a release (reserved ones are
// hidden).
func (c *Catalog) Available(r Release) []Def {
	return slices.DeleteFunc(slices.Clone(c.defs), func(d Def) bool { return releaseRank[d.Release] > releaseRank[r] })
}

// Tabs returns the tabs with at least one setting available in r, in
// order. A tab without settings of its own (Workarounds) is listed too:
// its content is actions, not settings.
func (c *Catalog) Tabs(r Release) []TabDef {
	out := []TabDef{}
	for _, t := range c.tabs {
		if !slices.ContainsFunc(c.defs, func(d Def) bool { return d.Tab == t.ID }) || slices.ContainsFunc(c.Available(r), func(d Def) bool { return d.Tab == t.ID }) {
			out = append(out, t)
		}
	}
	return out
}

var releaseRank = map[Release]int{V1: 0, V1x: 1, V2: 2}

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
	case TypeList:
		if _, err := ParseList(value, d.Options); err != nil {
			return fmt.Errorf("%w: %s: %v", ErrInvalid, d.Key, err)
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
func (c *Catalog) NewValue(scope Scope, scopeID, key, value string) (Value, error) {
	d, ok := c.Lookup(key)
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
