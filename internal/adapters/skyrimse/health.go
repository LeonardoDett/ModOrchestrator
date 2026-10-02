package skyrimse

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

// Loader is the SKSE loader in the game root (core/12 §7, §8).
const Loader = "skse64_loader.exe"

var (
	_ ports.ProcessDeclarer     = Adapter{}
	_ ports.HealthCheckProvider = Adapter{}
)

// Processes are the executables of a running game (core/12 §1).
func (Adapter) Processes(game.ID) []string { return []string{Executable, Loader} }

// HealthChecks implements framework_missing (core/12 §7): an enabled mod
// carries SKSE plugins, no enabled mod is of type skse and the loader is
// not in the game root (managed or not). The plugins load only through
// SKSE, so it is an error, with "Import framework" as the action; it never
// blocks deploy (the launch warning is F12).
func (Adapter) HealthChecks(ctx context.Context, fs ports.FileReader, inst game.Instance, mods []ports.ModContent) ([]diagnostic.Spec, error) {
	var users []ports.ModContent
	for _, m := range mods {
		if !m.Enabled {
			continue
		}
		if m.Type == ModTypeSKSE {
			return nil, nil
		}
		if slices.Contains(m.Content, FlagSKSEPlugin) {
			users = append(users, m)
		}
	}
	if len(users) == 0 {
		return nil, nil
	}
	info, err := fs.Stat(ctx, game.JoinPath(inst.Root, Loader))
	if err == nil && info.Exists && !info.IsDir {
		return nil, nil
	}
	params := diagnostic.Params{"framework": "SKSE", "file": Loader, "count": itoa(len(users)), "mod": users[0].Name}
	evidence := []diagnostic.Evidence{{Kind: "file_absent", Params: diagnostic.Params{"target": string(TargetRoot), "path": Loader}}}
	for _, m := range users {
		ref := event.EntityRef{Kind: "mod", ID: string(m.ID)}
		evidence = append(evidence, diagnostic.Evidence{Kind: "framework_user", Ref: &ref, Params: diagnostic.Params{"mod": m.Name}})
	}
	return []diagnostic.Spec{{
		Code: diagnostic.CodeFrameworkMissing, Severity: diagnostic.SeverityError, Params: params,
		Evidence: evidence,
		Actions:  []diagnostic.Action{{ID: health.ActionImport, NavigateTo: health.NavigateImport, Params: diagnostic.Params{"mod": "SKSE"}}},
		Related:  []event.EntityRef{{Kind: "instance", ID: string(inst.ID)}, {Kind: "framework", ID: "skse"}},
	}}, nil
}

func itoa(n int) string { return strconv.Itoa(n) }
