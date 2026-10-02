// Package fomod is the FOMOD XML installer model (core/03 §3–4, D030):
// parsing of ModuleConfig.xml, the pure evaluation of conditions, the state
// of the wizard for a selection and the file instructions it produces.
// State category: calculated. Nothing here reads the disk or executes
// anything: the caller hands in the XML bytes and the facts conditions need
// (Env), and gets data back. Scripted installers (script.cs) are never run
// (INV-LIB-04, anti-pattern 33).
//
// "Option" is the FOMOD "plugin" element; it is not a game Plugin (core/08).
package fomod

// Order is the sort order of steps, groups or options. The schema default
// is Ascending: steps, groups and options are shown sorted by name unless
// the author asks for Explicit (document) order.
type Order string

const (
	OrderAscending  Order = "Ascending"
	OrderDescending Order = "Descending"
	OrderExplicit   Order = "Explicit"
)

// GroupType is the selection rule of a group.
type GroupType string

const (
	SelectExactlyOne GroupType = "SelectExactlyOne"
	SelectAtMostOne  GroupType = "SelectAtMostOne"
	SelectAtLeastOne GroupType = "SelectAtLeastOne"
	SelectAll        GroupType = "SelectAll"
	SelectAny        GroupType = "SelectAny"
)

// OptionType is the type descriptor of an option.
type OptionType string

const (
	TypeRequired      OptionType = "Required"
	TypeOptional      OptionType = "Optional"
	TypeRecommended   OptionType = "Recommended"
	TypeNotUsable     OptionType = "NotUsable"
	TypeCouldBeUsable OptionType = "CouldBeUsable"
)

// FileState is the state a fileDependency asks for.
type FileState string

const (
	FileActive   FileState = "Active"
	FileInactive FileState = "Inactive"
	FileMissing  FileState = "Missing"
)

// Operator combines the terms of a condition.
type Operator string

const (
	OpAnd Operator = "And"
	OpOr  Operator = "Or"
)

// Module is a parsed ModuleConfig.xml. Steps, groups and options are
// already in display order (their order attributes applied), so indexes
// used by selections are display positions.
type Module struct {
	Name  string
	Image string // path relative to the FOMOD root, "" when none
	// Dependencies are the moduleDependencies: when false the installation
	// is refused (fomod_module_dependencies_failed).
	Dependencies *Condition
	Required     []FileInstall
	Steps        []Step
	Conditional  []ConditionalInstall
}

// Step is an installStep.
type Step struct {
	Name    string
	Visible *Condition // nil: always visible
	Groups  []Group
}

// Group is a group of options.
type Group struct {
	Name    string
	Type    GroupType
	Options []Option
}

// Option is a FOMOD "plugin": what the user picks.
type Option struct {
	Name        string
	Description string
	Image       string
	Files       []FileInstall
	Flags       []Flag
	Type        TypeDescriptor
}

// TypeDescriptor gives an option its type, possibly depending on
// conditions: the first matching pattern wins, otherwise Default.
type TypeDescriptor struct {
	Default  OptionType
	Patterns []TypePattern
}

// TypePattern is one dependencyType pattern.
type TypePattern struct {
	When Condition
	Type OptionType
}

// Flag is a condition flag an option sets when selected.
type Flag struct {
	Name  string
	Value string
}

// FileInstall is a file or folder element.
type FileInstall struct {
	Folder bool
	// Source is relative to the FOMOD root (the folder holding fomod/),
	// with "/" separators.
	Source string
	// Destination is relative to the mod root; HasDestination is false
	// when the attribute is absent (the destination is then the source).
	Destination    string
	HasDestination bool
	Priority       int
	// AlwaysInstall installs the file even when its option is not
	// selected; InstallIfUsable when the option is not NotUsable.
	AlwaysInstall   bool
	InstallIfUsable bool
}

// ConditionalInstall is a conditionalFileInstalls pattern, evaluated after
// the last step.
type ConditionalInstall struct {
	When  Condition
	Files []FileInstall
}

// Condition is a composite dependency: every term is combined with
// Operator. An empty condition is true.
type Condition struct {
	Operator Operator
	Files    []FileCondition
	Flags    []FlagCondition
	// Game and Manager are version requirements (gameDependency,
	// fommDependency); Extender is foseDependency, which the schema keeps
	// for script extenders.
	Game     []string
	Manager  []string
	Extender []string
	Nested   []Condition
}

// FileCondition is a fileDependency.
type FileCondition struct {
	File  string
	State FileState
}

// FlagCondition is a flagDependency.
type FlagCondition struct {
	Flag  string
	Value string
}
