// Package mo2 reads a Mod Organizer 2 instance (D128): ModOrganizer.ini,
// the mods folder with each mod's meta.ini, categories.dat, and per
// profile modlist.txt and lockedorder.txt. It only reads; nothing is ever
// written in the instance.
package mo2

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"modorchestrator/internal/core/application/ports"
	"modorchestrator/internal/core/domain/game"
	"modorchestrator/internal/core/domain/migration"
)

const (
	iniName         = "ModOrganizer.ini"
	metaName        = "meta.ini"
	separatorSuffix = "_separator"
	// OverwriteName names the mod the overwrite folder becomes.
	OverwriteName = "Overwrite"
)

// Reader reads MO2 instances. LocalAppData is the folder holding the
// global instances (%LOCALAPPDATA%); portable instances are found by
// pointing at them.
type Reader struct {
	LocalAppData string
}

var _ ports.ManagerReader = Reader{}

func (Reader) Manager() game.ForeignKind { return game.ForeignMO2 }

// Find lists the global instances whose game folder is root, and a
// portable instance in root itself.
func (r Reader) Find(ctx context.Context, root string) ([]migration.Source, error) {
	var dirs []string
	if r.LocalAppData != "" {
		base := filepath.Join(r.LocalAppData, "ModOrganizer")
		entries, err := os.ReadDir(base)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return nil, err
		}
		for _, e := range entries {
			if e.IsDir() {
				dirs = append(dirs, filepath.Join(base, e.Name()))
			}
		}
	}
	dirs = append(dirs, root)
	var out []migration.Source
	for _, d := range dirs {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		src, err := source(d)
		if err != nil || !samePath(src.GamePath, root) {
			continue
		}
		out = append(out, src)
	}
	return out, nil
}

// Open accepts an instance folder (the one holding ModOrganizer.ini).
func (Reader) Open(_ context.Context, folder string) ([]migration.Source, error) {
	src, err := source(folder)
	if err != nil {
		return nil, ports.ErrNotFound
	}
	return []migration.Source{src}, nil
}

func source(dir string) (migration.Source, error) {
	ini, err := readINI(filepath.Join(dir, iniName))
	if err != nil {
		return migration.Source{}, err
	}
	return migration.Source{
		Manager:  game.ForeignMO2,
		Path:     dir,
		Name:     filepath.Base(dir),
		GameRef:  ini.get("General", "gameName"),
		GamePath: ini.get("General", "gamePath"),
	}, nil
}

// layout is where an instance keeps each folder ([Settings] overrides,
// %BASE_DIR% placeholder).
type layout struct {
	base, mods, profiles, overwrite string
	selected                        string
}

func readLayout(dir string) (layout, error) {
	ini, err := readINI(filepath.Join(dir, iniName))
	if err != nil {
		return layout{}, err
	}
	l := layout{base: dir, selected: ini.get("General", "selected_profile")}
	if b := ini.get("Settings", "base_directory"); b != "" {
		l.base = b
	}
	folder := func(key, def string) string {
		v := ini.get("Settings", key)
		if v == "" {
			return filepath.Join(l.base, def)
		}
		return filepath.Clean(strings.ReplaceAll(v, "%BASE_DIR%", l.base))
	}
	l.mods, l.profiles, l.overwrite = folder("mod_directory", "mods"), folder("profiles_directory", "profiles"), folder("overwrite_directory", "overwrite")
	return l, nil
}

// Read loads the instance.
func (r Reader) Read(ctx context.Context, src migration.Source) (migration.Snapshot, error) {
	l, err := readLayout(src.Path)
	if err != nil {
		return migration.Snapshot{}, err
	}
	snap := migration.Snapshot{Source: src}
	snap.Categories = readCategories(filepath.Join(l.base, "categories.dat"))
	if _, err := os.Stat(filepath.Join(src.Path, "categories.dat")); err == nil && len(snap.Categories) == 0 {
		snap.Categories = readCategories(filepath.Join(src.Path, "categories.dat"))
	}
	known := map[string]bool{}
	for _, c := range snap.Categories {
		known[c.Key] = true
	}
	entries, err := os.ReadDir(l.mods)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return migration.Snapshot{}, err
	}
	mods := map[string]migration.Mod{}
	for _, e := range entries {
		if !e.IsDir() || strings.HasSuffix(e.Name(), separatorSuffix) {
			continue
		}
		m := readMod(filepath.Join(l.mods, e.Name()), e.Name())
		if !known[m.Category] {
			m.Category = ""
		}
		mods[e.Name()] = m
	}
	profiles, err := os.ReadDir(l.profiles)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return migration.Snapshot{}, err
	}
	var global []string
	for _, e := range profiles {
		if err := ctx.Err(); err != nil {
			return migration.Snapshot{}, err
		}
		if !e.IsDir() {
			continue
		}
		p := readProfile(filepath.Join(l.profiles, e.Name()), e.Name(), mods)
		p.Active = strings.EqualFold(e.Name(), l.selected)
		snap.Profiles = append(snap.Profiles, p)
		if p.Active || global == nil {
			global = global[:0]
			for _, x := range p.Order {
				if x.Mod != "" {
					global = append(global, x.Mod)
				}
			}
		}
	}
	// The global order is the active profile's; mods it does not list come
	// after, by name.
	seen := map[string]bool{}
	for _, k := range global {
		if m, ok := mods[k]; ok && !seen[k] {
			seen[k] = true
			snap.Mods = append(snap.Mods, m)
		}
	}
	rest := make([]string, 0, len(mods))
	for k := range mods {
		if !seen[k] {
			rest = append(rest, k)
		}
	}
	slices.SortFunc(rest, func(a, b string) int { return strings.Compare(strings.ToLower(a), strings.ToLower(b)) })
	for _, k := range rest {
		snap.Mods = append(snap.Mods, mods[k])
	}
	// The overwrite folder holds what tools generated: it wins everything,
	// so it comes last, enabled in every profile.
	if hasFiles(l.overwrite) {
		snap.Mods = append(snap.Mods, migration.Mod{Key: OverwriteName, Name: OverwriteName, Folder: l.overwrite})
		for i := range snap.Profiles {
			snap.Profiles[i].Order = append(snap.Profiles[i].Order, migration.Entry{Mod: OverwriteName})
			snap.Profiles[i].Enabled[OverwriteName] = true
		}
	}
	return snap, nil
}

func readMod(dir, name string) migration.Mod {
	m := migration.Mod{Key: name, Name: name, Folder: dir, Skip: []string{metaName}}
	ini, err := readINI(filepath.Join(dir, metaName))
	if err != nil {
		return m
	}
	m.Version = ini.get("General", "version")
	m.Author = ini.get("General", "author")
	m.Notes = ini.get("General", "comments")
	// "category" lists the primary category first ("12,4,").
	for _, c := range strings.Split(ini.get("General", "category"), ",") {
		if n, err := strconv.Atoi(strings.TrimSpace(c)); err == nil && n > 0 {
			m.Category = strconv.Itoa(n)
			break
		}
	}
	return m
}

// readProfile reads modlist.txt (highest priority first: it is reversed
// here) and the plugin locks. The game's own plugin file the profile keeps
// is read by the core through the adapter (D112).
func readProfile(dir, name string, mods map[string]migration.Mod) migration.Profile {
	p := migration.Profile{Name: name, Folder: dir, Enabled: map[string]bool{}}
	lines, _ := readLines(filepath.Join(dir, "modlist.txt"))
	for i := len(lines) - 1; i >= 0; i-- {
		line := lines[i]
		if len(line) < 2 {
			continue
		}
		mark, key := line[0], line[1:]
		if mark != '+' && mark != '-' {
			continue // '*': unmanaged (DLC, Creation Club)
		}
		if strings.HasSuffix(key, separatorSuffix) {
			p.Order = append(p.Order, migration.Entry{Separator: strings.TrimSuffix(key, separatorSuffix)})
			continue
		}
		if _, ok := mods[key]; !ok {
			continue
		}
		p.Order = append(p.Order, migration.Entry{Mod: key})
		p.Enabled[key] = mark == '+'
	}
	if lines, err := readLines(filepath.Join(dir, "lockedorder.txt")); err == nil {
		for _, l := range lines {
			n, idx, ok := strings.Cut(l, "|")
			if i, err := strconv.Atoi(strings.TrimSpace(idx)); ok && err == nil && i >= 0 {
				if p.Locks == nil {
					p.Locks = map[string]int{}
				}
				p.Locks[strings.TrimSpace(n)] = i
			}
		}
	}
	return p
}

// readCategories reads categories.dat: "id|name|nexus ids|parent id".
func readCategories(path string) []migration.Category {
	lines, err := readLines(path)
	if err != nil {
		return nil
	}
	var out []migration.Category
	for _, l := range lines {
		cells := strings.Split(l, "|")
		if len(cells) < 3 {
			continue
		}
		id, err := strconv.Atoi(strings.TrimSpace(cells[0]))
		if err != nil || id <= 0 || strings.TrimSpace(cells[1]) == "" {
			continue
		}
		c := migration.Category{Key: strconv.Itoa(id), Name: strings.TrimSpace(cells[1])}
		if parent, err := strconv.Atoi(strings.TrimSpace(cells[len(cells)-1])); err == nil && parent > 0 && len(cells) >= 4 {
			c.Parent = strconv.Itoa(parent)
		}
		out = append(out, c)
	}
	keys := map[string]bool{}
	for _, c := range out {
		keys[c.Key] = true
	}
	for i := range out {
		if !keys[out[i].Parent] {
			out[i].Parent = ""
		}
	}
	return out
}

func hasFiles(dir string) bool {
	found := false
	_ = filepath.WalkDir(dir, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			found = true
			return fs.SkipAll
		}
		return nil
	})
	return found
}

// readLines returns the non-empty lines that are not comments.
func readLines(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var out []string
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 1<<20)
	for sc.Scan() {
		l := strings.TrimSpace(strings.TrimPrefix(sc.Text(), "Feff"))
		if l == "" || strings.HasPrefix(l, "#") {
			continue
		}
		out = append(out, l)
	}
	return out, sc.Err()
}

// ini is a Qt settings file: [Section] and key=value, values possibly
// @ByteArray(...) or quoted with backslash escapes.
type ini map[string]map[string]string

func (i ini) get(section, key string) string {
	return i[strings.ToLower(section)][strings.ToLower(key)]
}

func readINI(path string) (ini, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	out := ini{}
	section := "general"
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 4<<20)
	for sc.Scan() {
		l := strings.TrimSpace(strings.TrimPrefix(sc.Text(), "Feff"))
		switch {
		case l == "" || strings.HasPrefix(l, ";") || strings.HasPrefix(l, "#"):
		case strings.HasPrefix(l, "[") && strings.HasSuffix(l, "]"):
			section = strings.ToLower(l[1 : len(l)-1])
		default:
			k, v, ok := strings.Cut(l, "=")
			if !ok {
				continue
			}
			if out[section] == nil {
				out[section] = map[string]string{}
			}
			out[section][strings.ToLower(strings.TrimSpace(k))] = qtValue(strings.TrimSpace(v))
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("mo2: %s is empty", path)
	}
	return out, nil
}

func qtValue(v string) string {
	if strings.HasPrefix(v, "@ByteArray(") && strings.HasSuffix(v, ")") {
		v = v[len("@ByteArray(") : len(v)-1]
	}
	if len(v) >= 2 && v[0] == '"' && v[len(v)-1] == '"' {
		v = v[1 : len(v)-1]
	}
	var b strings.Builder
	for i := 0; i < len(v); i++ {
		if v[i] == '\\' && i+1 < len(v) {
			i++
			switch v[i] {
			case 'n':
				b.WriteByte('\n')
			case 't':
				b.WriteByte('\t')
			default:
				b.WriteByte(v[i])
			}
			continue
		}
		b.WriteByte(v[i])
	}
	return b.String()
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
