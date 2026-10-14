package mod

import (
	"slices"
	"strings"
)

// PackageRef names a package a mod requires: the identity another mod
// declares and the minimum version it asks for (D125). The version is
// recorded and shown, not enforced.
type PackageRef struct {
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
}

// Package is what a mod declares about itself in its own metadata, read by
// the adapter's installer: its package identity and the packages it
// requires (D125). Empty for games whose adapter declares none.
type Package struct {
	Name     string       `json:"name,omitempty"`
	Requires []PackageRef `json:"requires,omitempty"`
}

// Is reports whether the package is the one named; names compare without
// case.
func (p Package) Is(name string) bool {
	return p.Name != "" && strings.EqualFold(p.Name, strings.TrimSpace(name))
}

// Clean drops empty and repeated references and those naming the package
// itself, keeping the first version declared.
func (p Package) Clean() Package {
	out := Package{Name: strings.TrimSpace(p.Name)}
	for _, r := range p.Requires {
		r.Name, r.Version = strings.TrimSpace(r.Name), strings.TrimSpace(r.Version)
		if r.Name == "" || out.Is(r.Name) || slices.ContainsFunc(out.Requires, func(o PackageRef) bool { return strings.EqualFold(o.Name, r.Name) }) {
			continue
		}
		out.Requires = append(out.Requires, r)
	}
	return out
}
