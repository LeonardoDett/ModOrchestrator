package valheim

import (
	"context"
	"slices"
	"strconv"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/diagnostic"
	"modorchestrator/internal/core/domain/event"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/health"
)

var (
	_ ports.ProcessDeclarer     = Adapter{}
	_ ports.HealthCheckProvider = Adapter{}
	_ ports.LaunchSupport       = Adapter{}
)

// Processes are the executables of a running game.
func (Adapter) Processes(game.ID) []string { return []string{Executable} }

// LaunchGame is the only launch option: the framework is started by the
// proxy in the game root, not by another executable.
const LaunchGame = "game"

// LaunchOptions implements ports.LaunchSupport.
func (Adapter) LaunchOptions(context.Context, ports.FileReader, game.Instance) ([]ports.LaunchOption, error) {
	return []ports.LaunchOption{{ID: LaunchGame, Exe: Executable, Default: true}}, nil
}

// HealthChecks implements framework_missing: an enabled mod carries plugins
// or patchers, no enabled mod is the framework pack, and the game root does
// not hold the proxy and the preloader (managed or not). Both are needed:
// the proxy alone, left by another manager, starts nothing. The mods load
// only through the framework, so it is an error; it never blocks deploy.
func (Adapter) HealthChecks(ctx context.Context, fs ports.FileReader, inst game.Instance, mods []ports.ModContent) ([]diagnostic.Spec, error) {
	var users []ports.ModContent
	for _, m := range mods {
		if !m.Enabled {
			continue
		}
		if m.Type == ModTypeLoader {
			return nil, nil
		}
		if slices.Contains(m.Content, FlagPlugin) || slices.Contains(m.Content, FlagPatcher) {
			users = append(users, m)
		}
	}
	if len(users) == 0 {
		return nil, nil
	}
	missing := ""
	for _, f := range []string{doorstopProxy, preloader} {
		info, err := fs.Stat(ctx, game.JoinPath(inst.Root, f))
		if err != nil || !info.Exists || info.IsDir {
			missing = f
			break
		}
	}
	if missing == "" {
		return nil, nil
	}
	params := diagnostic.Params{"framework": dirFramework, "file": missing, "count": strconv.Itoa(len(users)), "mod": users[0].Name}
	evidence := []diagnostic.Evidence{{Kind: "file_absent", Params: diagnostic.Params{"target": string(TargetRoot), "path": missing}}}
	for _, m := range users {
		ref := event.EntityRef{Kind: "mod", ID: string(m.ID)}
		evidence = append(evidence, diagnostic.Evidence{Kind: "framework_user", Ref: &ref, Params: diagnostic.Params{"mod": m.Name}})
	}
	return []diagnostic.Spec{{
		Code: diagnostic.CodeFrameworkMissing, Severity: diagnostic.SeverityError, Params: params,
		Evidence: evidence,
		Actions:  []diagnostic.Action{{ID: health.ActionImport, NavigateTo: health.NavigateImport, Params: diagnostic.Params{"mod": dirFramework}}},
		Related:  []event.EntityRef{{Kind: "instance", ID: string(inst.ID)}, {Kind: "framework", ID: "bepinex"}},
	}}, nil
}
