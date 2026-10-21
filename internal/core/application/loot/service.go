package loot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"strconv"
	"sync"
	"time"

	"modorchestrator/internal/core/application/plugins"
	"modorchestrator/internal/core/application/ports"
	appsettings "modorchestrator/internal/core/application/settings"
	"modorchestrator/internal/core/domain/game"
)

// SettingKey turns the provider on or off per instance (core/13).
const SettingKey = "plugins.lootProvider"

// Branch is the masterlist format the parser reads: LOOT keeps one branch
// per metadata syntax version of every masterlist repository.
const Branch = "v0.29"

// Error codes.
const (
	CodeUnsupported    = "loot_unsupported"
	CodeUpdateFailed   = "loot_update_failed"
	CodeUserlistAbsent = "loot_userlist_not_found"
	CodeUserlistBad    = "loot_userlist_invalid"
)

// Error is a failure with a stable code and parameters (D044, D053).
type Error struct {
	code   string
	params map[string]string
	cause  error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("loot: %s: %v", e.code, e.cause)
	}
	return "loot: " + e.code
}

func (e *Error) Unwrap() error             { return e.cause }
func (e *Error) Code() string              { return e.code }
func (e *Error) Params() map[string]string { return maps.Clone(e.params) }

func fail(code string, cause error, kv ...string) *Error {
	e := &Error{code: code, cause: cause, params: map[string]string{}}
	for i := 0; i+1 < len(kv); i += 2 {
		e.params[kv[i]] = kv[i+1]
	}
	return e
}

// Settings is what the provider reads of the settings.
type Settings interface {
	AppValue(ctx context.Context, key string) (appsettings.Effective, error)
	InstanceValue(ctx context.Context, instance, key string) (appsettings.Effective, error)
}

// Deps are the ports of the provider.
type Deps struct {
	Registry interface {
		ByName(name string) (ports.GameAdapter, bool)
	}
	Instances interface {
		Get(ctx context.Context, id game.InstanceID) (game.Instance, error)
	}
	FS       ports.FileSystem
	Folders  ports.KnownFolders
	Settings Settings
	// Fetcher downloads on "Update masterlist"; nil turns the update off.
	Fetcher ports.MasterlistFetcher
	// Dir is the app data folder of the downloaded masterlists.
	Dir     string
	Plugins *plugins.Service
	Clock   interface{ Now() time.Time }
}

// Service is the LOOT provider (a plugins.Provider) and its commands.
type Service struct {
	Deps

	mu     sync.Mutex
	lists  map[string]*loaded // by repository
	crcs   map[string]uint32  // by path|size|mtime
	loadMu sync.Mutex
}

type loaded struct {
	list   *Masterlist
	stamp  string
	source Source
	exact  map[string][]int // lower-case name -> entries
	regex  []int
}

// New creates the provider.
func New(d Deps) *Service {
	return &Service{Deps: d, lists: map[string]*loaded{}, crcs: map[string]uint32{}}
}

var _ plugins.Provider = (*Service)(nil)

// Source says which copy of the masterlist is in use.
type Source struct {
	// Kind is "bundled" (shipped with the app) or "downloaded".
	Kind string
	// Date is the publication date of the bundled copy, or when the
	// downloaded one was fetched.
	Date time.Time
}

// Status is the LOOT data of an instance for Settings › Plugins.
type Status struct {
	Supported bool
	Enabled   bool
	Source    Source
	// CanUpdate is false when the app was built without the download.
	CanUpdate bool
}

// game returns the adapter declaration of an instance.
func (s *Service) game(ctx context.Context, instance game.InstanceID) (game.Instance, ports.LootGame, bool) {
	inst, err := s.Instances.Get(ctx, instance)
	if err != nil {
		return game.Instance{}, ports.LootGame{}, false
	}
	adapter, ok := s.Registry.ByName(inst.Adapter)
	if !ok {
		return inst, ports.LootGame{}, false
	}
	lg, ok := lootGame(adapter, inst)
	return inst, lg, ok
}

func lootGame(adapter ports.GameAdapter, inst game.Instance) (ports.LootGame, bool) {
	ls, ok := adapter.(ports.LootSupport)
	if !ok {
		return ports.LootGame{}, false
	}
	def, err := ports.InstanceDefinition(adapter, inst)
	if err != nil || !def.Capabilities.Has(game.CapPlugins) {
		return ports.LootGame{}, false
	}
	return ls.LootGame(inst.Game)
}

func (s *Service) enabled(ctx context.Context, instance game.InstanceID) bool {
	if s.Settings == nil {
		return true
	}
	v, err := s.Settings.InstanceValue(ctx, string(instance), SettingKey)
	if err != nil {
		return true
	}
	b, err := strconv.ParseBool(v.Value)
	return err != nil || b
}

func (s *Service) language(ctx context.Context) string {
	if s.Settings == nil {
		return "en"
	}
	v, err := s.Settings.AppValue(ctx, "ui.language")
	if err != nil || v.Value == "" {
		return "en"
	}
	return v.Value
}

// Status reports the LOOT data of an instance.
func (s *Service) Status(ctx context.Context, instance game.InstanceID) (Status, error) {
	_, lg, ok := s.game(ctx, instance)
	if !ok {
		return Status{}, nil
	}
	l, err := s.load(ctx, lg)
	if err != nil {
		return Status{}, err
	}
	return Status{Supported: true, Enabled: s.enabled(ctx, instance), Source: l.source, CanUpdate: s.Fetcher != nil}, nil
}

// downloaded is the record next to a downloaded masterlist.
type downloaded struct {
	FetchedAt time.Time `json:"fetchedAt"`
	Branch    string    `json:"branch"`
}

func (s *Service) repoDir(lg ports.LootGame) string { return game.JoinPath(s.Dir, lg.Repository) }

// load returns the parsed masterlist of a game: the downloaded copy when it
// is newer than the one shipped with the app, else the shipped one. The
// parse is kept until the chosen copy changes.
func (s *Service) load(ctx context.Context, lg ports.LootGame) (*loaded, error) {
	s.loadMu.Lock()
	defer s.loadMu.Unlock()
	src := Source{Kind: "bundled", Date: lg.Date}
	data, prelude := lg.Masterlist, lg.Prelude
	if s.Dir != "" {
		if meta, ml, pre, ok := s.readDownloaded(ctx, lg); ok && meta.FetchedAt.After(lg.Date) {
			src = Source{Kind: "downloaded", Date: meta.FetchedAt}
			data, prelude = ml, pre
		}
	}
	stamp := src.Kind + "|" + src.Date.String()
	s.mu.Lock()
	l := s.lists[lg.Repository]
	s.mu.Unlock()
	if l != nil && l.stamp == stamp {
		return l, nil
	}
	m, err := Parse(data, prelude)
	if err != nil && src.Kind == "downloaded" {
		// A broken download never takes the data away.
		src = Source{Kind: "bundled", Date: lg.Date}
		stamp = src.Kind + "|" + src.Date.String()
		m, err = Parse(lg.Masterlist, lg.Prelude)
	}
	if err != nil {
		return nil, err
	}
	l = &loaded{list: m, stamp: stamp, source: src, exact: map[string][]int{}}
	for i, e := range m.Plugins {
		if e.IsRegex() {
			l.regex = append(l.regex, i)
		} else {
			k := lower(e.Name)
			l.exact[k] = append(l.exact[k], i)
		}
	}
	s.mu.Lock()
	s.lists[lg.Repository] = l
	s.mu.Unlock()
	return l, nil
}

func (s *Service) readDownloaded(ctx context.Context, lg ports.LootGame) (downloaded, []byte, []byte, bool) {
	dir := s.repoDir(lg)
	raw, err := readAll(ctx, s.FS, game.JoinPath(dir, "source.json"))
	if err != nil {
		return downloaded{}, nil, nil, false
	}
	var meta downloaded
	if json.Unmarshal(raw, &meta) != nil || meta.Branch != Branch {
		return downloaded{}, nil, nil, false
	}
	ml, err := readAll(ctx, s.FS, game.JoinPath(dir, "masterlist.yaml"))
	if err != nil {
		return downloaded{}, nil, nil, false
	}
	pre, _ := readAll(ctx, s.FS, game.JoinPath(dir, "prelude.yaml"))
	return meta, ml, pre, true
}

// URLs of the files of a masterlist repository.
func masterlistURL(repo string) string {
	return "https://raw.githubusercontent.com/loot/" + repo + "/" + Branch + "/masterlist.yaml"
}

func preludeURL() string {
	return "https://raw.githubusercontent.com/loot/prelude/" + Branch + "/prelude.yaml"
}

// UpdateMasterlist downloads the current masterlist and prelude of the
// instance's game (only on the user's click, D141). The files are checked
// by parsing before they replace the previous download.
func (s *Service) UpdateMasterlist(ctx context.Context, instance game.InstanceID) (Status, error) {
	_, lg, ok := s.game(ctx, instance)
	if !ok {
		return Status{}, fail(CodeUnsupported, nil)
	}
	if s.Fetcher == nil || s.Dir == "" {
		return Status{}, fail(CodeUpdateFailed, errors.New("download not available"))
	}
	ml, err := s.Fetcher.Fetch(ctx, masterlistURL(lg.Repository))
	if err != nil {
		return Status{}, fail(CodeUpdateFailed, err)
	}
	pre, err := s.Fetcher.Fetch(ctx, preludeURL())
	if err != nil {
		return Status{}, fail(CodeUpdateFailed, err)
	}
	if _, err := Parse(ml, pre); err != nil {
		return Status{}, fail(CodeUpdateFailed, err)
	}
	dir := s.repoDir(lg)
	if err := s.FS.MkdirAll(ctx, dir); err != nil {
		return Status{}, fail(CodeUpdateFailed, err)
	}
	meta, _ := json.Marshal(downloaded{FetchedAt: s.Clock.Now().UTC(), Branch: Branch})
	for _, f := range []struct {
		name string
		data []byte
	}{{"masterlist.yaml", ml}, {"prelude.yaml", pre}, {"source.json", meta}} {
		if err := s.FS.WriteFile(ctx, game.JoinPath(dir, f.name), f.data); err != nil {
			return Status{}, fail(CodeUpdateFailed, err)
		}
	}
	if s.Plugins != nil {
		// The load order follows the new data; a busy instance gets it on
		// its next arrangement.
		_ = s.Plugins.ProviderChanged(ctx, instance)
	}
	return s.Status(ctx, instance)
}
