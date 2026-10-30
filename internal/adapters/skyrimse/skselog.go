package skyrimse

import (
	"bufio"
	"bytes"
	"context"
	"strings"

	"modorchestrator/sdk"
	"modorchestrator/sdk/diagnostic"
	"modorchestrator/sdk/event"
	"modorchestrator/sdk/game"
	"modorchestrator/sdk/health"
	"modorchestrator/sdk/relpath"
)

var _ sdk.RunLogChecker = Adapter{}

// CodeSKSEPluginFailed: a script extender plugin (a DLL in
// Data\SKSE\Plugins) did not load on the last run of the game (D151, M4 of
// the MO2/Vortex survey; Vortex script-extender-error-check). After an
// update of the game it is the most useful warning: the plugin needs a
// version for the new runtime, or Address Library does.
const CodeSKSEPluginFailed diagnostic.Code = "skse_plugin_failed"

const (
	// skseLog is the log SKSE64 writes on every run, below the My Games
	// folder of the game.
	skseLog = "SKSE/skse64.log"
	// sksePlugins is where SKSE loads its plugins from, in Data.
	sksePlugins = "SKSE/Plugins/"
)

// RunLogFile is skse64.log in My Games (the GOG and Epic variants as for
// plugins.txt and the saves).
func (Adapter) RunLogFile(inst game.Instance) (sdk.FileLocation, bool) {
	return sdk.FileLocation{Folder: sdk.FolderDocuments, Path: myGames(inst) + "/" + skseLog}, true
}

// failedPlugin is a DLL the log says did not load, and why (SKSE's own
// words: "disabled, address library needs to be updated", "couldn't load
// plugin ... (Error: 126 ...)").
type failedPlugin struct {
	name, reason string
}

// RunLogChecks lists the SKSE plugins that did not load on the last run. A
// DLL no enabled mod deploys any more and that is not in the game folder is
// gone, and so is the problem; one the manager does not own is reported
// without a mod.
func (Adapter) RunLogChecks(ctx context.Context, fs sdk.FileReader, inst game.Instance, log sdk.RunLog, owners sdk.FileOwners) ([]diagnostic.Spec, error) {
	failed := parseSKSELog(log.Content)
	if len(failed) == 0 {
		return nil, nil
	}
	data := ""
	for _, t := range inst.Targets {
		if t.ID == TargetData {
			data = t.Path
		}
	}
	var out []diagnostic.Spec
	for _, f := range failed {
		rel, err := relpath.Parse(sksePlugins + f.name)
		if err != nil {
			continue
		}
		owner, managed, err := owners.Owner(ctx, game.Location{Target: TargetData, Path: rel})
		if err != nil {
			return nil, err
		}
		if !managed {
			if data == "" {
				continue
			}
			info, err := fs.Stat(ctx, game.JoinPath(data, rel.String()))
			if err != nil || !info.Exists {
				continue
			}
		}
		params := diagnostic.Params{"plugin": f.name, "reason": f.reason}
		dll := event.EntityRef{Kind: "skse_plugin", ID: strings.ToLower(f.name)}
		related := []event.EntityRef{dll}
		var actions []diagnostic.Action
		if managed {
			params["mod"] = owner.ModName
			m := event.EntityRef{Kind: "mod", ID: string(owner.Mod)}
			related = append([]event.EntityRef{m}, related...)
			actions = append(actions, diagnostic.Action{ID: health.ActionOpenModFolder, Target: &m, NavigateTo: health.NavigateModFolder})
		}
		out = append(out, diagnostic.Spec{
			Code: CodeSKSEPluginFailed, Severity: diagnostic.SeverityWarning, Params: params,
			Evidence: []diagnostic.Evidence{{Kind: "skse_log", Ref: &dll, Params: params}},
			Actions:  actions,
			Related:  related,
		})
	}
	return out, nil
}

// parseSKSELog reads the plugin lines of skse64.log. SKSE64 2.x writes one
// line per plugin:
//
//	plugin <path>\Name.dll (<version> <name> <version>) loaded correctly (handle ...)
//	plugin <path>\Name.dll (<version> <name> <version>) disabled, <reason>
//	plugin <path>\Name.dll (...) reported as incompatible during query
//	couldn't load plugin <path>\Name.dll (Error: 126 <message>)
//
// Anything else ("checking plugin", the header) is ignored, and so is a
// line it cannot read. A plugin listed twice keeps its last state.
func parseSKSELog(content []byte) []failedPlugin {
	var order []string
	state := map[string]failedPlugin{}
	ok := map[string]bool{}
	sc := bufio.NewScanner(bytes.NewReader(content))
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		lower := strings.ToLower(line)
		var name, reason string
		switch {
		case strings.HasPrefix(lower, "couldn't load plugin "):
			rest := line[len("couldn't load plugin "):]
			var tail string
			name, tail = splitDLL(rest)
			reason = strings.Trim(strings.TrimSpace(tail), "()")
			if reason == "" {
				reason = "couldn't load plugin"
			}
		case strings.HasPrefix(lower, "plugin "):
			var tail string
			name, tail = splitDLL(line[len("plugin "):])
			tail = strings.TrimSpace(tail)
			if strings.HasPrefix(tail, "(") {
				if i := strings.Index(tail, ")"); i >= 0 {
					tail = strings.TrimSpace(tail[i+1:])
				}
			}
			if strings.HasPrefix(strings.ToLower(tail), "loaded correctly") {
				if name != "" {
					k := strings.ToLower(name)
					ok[k] = true
					delete(state, k)
				}
				continue
			}
			reason = strings.TrimPrefix(tail, "disabled, ")
		default:
			continue
		}
		if name == "" || reason == "" {
			continue
		}
		k := strings.ToLower(name)
		if _, seen := state[k]; !seen {
			order = append(order, k)
		}
		delete(ok, k)
		state[k] = failedPlugin{name: name, reason: reason}
	}
	var out []failedPlugin
	for _, k := range order {
		if f, failed := state[k]; failed && !ok[k] {
			out = append(out, f)
		}
	}
	return out
}

// splitDLL cuts "<path>\Name.dll rest" into the file name of the DLL and
// the rest of the line; name is empty when there is no .dll.
func splitDLL(s string) (name, rest string) {
	i := strings.Index(strings.ToLower(s), ".dll")
	if i < 0 {
		return "", s
	}
	p := s[:i+len(".dll")]
	if j := strings.LastIndexAny(p, `\/`); j >= 0 {
		p = p[j+1:]
	}
	return strings.TrimSpace(p), s[i+len(".dll"):]
}
