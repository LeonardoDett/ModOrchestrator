package stores

import (
	"context"
	"encoding/json"
	"io"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
)

// Registry is the small part of the Windows registry the scanner reads.
type Registry interface {
	// Value returns a string value; ok is false when key or value is absent.
	Value(root, key, name string) (value string, ok bool)
	// SubKeys lists the names of the subkeys of key.
	SubKeys(root, key string) []string
}

// Scanner implements ports.StoreScanner.
type Scanner struct {
	FS  ports.FileReader
	Reg Registry
	// Env reads an environment variable (os.Getenv in production).
	Env func(string) string
}

var _ ports.StoreScanner = (*Scanner)(nil)

// maxFile bounds what is read from launcher files.
const maxFile = 4 << 20

// Scan gathers installations from every source. A source that is absent
// (store not installed) contributes nothing and is not an error.
func (s *Scanner) Scan(ctx context.Context, hints []ports.RegistryHint) ([]ports.StoreInstall, error) {
	var out []ports.StoreInstall
	out = append(out, s.steam(ctx)...)
	out = append(out, s.gog()...)
	out = append(out, s.epic(ctx)...)
	out = append(out, s.registryHints(hints)...)
	return out, ctx.Err()
}

func (s *Scanner) readFile(ctx context.Context, path string) (string, bool) {
	r, err := s.FS.Open(ctx, path)
	if err != nil {
		return "", false
	}
	defer r.Close()
	data, err := io.ReadAll(io.LimitReader(r, maxFile))
	if err != nil {
		return "", false
	}
	return string(data), true
}

// steam finds every installed app of every library (core/11 §3).
func (s *Scanner) steam(ctx context.Context) []ports.StoreInstall {
	var roots []string
	if s.Reg != nil {
		if v, ok := s.Reg.Value("HKCU", `Software\Valve\Steam`, "SteamPath"); ok {
			roots = append(roots, v)
		}
		if v, ok := s.Reg.Value("HKLM", `SOFTWARE\WOW6432Node\Valve\Steam`, "InstallPath"); ok {
			roots = append(roots, v)
		}
	}
	var out []ports.StoreInstall
	seenLib := map[string]bool{}
	for _, root := range roots {
		root = upperDrive(strings.ReplaceAll(root, "/", `\`))
		text, ok := s.readFile(ctx, game.JoinPath(root, "steamapps", "libraryfolders.vdf"))
		libs := []string{root}
		if ok {
			libs = append(libs, steamLibraries(text)...)
		}
		for _, lib := range libs {
			if seenLib[game.CleanAbs(lib)] {
				continue
			}
			seenLib[game.CleanAbs(lib)] = true
			out = append(out, s.steamLibrary(ctx, lib)...)
		}
	}
	return out
}

// steamLibraries extracts library paths from libraryfolders.vdf, in both the
// current format (numbered blocks with "path") and the old one (numbered
// keys holding the path).
func steamLibraries(text string) []string {
	doc, err := parseVDF(text)
	if err != nil {
		return nil
	}
	folders := doc.sub("libraryfolders")
	var out []string
	for key, v := range folders {
		if !isDigits(key) {
			continue
		}
		switch t := v.(type) {
		case string:
			out = append(out, t)
		case vdf:
			if p := t.str("path"); p != "" {
				out = append(out, p)
			}
		}
	}
	return out
}

func (s *Scanner) steamLibrary(ctx context.Context, lib string) []ports.StoreInstall {
	apps := game.JoinPath(lib, "steamapps")
	entries, err := s.FS.ReadDir(ctx, apps)
	if err != nil {
		return nil
	}
	var out []ports.StoreInstall
	for _, e := range entries {
		name := strings.ToLower(e.Name)
		if e.IsDir || !strings.HasPrefix(name, "appmanifest_") || !strings.HasSuffix(name, ".acf") {
			continue
		}
		text, ok := s.readFile(ctx, game.JoinPath(apps, e.Name))
		if !ok {
			continue
		}
		doc, err := parseVDF(text)
		if err != nil {
			continue
		}
		state := doc.sub("appstate")
		id, dir := state.str("appid"), state.str("installdir")
		if id == "" || dir == "" {
			continue
		}
		out = append(out, ports.StoreInstall{Store: "steam", AppID: id, Path: game.JoinPath(apps, "common", dir)})
	}
	return out
}

// gog reads the installed games GOG Galaxy records in the registry.
func (s *Scanner) gog() []ports.StoreInstall {
	if s.Reg == nil {
		return nil
	}
	const base = `SOFTWARE\WOW6432Node\GOG.com\Games`
	var out []ports.StoreInstall
	for _, id := range s.Reg.SubKeys("HKLM", base) {
		path, ok := s.Reg.Value("HKLM", base+`\`+id, "path")
		if !ok || path == "" {
			continue
		}
		if gameID, ok := s.Reg.Value("HKLM", base+`\`+id, "gameID"); ok && gameID != "" {
			id = gameID
		}
		out = append(out, ports.StoreInstall{Store: "gog", AppID: id, Path: path})
	}
	return out
}

// epic reads the launcher manifests (*.item, JSON) of installed games.
func (s *Scanner) epic(ctx context.Context) []ports.StoreInstall {
	programData := ""
	if s.Env != nil {
		programData = s.Env("ProgramData")
	}
	if programData == "" {
		return nil
	}
	dir := game.JoinPath(programData, "Epic", "EpicGamesLauncher", "Data", "Manifests")
	entries, err := s.FS.ReadDir(ctx, dir)
	if err != nil {
		return nil
	}
	var out []ports.StoreInstall
	for _, e := range entries {
		if e.IsDir || !strings.EqualFold(suffix(e.Name, 5), ".item") {
			continue
		}
		text, ok := s.readFile(ctx, game.JoinPath(dir, e.Name))
		if !ok {
			continue
		}
		var m struct {
			AppName         string `json:"AppName"`
			InstallLocation string `json:"InstallLocation"`
		}
		if json.Unmarshal([]byte(text), &m) != nil || m.AppName == "" || m.InstallLocation == "" {
			continue
		}
		out = append(out, ports.StoreInstall{Store: "epic", AppID: m.AppName, Path: strings.ReplaceAll(m.InstallLocation, "/", `\`)})
	}
	return out
}

// registryHints resolves the registry values adapters declared.
func (s *Scanner) registryHints(hints []ports.RegistryHint) []ports.StoreInstall {
	if s.Reg == nil {
		return nil
	}
	var out []ports.StoreInstall
	for _, h := range hints {
		root, key, ok := strings.Cut(h.Key, `\`)
		if !ok {
			continue
		}
		if v, ok := s.Reg.Value(root, key, h.Value); ok && v != "" {
			out = append(out, ports.StoreInstall{Store: "registry", AppID: h.ID, Path: v})
		}
	}
	return out
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func suffix(s string, n int) string {
	if len(s) < n {
		return s
	}
	return s[len(s)-n:]
}

// upperDrive upper-cases the drive letter: the registry stores it in lower
// case, which would leak into every path shown to the user.
func upperDrive(p string) string {
	if len(p) >= 2 && p[1] == ':' {
		return strings.ToUpper(p[:1]) + p[1:]
	}
	return p
}
