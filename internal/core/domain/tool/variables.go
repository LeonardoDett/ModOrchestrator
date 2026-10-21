package tool

import (
	"strings"

	"modorchestrator/internal/core/domain/game"
)

// Variables a tool's command line, folders and environment may use (D146).
// They are the same for every game; a target of the instance is reached as
// {target:<id>} (the Data folder of a game is the target that holds it).
const (
	VarGame     = "game"
	VarStaging  = "staging"
	VarArchives = "archives"
	VarProfile  = "profile"
	// VarProfileID is the id of the active profile: stable when the
	// profile is renamed (INV-ID-03).
	VarProfileID = "profile_id"
	// VarTargetPrefix starts the name of a target variable.
	VarTargetPrefix = "target:"
)

// TargetVar is the variable of a target.
func TargetVar(id game.TargetID) string { return VarTargetPrefix + string(id) }

// Context is what the variables of one instance stand for.
type Context struct {
	Instance    game.Instance
	Profile     string
	ProfileName string
}

// VariablesOf returns the variables of an instance, by name. A folder the
// instance does not have is left out, so a tool using it is refused.
func VariablesOf(c Context) map[string]string {
	vars := map[string]string{}
	set := func(k, v string) {
		if v != "" {
			vars[k] = v
		}
	}
	set(VarGame, c.Instance.Root)
	set(VarStaging, c.Instance.Staging)
	set(VarArchives, c.Instance.ArchiveStore)
	set(VarProfile, c.ProfileName)
	set(VarProfileID, c.Profile)
	for _, t := range c.Instance.Targets {
		set(TargetVar(t.ID), t.Path)
	}
	return vars
}

// Names lists the variable names, in the order they are offered: the core
// ones, then the targets in the instance's order.
func Names(c Context) []string {
	var out []string
	vars := VariablesOf(c)
	for _, k := range []string{VarGame, VarStaging, VarArchives, VarProfile, VarProfileID} {
		if _, ok := vars[k]; ok {
			out = append(out, k)
		}
	}
	for _, t := range c.Instance.Targets {
		if _, ok := vars[TargetVar(t.ID)]; ok {
			out = append(out, TargetVar(t.ID))
		}
	}
	return out
}

// Expand replaces {name} by its value. "{{" and "}}" stand for a literal
// brace. An unknown name or an unclosed brace is refused.
func Expand(s string, vars map[string]string) (string, error) {
	if !strings.ContainsAny(s, "{}") {
		return s, nil
	}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '{' && i+1 < len(s) && s[i+1] == '{':
			b.WriteByte('{')
			i++
		case c == '}' && i+1 < len(s) && s[i+1] == '}':
			b.WriteByte('}')
			i++
		case c == '{':
			end := strings.IndexByte(s[i+1:], '}')
			if end < 0 {
				return "", invalid(ReasonSyntax, s[i:])
			}
			name := s[i+1 : i+1+end]
			v, ok := vars[strings.ToLower(name)]
			if !ok {
				v, ok = vars[name]
			}
			if !ok {
				return "", invalid(ReasonVariable, name)
			}
			b.WriteString(v)
			i += end + 1
		case c == '}':
			return "", invalid(ReasonSyntax, s[i:])
		default:
			b.WriteByte(c)
		}
	}
	return b.String(), nil
}
