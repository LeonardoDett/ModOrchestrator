// Package vortex reads what Vortex knows about a game (D128): its state
// database (LevelDB in state.v2, keys "a###b###c" with JSON values), the
// staging folder of each game and the folder of each profile. The database is copied to a temporary folder and opened read
// only, so Vortex may be running and nothing is ever written in its folder.
package vortex

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/syndtr/goleveldb/leveldb"
	"github.com/syndtr/goleveldb/leveldb/opt"
	"github.com/syndtr/goleveldb/leveldb/util"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/migration"
)

const (
	stateDir = "state.v2"
	sep      = "###"
	// SourceName labels a Vortex source for the user.
	SourceName = "Vortex"
)

// Reader reads Vortex. AppData is %APPDATA% (Vortex keeps its data in
// AppData\Vortex); Temp is where the database copy is made.
type Reader struct {
	AppData string
	Temp    string
}

var _ ports.ManagerReader = Reader{}

func (Reader) Manager() game.ForeignKind { return game.ForeignVortex }

func (r Reader) dataDir() string { return filepath.Join(r.AppData, "Vortex") }

// Find lists the games Vortex discovered in the folder root.
func (r Reader) Find(ctx context.Context, root string) ([]migration.Source, error) {
	if r.AppData == "" {
		return nil, nil
	}
	srcs, err := r.Open(ctx, r.dataDir())
	if errors.Is(err, ports.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return slices.DeleteFunc(srcs, func(s migration.Source) bool { return !samePath(s.GamePath, root) }), nil
}

// Open lists the games of a Vortex data folder (the one holding state.v2)
// that have installed mods.
func (r Reader) Open(ctx context.Context, folder string) ([]migration.Source, error) {
	st, err := r.load(ctx, folder, []string{
		"settings" + sep + "gameMode" + sep + "discovered" + sep, "persistent" + sep + "mods" + sep,
		"settings" + sep + "mods" + sep + "installPath" + sep,
	})
	if err != nil {
		return nil, err
	}
	paths, install := map[string]string{}, map[string]string{}
	withMods := map[string]bool{}
	for k, v := range st {
		parts := strings.Split(k, sep)
		switch {
		case len(parts) == 5 && parts[1] == "gameMode" && parts[4] == "path":
			paths[parts[3]] = str(v)
		case len(parts) == 4 && parts[0] == "settings" && parts[1] == "mods" && parts[2] == "installPath":
			install[parts[3]] = str(v)
		case len(parts) >= 5 && parts[0] == "persistent" && parts[1] == "mods" && parts[4] == "state" && str(v) == "installed":
			withMods[parts[2]] = true
		}
	}
	var out []migration.Source
	for g := range withMods {
		out = append(out, migration.Source{
			Manager: game.ForeignVortex, Path: folder, Name: SourceName, GameRef: g, GamePath: paths[g],
			Location: stagingOf(install[g], folder, g),
		})
	}
	slices.SortFunc(out, func(a, b migration.Source) int { return strings.Compare(a.GameRef, b.GameRef) })
	return out, nil
}

type vmod struct {
	key, path, state, typ string
	attrs                 map[string]json.RawMessage
	rules                 []vrule
}

type vrule struct {
	Type      string `json:"type"`
	Reference struct {
		ID              string `json:"id"`
		FileMD5         string `json:"fileMD5"`
		LogicalFileName string `json:"logicalFileName"`
	} `json:"reference"`
}

// Read loads one game.
func (r Reader) Read(ctx context.Context, src migration.Source) (migration.Snapshot, error) {
	g := src.GameRef
	st, err := r.load(ctx, src.Path, []string{
		"persistent" + sep + "mods" + sep + g + sep,
		"persistent" + sep + "profiles" + sep,
		"persistent" + sep + "categories" + sep + g + sep,
		"settings" + sep + "mods" + sep + "installPath" + sep + g,
		"settings" + sep + "profiles" + sep + "lastActiveProfile" + sep + g,
	})
	if err != nil {
		return migration.Snapshot{}, err
	}
	mods := map[string]*vmod{}
	type vprofile struct {
		id, name, game string
		enabled        map[string]bool
	}
	profiles := map[string]*vprofile{}
	used := map[string]int64{}
	cats := map[string]*migration.Category{}
	staging, active := "", ""
	for k, v := range st {
		p := strings.Split(k, sep)
		switch {
		case p[0] == "persistent" && len(p) >= 5 && p[1] == "mods":
			m := mods[p[3]]
			if m == nil {
				m = &vmod{key: p[3], attrs: map[string]json.RawMessage{}}
				mods[p[3]] = m
			}
			switch {
			case len(p) == 5 && p[4] == "installationPath":
				m.path = str(v)
			case len(p) == 5 && p[4] == "state":
				m.state = str(v)
			case len(p) == 5 && p[4] == "type":
				m.typ = str(v)
			case len(p) == 5 && p[4] == "rules":
				_ = json.Unmarshal(v, &m.rules)
			case len(p) == 6 && p[4] == "attributes":
				m.attrs[p[5]] = v
			}
		case p[0] == "persistent" && len(p) >= 4 && p[1] == "profiles":
			pr := profiles[p[2]]
			if pr == nil {
				pr = &vprofile{id: p[2], enabled: map[string]bool{}}
				profiles[p[2]] = pr
			}
			switch {
			case len(p) == 4 && p[3] == "name":
				pr.name = str(v)
			case len(p) == 4 && p[3] == "gameId":
				pr.game = str(v)
			case len(p) == 4 && p[3] == "lastActivated":
				var ms int64
				_ = json.Unmarshal(v, &ms)
				used[p[2]] = ms
			case len(p) == 6 && p[3] == "modState" && p[5] == "enabled":
				var on bool
				_ = json.Unmarshal(v, &on)
				pr.enabled[p[4]] = on
			}
		case p[0] == "persistent" && len(p) == 5 && p[1] == "categories":
			c := cats[p[3]]
			if c == nil {
				c = &migration.Category{Key: p[3]}
				cats[p[3]] = c
			}
			switch p[4] {
			case "name":
				c.Name = str(v)
			case "parentCategory":
				c.Parent = str(v)
			}
		case p[0] == "settings" && p[1] == "mods" && len(p) == 4:
			staging = str(v)
		case p[0] == "settings" && p[1] == "profiles" && len(p) == 4:
			active = str(v)
		}
	}
	staging = stagingOf(staging, src.Path, g)

	snap := migration.Snapshot{Source: src}
	var keys []string
	for k, m := range mods {
		if m.state == "installed" && m.path != "" {
			keys = append(keys, k)
		}
	}
	// Vortex has no mod order: rules decide it. Install time is the order
	// the mods start from.
	sort.SliceStable(keys, func(i, j int) bool {
		a, b := mods[keys[i]], mods[keys[j]]
		if ta, tb := attr(a, "installTime"), attr(b, "installTime"); ta != tb {
			return ta < tb
		}
		return keys[i] < keys[j]
	})
	byMD5, byLogical := map[string]string{}, map[string]string{}
	for _, k := range keys {
		m := mods[k]
		name := firstOf(attr(m, "customFileName"), attr(m, "logicalFileName"), attr(m, "name"), k)
		mm := migration.Mod{
			Key: k, Name: name, Version: attr(m, "version"), Author: attr(m, "author"),
			Notes: attr(m, "notes"), Folder: filepath.Join(staging, m.path), ForeignType: m.typ,
		}
		if c := attr(m, "category"); c != "" && cats[c] != nil {
			mm.Category = c
		}
		snap.Mods = append(snap.Mods, mm)
		if h := attr(m, "fileMD5"); h != "" {
			byMD5[h] = k
		}
		if l := attr(m, "logicalFileName"); l != "" {
			byLogical[strings.ToLower(l)] = k
		}
	}
	installed := map[string]bool{}
	for _, k := range keys {
		installed[k] = true
	}
	for _, k := range keys {
		for _, ru := range mods[k].rules {
			other := ru.Reference.ID
			if !installed[other] {
				other = byMD5[ru.Reference.FileMD5]
			}
			if other == "" {
				other = byLogical[strings.ToLower(ru.Reference.LogicalFileName)]
			}
			if other == "" || other == k {
				continue
			}
			switch ru.Type {
			case "after":
				snap.Rules = append(snap.Rules, migration.Rule{Kind: migration.RuleAfter, Mod: k, Other: other})
			case "before":
				snap.Rules = append(snap.Rules, migration.Rule{Kind: migration.RuleAfter, Mod: other, Other: k})
			case "requires":
				snap.Rules = append(snap.Rules, migration.Rule{Kind: migration.RuleRequires, Mod: k, Other: other})
			case "recommends":
				snap.Rules = append(snap.Rules, migration.Rule{Kind: migration.RuleRecommends, Mod: k, Other: other})
			case "conflicts":
				snap.Rules = append(snap.Rules, migration.Rule{Kind: migration.RuleConflicts, Mod: k, Other: other})
			}
		}
	}
	var catKeys []string
	for k, c := range cats {
		if strings.TrimSpace(c.Name) != "" {
			catKeys = append(catKeys, k)
		}
	}
	sort.Strings(catKeys)
	for _, k := range catKeys {
		c := *cats[k]
		if cats[c.Parent] == nil || c.Parent == k {
			c.Parent = ""
		}
		snap.Categories = append(snap.Categories, c)
	}
	var pids []string
	for id, p := range profiles {
		if p.game == g && strings.TrimSpace(p.name) != "" {
			pids = append(pids, id)
		}
	}
	sort.Slice(pids, func(i, j int) bool { return profiles[pids[i]].name < profiles[pids[j]].name })
	for _, id := range pids {
		p := profiles[id]
		mp := migration.Profile{Name: p.name, Active: id == active, Enabled: map[string]bool{}}
		if ms := used[id]; ms > 0 {
			mp.LastUsed = time.UnixMilli(ms)
		}
		for k, on := range p.enabled {
			if installed[k] {
				mp.Enabled[k] = on
			}
		}
		// The game's plugin file of the profile is read by the core through
		// the adapter (D112).
		mp.Folder = filepath.Join(src.Path, g, "profiles", id)
		snap.Profiles = append(snap.Profiles, mp)
	}
	return snap, nil
}

// load copies the database of folder to a temporary folder, opens the copy
// read only and returns the values under the prefixes.
func (r Reader) load(ctx context.Context, folder string, prefixes []string) (map[string]json.RawMessage, error) {
	src := filepath.Join(folder, stateDir)
	if info, err := os.Stat(src); err != nil || !info.IsDir() {
		return nil, ports.ErrNotFound
	}
	tmp, err := os.MkdirTemp(r.Temp, "vortex-state-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	entries, err := os.ReadDir(src)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() || strings.EqualFold(e.Name(), "LOCK") {
			continue
		}
		if err := copyFile(filepath.Join(src, e.Name()), filepath.Join(tmp, e.Name())); err != nil {
			return nil, err
		}
	}
	db, err := leveldb.OpenFile(tmp, &opt.Options{ReadOnly: true, ErrorIfMissing: true})
	if err != nil {
		return nil, fmt.Errorf("vortex: open state: %w", err)
	}
	defer db.Close()
	out := map[string]json.RawMessage{}
	for _, p := range prefixes {
		it := db.NewIterator(util.BytesPrefix([]byte(p)), nil)
		for it.Next() {
			if err := ctx.Err(); err != nil {
				it.Release()
				return nil, err
			}
			out[string(it.Key())] = slices.Clone(it.Value())
		}
		it.Release()
		if err := it.Error(); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil // removed by Vortex while copying (compaction)
		}
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// stagingOf resolves the staging folder of game g: the installPath setting
// ("{USERDATA}" and "{game}" placeholders) or Vortex's default.
func stagingOf(install, data, g string) string {
	if install == "" {
		install = filepath.Join("{USERDATA}", "{game}", "mods")
	}
	return filepath.Clean(replaceFold(replaceFold(install, "{USERDATA}", data), "{game}", g))
}

func attr(m *vmod, name string) string {
	v, ok := m.attrs[name]
	if !ok {
		return ""
	}
	return str(v)
}

// str reads a JSON string or number as text.
func str(v json.RawMessage) string {
	var s string
	if json.Unmarshal(v, &s) == nil {
		return s
	}
	var n json.Number
	if json.Unmarshal(v, &n) == nil {
		return n.String()
	}
	return ""
}

func firstOf(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func replaceFold(s, old, new string) string {
	i := strings.Index(strings.ToLower(s), strings.ToLower(old))
	if i < 0 {
		return s
	}
	return s[:i] + new + s[i+len(old):]
}

func samePath(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	norm := func(p string) string {
		return strings.ToLower(strings.TrimRight(filepath.Clean(strings.ReplaceAll(p, "/", `\`)), `\/`))
	}
	return norm(a) == norm(b)
}
