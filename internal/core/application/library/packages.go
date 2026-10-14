package library

import (
	"context"
	"slices"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/operation"
	"modorchestrator/internal/core/domain/rules"
)

// linkPackages turns package requirements into DependencyRules (D125), in
// the install transaction: what the installed mod requires, against the
// mods of the library that declare that package, and what the other mods
// require, against the package the installed mod declares. A requirement
// no mod declares yet stays on the mod; the health check reports it.
func (s *Service) linkPackages(ctx context.Context, tx ports.Tx, m *mod.Mod, op operation.ID) error {
	if m.Package.Name == "" && len(m.Package.Requires) == 0 {
		return nil
	}
	list, err := tx.Mods().ListByInstance(ctx, m.Instance)
	if err != nil {
		return err
	}
	others := slices.DeleteFunc(list, func(o *mod.Mod) bool { return o.ID == m.ID || o.State == mod.StateRemoved })
	// The oldest mod declaring a package wins when several do (variants).
	slices.SortStableFunc(others, func(a, b *mod.Mod) int { return a.CreatedAt.Compare(b.CreatedAt) })
	set, err := instanceRules(ctx, tx, m.Instance)
	if err != nil {
		return err
	}
	for _, want := range m.Package.Requires {
		if i := slices.IndexFunc(others, func(o *mod.Mod) bool { return o.Package.Is(want.Name) }); i >= 0 {
			if err := s.requireByMetadata(tx, set, m.ID, others[i].ID, packageNote(want), op); err != nil {
				return err
			}
		}
	}
	if m.Package.Name != "" {
		for _, o := range others {
			for _, want := range o.Package.Requires {
				if !m.Package.Is(want.Name) || requiresPackage(set.DependencyRules(), o.ID, want.Name, others) {
					continue
				}
				if err := s.requireByMetadata(tx, set, o.ID, m.ID, packageNote(want), op); err != nil {
					return err
				}
			}
		}
	}
	return tx.Rules().Save(ctx, set)
}

// requiresPackage reports whether mod already has a "requires" rule to a
// mod declaring the package.
func requiresPackage(deps []rules.DependencyRule, from mod.ID, name string, mods []*mod.Mod) bool {
	return slices.ContainsFunc(deps, func(d rules.DependencyRule) bool {
		return d.Mod == from && d.Kind == rules.Requires && slices.ContainsFunc(mods, func(o *mod.Mod) bool { return o.ID == d.Target && o.Package.Is(name) })
	})
}

// packageNote is the note of a rule created from a package requirement:
// the package and the minimum version, as the mod declares them.
func packageNote(r mod.PackageRef) string {
	if r.Version == "" {
		return r.Name
	}
	return r.Name + " " + r.Version
}
