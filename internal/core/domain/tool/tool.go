// Package tool is the registry of external tools of an instance (core/15
// "Ferramentas externas", capability `tools`, D146): programs the user
// starts from the app (editors, cleaners, generators), with the command
// line, folder, environment and behaviour of each one.
//
// A Tool is desired state the user owns. What a tool is called, where it
// usually lives and which arguments it needs for a game are facts of the
// adapter (Known); the core never names a tool (D112).
package tool

import (
	"errors"
	"fmt"
	"slices"
	"strings"

	"modorchestrator/internal/core/domain/game"
)

// ID identifies a tool of an instance; opaque (INV-ID-01).
type ID string

// ErrInvalid is wrapped by every validation failure.
var ErrInvalid = errors.New("tool: invalid")

// Reasons of a validation failure (parameters of tool_invalid).
const (
	ReasonName      = "name"
	ReasonExe       = "executable"
	ReasonExtension = "extension"
	ReasonEnvName   = "env_name"
	ReasonEnvRepeat = "env_repeated"
	ReasonVariable  = "variable"
	ReasonSyntax    = "syntax"
)

// MaxName bounds the name shown in the title bar menu.
const MaxName = 80

// Extension is the only kind of file a tool may start (D146): an
// executable, never a script.
const Extension = ".exe"

// EnvVar is one variable added to the environment of the tool. The value
// may hold variables ({game}...).
type EnvVar struct {
	Name  string
	Value string
}

// Tool is one external tool of an instance.
type Tool struct {
	ID       ID
	Instance game.InstanceID
	Name     string
	// Known is the id of the adapter's known tool it came from; "" for a
	// tool the user added from scratch. It only names the defaults.
	Known string
	// Exe is the path of the executable; it may start with a variable
	// ({game}\Data\...), so a tool inside the game folder follows it.
	Exe string
	// Args is the rest of the command line, as typed, with variables. It is
	// given to the program as written (quotes included).
	Args string
	// WorkDir is the folder the tool starts in; "" is the executable's.
	WorkDir string
	Env     []EnvVar
	// Icon is an image (.ico, .exe, .png) shown for the tool; "" is the
	// executable's own icon.
	Icon string
	// Exclusive keeps every other change of the instance refused while
	// the tool runs (instance_busy, D038).
	Exclusive bool
	// DeployBefore deploys a pending change before the tool starts, so it
	// sees what the profile wants.
	DeployBefore bool
	// Position is the order in the list and in the title bar menu.
	Position int
}

// Error is a validation failure with its reason and the field or variable
// at fault.
type Error struct {
	Reason string
	Detail string
}

func (e *Error) Error() string {
	if e.Detail != "" {
		return fmt.Sprintf("tool: invalid %s: %s", e.Reason, e.Detail)
	}
	return "tool: invalid " + e.Reason
}

func (e *Error) Unwrap() error { return ErrInvalid }

func invalid(reason, detail string) error { return &Error{Reason: reason, Detail: detail} }

// Normalize trims the fields the user types and drops empty environment
// rows.
func (t *Tool) Normalize() {
	t.Name = strings.TrimSpace(t.Name)
	t.Exe = strings.TrimSpace(strings.Trim(strings.TrimSpace(t.Exe), `"`))
	t.Args = strings.TrimSpace(t.Args)
	t.WorkDir = strings.TrimSpace(strings.Trim(strings.TrimSpace(t.WorkDir), `"`))
	t.Icon = strings.TrimSpace(strings.Trim(strings.TrimSpace(t.Icon), `"`))
	env := t.Env[:0:0]
	for _, v := range t.Env {
		v.Name = strings.TrimSpace(v.Name)
		if v.Name == "" && strings.TrimSpace(v.Value) == "" {
			continue
		}
		env = append(env, v)
	}
	t.Env = env
}

// Validate checks the tool against the variables an instance offers
// (names without braces, see Variables).
func (t Tool) Validate(vars map[string]string) error {
	if t.Name == "" || len([]rune(t.Name)) > MaxName {
		return invalid(ReasonName, "")
	}
	if t.Exe == "" {
		return invalid(ReasonExe, "")
	}
	if !strings.HasSuffix(strings.ToLower(t.Exe), Extension) {
		return invalid(ReasonExtension, t.Exe)
	}
	seen := map[string]bool{}
	for _, v := range t.Env {
		if v.Name == "" || strings.ContainsAny(v.Name, "= \t") {
			return invalid(ReasonEnvName, v.Name)
		}
		k := strings.ToLower(v.Name)
		if seen[k] {
			return invalid(ReasonEnvRepeat, v.Name)
		}
		seen[k] = true
	}
	texts := []string{t.Exe, t.Args, t.WorkDir, t.Icon}
	for _, v := range t.Env {
		texts = append(texts, v.Value)
	}
	for _, s := range texts {
		if _, err := Expand(s, vars); err != nil {
			return err
		}
	}
	return nil
}

// Sort orders tools by position, then name and id (stable for equal
// positions of old data).
func Sort(list []Tool) {
	slices.SortStableFunc(list, func(a, b Tool) int {
		if a.Position != b.Position {
			return a.Position - b.Position
		}
		if c := strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)); c != 0 {
			return c
		}
		return strings.Compare(string(a.ID), string(b.ID))
	})
}
