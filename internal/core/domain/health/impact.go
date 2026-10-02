package health

import (
	"slices"

	"modorchestrator/internal/core/domain/mod"
	"modorchestrator/internal/core/domain/rules"
)

// Impact is what changing the enabled state of some mods means for the
// requirements between mods (core/06 §6). It only informs: nothing is
// enabled or disabled without the user asking.
type Impact struct {
	// AlsoEnable lists the installed, disabled mods that the mods being
	// enabled require, directly or through each other.
	AlsoEnable []mod.ID
	// Affected lists the enabled mods that require a mod being disabled.
	Affected []mod.ID
}

// EnableImpact derives the impact of enabling (or disabling) ids. Only
// enabled `requires` rules count; recommendations never ask for anything.
func EnableImpact(set *rules.Set, mods Mods, ids []mod.ID, enabling bool) Impact {
	var deps []rules.DependencyRule
	for _, r := range set.DependencyRules() {
		if !r.Disabled && r.Kind == rules.Requires {
			deps = append(deps, r)
		}
	}
	changing := map[mod.ID]bool{}
	for _, id := range ids {
		changing[id] = true
	}
	var out Impact
	if enabling {
		queue := slices.Clone(ids)
		seen := map[mod.ID]bool{}
		for len(queue) > 0 {
			m := queue[0]
			queue = queue[1:]
			for _, r := range deps {
				t, ok := mods[r.Target]
				if r.Mod != m || seen[r.Target] || changing[r.Target] || !ok || t.State != mod.StateInstalled || t.Enabled {
					continue
				}
				seen[r.Target] = true
				out.AlsoEnable = append(out.AlsoEnable, r.Target)
				queue = append(queue, r.Target)
			}
		}
		slices.Sort(out.AlsoEnable)
		return out
	}
	seen := map[mod.ID]bool{}
	for _, r := range deps {
		if changing[r.Target] && !changing[r.Mod] && mods.enabled(r.Mod) && !seen[r.Mod] {
			seen[r.Mod] = true
			out.Affected = append(out.Affected, r.Mod)
		}
	}
	slices.Sort(out.Affected)
	return out
}
